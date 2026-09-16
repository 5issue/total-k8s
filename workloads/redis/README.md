# Redis Kubernetes 구성

Backend에서 사용하는 single-replica Redis workload의 Kubernetes 구성입니다.

## 구성

| 항목              | 값                                           |
| --------------- | ------------------------------------------- |
| Redis           | `7.4.11-alpine3.21`                         |
| Namespace       | `backend`                                   |
| StatefulSet     | `redis`, replica `1`                        |
| Pod             | Redis + `redis-exporter`, 정상 상태 `2/2 Ready` |
| Service         | `redis`, `6379/TCP`                         |
| Authentication  | Redis `requirepass`                         |
| Persistence     | AOF                                         |
| Storage         | `gp3`, `5Gi`, `ReadWriteOnce`               |
| Redis resources | request `100m/256Mi`, limit `500m/1Gi`      |
| Scheduling      | On-Demand node required                     |
| PDB             | `minAvailable: 1`                           |

Redis Service와 headless Service는 클러스터 외부에 노출하지 않습니다. EKS overlay는 `eks.amazonaws.com/capacityType=ON_DEMAND` 또는 `karpenter.sh/capacity-type=on-demand`인 node만 Redis Pod의 배치 대상으로 허용합니다.

## Backend 연결 계약

| Backend variable | 값                                        |
| ---------------- | ---------------------------------------- |
| `REDIS_HOST`     | `redis.backend.svc.cluster.local`        |
| `REDIS_PORT`     | `6379`                                   |
| `REDIS_PASSWORD` | `backend/redis-credentials` Secret의 `password` |

Kubernetes Secret 계약은 다음과 같습니다.

| 항목                | 값                                                  |
| ----------------- | -------------------------------------------------- |
| Source of Truth   | AWS Secrets Manager `prod/total/redis-credentials` |
| Kubernetes Secret | `backend/redis-credentials`                        |
| Secret type       | `Opaque`                                           |
| Secret key        | `password`                                         |

AWS Secrets Manager resource와 Kubernetes Secret publication은 `total-infra`에서 관리합니다.

상세 credential lifecycle, publication 및 EKS 재생성 후 복구 절차는 [CREDENTIAL-PUBLICATION-RUNBOOK.md](CREDENTIAL-PUBLICATION-RUNBOOK.md)를 따릅니다.

## Persistence와 장애 범위

Redis는 single replica로 운영합니다. Pod가 재생성되면 StatefulSet이 기존 PVC를 다시 연결하고 Redis는 AOF를 데이터 복구 기반으로 사용합니다.

장애 확인, storage 복구 및 persistence 검증 기준은 [FAILURE-RUNBOOK.md](FAILURE-RUNBOOK.md)를 따릅니다.

Backend runtime 환경변수 구성 및 애플리케이션 E2E는 Backend 배포 영역에서 관리합니다.
