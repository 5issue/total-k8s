# Workload Publication RBAC

EKS Access Entry의 `total:workload-publication` group에 workload publication용 Kubernetes 권한을 제공합니다.

## 권한 범위

* `messaging`, `backend`, `dev` Namespace 조회
* `messaging/rabbitmq-ca-signing` 조회
* `messaging`, `backend`, `dev`의 `rabbitmq-ca` 조회 및 patch
* `backend`, `dev`의 `redis-credentials` 조회 및 patch
* 세 Namespace의 Secret 생성

Secret `create` 권한은 Kubernetes RBAC 특성상 Namespace 범위로 적용합니다. 실제 publisher는 정의된 Source와 Target Secret만 생성·갱신합니다.

Namespace lifecycle은 각 workload 및 인프라 구성이 관리합니다.
