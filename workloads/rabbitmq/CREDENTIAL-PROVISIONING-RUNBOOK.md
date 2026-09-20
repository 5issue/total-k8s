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
| `dev/rabbitmq-app-credentials`       | `username`, `password` | Dev Backend RabbitMQ 연결                    |

Application credential 구성·갱신·복구 시 세 Kubernetes Secret과 RabbitMQ의 `total-backend` user credential은 동일한 Secrets Manager version을 기준으로 최종 수렴하도록 관리합니다.

AWS Secrets Manager resource와 Kubernetes Secret publication 경로는 `total-infra`에서 관리합니다. 실제 credential 값과 SecretVersion 생성·갱신은 Terraform 관리 범위에 포함하지 않습니다.

## 3. 초기 구성

Application Identity Provisioning 전 다음 순서로 credential을 준비합니다.

1. `total-infra`에서 `make apply`를 실행해 AWS Secrets Manager에 `prod/total/rabbitmq-app-credentials` resource를 생성합니다.
2. 별도 운영 절차를 통해 최초 Application credential을 발급하고
   다음 형태의 SecretVersion을 생성합니다.
   - `username`: `total-backend`
   - `password`: 발급된 Application password
3. EKS와 `messaging`, `backend`, `dev` Namespace가 준비된 이후
   `total-infra`에서 다음 명령을 실행합니다.

   `make rabbitmq-credential-publish`

4. publication 결과는 다음 명령으로 확인합니다.

   `make rabbitmq-credential-verify`

publication은 한 번의 실행에서 확인한 동일한 AWSCURRENT VersionId를 기준으로
다음 세 Secret을 구성합니다.

- `messaging/rabbitmq-app-credentials`
- `backend/rabbitmq-app-credentials`
- `dev/rabbitmq-app-credentials`

이후 RabbitMQ Cluster와 다음 리소스가 준비된 상태에서
Application Identity Provisioning을 수행합니다.

- `messaging/rabbitmq-ca`
- `messaging/rabbitmq-app-credentials`
- RabbitMQ Management API HTTPS `15671`

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

`provisioning-job.yaml`은 credential publication과 RabbitMQ 준비 이후 실행하는 one-shot 작업이므로 EKS overlay의 상시 적용 리소스에 포함하지 않습니다. 실제 실행·재실행 방식은 배포/GitOps 구성에 따릅니다.

## 5. 자격 증명 갱신

Application password를 변경할 때는 AWS Secrets Manager의 동일 credential version을 기준으로 RabbitMQ와 Backend를 갱신합니다.

```text
AWS Secrets Manager
        │
        ├── messaging/rabbitmq-app-credentials
        │           ↓
        │    RabbitMQ total-backend user
        │
        ├── backend/rabbitmq-app-credentials
        │           ↓
        │    Backend Application
        │
        └── dev/rabbitmq-app-credentials
                    ↓
              Dev Backend
```

갱신 절차:

1. AWS Secrets Manager에 새로운 Application credential version을 준비합니다.
2. `total-infra`에서 `make rabbitmq-credential-publish`를 실행해 현재 AWSCURRENT VersionId의 credential을 세 Kubernetes Secret에 반영합니다.
3. `make rabbitmq-credential-verify`로 세 Secret의 source VersionId 일치 여부를 확인합니다.
4. Provisioning Job을 실행해 RabbitMQ의 `total-backend` credential을 갱신합니다.
5. RabbitMQ의 user/vhost/permission 상태를 확인합니다.
6. Backend가 새로운 credential을 사용하도록 재연결합니다.
7. Backend의 AMQPS 인증과 publish/consume을 확인합니다.

credential 갱신 중에는 Kubernetes Secret과 RabbitMQ user credential 사이에 일시적인 불일치 구간이 발생할 수 있으므로, publication 이후 Provisioning과 Backend 재연결을 연속된 운영 절차로 수행합니다.

## 6. 자격 증명 복구

Application credential 또는 RabbitMQ Application Identity를 복구할 때는 AWS Secrets Manager의 현재 credential version을 기준으로 복구합니다.

복구 절차:

1. AWS Secrets Manager의 현재 Application credential version을 확인합니다.
2. `total-infra`에서 `make rabbitmq-credential-publish`를 실행해 현재 AWSCURRENT VersionId의 credential을 세 Kubernetes Secret에 반영합니다.
3. `make rabbitmq-credential-verify`로 세 Secret의 source VersionId 일치 여부를 확인합니다.
4. RabbitMQ TLS와 Management API `15671` 접근 상태를 확인합니다.
5. Provisioning Job을 실행해 `total-prod` vhost, `total-backend` user 및 permission을 계약 상태로 구성합니다.
6. RabbitMQ의 user/vhost/permission 상태를 확인합니다.
7. Backend가 현재 credential을 사용하도록 재연결합니다.
8. Backend의 AMQPS 인증과 publish/consume을 확인합니다.

기존 PVC를 유지한 RabbitMQ Cluster 복구 시에는 Provisioning에 사용하는 `rabbitmq-default-user` Secret과 RabbitMQ 내부 bootstrap credential의 정합성을 먼저 확인합니다. 상세 장애 대응은 FAILURE-RUNBOOK.md를 따릅니다.

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
