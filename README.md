# Kubernetes 배포 저장소

통합 프로젝트의 Kubernetes 배포 리소스와 EKS 위에서 동작하는 공통 platform component를 관리합니다.

workloads의 공통 Kubernetes 구성은 base에 두고, Namespace를 포함한 환경별 설정은 overlays에서 관리합니다.

## 디렉터리 구조

```text
.
├── apps/                       # Argo CD Application 정의
├── k8s/
│   ├── addons/                 # cert-manager, RabbitMQ Operator 등 cluster-level component
│   ├── argocd/                 # Argo CD 설정
│   ├── backend/                # Backend Kubernetes 배포 리소스
│   ├── cnpg/                   # CloudNativePG 구성
│   ├── dev/                    # Dev 환경 구성
│   ├── frontend/               # Frontend Kubernetes 배포 리소스
│   ├── grafana/                # Grafana 구성
│   └── moco/                   # MOCO 구성
├── tests/
│   └── k6/                     # 부하 테스트
├── workloads/
│   ├── mysql-shared/           # 공용 MySQL workload
│   ├── postgres-shared/        # 공용 PostgreSQL workload
│   ├── rabbitmq/               # RabbitMQ workload, TLS 및 운영 Runbook
│   └── redis/                  # Redis workload 및 모니터링 구성
├── root-application.yaml       # Argo CD Root Application
└── README.md
```

## Platform components

* [Kubernetes addons](k8s/addons/README.md): cert-manager `v1.21.1`, RabbitMQ Cluster Operator `v2.22.5` 등 EKS 위에서 동작하는 cluster-level component

현재 RabbitMQ 구성에 필요한 선행 component를 기존 Argo CD `addons-app`이 관리하는 `k8s/addons/`에 추가해 두었습니다. 현재 repository 구조를 기준으로 구성한 것으로, 실제 배포 파이프라인이 확정되면 해당 방식에 맞춰 위치와 관리 방식을 조정할 수 있습니다.

각 component의 구성과 선행 관계는 [addons README](k8s/addons/README.md)에 정리되어 있습니다.

## Workloads

* [MySQL](workloads/mysql-shared/README.md): 공용 MySQL workload
* [PostgreSQL](workloads/postgres-shared/README.md): 공용 PostgreSQL workload
* [Redis](workloads/redis/README.md): 단일 replica Redis 구성
* [RabbitMQ](workloads/rabbitmq/README.md): RabbitMQ Cluster Operator 기반 3-node cluster, EKS TLS 및 Application Identity 구성

최종 배포 대상은 AWS EKS이며, 환경별 설정과 상세 운영 절차는 각 workload의 README 및 Runbook에서 관리합니다.
