# Kubernetes 배포 저장소

통합 프로젝트의 Kubernetes 배포 리소스와 EKS에서 동작하는 platform component를 관리합니다.

Argo CD Application/ApplicationSet을 통해 각 배포 단위를 관리하며, workload별 세부 구성과 운영 절차는 해당 디렉터리의 README 및 Runbook에서 관리합니다.

## GitOps 구조

EKS 최초 구성 시 Terraform에서 Root Application을 주입하고, `root-application.yaml`이 `apps/`의 Application/ApplicationSet을 관리합니다.

```text
Terraform
    │
    ▼
Root Application
    │
    ▼
  apps/
    │
    ├── charts/
    ├── k8s/
    └── workloads/
```

Backend는 `charts/backend-service/`의 공통 Helm chart를 기반으로 운영·Dev 환경에 배포합니다. Frontend, AI, Ingress, platform component 및 stateful workload도 각각의 Argo CD Application을 통해 관리합니다.

## 디렉터리 구조

```text
.
├── apps/                         # Argo CD Application / ApplicationSet
├── charts/
│   ├── ai-service/              # AI 서비스 Helm chart
│   └── backend-service/         # Backend 공통 Helm chart
├── demo/
│   └── canary/                  # 배포 전략 테스트 manifest
├── k8s/
│   ├── addons/                  # Cluster-level addons
│   ├── ai-ingress/              # AI Ingress
│   ├── argocd/                  # Argo CD 설정
│   ├── backend/                 # Backend Kubernetes 리소스
│   ├── backend-ingress/         # Backend Ingress
│   ├── cnpg/                    # CloudNativePG Operator
│   ├── dev/                     # Dev 환경 구성
│   ├── frontend/                # Frontend 배포 리소스
│   ├── frontend-ingress/        # Frontend Ingress
│   ├── grafana/                 # Grafana / Alertmanager 구성
│   └── moco/                    # MOCO Operator
├── tests/
│   └── k6/                      # 부하 테스트
├── workloads/
│   ├── developer-rbac/          # 개발자 접근 권한
│   ├── mysql-shared/            # 공용 MySQL workload
│   ├── platform-observability/  # Platform observability
│   ├── postgres-shared/         # 공용 PostgreSQL workload
│   ├── rabbitmq/                # RabbitMQ workload
│   ├── redis/                   # Redis workload
│   └── workload-publication-rbac/ # Secret publication 권한
├── root-application.yaml        # Argo CD Root Application
└── README.md
```

현재 운영·Dev Backend의 Argo CD 배포는 `charts/backend-service/`를 기준으로 관리합니다.

## Platform Components

`k8s/`에서는 EKS workload에 필요한 cluster-level component와 공통 Kubernetes 구성을 관리합니다.

주요 구성은 다음과 같습니다.

- cert-manager
- RabbitMQ Cluster Operator
- CloudNativePG Operator
- MOCO Operator
- kube-downscaler
- Argo CD
- Grafana / Alertmanager

각 component의 상세 구성은 해당 디렉터리의 README와 manifest를 따릅니다.

## Workloads

`workloads/`에서는 상태 저장 workload와 운영에 필요한 공통 Kubernetes 리소스를 관리합니다.

- [MySQL](workloads/mysql-shared/README.md): MOCO 기반 공용 MySQL
- [PostgreSQL](workloads/postgres-shared/README.md): CloudNativePG 기반 공용 PostgreSQL
- [Redis](workloads/redis/README.md): 공용 Redis
- [RabbitMQ](workloads/rabbitmq/README.md): RabbitMQ Cluster Operator 기반 메시징 workload
- `developer-rbac/`: 개발자 Kubernetes 접근 권한
- `platform-observability/`: Platform observability 리소스
- `workload-publication-rbac/`: Workload Secret publication 권한

핵심 stateful workload는 공통 구성을 `base/`에 두고 환경별 설정을 `overlays/`에서 관리합니다.

구성 계약, 연결 정보, 장애 대응 및 운영 절차는 각 workload 디렉터리의 README와 Runbook에서 관리합니다.

## 책임 범위

`total-k8s`는 Argo CD 선언, Helm/Kustomize/manifest, Kubernetes RBAC 및 workload runtime 구성을 관리합니다.

AWS 인프라와 credential source 및 publication은 `total-infra`, 애플리케이션의 runtime 설정과 서비스 로직은 각 애플리케이션 영역에서 관리합니다.

## Demo 및 테스트

`demo/canary/`에서는 배포 전략 검증용 manifest와 rollback 문서를 관리합니다.

`tests/k6/`에서는 애플리케이션 부하 테스트 구성을 관리합니다.

## 운영 기준

최종 배포 대상은 AWS EKS입니다.

GitOps 배포 리소스는 Argo CD의 선언 상태를 기준으로 관리하며, 세부 구현과 운영 기준은 각 디렉터리의 README 및 Runbook을 따릅니다.