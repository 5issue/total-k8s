# RabbitMQ Application 자격 증명 관리 Runbook

이 Runbook은 `total-prod` vhost와 `total-backend` Application Identity에 필요한 자격 증명의 구성, 갱신 및 복구 절차를 정의합니다.

## 1. 자격 증명 계약

RabbitMQ Application 연결에는 다음 값을 사용합니다.

| 항목                | 값                          |
| ----------------- | -------------------------- |
| Vhost             | `total-prod`               |
| Username          | `total-backend`            |
| Credential Secret | `rabbitmq-app-credentials` |
| Secret Keys       | `username`, `password`     |
| Configure         | `.*`                       |
| Write             | `.*`                       |
| Read              | `.*`                       |

Configure / Write / Read 권한은 `total-prod` vhost 범위에 적용합니다.

`rabbitmq-default-user`는 Application Identity Provisioning을 위한 bootstrap credential로 사용합니다.

## 2. Source of Truth와 Secret 배포 계약

RabbitMQ Application credential의 Source of Truth는 AWS Secrets Manager입니다.

동일한 credential version을 기준으로 다음 Kubernetes Secret을 제공합니다.

| Kubernetes Secret                    | Keys                   | 사용 목적                                      |
| ------------------------------------ | ---------------------- | ------------------------------------------ |
| `messaging/rabbitmq-app-credentials` | `username`, `password` | RabbitMQ Application Identity Provisioning |
| `backend/rabbitmq-app-credentials`   | `username`, `password` | Backend RabbitMQ 연결                        |

두 Secret과 RabbitMQ의 `total-backend` user credential은 동일한 Secrets Manager version을 기준으로 관리합니다.

AWS Secrets Manager resource와 credential publication에 필요한 IAM 구성은 `total-infra`에서 관리합니다.

## 3. 초기 구성

Application Identity Provisioning에는 다음 리소스가 필요합니다.

* RabbitMQ Cluster Operator
* `messaging` Namespace의 RabbitMQ Cluster
* `messaging/rabbitmq-ca`
* `messaging/rabbitmq-app-credentials`
* RabbitMQ Management API HTTPS `15671`

Provisioning은 RabbitMQ Cluster와 필요한 Secret이 준비된 이후 수행합니다.

## 4. Application Identity Provisioning

Provisioning Job은 RabbitMQ Management API를 통해 다음 상태를 구성합니다.

* Vhost: `total-prod`
* User: `total-backend`
* Configure: `.*`
* Write: `.*`
* Read: `.*`

Management API endpoint:

```text
https://rabbitmq.messaging.svc.cluster.local:15671
```

Provisioning에는 다음 자격 정보를 사용합니다.

| 항목                     | Resource                             |
| ---------------------- | ------------------------------------ |
| Bootstrap credential   | `rabbitmq-default-user`              |
| Application credential | `messaging/rabbitmq-app-credentials` |
| CA trust               | `messaging/rabbitmq-ca/ca.crt`       |

Management API 연결 시 CA chain과 hostname을 검증합니다.

Provisioning Job은 vhost, user 및 permission을 현재 계약 상태로 구성한 뒤 결과를 다시 확인합니다.

## 5. 자격 증명 갱신

Application password를 변경할 때는 AWS Secrets Manager의 동일 credential version을 기준으로 RabbitMQ와 Backend를 갱신합니다.

```text
AWS Secrets Manager
        │
        ├── messaging/rabbitmq-app-credentials
        │           ↓
        │    RabbitMQ total-backend user
        │
        └── backend/rabbitmq-app-credentials
                    ↓
             Backend Application
```

갱신 절차:

1. AWS Secrets Manager에 새로운 Application credential version을 준비합니다.
2. 동일 version을 `messaging/rabbitmq-app-credentials`와 `backend/rabbitmq-app-credentials`에 제공합니다.
3. Provisioning Job을 실행해 RabbitMQ의 `total-backend` credential을 갱신합니다.
4. RabbitMQ의 user/vhost/permission 상태를 확인합니다.
5. Backend가 새로운 credential을 사용하도록 재연결합니다.
6. Backend의 AMQPS 인증과 publish/consume을 확인합니다.

## 6. 자격 증명 복구

Application credential 또는 RabbitMQ Application Identity를 복구할 때는 AWS Secrets Manager의 현재 credential version을 기준으로 복구합니다.

복구 절차:

1. AWS Secrets Manager의 현재 Application credential version을 확인합니다.
2. 동일 credential을 `messaging/rabbitmq-app-credentials`와 `backend/rabbitmq-app-credentials`에 제공합니다.
3. RabbitMQ TLS와 Management API `15671` 접근 상태를 확인합니다.
4. Provisioning Job을 실행해 `total-prod` vhost, `total-backend` user 및 permission을 계약 상태로 구성합니다.
5. RabbitMQ의 user/vhost/permission 상태를 확인합니다.
6. Backend의 AMQPS 인증과 publish/consume을 확인합니다.

기존 RabbitMQ PVC를 사용하는 복구에서는 RabbitMQ 내부 bootstrap credential과 `rabbitmq-default-user` Secret의 일치 여부를 함께 확인합니다.

## 7. Backend 연결 계약

Backend는 다음 연결 정보를 사용합니다.

| 환경변수                | 값                                              |
| ------------------- | ---------------------------------------------- |
| `RABBITMQ_HOST`     | `rabbitmq.messaging.svc.cluster.local`         |
| `RABBITMQ_PORT`     | `5671`                                         |
| `RABBITMQ_VHOST`    | `total-prod`                                   |
| `RABBITMQ_USERNAME` | `backend/rabbitmq-app-credentials`의 `username` |
| `RABBITMQ_PASSWORD` | `backend/rabbitmq-app-credentials`의 `password` |

CA trust:

| 항목         | 값                          |
| ---------- | -------------------------- |
| Secret     | `backend/rabbitmq-ca`      |
| Key        | `ca.crt`                   |
| Mount Path | `/etc/rabbitmq/tls/ca.crt` |
| Trust 방식   | Spring PEM SSL Bundle      |

Backend 연결에서는 Server Certificate Validation과 Hostname Verification을 적용합니다.

## 8. 연계 검증

Application Identity 구성 후 다음 상태를 확인합니다.

### RabbitMQ

* `total-prod` vhost
* `total-backend` user
* `total-prod` 범위 Configure / Write / Read `.*`
* Management API HTTPS `15671` 접근

### TLS

* `rabbitmq.messaging.svc.cluster.local` 기준 Server Certificate Validation
* CA chain 검증
* Hostname Verification

### Backend

* AMQPS `5671` 연결
* `total-prod` vhost 인증
* `total-backend` credential 인증
* publish/consume 동작