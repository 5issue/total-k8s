# Redis Kubernetes 구성

이 디렉터리는 Backend caching layer로 사용하는 단일 replica Redis의 공통 구성과 AWS EKS overlay를 관리합니다.

## 현재 base

`base`는 환경에 독립적인 다음 리소스를 제공합니다.

* `StatefulSet/redis`, `replicas: 1`
* image `redis:7.4.11-alpine3.21`
* backend endpoint용 `ClusterIP` Service `redis`, TCP `6379`
* StatefulSet identity용 headless Service `redis-headless`
* `redis-credentials` Secret의 `password`를 사용하는 `requirepass` 인증
* AOF persistence와 `ReadWriteOnce` PVC `1Gi`
* 인증된 `PING`을 사용하는 startup/readiness/liveness probe
* non-root UID `999`, GID/fsGroup `1000`, `RuntimeDefault` seccomp
* privilege escalation 금지, Linux capability 전체 제거, read-only root filesystem

`redis`와 `redis-headless`는 외부에 노출하지 않습니다. Base는 Namespace, StorageClass, resource request/limit을 지정하지 않습니다.

## Backend contract

Backend는 Redis를 caching layer로 사용하며 다음 환경변수로 연결 정보를 받습니다.

| Backend variable | EKS 값 |
| --- | --- |
| `REDIS_HOST` | `redis` |
| `REDIS_PORT` | `6379` |
| `REDIS_PASSWORD` | `redis-credentials` Secret의 `password` |

Redis 사용 계획은 member, order, payment, product, WMS, SCM이 확정이고 OMS는 조건부입니다. auth는 현재 사용 근거가 없습니다. 실제 cache key, TTL, eviction, logical DB, timeout/pool 및 장애 시 fail-open/fail-closed 동작은 Backend 구현 계약입니다.

## EKS overlay

`overlays/eks`는 다음 운영 기본안을 적용합니다.

| 항목 | 값 |
| --- | --- |
| Namespace | `backend` |
| StorageClass | 암호화와 volume expansion을 지원하는 기존 `gp3` |
| PVC | `5Gi`, `ReadWriteOnce` |
| Resources | request `100m/256Mi`, limit `500m/1Gi` |
| Scheduling | on-demand node 선호, hard pinning 없음 |
| PDB | `minAvailable: 1` |
| NetworkPolicy | 같은 `backend` Namespace의 Pod에서 TCP 6379만 허용 |

`backend`를 선택하면 기존 Backend Service와 짧은 DNS 이름 `redis`를 사용하고 Secret을 Namespace 사이에 복제하지 않아도 됩니다. `gp3`는 total-infra가 기본 StorageClass로 생성하며 `WaitForFirstConsumer`, EBS encryption, volume expansion을 제공합니다.

On-demand 배치는 선호 조건으로 두어 managed node 또는 Karpenter label 중 하나가 없거나 장애가 발생해도 재스케줄링을 막지 않습니다. PDB는 voluntary disruption 중 유일한 Pod를 보호하지만 Redis를 HA로 만들지는 않으며, drain 시 명시적인 운영 조정이 필요할 수 있습니다.

NetworkPolicy는 member의 최종 Pod label과 OMS의 사용 조건이 아직 없으므로 Namespace 경계까지만 제한합니다. 서비스별 최소 허용 rule은 해당 계약이 확정된 뒤 좁힙니다.

## Security

* 실제 credential이나 Secret manifest는 Git에 저장하지 않습니다.
* EKS 배포 전에 같은 Namespace에 `redis-credentials/password`가 제공되어야 합니다.
* Secret delivery와 rotation 도구는 공통 인프라 결정 후 연결합니다.
* Redis TLS는 현재 확정 요구가 아니므로 활성화하지 않습니다.

## Persistence와 장애 범위

단일 Pod가 삭제되면 StatefulSet이 재생성하고 기존 PVC를 다시 연결합니다. AOF는 process 또는 Pod 재시작 후 데이터 복구 기반을 제공합니다. Sentinel, Redis Cluster, replica failover는 현재 범위에 포함하지 않습니다.

현재 monitoring 준비는 authenticated probe와 Redis 상태 확인 절차까지입니다. 별도 exporter는 monitoring stack과 credential 전달 방식이 확정된 뒤 추가합니다.

장애 확인 절차는 [FAILURE-RUNBOOK.md](FAILURE-RUNBOOK.md)를 따릅니다.

## Local overlay

`overlays/local`은 선택적인 검증용 `redis-local` Namespace를 사용합니다. Secret은 repository에 포함하지 않습니다. Backend의 Docker Compose는 password가 비어 있을 수 있으므로 EKS 인증 구성을 동일하게 검증하는 환경은 아닙니다.

## Pending

* Secret delivery와 rotation 방식
* service별 NetworkPolicy 축소 및 OMS 허용 여부
* monitoring collector/exporter 연동
* backup/RPO/RTO와 Redis HA 필요 여부
* Backend cache key, TTL, eviction 및 장애 처리 계약

## Render 검증

```bash
kubectl kustomize workloads/redis/base
kubectl kustomize workloads/redis/overlays/local
kubectl kustomize workloads/redis/overlays/eks
```
