# MySQL(MOCO) Kubernetes 구성

이 디렉터리는 MOCO(MySQL Operator for Kubernetes) 기반의 공용 MySQL 클러스터 `shared-mysql` 공통 구성과 AWS EKS overlay를 관리합니다. member/auth/order/payment 4개 서비스가 이 클러스터 하나를 공유하며, 서비스별 database(schema) + 별도 DB 계정으로 논리적으로 분리됩니다. 최초에는 서비스별 완전 독립 클러스터(4개)로 설계했으나, 노드 리소스(t3.medium 2대) 제약으로 물리 클러스터는 통합하고 DB/계정 레벨 분리로 절충했습니다.

## 현재 base

`base`는 환경 독립적인 다음 계약만 정의합니다.

* `MySQLCluster/shared-mysql`, `replicas: 3`
* mysqld image `ghcr.io/cybozu-go/moco/mysql:8.0.41` (팀 표준 버전 재확인 필요)

MOCO는 quorum 기반 semi-synchronous 복제 특성상 `replicas`로 1, 3, 5(양의 홀수)만 허용합니다. 2로 축소할 수 없습니다.

MOCO Operator와 CRD는 workload보다 먼저 설치되어야 합니다. `base`만으로는 배포할 수 없습니다 — MOCO는 `volumeClaimTemplates`(`mysql-data`)를 필수로 요구하며, storage는 `overlays/eks`에서만 정의합니다.

## Backend contract

서비스별 database/계정 이름, 권한 범위는 아직 미확정입니다. 각 서비스는 자신의 schema로 권한을 제한한 계정만 사용해야 하며(공용 계정 금지), 실제 계정 목록이 확정되기 전에는 manifest에 가짜 계정/권한을 만들지 않습니다.

order 서비스는 비관적 락(`SELECT ... FOR UPDATE`)을 사용합니다. 락 경합 시 커넥션 풀 고갈을 막기 위해 `innodb_lock_wait_timeout`을 기본값보다 낮게 설정하는 방안을 검토 중이며 아직 반영하지 않았습니다.

## EKS overlay

`overlays/eks`는 다음 운영 기본안을 적용합니다.

| 항목 | 값 |
| --- | --- |
| Namespace | `backend` |
| Replicas | `3` |
| StorageClass/PVC | `gp3`, `20Gi` (서비스 4개 공용이라 단일 서비스 대비 확대) |
| Resources | request `250m/512Mi`, limit `1 CPU/1.5Gi` |
| Placement | on-demand node 선호, zone `topologySpreadConstraints`(`maxSkew: 1`, `ScheduleAnyway`) |
| PDB | `maxUnavailable: 1` |
| NetworkPolicy | `auth-service`/`order-service`/`payment-service` label을 가진 Pod에서만 TCP `3306` 허용 (`member-service`는 미배포로 제외) |
| RBAC | `shared-mysql-secret-reader` Role/RoleBinding — credential Secret 조회를 인가된 관리자로 제한 (현재 subjects 비어있어 아무도 접근 불가) |

노드 2대(AZ `ap-northeast-2a`/`2c`) 환경에서 인스턴스 3개는 hard anti-affinity 조건이 항상 깨지므로, soft `topologySpreadConstraints`로 가능한 범위에서 분산합니다(팀 내 Prometheus 사례에서 검증된 방식). On-demand 배치는 preferred로 두어 재스케줄링을 막지 않습니다.

Pod/container security context는 non-root, seccomp `RuntimeDefault`, capability 전체 제거, privilege escalation 금지를 적용합니다. MySQL data 디렉터리 쓰기 때문에 `readOnlyRootFilesystem`은 적용하지 않습니다.

## 백업

MOCO는 백업 기능을 내장하지 않습니다. 현재 backup/PITR이 구성되어 있지 않으며, xtrabackup 기반 CronJob과 binlog 아카이빙을 직접 구성해야 합니다(풀 백업만으로는 PITR 불가). **최우선 후속 작업입니다.**

## Security

* mTLS/Istio는 서비스 간 통신에 사용하지 않습니다(보안팀 v2.1 인증/인가 설계서 확정, VPC CNI NetworkPolicy 기반 격리로 대체).
* Backend-DB 연결 구간 자체의 TLS 적용 여부는 미확정입니다(개인정보/결제 데이터 포함, 보안팀 확인 우선순위 높음).
* NetworkPolicy는 현재 `auth-service`/`order-service`/`payment-service` Pod label 단위까지 제한합니다(D-10). `member-service`는 아직 배포되지 않아 제외했습니다.
* credential Secret 조회는 `shared-mysql-secret-reader` Role/RoleBinding으로 제한합니다(D-04). `resourceNames`는 MOCO가 생성하는 실제 Secret 이름이 확인되기 전까지 placeholder이고, `subjects`도 보안팀 D-04 화이트리스트가 확정되기 전까지 비워둬 현재는 아무도 접근할 수 없습니다(fail-closed).
* MOCO Operator의 헬스체크/관리 전용 포트는 아직 확인하지 않았습니다(RabbitMQ Cluster Operator가 Management API `15671`을 별도로 요구했던 사례가 있어 동일 패턴을 우려하고 있습니다).
* Audit 로그(D-17)는 아직 반영하지 않았습니다 — 사용 중인 `ghcr.io/cybozu-go/moco/mysql` 이미지는 MySQL Community 기반이라 audit_log 플러그인이 기본 포함되어 있지 않고, `general_log`를 켜면 모든 쿼리(개인정보/결제 데이터 포함 가능)가 평문으로 로그에 남는 부작용이 있어 임의로 켜지 않았습니다. 필요 시 MOCO의 [custom mysqld image 가이드](https://cybozu-go.github.io/moco/custom-mysqld.html)로 audit 플러그인을 포함한 이미지를 직접 빌드하는 방향의 결정이 먼저 필요합니다.

장애 확인 절차는 [FAILURE-RUNBOOK.md](FAILURE-RUNBOOK.md)를 따릅니다.

## Pending

* StorageClass(`gp3`) `volumeBindingMode`가 `WaitForFirstConsumer`인지 확인 (PVC 재바인딩 AZ 일치 전제조건)
* 노드그룹 AZ별 분리(`worker_node_2a`/`2c`) — 현재 단일 그룹이 서브넷을 상속받는 구조라 재기동 시 AZ 불일치로 PVC Pending 위험
* xtrabackup CronJob + binlog 아카이빙 구현 (backup/PITR)
* 서비스별 database/계정/권한 화이트리스트 확정 (KISA D-02/D-06: 공용계정 금지)
* 비밀번호 만료/복잡도/재사용 기준값 확정 (KISA D-03/D-05)
* Backend-DB 연결 TLS 적용 여부 확정 (확정 시 `.spec.certificates` 추가 필요)
* MOCO Operator 관리 전용 포트 확인 후 NetworkPolicy 반영
* `shared-mysql` 최초 배포 후 `kubectl get secrets -n backend`로 실제 Secret 이름 확인 → `rbac-secret-access.yaml`의 `resourceNames` 교체 (D-04)
* D-04 인가된 DB 관리자 화이트리스트 확정 → `rbac-secret-access.yaml`의 `subjects`에 실제 User/Group 반영
* Audit 로그(D-17) 방식 결정 — custom mysqld 이미지 빌드 여부/우선순위
* `innodb_lock_wait_timeout` 튜닝 (order 서비스 비관적 락 대응)
* MOCO/CRD 설치 방식과 infrastructure/GitOps ownership 확정 (Redis/RabbitMQ와 동일 상태)

## Render 검증

```bash
kubectl kustomize workloads/mysql-shared/base
kubectl kustomize workloads/mysql-shared/overlays/eks
```

## 배포 후 검증 계획

* 실제 AZ 배치 확인 (`kubectl get pods -o wide`)
* 노드 재기동 시뮬레이션 → PVC 재바인딩 정상 확인 (최우선 검증 항목)
* Failover 테스트 (Primary 강제 종료 → 자동 승격 확인)
* TLS 연결 확인 시 SAN에 short/long DNS 포함 여부 검증 (RabbitMQ에서 누락으로 hostname verification 실패를 겪은 전례 있음)
