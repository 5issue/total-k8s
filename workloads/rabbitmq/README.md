# RabbitMQ Kubernetes 구성

이 디렉터리는 RabbitMQ Cluster Operator를 사용하는 3-node RabbitMQ 구성을 관리합니다.

공통 Kubernetes 리소스는 `base`에 두며, Namespace와 AWS EKS 환경별 설정은 overlay에서 관리합니다.

> **현재 구성 범위**
>
> 현재 PR은 RabbitMQ의 공통 Kubernetes 리소스를 base로 구성하는 범위입니다. backend의 현재 연결 환경변수와 서비스 구성을 기준으로 작성했으며, EKS 및 공통 인프라 구성이 확정된 이후 StorageClass, 리소스 할당, 배치·가용성, Secret 및 보안 설정 등 환경별 항목은 overlay에서 추가·조정합니다.

## 구성

RabbitMQ는 공식 RabbitMQ Cluster Operator를 사용합니다. 3-node cluster의 구성과 StatefulSet, PVC, 상태 검증 등의 관리를 Operator에 맡기고 `RabbitmqCluster` CR을 통해 원하는 상태를 관리합니다.

현재 `base`에는 다음 구성을 정의합니다.

* `RabbitmqCluster/rabbitmq`, `replicas: 3`
* backend 연결용 `ClusterIP` Service
* Operator가 관리하는 StatefulSet 및 replica별 PVC
* Operator가 관리하는 startup/readiness 상태 검증
* Operator가 생성하는 `rabbitmq-default-user` Kubernetes Secret

`base`에는 Namespace를 지정하지 않으며 `NodePort`나 `LoadBalancer`를 사용하지 않습니다. Management UI가 필요한 경우 `kubectl port-forward`를 통해 접근합니다.


## 선행 조건

`RabbitmqCluster`를 적용하기 전에 RabbitMQ Cluster Operator와 CRD가 설치되어 있어야 합니다.

배포 구성에서는 이 의존성을 고려하여 Operator와 CRD가 workload보다 먼저 적용되어야 합니다. Operator와 RabbitMQ image version은 EKS 환경 구성이 확정된 뒤 호환성을 확인하여 고정합니다.


## Persistence

RabbitMQ Cluster Operator는 replica별 PVC를 생성하여 데이터를 저장합니다.

현재 `base`에서는 `storageClassName`과 PVC 용량을 지정하지 않았으며, EKS 배포 시 StorageClass와 실제 용량을 overlay에서 결정합니다.

현재 논의 중인 EBS gp3 `5Gi`는 확정값이 아니며, EBS CSI와 StorageClass 구성이 확정된 뒤 반영합니다.

## Backend 연결

같은 Namespace에 배포된 backend는 다음 값을 사용합니다.

| Backend variable    | Kubernetes 값                               |
| ------------------- | ------------------------------------------ |
| `RABBITMQ_HOST`     | `rabbitmq`                                 |
| `RABBITMQ_PORT`     | `5672`                                     |
| `RABBITMQ_USERNAME` | `rabbitmq-default-user` Secret의 `username` |
| `RABBITMQ_PASSWORD` | `rabbitmq-default-user` Secret의 `password` |

다른 Namespace에서 접근하는 경우 `rabbitmq.<namespace>.svc.cluster.local` FQDN을 사용합니다.

Operator가 생성하는 default user는 초기 연결 검증에 사용할 수 있습니다. 운영 환경의 credential 및 Secret 관리 방식은 EKS 구성 시 별도로 결정합니다.

평문 credential은 Git에 저장하지 않습니다.

## Quorum Queue

`base`에서는 Queue type을 강제하지 않습니다.

HA와 persistence가 필요한 Queue는 application에서 `durable=true`와 `x-queue-type=quorum`을 지정하여 생성합니다.

현재 검토 중인 2-node 구성에서는 3개의 RabbitMQ Pod를 서로 다른 node에 강제 배치할 수 없습니다. 따라서 `base`에는 required anti-affinity를 적용하지 않으며, 실제 EKS node/AZ 구성이 확정된 뒤 overlay에서 배치 정책을 결정합니다.

## 검증

다음 명령으로 `base`의 render 결과를 확인할 수 있습니다.

```bash
kubectl kustomize workloads/rabbitmq/base
```

실제 cluster 형성, PVC provisioning, Service 연결 및 Quorum Queue 동작은 EKS 환경 준비 후 검증합니다.

EKS 환경에서 추가로 결정할 항목은 [EKS overlay README](overlays/eks/README.md)를 참고합니다.

## 참고 문서

* [RabbitMQ Kubernetes Operator overview](https://www.rabbitmq.com/kubernetes/operator/operator-overview)
* [Using the RabbitMQ Cluster Kubernetes Operator](https://www.rabbitmq.com/kubernetes/operator/using-operator)
* [Quorum Queues](https://www.rabbitmq.com/docs/quorum-queues)
