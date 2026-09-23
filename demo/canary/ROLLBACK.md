# 롤백 시나리오 (카나리·블루그린 데모)

카나리·블루그린 배포 중 문제가 생겼을 때 이전 버전으로 되돌리는 절차입니다.

## 0. 적용 범위 (중요)
| 대상 | 배포 방식 | 롤백 방법 |
|---|---|---|
| 데모: auth 카나리·블루그린 | `kubectl apply` 로 수동 적용 (ArgoCD 대상 아님) | 이 문서의 Argo Rollouts 명령 |
| 운영: 백엔드 8개 | ArgoCD ApplicationSet 자동 동기화 | `git revert` (아래 5절) |

## 1. 사전 준비
```bash
kubectl argo rollouts version            # 롤아웃 플러그인 설치 확인
kubectl get pods -A | grep -i rollouts   # Argo Rollouts 컨트롤러 동작 확인
kubectl apply -f demo/canary/auth-rollout.yaml     # 카나리 데모 적용
kubectl apply -f demo/canary/auth-bluegreen.yaml   # 블루그린 데모 적용
```

| 파일 | 리소스 이름 | 네임스페이스 |
|---|---|---|
| auth-rollout.yaml | Rollout `auth-canary-demo` | backend |
| auth-bluegreen.yaml | Rollout `auth-bluegreen-demo` | backend |
| auth-bluegreen.yaml | Service `auth-bg-active` (운영 트래픽) | backend |
| auth-bluegreen.yaml | Service `auth-bg-preview` (미리보기) | backend |

## 2. 롤백이 필요한 상황
- 새 버전 파드가 CrashLoopBackOff 또는 헬스체크 실패
- 카나리 단계에서 에러율·응답 시간 급증
- 블루그린 preview에서 이상 확인

## 3. 카나리 롤백 (auth-canary-demo)
```bash
# 상태 확인 (현재 단계, 버전별 파드 수)
kubectl argo rollouts get rollout auth-canary-demo -n backend

# 배포 진행 중 문제 발견 → 중단: 트래픽을 안정 버전으로 되돌림
kubectl argo rollouts abort auth-canary-demo -n backend

# 배포 완료 후 문제 발견 → 이전 리비전으로 되돌리는 배포 시작
kubectl argo rollouts undo auth-canary-demo -n backend

# undo 후 카나리 단계를 거치지 않고 바로 완료하려면
kubectl argo rollouts promote auth-canary-demo -n backend --full
```
- abort 후 상태는 Degraded로 표시됩니다. 문제를 고친 새 이미지를 배포하거나
  `kubectl argo rollouts retry rollout auth-canary-demo -n backend` 로 재시도합니다.

## 4. 블루그린 롤백 (auth-bluegreen-demo)
```bash
# promote 전 (preview에서 문제 발견): preview 폐기, active는 그대로 → 사용자 영향 없음
kubectl argo rollouts abort auth-bluegreen-demo -n backend

# promote 후 (전환했는데 문제 발견): 이전 리비전으로 되돌림
kubectl argo rollouts undo auth-bluegreen-demo -n backend
# preview로 이전 버전 확인 후 전환
kubectl argo rollouts promote auth-bluegreen-demo -n backend
```

## 5. 운영(백엔드 8개) 롤백
ArgoCD가 `selfHeal: true` 라서 `kubectl edit`, `kubectl set image` 로 직접 고치면
몇 분 안에 Git 상태로 되돌아갑니다. 반드시 Git으로 롤백합니다.
```bash
git log --oneline -5              # 되돌릴 커밋 확인
git revert <커밋해시>              # 해당 커밋을 취소하는 새 커밋 생성
git push                          # ArgoCD가 감지해 자동 반영
```

## 6. 롤백 후 확인
```bash
kubectl argo rollouts get rollout <이름> -n backend   # Healthy 확인
kubectl get pods -n backend                          # 이전 버전 파드 Running 확인
```

## 명령 요약
| 명령 | 동작 |
|---|---|
| get rollout | 현재 상태·단계 확인 |
| abort | 진행 중단, 안정 버전 유지 |
| undo | 이전 리비전으로 되돌림 |
| promote | 다음 단계로 진행 (블루그린: 전환 승인) |
| promote --full | 남은 단계 생략하고 즉시 완료 |
| retry | abort된 배포 재시도 |


문제 발견!
 │
 ├─ 운영 백엔드인가? ──────────────▶ git revert → push
 │
 └─ 데모(auth)인가?
     │
     ├─ 카나리
     │   ├─ 진행 중? ──────────────▶ abort
     │   └─ 100% 완료 후? ─────────▶ undo (+ 급하면 promote --full)
     │
     └─ 블루그린
         ├─ 전환(promote) 전? ─────▶ abort
         └─ 전환 후? ──────────────▶ undo → promote

 모든 경우 마지막: kubectl argo rollouts get rollout <이름> -n backend
                  → Healthy 확인