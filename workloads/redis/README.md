# Redis Kubernetes 구성

`backend` Namespace에 배포하고 `backend`와 `dev`에서 사용하는 single-replica Redis workload를 관리합니다.

## 구성

| 항목 | 값 |
| --- | --- |
| Redis | `7.4.11-alpine3.21` |
| Namespace | `backend` |
| StatefulSet | `redis`, replica `1` |
| Pod | Redis + `redis-exporter`, `2/2 Ready` |
| Service | `redis`, `6379/TCP` |
| Authentication | Redis `requirepass` |
| Persistence | AOF |
| Storage | `gp3`, `5Gi`, `ReadWriteOnce` |
| Redis resources | request `100m/256Mi`, limit `500m/1Gi` |
| Scheduling | On-Demand node required |
| PDB | `minAvailable: 1` |

Redis Service와 headless Service는 cluster 내부에서 제공합니다. EKS에서는 On-Demand node를 Redis Pod의 배치 대상으로 사용합니다.

## Backend 연결 계약

| Backend variable | 값 |
| --- | --- |
| `REDIS_HOST` | `redis.backend.svc.cluster.local` |
| `REDIS_PORT` | `6379` |
| `REDIS_PASSWORD` | Pod Namespace의 `redis-credentials` Secret `password` |

Kubernetes Secret 계약은 다음과 같습니다.

| 항목 | 값 |
| --- | --- |
| Source of Truth | AWS Secrets Manager `prod/total/redis-credentials` |
| Kubernetes Secrets | `backend/redis-credentials`, `dev/redis-credentials` |
| Secret type | `Opaque` |
| Secret key | `password` |

Credential source와 Kubernetes Secret publication은 `total-infra`에서 관리합니다.

`backend`와 `dev`는 동일한 `AWSCURRENT` credential을 사용합니다. Credential publication 및 복구 절차는 `total-infra`의 Workload Secret Publication Runbook을 따릅니다.

## Persistence와 장애 범위

Redis는 single replica와 AOF persistence를 사용합니다. Pod 재생성 시 StatefulSet이 기존 PVC를 다시 연결하여 데이터를 복구합니다.

장애 확인, storage 복구 및 persistence 검증은 [FAILURE-RUNBOOK.md](FAILURE-RUNBOOK.md)를 따릅니다.