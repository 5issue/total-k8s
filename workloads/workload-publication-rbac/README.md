# Workload Publication RBAC

이 bundle은 외부에서 EKS Access Entry로 매핑한 Kubernetes group `total:workload-publication`에 RabbitMQ CA trust publication 권한을 부여합니다.

허용 범위:

* `messaging`, `backend`, `dev` Namespace 조회
* `messaging/rabbitmq-ca-signing` 조회
* `messaging/rabbitmq-ca`, `backend/rabbitmq-ca`, `dev/rabbitmq-ca` 조회 및 patch
* 세 Namespace의 Secret 생성

Kubernetes RBAC는 Secret `create`를 resource name으로 제한할 수 없으므로 create 권한은 Namespace 단위입니다. 실제 publisher는 Source와 Target Namespace 및 Secret 이름을 고정하여 `rabbitmq-ca` 외의 Secret을 생성하지 않습니다.

이 bundle은 Namespace를 생성하거나 소유하지 않습니다. `messaging`은 RabbitMQ overlay가 소유하고 `backend`와 `dev`는 인프라 구성이 생성합니다. Namespace가 아직 없으면 namespaced RBAC 생성은 실패하며 Argo CD가 준비 후 다시 동기화합니다.
