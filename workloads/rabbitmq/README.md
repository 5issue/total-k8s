# RabbitMQ Kubernetes 구성

RabbitMQ Cluster Operator 기반 3-node RabbitMQ의 EKS 구성을 관리합니다.

## 구성

| 항목                        | 값                              |
| ------------------------- | ------------------------------ |
| RabbitMQ                  | `4.3.5`                        |
| RabbitMQ Cluster Operator | `v2.22.5`                      |
| Namespace                 | `messaging`                    |
| Replicas                  | `3`                            |
| Storage                   | `gp3`, replica당 `5Gi`          |
| Requests                  | CPU `100m`, Memory `256Mi`     |
| Limits                    | CPU `1`, Memory `1.5Gi`        |
| Scheduling                | On-Demand required             |
| Replica 분산                | hostname/AZ soft anti-affinity |
| PDB                       | `maxUnavailable: 1`            |
| Application               | AMQPS `5671`                   |
| Management API            | HTTPS `15671`                  |

RabbitMQ Cluster Operator와 cert-manager는 `k8s/addons/`에서 관리합니다.

## 연결 계약

Production과 Dev Backend는 `messaging` Namespace의 동일한 RabbitMQ cluster를 사용합니다.

| 항목                    | 값                                      |
| --------------------- | -------------------------------------- |
| Host                  | `rabbitmq.messaging.svc.cluster.local` |
| Port                  | `5671`                                 |
| Protocol              | AMQPS                                  |
| CA Secret             | `rabbitmq-ca`                          |
| CA Key                | `ca.crt`                               |
| CA Mount              | `/etc/rabbitmq/tls/ca.crt`             |
| Hostname verification | enabled                                |

Application Messaging Topology와 서비스별 Application Identity는 Backend 최종 계약을 기준으로 관리합니다.

## TLS / CA Trust

cert-manager가 RabbitMQ private CA와 server certificate를 관리합니다.

| Resource                        | 역할                          |
| ------------------------------- | --------------------------- |
| `messaging/rabbitmq-ca-signing` | CA signing material         |
| `messaging/rabbitmq-server-tls` | RabbitMQ server identity    |
| `messaging/rabbitmq-ca`         | RabbitMQ CA trust           |
| `backend/rabbitmq-ca`           | Production Backend CA trust |
| `dev/rabbitmq-ca`               | Dev Backend CA trust        |

`messaging/rabbitmq-ca-signing/tls.crt`의 public CA를 `messaging`, `backend`, `dev`의 `rabbitmq-ca/ca.crt`로 publication합니다.

CA trust 배포는 [TRUST-PUBLICATION-RUNBOOK.md](TRUST-PUBLICATION-RUNBOOK.md), CA 교체는 [CA-ROLLOVER-RUNBOOK.md](CA-ROLLOVER-RUNBOOK.md)를 따릅니다.

## NetworkPolicy

| Source                     | Port                    | 목적                                |
| -------------------------- | ----------------------- | --------------------------------- |
| `backend`, `dev` Namespace | `5671/TCP`              | AMQPS                             |
| RabbitMQ Pod               | `4369/TCP`, `25672/TCP` | Peer communication                |
| RabbitMQ Cluster Operator  | `15671/TCP`             | Management API                    |
| RabbitMQ Provisioner       | `15671/TCP`             | Application Identity provisioning |

RabbitMQ Service는 `ClusterIP`로 제공합니다.

## 영속성 및 복구

각 RabbitMQ replica는 독립 `5Gi` PVC를 사용합니다. 각 RabbitMQ replica는 독립 5Gi PVC를 사용합니다. 장애 확인과 복구는 FAILURE-RUNBOOK.md를 따릅니다.

장애 확인과 복구는 [FAILURE-RUNBOOK.md](FAILURE-RUNBOOK.md)를 따릅니다.

## 관련 문서

| 문서                                                                       | 역할                        |
| ------------------------------------------------------------------------ | ------------------------- |
| [TRUST-PUBLICATION-RUNBOOK.md](TRUST-PUBLICATION-RUNBOOK.md)             | CA trust 배포               |
| [CA-ROLLOVER-RUNBOOK.md](CA-ROLLOVER-RUNBOOK.md)                         | CA 교체                     |
| [CREDENTIAL-PROVISIONING-RUNBOOK.md](CREDENTIAL-PROVISIONING-RUNBOOK.md) | Application credential 운영 |
| [FAILURE-RUNBOOK.md](FAILURE-RUNBOOK.md)                                 | 장애 확인 및 복구                |