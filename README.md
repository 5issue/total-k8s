# Kubernetes 배포 저장소

통합 프로젝트의 Kubernetes 배포 리소스와 EKS 위에서 동작하는 공통 platform component를 관리합니다.

Argo CD Application/ApplicationSet을 통해 각 배포 단위를 관리하며, workload별 세부 구성과 운영 절차는 해당 디렉터리의 README 및 Runbook에서 관리합니다.

## 디렉터리 구조

```text
.
├── apps/                       # Argo CD Application / ApplicationSet
├── charts/
│   └── backend-service/        # Backend 공통 Helm chart
├── demo/
│   └── canary/                 # 배포 전략 테스트 manifest
├── k8s/
│   ├── addons/                 # cert-manager, RabbitMQ Operator 등 cluster-level component
│   ├── argocd/                 # Argo CD 설정
│   ├── backend/                # Backend Kubernetes 배포 리소스
│   ├── backend-ingress/        # Backend Ingress
│   ├── cnpg/                   # CloudNativePG Operator 구성
│   ├── dev/                    # Dev 환경 구성
│   ├── frontend/               # Frontend Kubernetes 배포 리소스
│   ├── frontend-ingress/       # Frontend Ingress
│   ├── grafana/                # Grafana 구성
│   └── moco/                   # MOCO Operator 구성
├── tests/
│   └── k6/                     # 부하 테스트
├── workloads/
│   ├── mysql-shared/           # 공용 MySQL workload
│   ├── postgres-shared/        # 공용 PostgreSQL workload
│   ├── rabbitmq/               # RabbitMQ workload 및 운영 구성
│   └── redis/                  # Redis workload 및 운영 구성
├── root-application.yaml       # Argo CD Root Application
└── README.md
```

## Platform Components

[Kubernetes addons](k8s/addons/README.md)에서는 EKS workload에 필요한 cluster-level component를 관리합니다.

현재 주요 구성은 다음과 같습니다.

* cert-manager `v1.21.1`
* RabbitMQ Cluster Operator `v2.22.5`
* kube-downscaler

Operator 구성과 실제 workload 구성은 각각 `k8s/`와 `workloads/`에서 관리하고 있습니다.

각 component의 구성과 선행 관계는 [addons README](k8s/addons/README.md)를 따릅니다.

## Workloads

`workloads/`에서는 MySQL, PostgreSQL, Redis, RabbitMQ의 base/overlay 구성과 운영 문서를 관리합니다.

공통 Kubernetes 구성은 `base/`에 두고 EKS 등 환경별 설정은 `overlays/`에서 관리합니다.

* [MySQL](workloads/mysql-shared/README.md): 공용 MySQL workload
* [PostgreSQL](workloads/postgres-shared/README.md): 공용 PostgreSQL workload
* [Redis](workloads/redis/README.md): single-replica Redis, AOF persistence 및 monitoring
* [RabbitMQ](workloads/rabbitmq/README.md): RabbitMQ Cluster Operator 기반 3-node cluster, TLS 및 Application Identity 구성

최종 배포 대상은 AWS EKS이며, workload별 연결 계약과 상세 운영·복구 절차는 각 README 및 Runbook에서 관리합니다.
