# Kubernetes 배포 저장소

통합 프로젝트의 Kubernetes 리소스를 관리합니다.

공통 Kubernetes 리소스는 `base`에 두고, Namespace를 포함한 환경별 설정은 `overlays`에서 관리합니다.

## Platform components

* [Kubernetes addons](k8s/addons/README.md): cert-manager `v1.21.1`, RabbitMQ Cluster Operator `v2.22.5` 등 EKS 위에서 동작하는 cluster-level component

현재 RabbitMQ 구성에 필요한 선행 component를 기존 Argo CD `addons-app`이 관리하는 `k8s/addons/`에 추가해 두었습니다. 현재 repository 구조를 기준으로 구성한 것으로, 실제 배포 파이프라인이 확정되면 해당 방식에 맞춰 위치와 관리 방식을 조정할 수 있습니다.

각 component의 구성과 선행 관계는 addons README에 정리되어 있습니다.

## Workloads

* [Redis](workloads/redis/README.md): 단일 replica Redis 구성
* [RabbitMQ](workloads/rabbitmq/README.md): RabbitMQ Cluster Operator 기반 3-node cluster 구성

최종 배포 대상은 AWS EKS이며, 환경별 설정은 각 workload의 overlay에서 관리합니다.
