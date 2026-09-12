# RabbitMQ Kubernetes 구성

이 디렉터리는 RabbitMQ Cluster Operator 기반의 3-node RabbitMQ 구성과 AWS EKS overlay를 관리합니다.

## 구성

| 항목                        | 값                                                 |
| ------------------------- | ------------------------------------------------- |
| RabbitMQ                  | `4.3.5`                                           |
| RabbitMQ Cluster Operator | `v2.22.5`                                         |
| CRD                       | `rabbitmq.com/v1beta1`                            |
| cert-manager              | `v1.21.1`                                         |
| Namespace                 | `messaging`                                       |
| Replicas                  | `3`                                               |
| StorageClass/PVC          | `gp3`, replica당 `5Gi`                             |
| Resources                 | request `250m/512Mi`, limit `1 CPU/1.5Gi`         |
| Scheduling                | On-Demand node 선호, hostname/AZ soft anti-affinity |
| PDB                       | `maxUnavailable: 1`                               |
| Graceful termination      | `120s`                                            |
| Application protocol      | AMQPS `5671`                                      |
| Peer communication        | `4369`, `25672`                                   |
| Management API            | HTTPS `15671`                                     |

RabbitMQ Cluster Operator와 cert-manager는 `k8s/addons/`에서 관리합니다.

## Backend 연결 계약

Backend는 다음 연결 계약을 사용합니다.

| 항목                    | 값                                      |
| --------------------- | -------------------------------------- |
| Host                  | `rabbitmq.messaging.svc.cluster.local` |
| Port                  | `5671`                                 |
| Protocol              | AMQPS                                  |
| Vhost                 | `total-prod`                           |
| Username              | `total-backend`                        |
| Credential            | `backend/rabbitmq-app-credentials`     |
| Credential keys       | `username`, `password`                 |
| CA trust              | `backend/rabbitmq-ca/ca.crt`           |
| CA mount              | `/etc/rabbitmq/tls/ca.crt`             |
| Trust configuration   | Spring PEM SSL Bundle                  |
| Hostname verification | enabled                                |

Exchange, queue, routing key, durability, quorum, DLQ/retry, acknowledgement, publisher confirm 등 Application Messaging Topology는 Backend에서 관리합니다.

## TLS 및 인증서

cert-manager를 사용해 RabbitMQ private CA와 server certificate의 lifecycle을 관리합니다.

| Resource                        | 역할                       | 주요 값                 |
| ------------------------------- | ------------------------ | -------------------- |
| `messaging/rabbitmq-ca-signing` | CA signing               | `tls.crt`, `tls.key` |
| `messaging/rabbitmq-server-tls` | RabbitMQ server identity | `tls.crt`, `tls.key` |
| `messaging/rabbitmq-ca`         | RabbitMQ CA trust        | `ca.crt`             |
| `backend/rabbitmq-ca`           | Backend CA trust         | `ca.crt`             |

인증서 lifecycle은 다음 기준을 사용합니다.

| Certificate     | Duration | Renewal        |
| --------------- | -------- | -------------- |
| RabbitMQ CA     | 5년       | 계획된 rollover   |
| RabbitMQ Server | 90일      | 만료 15일 전 자동 갱신 |

Server certificate SAN은 RabbitMQ Service와 Operator Management API가 사용하는 Service/per-Pod DNS를 포함합니다.

CA trust 배포와 교체 절차는 각각 [TRUST-PUBLICATION-RUNBOOK.md](TRUST-PUBLICATION-RUNBOOK.md), [CA-ROLLOVER-RUNBOOK.md](CA-ROLLOVER-RUNBOOK.md)를 따릅니다.

## Application Identity

RabbitMQ Application Identity는 다음 계약을 사용합니다.

| 항목        | 값               |
| --------- | --------------- |
| Vhost     | `total-prod`    |
| Username  | `total-backend` |
| Configure | `.*`            |
| Write     | `.*`            |
| Read      | `.*`            |

Application credential의 Source of Truth는 AWS Secrets Manager이며 동일 credential을 다음 Kubernetes Secret으로 제공합니다.

| Secret                               | 소비자                               |
| ------------------------------------ | --------------------------------- |
| `messaging/rabbitmq-app-credentials` | Application Identity Provisioning |
| `backend/rabbitmq-app-credentials`   | Backend Application               |

두 Secret은 `username`, `password` key를 사용합니다.

Application Identity Provisioning은 RabbitMQ Management API `15671`을 사용해 vhost, user, permission을 구성합니다.

자격 증명 구성·갱신·복구 절차는 [CREDENTIAL-PROVISIONING-RUNBOOK.md](CREDENTIAL-PROVISIONING-RUNBOOK.md)를 따릅니다.

## NetworkPolicy

EKS NetworkPolicy는 RabbitMQ 역할별 통신 경로를 다음과 같이 구성합니다.

| Source                    | Port                    | 목적                                |
| ------------------------- | ----------------------- | --------------------------------- |
| `backend` Namespace       | `5671/TCP`              | AMQPS Application Traffic         |
| `messaging` RabbitMQ Pod  | `4369/TCP`, `25672/TCP` | Peer Discovery / Distribution     |
| RabbitMQ Cluster Operator | `15671/TCP`             | HTTPS Management API              |
| RabbitMQ Provisioner      | `15671/TCP`             | Application Identity Provisioning |

RabbitMQ Service는 `ClusterIP`를 사용합니다.

## 영속 저장소와 장애 범위

각 RabbitMQ replica는 `gp3` 기반의 독립 `5Gi` PVC를 사용합니다. Operator가 RabbitMQ Pod와 cluster state를 reconciliation하며, PDB `maxUnavailable: 1`을 적용합니다.

RabbitMQ는 3-node broker cluster로 구성합니다. Queue type, durability 및 메시지 처리 정책은 Backend의 Application Messaging Topology에서 관리합니다.

장애 확인 및 복구 절차는 [FAILURE-RUNBOOK.md](FAILURE-RUNBOOK.md)를 따릅니다.

## 관련 문서

| 문서                                                                       | 역할                         |
| ------------------------------------------------------------------------ | -------------------------- |
| [CREDENTIAL-PROVISIONING-RUNBOOK.md](CREDENTIAL-PROVISIONING-RUNBOOK.md) | Application 자격 증명 구성·갱신·복구 |
| [TRUST-PUBLICATION-RUNBOOK.md](TRUST-PUBLICATION-RUNBOOK.md)             | Public CA trust 배포         |
| [CA-ROLLOVER-RUNBOOK.md](CA-ROLLOVER-RUNBOOK.md)                         | CA 교체                      |
| [FAILURE-RUNBOOK.md](FAILURE-RUNBOOK.md)                                 | RabbitMQ 장애 확인 및 복구        |
