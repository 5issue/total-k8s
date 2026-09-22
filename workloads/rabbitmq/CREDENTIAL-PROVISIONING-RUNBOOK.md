# RabbitMQ Application 자격 증명 관리 Runbook

이 Runbook은 `total-prod` vhost와 `total-backend`, `total-wms`, `total-oms`
Application Identity에 필요한 자격 증명의 구성, 갱신 및 복구 절차를 정의합니다.

## 1. 자격 증명 계약

모든 Application credential Secret은 `username`, `password` key를 사용하며,
Application user에는 management tag를 부여하지 않습니다. Configure / Write / Read
권한은 `total-prod` vhost 범위에 적용합니다.

| Identity | Username | Kubernetes Secret | Configure | Write | Read |
| --- | --- | --- | --- | --- | --- |
| Backend | `total-backend` | `rabbitmq-app-credentials` | `.*` | `.*` | `.*` |
| WMS | `total-wms` | `rabbitmq-wms-credentials` | `^wms\.topic\.exchange$` | `^wms\.topic\.exchange$` | `^$` |
| OMS | `total-oms` | `rabbitmq-oms-credentials` | 아래 OMS Configure | 아래 OMS Write | 아래 OMS Read |

OMS Configure:

```text
^(oms\.topic\.exchange|oms\.(order-payment-completed|return-requested|wms-inspected|payment-refunded)\.(queue|dlq))$
```

OMS Write:

```text
^(amq\.default|oms\.topic\.exchange|oms\.(order-payment-completed|return-requested|wms-inspected|payment-refunded)\.queue)$
```

OMS Read:

```text
^(order\.topic\.exchange|oms\.topic\.exchange|oms\.(order-payment-completed|return-requested|wms-inspected|payment-refunded)\.queue)$
```

WMS Topic Permission:

| 항목 | 값 |
| --- | --- |
| Vhost | `total-prod` |
| Exchange | `wms.topic.exchange` |
| Write routing key | `^wms\.return\.inspected$` |
| Read routing key | `^$` |

일반 permission은 routing key가 아니라 exchange와 queue 이름에 적용합니다. 공용
`wms.topic.exchange`에 대한 WMS 발행 범위는 별도 topic permission으로 제한합니다.
OMS에는 topic permission을 추가하지 않습니다. `amq.default` write는 OMS primary
queue가 default exchange를 DLX로 사용하는 현재 애플리케이션 계약에 필요합니다.

`rabbitmq-default-user`는 Application Identity Provisioning을 위한 bootstrap
credential로 사용하며 Application에서는 사용하지 않습니다.

## 2. Source of Truth와 Secret 배포 계약

RabbitMQ Application credential의 Source of Truth는 AWS Secrets Manager입니다.
AWS Secrets Manager resource와 Kubernetes Secret publication 경로는
`total-infra`에서 관리합니다. 실제 credential 값과 SecretVersion 생성·갱신은
Terraform 관리 범위에 포함하지 않습니다.

각 identity는 한 번의 publication에서 확인한 동일한 AWS Secrets Manager source
version을 기준으로 다음 Namespace의 같은 이름 Kubernetes Secret에 배포되어야
합니다.

| Namespace | 사용 목적 |
| --- | --- |
| `messaging` | RabbitMQ Application Identity Provisioning |
| `backend` | Production Backend RabbitMQ 연결 |
| `dev` | Dev Backend RabbitMQ 연결 |

대상 Secret 이름은 다음과 같습니다.

- Backend: `rabbitmq-app-credentials`
- WMS: `rabbitmq-wms-credentials`
- OMS: `rabbitmq-oms-credentials`

`total-infra`는 Backend, WMS, OMS에 대해 다음 publish/verify target을 제공합니다.

| Identity | Publish | Verify |
| --- | --- | --- |
| Backend | `make rabbitmq-credential-publish` | `make rabbitmq-credential-verify` |
| WMS | `make rabbitmq-wms-credential-publish` | `make rabbitmq-wms-credential-verify` |
| OMS | `make rabbitmq-oms-credential-publish` | `make rabbitmq-oms-credential-verify` |

## 3. 초기 구성

기존 `total-backend` Application Identity Provisioning 전 다음 순서로 credential을
준비합니다.

1. `total-infra`에서 `make apply`를 실행해 AWS Secrets Manager에
   `prod/total/rabbitmq-app-credentials` resource를 생성합니다.
2. 별도 운영 절차를 통해 최초 Application credential을 발급하고 SecretVersion을
   생성합니다. `username`은 `total-backend`이고 `password`는 비어 있지 않아야
   합니다.
3. EKS와 `messaging`, `backend`, `dev` Namespace가 준비된 이후
   `total-infra`에서 다음 명령을 실행합니다.

   ```text
   make rabbitmq-credential-publish
   ```

4. publication 결과는 다음 명령으로 확인합니다.

   ```text
   make rabbitmq-credential-verify
   ```

publication 스크립트는 실행 시작 시 AWS Secrets Manager의 유일한 `AWSCURRENT`
VersionId를 고정하고 해당 version payload를 조회합니다. 한 번의 실행에서는 이
VersionId를 기준으로 다음 세 Secret을 publication하고 즉시 검증합니다.

- `messaging/rabbitmq-app-credentials`
- `backend/rabbitmq-app-credentials`
- `dev/rabbitmq-app-credentials`

검증 시 Secret type, source Secret 및 source VersionId annotation,
`username`/`password` key schema와 세 Namespace의 VersionId 일치를 확인합니다.
`publish` 실행 중 검증은 고정한 `AWSCURRENT` VersionId와 publication 결과를
비교합니다. 독립 `make rabbitmq-credential-verify`는 Kubernetes의 세 Namespace에
기록된 source VersionId가 서로 같은지 검증하며 AWS의 `AWSCURRENT`를 다시
resolve하지 않습니다.

WMS/OMS도 각 전용 target으로 같은 책임 경계와 동일 source version 계약을
따릅니다. 실제 credential 값과 SecretVersion 준비는 별도 승인된 운영 절차입니다.

이후 RabbitMQ Cluster와 다음 리소스가 준비된 상태에서 Application Identity
Provisioning을 수행합니다.

- `messaging/rabbitmq-ca`
- `messaging/rabbitmq-default-user`
- `messaging/rabbitmq-app-credentials`
- `messaging/rabbitmq-wms-credentials`
- `messaging/rabbitmq-oms-credentials`
- RabbitMQ Management API HTTPS `15671`

## 4. Application Identity Provisioning

Provisioning Job은 다음 Secret을 읽습니다.

| Secret | Mount path | Expected username |
| --- | --- | --- |
| `rabbitmq-app-credentials` | `/var/run/rabbitmq-secrets/application` | `total-backend` |
| `rabbitmq-wms-credentials` | `/var/run/rabbitmq-secrets/wms` | `total-wms` |
| `rabbitmq-oms-credentials` | `/var/run/rabbitmq-secrets/oms` | `total-oms` |

Provisioning Job은 RabbitMQ Management API를 통해 다음 상태를 멱등 구성합니다.

1. `total-prod` vhost를 PUT하고 GET으로 검증합니다.
2. 각 Secret의 username이 Identity 계약과 일치하는지 검증합니다.
3. 세 user를 management tag 없이 생성하거나 현재 password로 수렴합니다.
4. 각 user의 `total-prod` Configure / Write / Read permission을 PUT합니다.
5. WMS의 `wms.topic.exchange` topic permission을 PUT합니다.
6. user, permission과 WMS topic permission을 GET하여 실제 적용값을 검증합니다.

Management API endpoint:

```text
https://rabbitmq.messaging.svc.cluster.local:15671
```

Provisioning에는 다음 자격 정보를 사용합니다.

| 항목 | Resource |
| --- | --- |
| Bootstrap credential | `messaging/rabbitmq-default-user` |
| Application credentials | `messaging/rabbitmq-app-credentials`, `messaging/rabbitmq-wms-credentials`, `messaging/rabbitmq-oms-credentials` |
| CA trust | `messaging/rabbitmq-ca/ca.crt` |

Management API 연결 시 CA chain과 hostname을 검증합니다. credential publication,
bootstrap credential, CA trust와 RabbitMQ 준비가 완료된 이후 Job을 실행하며, 실패
시 로그에서 `backend`, `wms`, `oms` 중 실패한 identity를 확인합니다.

## 5. 자격 증명 갱신

Application password를 변경할 때는 대상 identity의 동일한 AWS Secrets Manager
source version을 기준으로 RabbitMQ와 Backend를 갱신합니다.

기존 `total-backend` 갱신 절차:

1. AWS Secrets Manager에 새로운 Application credential version을 준비하고
   `AWSCURRENT` 상태를 확인합니다.
2. `total-infra`에서 `make rabbitmq-credential-publish`를 실행해 실행 시작 시 고정한
   `AWSCURRENT` VersionId의 credential을 `messaging`, `backend`, `dev` Secret에
   반영합니다.
3. `make rabbitmq-credential-verify`로 세 Secret의 source VersionId와 key schema가
   일치하는지 확인합니다.
4. Provisioning Job을 실행해 RabbitMQ의 `total-backend` credential과 permission을
   수렴합니다.
5. RabbitMQ의 user/vhost/permission 상태를 확인합니다.
6. Backend가 새로운 credential을 사용하도록 재연결하거나 rollout합니다.
7. Backend의 AMQPS 인증과 publish/consume을 확인합니다.

WMS/OMS도 대상 identity별 전용 publish/verify target으로 같은 순서를 수행합니다.

credential 갱신 중에는 Kubernetes Secret과 RabbitMQ user credential 사이에
일시적인 불일치 구간이 발생할 수 있습니다. publication 이후 Provisioning과 해당
Backend 재연결을 연속된 운영 절차로 수행해 불일치 시간을 최소화합니다.

WMS/OMS 전환 후에도 다른 Backend 서비스가 사용하므로 `total-backend` user,
`rabbitmq-app-credentials`와 기존 `.*` permission을 삭제하거나 축소하지 않습니다.

## 6. 자격 증명 복구

Application credential 또는 RabbitMQ Application Identity를 복구할 때는 AWS
Secrets Manager의 현재 `AWSCURRENT` credential version을 기준으로 복구합니다.

기존 `total-backend` 복구 절차:

1. AWS Secrets Manager의 현재 `AWSCURRENT` VersionId를 확인합니다.
2. `total-infra`에서 `make rabbitmq-credential-publish`를 실행해 고정한 source
   VersionId의 credential을 세 Namespace의 Kubernetes Secret에 반영합니다.
3. `make rabbitmq-credential-verify`로 세 Secret의 source VersionId 일치 여부를
   확인합니다.
4. RabbitMQ TLS와 Management API `15671` 접근 상태를 확인합니다.
5. Provisioning Job을 실행해 `total-prod` vhost와 세 Application user 및
   permission을 계약 상태로 구성합니다. 실행 전 WMS/OMS credential Secret도
   준비되어 있어야 합니다.
6. RabbitMQ의 user/vhost/permission 상태를 확인합니다.
7. 해당 Backend가 현재 credential을 사용하도록 재연결하거나 rollout합니다.
8. Backend의 AMQPS 인증과 필요한 publish/consume을 확인합니다.

기존 PVC를 유지한 RabbitMQ Cluster 복구 시에는 Provisioning에 사용하는
`rabbitmq-default-user` Secret과 RabbitMQ 내부 bootstrap credential의 정합성을
먼저 확인합니다. Pod/PVC, cluster membership, TLS 및 Application Identity 장애의
상세 대응은 [FAILURE-RUNBOOK.md](FAILURE-RUNBOOK.md)를 따릅니다.

## 7. Backend 연결 계약

Backend는 다음 공통 연결 정보를 사용합니다.

| 환경변수 | 값 |
| --- | --- |
| `RABBITMQ_HOST` | `rabbitmq.messaging.svc.cluster.local` |
| `RABBITMQ_PORT` | `5671` |
| `RABBITMQ_VHOST` | `total-prod` |
| `RABBITMQ_USERNAME` | 선택된 credential Secret의 `username` |
| `RABBITMQ_PASSWORD` | 선택된 credential Secret의 `password` |

서비스별 credential Secret 선택:

| Service | Credential Secret |
| --- | --- |
| WMS | `rabbitmq-wms-credentials` |
| OMS | `rabbitmq-oms-credentials` |
| 그 외 기존 Backend | `rabbitmq-app-credentials` |

CA trust:

| 항목 | 값 |
| --- | --- |
| Secret | `backend/rabbitmq-ca` |
| Key | `ca.crt` |
| Mount Path | `/etc/ssl/certs/rabbitmq/ca.crt` |
| Trust 방식 | Spring PEM SSL Bundle |

Backend 연결 계약은 AMQPS `5671` only이며, CA chain을 신뢰해 Server Certificate
Validation과 `rabbitmq.messaging.svc.cluster.local` 기준 Hostname Verification을
수행해야 합니다. Application username/password를 사용하며 mTLS는 사용하지 않습니다.

## 8. 연계 검증

Application Identity 구성 후 다음 상태를 확인합니다.

보안팀의 Management API 점검은 임시 관리자 계정과 `kubectl port-forward`를
사용하는 수동 절차로 수행합니다. 상시 Management API 외부 노출이나 monitoring/audit
계정은 이 구현 범위에 포함하지 않습니다.

### RabbitMQ

- `total-prod` vhost
- `total-backend`, `total-wms`, `total-oms` user 및 management tag 없음
- 세 user의 Configure / Write / Read가 자격 증명 계약과 정확히 일치
- Management API HTTPS `15671` 접근

### 최소 권한

- WMS는 `wms.topic.exchange` 선언과 발행만 가능
- WMS는 `wms.topic.exchange`에서 routing key `wms.return.inspected`만 발행 가능
- WMS topic permission의 read routing key는 `^$`
- OMS는 계약에 포함된 exchange/queue/DLQ 선언, binding, 발행 및 소비 가능
- WMS/OMS는 계약 밖의 리소스를 선언, 발행 또는 소비할 수 없음
- OMS에는 topic permission이 없음

### TLS

- Backend AMQPS `5671` only 연결
- `rabbitmq.messaging.svc.cluster.local` 기준 Server Certificate Validation
- CA chain 검증
- Hostname Verification

### Backend

- `total-prod` vhost 인증
- WMS와 OMS Deployment의 `RABBITMQ_USERNAME`, `RABBITMQ_PASSWORD`가 각각의
  전용 Secret을 참조
- 그 외 Backend는 기존 `rabbitmq-app-credentials`를 계속 사용
- 서비스별로 필요한 publish/consume 동작

이 Runbook은 credential 값을 출력하거나 Secret manifest에 하드코딩하는 절차를
포함하지 않습니다.
