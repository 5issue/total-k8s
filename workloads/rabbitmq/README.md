# RabbitMQ Kubernetes 구성

이 디렉터리는 RabbitMQ Cluster Operator 기반의 3-node RabbitMQ 공통 구성과 AWS EKS overlay를 관리합니다.

## 현재 base

`base`는 환경 독립적인 다음 계약만 정의합니다.

* `RabbitmqCluster/rabbitmq`, `replicas: 3`
* broker image `rabbitmq:4.3.5`
* Operator가 관리하는 StatefulSet, readiness, Service, replica별 PVC
* backend endpoint용 ClusterIP Service
* Operator가 생성하는 `rabbitmq-default-user` bootstrap Secret

3 replicas는 SPOF 완화를 위한 합의된 인프라 기준입니다. 짝수 replica로 축소하지 않습니다. 다만 broker replica 수는 queue durability나 message HA를 의미하지 않습니다.

RabbitMQ Cluster Operator와 CRD는 workload보다 먼저 설치되어야 합니다. Broker baseline은 `rabbitmq:4.3.5`로 고정합니다.

## Version과 infrastructure prerequisite

* RabbitMQ broker baseline: `4.3.5`
* RabbitMQ Cluster Operator candidate: `2.22.5` (현재 저장소에는 설치 구성 없음)
* RabbitMQ CRD API: `rabbitmq.com/v1beta1`
* cert-manager: Operator 설치 선행 조건
* EKS runtime: 현재 목표 Kubernetes `1.36`과 Operator/CRD 조합의 실제 호환성 검증 필요

Operator와 cert-manager 설치, Argo CD Application 생성은 이 workload 범위에 포함하지 않습니다. 설치 방식과 infrastructure/GitOps ownership은 아직 확정되지 않았습니다.

## Backend contract

RabbitMQ는 전체 MSA가 사용하는 message broker입니다. Backend는 producer/consumer, exchange, queue, routing key, durable/quorum 여부, DLQ/retry, publisher confirm, acknowledgement와 prefetch를 정의합니다.

Base의 non-TLS 연결 계약은 다음과 같습니다.

| Backend variable | Base 값 |
| --- | --- |
| `RABBITMQ_HOST` | `rabbitmq` |
| `RABBITMQ_PORT` | `5672` |
| `RABBITMQ_USERNAME` | `rabbitmq-default-user/username` |
| `RABBITMQ_PASSWORD` | `rabbitmq-default-user/password` |

EKS overlay는 보안 요구에 따라 plaintext listener를 끄고 TLS port `5671`을 사용합니다. Backend EKS 설정은 TLS 활성화와 CA trust 구성을 함께 제공해야 합니다.

## EKS overlay

`overlays/eks`는 다음 운영 기본안을 적용합니다.

| 항목 | 값 |
| --- | --- |
| Namespace | `backend` |
| Replicas | `3` |
| StorageClass/PVC | 기존 암호화 `gp3`, replica당 `5Gi` |
| Resources | request `250m/512Mi`, limit `1 CPU/1.5Gi` |
| Placement | on-demand node 선호, hostname/AZ soft anti-affinity |
| PDB | `maxUnavailable: 1` |
| Graceful termination | `120s` |
| TLS | `rabbitmq-server-tls`, `rabbitmq-ca`, non-TLS listener 비활성화 |
| NetworkPolicy | backend의 TLS 5671 및 RabbitMQ peer 4369/25672만 허용 |

`backend` Namespace는 현재 Backend DNS 계약 `rabbitmq.backend.svc.cluster.local`과 일치하고 cross-Namespace credential 복제를 피합니다. `gp3`는 total-infra의 EBS CSI 구성과 일치합니다.

현재 EKS는 2개 AZ와 최소 2개 managed worker node를 사용하므로 세 RabbitMQ Pod를 항상 서로 다른 node에 강제할 수 없습니다. hostname과 AZ anti-affinity를 preferred로 설정해 가능한 범위에서 분산하면서 node 장애 시 rescheduling을 막지 않습니다. on-demand node 역시 hard pinning하지 않습니다.

RabbitMQ와 setup container에는 UID/GID `999`, non-root, read-only root filesystem, privilege escalation 금지, capability drop, `RuntimeDefault` seccomp를 명시합니다.

## TLS prerequisite

EKS overlay는 다음 Secret 이름과 key만 계약으로 정하고 실제 Secret은 생성하지 않습니다.

| Secret | Required keys |
| --- | --- |
| `rabbitmq-server-tls` | `tls.crt`, `tls.key` |
| `rabbitmq-ca` | `ca.crt` |

두 Secret은 `RabbitmqCluster`와 같은 `backend` Namespace에 먼저 제공되어야 합니다. 인증서 발급 및 rotation 도구는 공통 인프라 결정 사항이며 repository에 실제 key/certificate를 저장하지 않습니다.

Backend 후속 연계사항은 AMQP port `5672`를 AMQPS `5671`로 전환하고 TLS를 활성화하며, `rabbitmq-ca/ca.crt`를 trust store에 연결하고 application credential을 별도 Secret으로 주입하는 것입니다. `rabbitmq-default-user`는 bootstrap 용도와 application 용도로 분리해야 합니다.

> **NOTE — Backend RabbitMQ Java Client security:** 현재 Backend dependency 기준은 Spring Boot `4.1.0`, Spring AMQP `4.1.0`, `spring-rabbit` `4.1.0`, RabbitMQ Java Client `5.30.0`입니다. Java Client `5.30.0`은 credential exposure 영향 범위(`<= 5.34`)에 포함되며 수정 버전은 `5.35+`입니다. Backend/security 담당자가 managed dependency를 포함한 `5.35+` 전환과 회귀 테스트를 후속 수행해야 하며, 이 디렉터리에서는 Backend dependency를 변경하지 않습니다.

## Authentication, vhost와 permissions

Operator default user는 bootstrap과 초기 E2E 확인용입니다. 운영 service user, vhost 분리 및 configure/write/read 최소권한은 확정 요구지만 Backend topology가 없으므로 현재 manifest에 가짜 user/vhost/permission을 만들지 않습니다.

## NetworkPolicy와 management

RabbitMQ Service는 ClusterIP만 사용합니다. Management UI를 NodePort, LoadBalancer 또는 Ingress로 노출하지 않으며 승인된 운영자가 Kubernetes API를 통한 port-forward로 일시 접근합니다.

EKS NetworkPolicy는 application TLS port와 Erlang peer-discovery/distribution port만 허용합니다. Management와 Prometheus port는 일반 Pod ingress에서 열지 않습니다. 수집 Namespace와 인증 방식이 확정되면 Operator가 기본 제공하는 Prometheus plugin/metrics port에 별도 allow rule과 monitor resource를 추가합니다.

## Persistence와 장애 범위

각 replica는 독립 PVC를 사용하고 Operator가 Pod 및 cluster reconciliation을 수행합니다. PDB는 voluntary disruption 중 동시 unavailable Pod를 하나로 제한합니다. 실제 queue가 classic인지 quorum인지, durable인지가 정해지기 전에는 message HA를 보장하지 않습니다.

장애 확인 절차는 [FAILURE-RUNBOOK.md](FAILURE-RUNBOOK.md)를 따릅니다.

## Pending

* Cluster Operator candidate `2.22.5` 설치 방식과 infrastructure/GitOps ownership 확정
* Operator/CRD와 EKS Kubernetes `1.36` runtime compatibility 검증
* certificate 발급/rotation 및 Secret delivery solution
* Backend AMQP `5672` → AMQPS `5671`, TLS 활성화와 `rabbitmq-ca/ca.crt` trust 연계
* bootstrap/default credential과 application credential 분리 및 Secret 주입
* Backend RabbitMQ Java Client `5.35+` security upgrade 검토
* service별 user, vhost, configure/write/read permission matrix
* exchange, queue, routing key, quorum, DLQ/retry/ack/confirm topology
* monitoring collector Namespace와 ServiceMonitor/PodMonitor 방식
* backup/RPO/RTO와 실제 부하 기반 resource/PVC 조정

## Render 검증

```bash
kubectl kustomize workloads/rabbitmq/base
kubectl kustomize workloads/rabbitmq/overlays/eks
```
