# Redis 장애 대응 Runbook

이 문서는 single-replica Redis의 인프라 장애 확인 범위를 정의합니다. 명령은 상태 조회용이며 실제 삭제, 재시작, drain은 승인된 장애 훈련에서만 수행합니다.

## 정상 상태

```bash
kubectl -n backend get statefulset redis
kubectl -n backend get pod,pvc,service -l app.kubernetes.io/name=redis
kubectl -n backend describe pod redis-0
```

정상 기준은 StatefulSet ready replica `1`, Pod readiness 통과, PVC `Bound`, Service endpoint 존재입니다. 인증 확인에는 `redis-credentials`를 사용하되 값을 화면이나 로그에 출력하지 않습니다.

## Pod 장애

1. Pod event와 이전 container log를 수집합니다.
2. StatefulSet이 `redis-0`을 다시 생성하는지 확인합니다.
3. 동일 PVC가 재연결되는지 확인합니다.
4. authenticated readiness와 Service endpoint를 확인합니다.
5. AOF 기반 데이터 확인은 비민감 테스트 key로 수행합니다.

## PVC 또는 node 장애

1. PVC/PV 상태, EBS CSI event, node condition을 확인합니다.
2. EBS volume의 AZ와 새 Pod가 선택한 node AZ가 일치하는지 확인합니다.
3. attach/detach가 진행 중이면 중복 강제 attach를 시도하지 않습니다.
4. 복구 후 authenticated `PING`, AOF load 오류, application connection 오류를 확인합니다.

## 알려진 한계

Redis는 replica 1이므로 Pod 또는 node 복구 중 서비스 중단이 발생합니다. PDB는 voluntary disruption을 제한할 뿐 node 장애와 automatic failover를 해결하지 않습니다. 장애 시 application이 fail-open인지 fail-closed인지는 Backend 계약이 필요합니다.
