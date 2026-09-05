# Kubernetes 배포 저장소

통합 프로젝트의 Kubernetes 리소스를 관리합니다.

공통 Kubernetes 리소스는 `base`에 두고, Namespace를 포함한 환경별 설정은 `overlays`에서 관리합니다.

## Workloads

* [Redis](workloads/redis/README.md): 단일 replica Redis 구성
* [RabbitMQ](workloads/rabbitmq/README.md): RabbitMQ Cluster Operator 기반 3-node cluster 구성

최종 배포 대상은 AWS EKS이며, EKS 환경별 설정은 인프라 구성이 확정되는 대로 각 workload의 overlay에 반영합니다.
