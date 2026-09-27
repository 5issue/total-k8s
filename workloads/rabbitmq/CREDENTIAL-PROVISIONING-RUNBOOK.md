# RabbitMQ Application 자격 증명 관리 Runbook

이 Runbook은 `total-prod` vhost와 `total-backend`, `total-wms`, `total-oms` Application Identity의 자격 증명 구성, 갱신 및 복구 절차를 정의합니다.

## 1. 자격 증명 계약

모든 Application credential Secret은 `username`, `password` key를 사용하며 Application user에는 management tag를 부여하지 않습니다. Configure / Write / Read 권한은 `total-prod` vhost 범위에 적용합니다.

| Identity | Username | Kubernetes Secret | Configure | Write | Read |
| --- | --- | --- | --- | --- | --- |
| Backend | `total-backend` | `rabbitmq-app-credentials` | `.*` | `.*` | `.*` |
| WMS | `total-wms` | `rabbitmq-wms-credentials` | 아래 WMS Configure | 아래 WMS Write | 아래 WMS Read |
| OMS | `total-oms` | `rabbitmq-oms-credentials` | 아래 OMS Configure | 아래 OMS Write | 아래 OMS Read |

### WMS Configure

```text
^(order\.topic\.exchange|session\.topic\.exchange|wms\.topic\.exchange|wms\.inventory\.confirm\.(queue|dlq))$
```

### WMS Write

```text
^(amq\.default|session\.topic\.exchange|wms\.topic\.exchange|wms\.inventory\.confirm\.queue)$
```

### WMS Read

```text
^(order\.topic\.exchange|wms\.inventory\.confirm\.queue)$
```

### OMS Configure

```text
^(session\.topic\.exchange|oms\.topic\.exchange|oms\.(order-payment-completed|return-requested|wms-inspected|payment-refunded)\.(queue|dlq))$
```

### OMS Write

```text
^(amq\.default|session\.topic\.exchange|oms\.topic\.exchange|oms\.(order-payment-completed|return-requested|wms-inspected|payment-refunded)\.queue)$
```

### OMS Read

```text
^(order\.topic\.exchange|payment\.topic\.exchange|oms\.topic\.exchange|wms\.topic\.exchange|oms\.(order-payment-completed|return-requested|wms-inspected|payment-refunded)\.queue)$
```

### Topic Permission

| Identity | Exchange | Write routing key | Read routing key |
| --- | --- | --- | --- |
| WMS | `wms.topic.exchange` | `^wms\.(inbound\.completed|outbound\.completed|return\.inspected)$` | `^$` |
| OMS | `wms.topic.exchange` | `^$` | `^wms\.return\.inspected$` |

WMS의 resource/topic ACL은 현재 서비스가 실제 발행하는 inbound/outbound 이벤트와
inventory-confirm consumer 선언을 포함합니다. OMS의 resource ACL도 현재 서비스의
session activity, order/payment consumer 및 OMS producer 선언을 포함합니다.

AUTHZ-09 역할 분리는 이 전체 서비스 역할과 별개로 `wms.return.inspected` 흐름에만
적용합니다. 따라서 WMS에는 해당 routing key의 write, OMS에는 read topic permission을
부여합니다. Backend 내부 exchange/routing key 불일치는 ACL 확대로 보정하지 않습니다.

`rabbitmq-default-user`는 Application Identity Provisioning을 위한 bootstrap credential로 사용하며 Application에서는 사용하지 않습니다.

---

## 2. Source of Truth와 Secret 배포 계약

RabbitMQ Application credential의 Source of Truth는 AWS Secrets Manager입니다.

AWS Secrets Manager resource와 Kubernetes Secret publication 경로는 `total-infra`에서 관리합니다. 실제 credential 값과 SecretVersion 생성·갱신은 Terraform 관리 범위에 포함하지 않습니다.

각 identity의 credential은 동일한 AWS Secrets Manager source version을 기준으로 다음 Namespace에 배포합니다.

| Namespace | 사용 목적 |
| --- | --- |
| `messaging` | RabbitMQ Application Identity Provisioning |
| `backend` | Production Backend RabbitMQ 연결 |
| `dev` | Dev Backend RabbitMQ 연결 |

대상 Secret:

- Backend: `rabbitmq-app-credentials`
- WMS: `rabbitmq-wms-credentials`
- OMS: `rabbitmq-oms-credentials`

Publication 과정에서는 source VersionId를 고정하고 Secret type, source Secret, source VersionId annotation, `username`/`password` key schema 및 Namespace 간 VersionId 일치를 검증합니다.

---

## 3. 초기 구성

1. `total-infra` init stack으로 다음 Secrets Manager 컨테이너를 준비합니다.
   - `prod/total/rabbitmq-app-credentials`
   - `prod/total/rabbitmq-wms-credentials`
   - `prod/total/rabbitmq-oms-credentials`

2. 기존 credential을 확인합니다.

   ```text
   make rabbitmq-credentials-check
   ```

   없는 identity가 있고 신규 발급이 승인된 경우에만 다음을 실행합니다.

   ```text
   make rabbitmq-credentials-initialize
   ```

   Initializer는 기존 `AWSCURRENT`를 변경하지 않으며 password를 Terraform state나 터미널에 출력하지 않습니다.

3. EKS와 `messaging`, `backend`, `dev` Namespace가 준비된 후 credential을 일괄 publication합니다.

   ```text
   make publish-all-credentials \
     ENV=production \
     KUBECTL_CONTEXT=<EKS cluster ARN>
   ```

4. Publication 완료 후 다음 리소스가 준비됐는지 확인합니다.
   - `messaging/rabbitmq-ca`
   - `messaging/rabbitmq-default-user`
   - `messaging/rabbitmq-app-credentials`
   - `messaging/rabbitmq-wms-credentials`
   - `messaging/rabbitmq-oms-credentials`
   - RabbitMQ Management API HTTPS `15671`

전체 Fresh EKS 구성 순서는 `total-infra`의 RabbitMQ Identity Provisioning Runbook을 따릅니다.

---

## 4. Application Identity Provisioning

RabbitMQ 기반 리소스는 자동 동기화되는 `rabbitmq-app`이 관리합니다.

Application Identity Provisioning Job은 외부 credential publication이 완료된 이후 실행할 수 있도록 별도 `rabbitmq-provisioning-app`에서 관리하며 automated sync를 사용하지 않습니다.

Fresh EKS에서는 다음 순서로 진행합니다.

1. addons와 `rabbitmq-app`을 정상화합니다.
2. RabbitMQ Cluster, TLS, bootstrap credential 및 CA trust가 준비됐는지 확인합니다.
3. `total-infra`에서 Application credential publication을 완료합니다.
4. `rabbitmq-provisioning-app`을 sync합니다.

   ```text
   argocd app sync rabbitmq-provisioning-app
   ```

5. `rabbitmq-application-provisioning` Job이 `Complete`인지 확인합니다.

Provisioning Job은 RabbitMQ Management API를 통해 다음 상태를 멱등 구성하고 검증합니다.

1. `total-prod` vhost
2. `total-backend`, `total-wms`, `total-oms` user
3. 각 user의 Configure / Write / Read permission
4. topic permission이 계약과 다를 때만 기존 permission 전체 제거
5. 필요한 경우 WMS/OMS의 단일 `wms.topic.exchange` topic permission 재적용
6. Backend에는 topic permission이 없고 WMS/OMS에는 계약한 단일 permission만 있는지 확인
7. user, permission 및 topic permission의 실제 적용값

`rabbitmq-provisioning-app`의 Job에는 `Force=true,Replace=true`를 유지합니다. Credential 갱신이나 복구 시 Application을 다시 sync하면 완료된 Job을 재생성하고 동일한 계약 상태로 수렴합니다.

Management API:

```text
https://rabbitmq.messaging.svc.cluster.local:15671
```

Provisioning에 사용하는 리소스:

| 항목 | Resource |
| --- | --- |
| Bootstrap credential | `messaging/rabbitmq-default-user` |
| Application credentials | `messaging/rabbitmq-app-credentials`, `messaging/rabbitmq-wms-credentials`, `messaging/rabbitmq-oms-credentials` |
| CA trust | `messaging/rabbitmq-ca/ca.crt` |

Management API 연결 시 CA chain과 hostname을 검증합니다.

---

## 5. 자격 증명 갱신

Application credential 변경 시 AWS Secrets Manager의 새 `AWSCURRENT` version을 기준으로 갱신합니다.

1. AWS Secrets Manager에 새 credential version을 준비합니다.
2. `total-infra`의 대상 publication 절차로 Kubernetes Secret을 갱신하고 검증합니다.
3. `rabbitmq-provisioning-app`을 다시 sync해 RabbitMQ Application Identity를 현재 계약으로 수렴합니다.
4. 해당 Backend workload를 재연결하거나 rollout합니다.
5. AMQPS 인증 및 필요한 publish/consume 동작을 확인합니다.

Publication 이후 RabbitMQ provisioning과 Backend 재연결을 연속해서 수행해 Kubernetes Secret과 RabbitMQ credential 사이의 불일치 시간을 최소화합니다.

WMS/OMS 전환 후에도 다른 Backend 서비스가 사용하므로 `total-backend`, `rabbitmq-app-credentials`와 기존 `.*` permission은 유지합니다.

---

## 6. 자격 증명 복구

Application credential 또는 RabbitMQ Application Identity 복구 시 AWS Secrets Manager의 현재 `AWSCURRENT` version을 기준으로 복구합니다.

1. 현재 credential source를 확인합니다.
2. `total-infra`에서 credential을 다시 publication하고 검증합니다.
3. RabbitMQ TLS와 Management API 접근 상태를 확인합니다.
4. `rabbitmq-provisioning-app`을 sync해 vhost, user 및 permission을 계약 상태로 복구합니다.
5. 해당 Backend workload를 재연결하거나 rollout합니다.
6. AMQPS 인증 및 필요한 publish/consume 동작을 확인합니다.

기존 PVC를 유지한 RabbitMQ Cluster 복구 시에는 `rabbitmq-default-user` Secret과 RabbitMQ 내부 bootstrap credential의 정합성을 먼저 확인합니다.

Pod/PVC, cluster membership, TLS 및 Application Identity 장애의 상세 대응은 `FAILURE-RUNBOOK.md`를 따릅니다.

---

## 7. Backend 연결 계약

Backend는 다음 연결 정보를 사용합니다.

| 환경변수 | 값 |
| --- | --- |
| `RABBITMQ_HOST` | `rabbitmq.messaging.svc.cluster.local` |
| `RABBITMQ_PORT` | `5671` |
| `RABBITMQ_VHOST` | `total-prod` |
| `RABBITMQ_USERNAME` | 선택된 credential Secret의 `username` |
| `RABBITMQ_PASSWORD` | 선택된 credential Secret의 `password` |

서비스별 credential:

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

Backend 연결은 AMQPS `5671` only이며 CA chain과 `rabbitmq.messaging.svc.cluster.local` 기준 Server Certificate/Hostname을 검증합니다.

Application username/password 인증을 사용하며 mTLS는 사용하지 않습니다.

---

## 8. 연계 검증

보안팀의 Management API 점검은 임시 관리자 계정과 `kubectl port-forward`를 사용하는 수동 절차로 수행합니다. 상시 Management API 외부 노출이나 별도 monitoring/audit 계정은 이 구현 범위에 포함하지 않습니다.

### RabbitMQ

- `total-prod` vhost 존재
- `total-backend`, `total-wms`, `total-oms` user 존재
- Application user에 management tag 없음
- 세 user의 Configure / Write / Read가 자격 증명 계약과 일치
- Management API HTTPS `15671` 접근 가능

### 최소 권한

- WMS는 실제 구현의 session activity 및 WMS inbound/outbound 발행, inventory-confirm
  topology 선언/consume이 가능
- OMS는 실제 구현의 session activity 및 OMS event 발행, order/payment/WMS 관련
  topology 선언/consume이 가능
- AUTHZ-09 흐름에서는 WMS만 `wms.return.inspected`를 발행하고 OMS만 구독 가능
- WMS/OMS의 Configure / Write / Read는 자격 증명 계약에 정의된 리소스로 제한

### TLS

- Backend AMQPS `5671` only 연결
- `rabbitmq.messaging.svc.cluster.local` 기준 Server Certificate Validation
- CA chain 검증
- Hostname Verification

### Backend

- `total-prod` vhost 인증
- WMS/OMS Deployment가 각각 전용 credential Secret 참조
- 그 외 Backend는 기존 `rabbitmq-app-credentials` 사용
- 서비스별 필요한 publish/consume 동작 확인

이 Runbook은 credential 값을 출력하거나 Secret manifest에 하드코딩하는 절차를 포함하지 않습니다.
