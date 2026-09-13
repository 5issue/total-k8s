# Redis Kubernetes 구성

Backend에서 사용하는 Redis workload의 Kubernetes 구성입니다.

## 구성

| 항목 | 값 |
| --- | --- |
| Redis | `7.4.11-alpine3.21` |
| Replica | `1` |
| Namespace | `backend` |
| Service | `redis` |
| Port | `6379` |
| Authentication | Password |
| Persistence | AOF |
| Storage | `gp3`, `5Gi`, `ReadWriteOnce` |
| Resources | request `100m/256Mi`, limit `500m/1Gi` |
| PDB | `minAvailable: 1` |

Redis와 headless Service는 클러스터 외부에 노출하지 않습니다.

## Backend 연결 계약

| Backend variable | 값 |
| --- | --- |
| `REDIS_HOST` | `redis.backend.svc.cluster.local` |
| `REDIS_PORT` | `6379` |
| `REDIS_PASSWORD` | `redis-credentials` Secret의 `password` |

실제 credential은 repository에 저장하지 않습니다. EKS 배포 전 `backend` Namespace에 `redis-credentials/password`가 제공되어야 합니다.


## Persistence와 장애 범위

Redis는 Single Replica로 운영합니다.

Pod 삭제 시 StatefulSet이 Pod를 재생성하고 기존 PVC를 다시 연결하며, AOF를 데이터 복구 기반으로 사용합니다.

장애 대응 절차는 [FAILURE-RUNBOOK.md](FAILURE-RUNBOOK.md)를 따릅니다.