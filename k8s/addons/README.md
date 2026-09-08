# Kubernetes Platform Addons

## 개요

`k8s/addons/`는 EKS 위에서 공통으로 사용하는 Kubernetes platform component를 관리하는 경로입니다. 현재 `apps/addons-app.yaml`이 이 경로를 raw-directory recurse 방식으로 읽고 있습니다.

## 현재 구성

| Component | Version | Source | Repository path | SHA-256 |
| --- | --- | --- | --- | --- |
| cert-manager | `v1.21.1` | `https://github.com/cert-manager/cert-manager/releases/download/v1.21.1/cert-manager.yaml` | `cert-manager/v1.21.1/cert-manager.yaml` | `5f6a499b8c1857d57f560f536e0dcc830914b45c420899fe7ad0692c8624e408` |
| RabbitMQ Cluster Operator | `v2.22.5` | `https://github.com/rabbitmq/cluster-operator/releases/download/v2.22.5/cluster-operator.yml` | `rabbitmq-cluster-operator/v2.22.5/cluster-operator.yml` | `f7d3a549a2514ea3de3a91b231a969dbfee0520f467d2fbe91821b9388f48dbe` |

두 파일은 표에 표시한 공식 release asset을 수정하지 않고 저장한 것입니다. 버전별 경로와 checksum으로 사용 버전과 upstream source를 확인할 수 있습니다.

현재 addons Application은 plain YAML manifest를 직접 읽는 구조입니다. 이 모드에서는 하위 디렉터리의 `kustomization.yaml`이나 Helm chart가 별도로 렌더링되지 않으므로, 현재는 배포 호환성을 위해 release manifest를 repository에 보관하고 있습니다. 이후 배포 구조가 Kustomize 또는 Helm source를 지원하는 형태로 확정되면 version-pinned remote source를 사용하는 더 간결한 구조로 조정할 수 있습니다.

## RabbitMQ 선행 관계

RabbitMQ 구성요소에는 다음 기술적 dependency가 있습니다.

`cert-manager → RabbitMQ Cluster Operator → RabbitMQ workload`

RabbitMQ Cluster Operator는 cert-manager를 사용하며, RabbitMQ workload는 Operator의 CRD와 Controller가 준비된 상태를 전제로 합니다. 실제 배포 순서와 동기화 방식은 배포 구조가 확정된 이후 그 구조에 맞춰 연결할 수 있습니다.

## EKS 검증

2026-09-07 EKS Kubernetes `1.36` 환경에서 다음 버전을 실제로 설치해 runtime validation했습니다.

* cert-manager `v1.21.1`
* RabbitMQ Cluster Operator `v2.22.5`
* RabbitMQ Server `4.3.5`

cert-manager의 controller, webhook, cainjector와 API가 정상적으로 준비되고, RabbitMQ Cluster Operator가 실제 RabbitMQ cluster를 생성·관리하는 것을 확인했습니다. RabbitMQ Cluster Operator `v2.22.5`는 Kubernetes `1.36` 환경에서 별도 runtime validation을 수행했습니다.

## 구성 참고사항

* 실제 credential, private key, certificate는 이 디렉터리에 저장하지 않습니다.
* runtime validation에 사용한 test CA, client certificate, probe Pod와 임시 credential은 포함하지 않았습니다.
* `cert-manager.yaml`과 `cluster-operator.yml`은 CRD, RBAC, webhook, Controller 등을 포함한 각 버전의 공식 release manifest로, 프로젝트에서 직접 작성한 manifest가 아닙니다.
* 현재 `addons-app`은 `k8s/addons/` 아래의 일반 YAML 파일을 재귀적으로 동기화하는 directory 방식으로 구성되어 있습니다. 이 구조에서는 Kustomize나 Helm 구성을 직접 사용하지 않기 때문에, 현재 배포 흐름을 변경하지 않고 버전을 고정할 수 있도록 공식 release manifest를 upstream 원본 그대로 포함했습니다.
* 현재 upstream manifest에는 Argo CD sync-wave와 같은 배포 orchestration 설정을 추가하지 않았습니다.
* 실제 배포 파이프라인이 확정되면 해당 방식에 맞춰 addon 구조와 dependency 연결 방식의 조정을 부탁드립니다.
