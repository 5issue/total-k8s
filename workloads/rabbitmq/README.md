# RabbitMQ Kubernetes 구성

이 디렉터리는 RabbitMQ Cluster Operator 기반의 3-node RabbitMQ 공통 구성과 AWS EKS overlay를 관리합니다.

## 현재 base

`base`는 환경 독립적인 RabbitMQ 기본 구성을 정의합니다.

* `RabbitmqCluster/rabbitmq`, `replicas: 3`
* broker image `rabbitmq:4.3.5`
* Operator가 관리하는 StatefulSet, readiness, Service, replica별 PVC
* Backend endpoint용 ClusterIP Service
* Operator가 생성하는 `rabbitmq-default-user` bootstrap Secret

3 replicas는 SPOF 완화를 위한 현재 인프라 baseline입니다. 다만 broker replica 수만으로 queue durability나 message HA가 보장되지는 않으며, 실제 메시지 가용성은 queue type과 durability 설정에 따라 달라집니다.

RabbitMQ Cluster Operator와 CRD는 workload보다 먼저 준비되어 있어야 합니다.

## 버전 및 선행 구성

* RabbitMQ broker: `4.3.5`
* RabbitMQ Cluster Operator: `v2.22.5` (`k8s/addons/rabbitmq-cluster-operator/v2.22.5`)
* RabbitMQ CRD API: `rabbitmq.com/v1beta1`
* cert-manager: `v1.21.1` (`k8s/addons/cert-manager/v1.21.1`)

RabbitMQ workload는 다음 선행 관계를 가집니다.

`cert-manager → RabbitMQ Cluster Operator → RabbitMQ workload`

현재 cert-manager와 RabbitMQ Cluster Operator는 `k8s/addons/`에 구성되어 있습니다. workload Application과 실제 배포 순서 연결은 아직 구성되어 있지 않으며, 배포 파이프라인이 확정되면 해당 방식에 맞춰 조정이 필요합니다.

2026-09-07 `test-eks` Kubernetes `1.36` 환경에서 RabbitMQ Cluster Operator `v2.22.5`와 RabbitMQ `4.3.5` 구성의 runtime validation을 완료했습니다.

## Backend 연결 계약

RabbitMQ는 전체 MSA가 사용하는 message broker입니다.

Producer/Consumer, exchange, queue, routing key, durable/quorum 여부, DLQ/retry, publisher confirm, acknowledgement, prefetch 등 application messaging topology는 Backend 영역에서 정의합니다.

`base`에서는 Operator 기본 listener를 사용하는 다음 연결 값을 기준으로 합니다.

| Backend variable    | Base 값                           |
| ------------------- | -------------------------------- |
| `RABBITMQ_HOST`     | `rabbitmq`                       |
| `RABBITMQ_PORT`     | `5672`                           |
| `RABBITMQ_USERNAME` | `rabbitmq-default-user/username` |
| `RABBITMQ_PASSWORD` | `rabbitmq-default-user/password` |

실제 EKS 환경에서는 overlay를 통해 plaintext listener를 비활성화하고 AMQPS `5671`을 사용합니다.

EKS 환경의 Backend 연계에는 AMQPS `5671`, `rabbitmq-ca/ca.crt`를 통한 CA trust 및 별도 application credential 구성이 필요합니다.

## EKS overlay

`overlays/eks`는 다음 운영 baseline을 적용합니다.

| 항목                   | 값                                                                                 |
| -------------------- | --------------------------------------------------------------------------------- |
| Namespace            | `backend`                                                                         |
| Replicas             | `3`                                                                               |
| StorageClass/PVC     | 암호화 `gp3`, replica당 `5Gi`                                                         |
| Resources            | request `250m/512Mi`, limit `1 CPU/1.5Gi`                                         |
| Placement            | on-demand node 선호, hostname/AZ soft anti-affinity                                 |
| PDB                  | `maxUnavailable: 1`                                                               |
| Graceful termination | `120s`                                                                            |
| TLS                  | `rabbitmq-server-tls`, `rabbitmq-ca`, non-TLS listener 비활성화                       |
| NetworkPolicy        | Backend TLS 5671, RabbitMQ peer 4369/25672, Operator Management HTTPS 15671 최소 허용 |

`backend` Namespace는 Backend DNS 계약 `rabbitmq.backend.svc.cluster.local`과 일치하며 cross-Namespace credential 복제를 피합니다. `gp3`는 `total-infra`의 EBS CSI 구성과 연계합니다.

RabbitMQ Pod의 hostname 및 AZ anti-affinity는 `preferred`로 설정합니다. 사용 가능한 worker 수가 RabbitMQ replica 수보다 적은 경우 동일 node에 둘 이상의 RabbitMQ Pod가 배치될 수 있으며, hard constraint로 인해 Pod 복구가 차단되는 상황을 피하도록 구성했습니다.

On-Demand node 배치 역시 hard pinning하지 않고 preference로 적용합니다.

RabbitMQ와 setup container에는 UID/GID `999`, non-root, read-only root filesystem, privilege escalation 금지, capability drop, `RuntimeDefault` seccomp를 적용합니다.

EKS overlay의 상세 구성과 선행 조건은 [overlays/eks/README.md](overlays/eks/README.md)를 참고합니다.

## TLS prerequisite

EKS overlay는 다음 Secret 이름과 key를 계약으로 사용하며 실제 Secret 값은 repository에서 생성하지 않습니다.

| Secret                | Required keys        |
| --------------------- | -------------------- |
| `rabbitmq-server-tls` | `tls.crt`, `tls.key` |
| `rabbitmq-ca`         | `ca.crt`             |

두 Secret은 `RabbitmqCluster`와 같은 `backend` Namespace에 제공되어 있어야 합니다.

인증서 발급, rotation 및 Secret delivery 방식은 공통 인프라/보안 연계사항으로 남아 있습니다. 실제 certificate, private key 또는 credential은 repository에 저장하지 않습니다.

### TLS DNS 계약

인증서 SAN은 Backend Service와 Operator의 per-Pod Management API ServerName을 모두 만족하도록 short `.svc`와 long `.svc.cluster.local` DNS를 함께 포함합니다.

3-replica `rabbitmq` cluster에서 검증한 DNS 계약은 다음과 같습니다.

```text
rabbitmq.backend.svc
rabbitmq.backend.svc.cluster.local

*.rabbitmq-nodes.backend.svc
*.rabbitmq-nodes.backend.svc.cluster.local

rabbitmq-server-0.rabbitmq-nodes.backend.svc
rabbitmq-server-0.rabbitmq-nodes.backend.svc.cluster.local

rabbitmq-server-1.rabbitmq-nodes.backend.svc
rabbitmq-server-1.rabbitmq-nodes.backend.svc.cluster.local

rabbitmq-server-2.rabbitmq-nodes.backend.svc
rabbitmq-server-2.rabbitmq-nodes.backend.svc.cluster.local
```

`.svc.cluster.local` SAN만 포함한 경우 Backend의 Service DNS를 통한 data-plane TLS 연결은 가능하지만, Operator가 short `.svc` ServerName으로 호출하는 HTTPS Management API `15671`에서는 hostname verification이 실패하는 것을 runtime validation에서 확인했습니다.

## Authentication, vhost와 permissions

Operator가 생성하는 `rabbitmq-default-user`는 bootstrap 및 초기 연결 확인 용도로 사용합니다.

운영 service user, vhost 및 configure/write/read 권한 구성은 Backend messaging topology가 확정된 이후 연계가 필요합니다. 현재 manifest에는 임의의 user, vhost 또는 permission을 추가하지 않았습니다.

Application credential은 Operator bootstrap credential과 분리하는 방향으로 연계가 필요합니다.

## NetworkPolicy와 Management

RabbitMQ Service는 ClusterIP만 사용합니다. Management UI는 NodePort, LoadBalancer 또는 Ingress로 외부에 노출하지 않으며, 필요한 경우 Kubernetes API를 통한 port-forward 방식으로 접근할 수 있습니다.

EKS NetworkPolicy는 다음 ingress를 허용합니다.

* Backend application traffic: TCP `5671`
* RabbitMQ peer discovery/distribution: TCP `4369`, `25672`
* RabbitMQ Cluster Operator Management API: TCP `15671`

`15671`은 `rabbitmq-system` Namespace에서 다음 label이 모두 일치하는 RabbitMQ Cluster Operator Pod에만 허용합니다.

* `app.kubernetes.io/name=rabbitmq-cluster-operator`
* `app.kubernetes.io/component=rabbitmq-operator`

일반 Pod에는 Management 및 Prometheus port를 추가로 노출하지 않습니다.

Prometheus metrics 연계는 monitoring collector Namespace와 수집 방식이 확정된 이후 별도 연계가 필요합니다.

## Persistence와 장애 범위

각 RabbitMQ replica는 독립 PVC를 사용하며 Operator가 Pod 및 cluster reconciliation을 수행합니다.

PDB `maxUnavailable: 1`은 voluntary disruption 시 동시에 unavailable 상태가 되는 Pod 수를 제한합니다.

2026-09-07 runtime validation에서는 단일 RabbitMQ Pod 삭제 후 새 Pod가 기존 PVC/PV/EBS를 다시 사용해 cluster에 합류하는 것을 확인했습니다. 장애 중에는 나머지 두 endpoint를 통한 AMQPS 연결도 유지되었습니다.

Worker node 및 AZ 장애 복구는 해당 validation 범위에 포함하지 않았습니다.

Broker가 3개이더라도 queue type과 durability가 확정되지 않은 상태에서는 message HA 또는 무손실을 보장하지 않습니다.

장애 확인 범위와 절차는 [FAILURE-RUNBOOK.md](FAILURE-RUNBOOK.md)를 참고합니다.

## 후속 연계사항

### 인프라 / 플랫폼

* certificate 발급, rotation 및 Secret delivery 방식
* monitoring collector Namespace와 ServiceMonitor/PodMonitor 연계
* backup/RPO/RTO 정책
* 실제 부하 기준 resource/PVC 조정

### Backend

* AMQP `5672` → AMQPS `5671` 전환 및 CA trust 구성
* bootstrap credential과 application credential 분리
* RabbitMQ Java Client `5.35+` security upgrade 검토
* service별 user/vhost/permission 구성
* exchange, queue, routing key 및 quorum/durability 정책
* DLQ/retry/acknowledgement/publisher confirm 등 messaging topology

## Render 검증

```bash
kubectl kustomize workloads/rabbitmq/base
kubectl kustomize workloads/rabbitmq/overlays/eks
```
