# Redis Kubernetes 구성

이 디렉터리는 단일 replica Redis의 Kubernetes 구성을 관리합니다.

공통 Kubernetes 리소스는 `base`에 두며, Namespace와 AWS EKS 환경별 설정은 overlay에서 관리합니다.

> **현재 구성 범위**
>
> 현재 PR은 Redis의 공통 Kubernetes 리소스를 `base`로 구성하는 범위입니다. backend의 현재 연결 환경변수와 서비스 구성을 기준으로 작성했으며, EKS 및 공통 인프라 구성이 확정된 이후 StorageClass, 리소스 할당, Secret 및 보안 설정 등 환경별 항목은 overlay에서 추가·조정합니다.

## 구성

현재 `base`에는 다음 구성을 정의합니다.

* `StatefulSet/redis`, `replicas: 1`
* image `redis:7.4.11-alpine3.21`
* backend 연결용 `ClusterIP` Service `redis`, TCP `6379`
* StatefulSet network identity용 headless Service `redis-headless`
* `redis-credentials` Secret의 `password`를 사용하는 Redis 인증
* AOF persistence
* 인증된 `PING`을 사용하는 startup/readiness/liveness probe
* replica별 `ReadWriteOnce` PVC `1Gi`
* `storageClassName` 미지정

`redis` Service는 외부에 노출하지 않으며, `redis-headless` Service는 StatefulSet의 network identity를 위한 리소스로 backend 연결 endpoint로 사용하지 않습니다.

현재 PVC `1Gi`는 `base`의 초기 구성값이며, 실제 용량과 StorageClass는 EKS 환경 구성이 확정된 뒤 조정합니다.

## Backend 연결

같은 Namespace에 배포된 backend는 다음 값을 사용합니다.

| Backend variable | Kubernetes 값                           |
| ---------------- | -------------------------------------- |
| `REDIS_HOST`     | `redis`                                |
| `REDIS_PORT`     | `6379`                                 |
| `REDIS_PASSWORD` | `redis-credentials` Secret의 `password` |

Redis 인증을 위해 같은 Namespace에 `redis-credentials` Secret이 필요합니다.

평문 password와 실제 Secret manifest는 Git에 저장하지 않습니다. Redis와 backend가 서로 다른 Namespace에 배포되는 경우 Secret 관리 방식은 EKS 구성 시 별도로 결정합니다.

## Local overlay

`overlays/local`은 선택적인 Kubernetes 로컬 검증용 구성으로 `redis-local` Namespace를 사용합니다.

backend의 로컬 실행 환경은 total-backend/docker-compose.yml을 사용합니다. 해당 Compose 구성은 password가 비어 있을 수 있으므로 Kubernetes의 requirepass 인증 구성을 동일하게 검증하는 환경은 아닙니다.

## 검증

다음 명령으로 manifest의 render 결과를 확인할 수 있습니다.

```bash
kubectl kustomize workloads/redis/base
kubectl kustomize workloads/redis/overlays/local
```

실제 Kubernetes 환경이 준비되면 인증된 `PING`, Pod 재생성 후 AOF/PVC 데이터 유지 여부를 추가로 검증합니다.

## EKS 구성 시 결정 사항

* Namespace 및 환경별 overlay 구성
* EBS CSI driver, StorageClass 및 volume topology
* PVC 용량과 데이터 보존·복구 정책
* CPU/memory requests 및 limits
* Secret 배포 및 rotation 방식
* Pod/container security 및 NetworkPolicy
* monitoring, alert 및 PodDisruptionBudget
* Redis 고가용성 구성(Sentinel, Cluster 등) 필요 여부
