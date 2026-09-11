# RabbitMQ Application 자격 증명 관리 Runbook

이 Runbook은 `total-prod` vhost와 `total-backend` Application Identity에 필요한 자격 증명의 구성, 갱신 및 복구 기준을 정의합니다.

실제 자격 증명 값은 Git, Kubernetes manifest, Terraform 코드 또는 Terraform state에 저장하지 않습니다.

## 1. 자격 증명 계약

RabbitMQ Application 연결에는 다음 값을 사용합니다.

| 항목 | 값 |
| --- | --- |
| Vhost | `total-prod` |
| Username | `total-backend` |
| Credential Secret | `rabbitmq-app-credentials` |
| Secret Keys | `username`, `password` |
| Configure | `.*` |
| Write | `.*` |
| Read | `.*` |

`Configure / Write / Read = .*` 권한은 RabbitMQ 전체가 아니라 `total-prod` vhost 범위에만 적용합니다.

`total-backend` 사용자는 Application 전용 계정으로 사용하며 `administrator`, `management`, `policymaker`, `monitoring` 등의 management tag를 부여하지 않습니다.

RabbitMQ Cluster Operator가 생성하는 `rabbitmq-default-user`는 RabbitMQ 구성 작업에만 사용하며 Backend Application 연결에는 사용하지 않습니다.

---

## 2. 자격 증명 기준 원본

RabbitMQ Application 자격 증명의 영속 기준 원본(Source of Truth)은 AWS Secrets Manager를 사용합니다.

AWS Secrets Manager Resource, 실제 SecretVersion 생성·갱신 방식 및 최소 IAM 구성은 `total-infra` 영역에서 별도로 구성합니다.

RabbitMQ 자격 증명은 Terraform `random_password`로 생성하거나 Terraform input/output을 통해 전달하지 않습니다. 이를 통해 실제 password가 Terraform state에 저장되는 것을 방지합니다.

동일한 Secrets Manager 원본/version을 기준으로 다음 Kubernetes Secret을 제공합니다.

| Kubernetes Secret | Keys | 사용 목적 |
| --- | --- | --- |
| `messaging/rabbitmq-app-credentials` | `username`, `password` | RabbitMQ Application Identity 구성 |
| `backend/rabbitmq-app-credentials` | `username`, `password` | Backend RabbitMQ 연결 |

두 Secret은 동일한 자격 증명을 사용해야 합니다.

실제 자격 증명 값은 Git, manifest, 로그, diff 또는 협업 문서에 기록하지 않습니다.

External Secrets Operator, Secret Sync Controller 및 Namespace 간 Secret 조회 RBAC는 현재 구성에 도입하지 않습니다.

Kubernetes Secret 배포의 구체적인 실행 주체와 AWS IAM 정책은 `total-infra` 후속 구성에서 확정합니다.

---

## 3. 초기 구성 선행조건

RabbitMQ Application Identity를 구성하기 전에 다음 조건이 충족되어야 합니다.

- cert-manager가 준비되어 있어야 합니다.
- RabbitMQ Cluster Operator가 준비되어 있어야 합니다.
- `messaging` Namespace에 RabbitMQ workload가 배포되어 있어야 합니다.
- RabbitMQ server TLS Certificate가 발급되어 있어야 합니다.
- `messaging/rabbitmq-ca`에 public CA의 `ca.crt`가 제공되어 있어야 합니다.
- `messaging/rabbitmq-app-credentials`가 준비되어 있어야 합니다.
- RabbitMQ Management API `15671/TCP`에 TLS로 접근할 수 있어야 합니다.

실제 GitOps Application 구성, 배포 순서 및 Sync 정책은 배포/GitOps 담당 영역에서 결정합니다.

이 Runbook에서는 RabbitMQ Application Identity 구성에 필요한 선행조건과 검증 기준만 정의합니다.

---

## 4. Application Identity Provisioning

RabbitMQ Application Identity는 provisioning Job을 통해 다음 상태로 수렴시킵니다.

- Vhost: `total-prod`
- User: `total-backend`
- User management tag: 없음
- Configure: `.*`
- Write: `.*`
- Read: `.*`

Provisioning Job은 다음 Management API를 사용합니다.

```text
https://rabbitmq.messaging.svc.cluster.local:15671
```

Management API 접근 시:

rabbitmq-default-user를 bootstrap credential로 사용합니다.
messaging/rabbitmq-ca/ca.crt를 사용해 서버 인증서를 검증합니다.
hostname verification을 활성화합니다.
plaintext Management API 15672는 사용하지 않습니다.

Job은 RabbitMQ 상태를 확인한 뒤 DELETE를 사용하지 않고 PUT 기반으로 vhost, user, permission을 생성하거나 현재 계약 상태로 수렴시킵니다.

구성 완료 후 GET 요청으로 vhost, user 및 permission 상태를 다시 확인합니다.

Provisioning Job 보안 경계

Job에서 사용하는 Secret은 다음으로 제한합니다.

rabbitmq-default-user
messaging/rabbitmq-app-credentials
messaging/rabbitmq-ca

다음 Secret 또는 private key에는 접근하지 않습니다.

rabbitmq-ca-signing의 CA private key
rabbitmq-server-tls의 server private key
backend/rabbitmq-app-credentials
backend/rabbitmq-ca

Application password는 mounted Secret file을 통해 읽으며 다음 위치에 노출하지 않습니다.

command-line argument
URL
environment variable
application log
shell tracing

Provisioning Job은 ServiceAccount token을 자동 mount하지 않으며 Kubernetes Secret API를 조회하기 위한 별도 RBAC 권한을 사용하지 않습니다.

Provisioning Job은 RabbitMQ Cluster와 필요한 Secret이 준비된 이후 실행해야 합니다. 실제 실행 및 GitOps 연계 방식은 배포/GitOps 구성에서 결정합니다.

---

## 5. 자격 증명 갱신

RabbitMQ Application password를 변경할 경우 다음 상태가 일치해야 합니다.

AWS Secrets Manager
        ↓
messaging/rabbitmq-app-credentials
        ↓
RabbitMQ total-backend user

AWS Secrets Manager
        ↓
backend/rabbitmq-app-credentials
        ↓
Backend Application

기본 갱신 절차는 다음과 같습니다.

1. AWS Secrets Manager에서 새로운 Application password version을 준비합니다.
2. 동일 version을 기준으로 `messaging/rabbitmq-app-credentials`와 `backend/rabbitmq-app-credentials`를 갱신합니다.
3. Provisioning Job을 실행하여 RabbitMQ의 `total-backend` password를 갱신하고 상태를 검증합니다.
4. Backend가 새로운 credential을 사용하도록 재연결합니다.
5. AMQPS 연결, 인증 및 publish/consume 동작을 확인합니다.

Kubernetes Secret과 RabbitMQ 내부 credential이 서로 다른 상태가 되지 않도록 동일 Secrets Manager version을 기준으로 갱신합니다.

단일 사용자 password를 갱신하는 과정에서는 기존 연결과 신규 연결 사이에 일시적인 인증 실패가 발생할 수 있습니다.

서비스 중단을 최소화해야 하는 경우 별도의 임시 Application Identity를 생성하여 Backend를 먼저 전환한 뒤 기존 Identity를 교체하는 방식을 검토할 수 있습니다.

임시 Identity의 이름, 권한 및 회수 시점은 실제 갱신 작업 시 별도로 결정합니다.

rabbitmq-default-user Secret을 Application credential 갱신 목적으로 삭제하거나 재생성하지 않습니다.

---

## 6. 자격 증명 복구

Kubernetes Secret 또는 RabbitMQ Application Identity를 복구해야 하는 경우 AWS Secrets Manager의 현재 credential version을 기준으로 복구합니다.

복구 시 다음 항목을 확인합니다.

1. AWS Secrets Manager의 현재 Application credential version을 확인합니다.
2. 동일 credential을 `messaging/rabbitmq-app-credentials`와 `backend/rabbitmq-app-credentials`에 제공합니다.
3. RabbitMQ TLS 및 Management API 접근이 정상인지 확인합니다.
4. Provisioning Job으로 `total-prod` vhost, `total-backend` user 및 permission을 현재 계약 상태로 수렴시킵니다.
5. RabbitMQ에서 user/vhost/permission 상태를 확인합니다.
6. Backend와 연계하여 AMQPS 인증 및 publish/consume을 확인합니다.

기존 RabbitMQ PVC를 복구하는 경우 rabbitmq-default-user Secret을 임의로 삭제하거나 재생성하지 않습니다.

기존 RabbitMQ 내부 bootstrap credential과 Kubernetes의 rabbitmq-default-user Secret이 일치하는지 먼저 확인합니다.

이 복구 절차는 RabbitMQ Application Identity와 접근 인증을 대상으로 합니다.

Queue type, Queue durability, message replication, DLQ/retry 등 Application Messaging Topology의 복구 정책은 Backend 영역에서 별도로 결정합니다.

---

## 7. Backend 연계 계약

Backend는 다음 연결 정보를 사용합니다.

| 환경변수 | 값 |
| --- | --- |
| `RABBITMQ_HOST` | `rabbitmq.messaging.svc.cluster.local` |
| `RABBITMQ_PORT` | `5671` |
| `RABBITMQ_VHOST` | `total-prod` |
| `RABBITMQ_USERNAME` | `backend/rabbitmq-app-credentials`의 `username` |
| `RABBITMQ_PASSWORD` | `backend/rabbitmq-app-credentials`의 `password` |

CA trust는 다음 기준을 사용합니다.

| 항목 | 값 |
| --- | --- |
| Secret | `backend/rabbitmq-ca` |
| Key | `ca.crt` |
| Mount Path | `/etc/rabbitmq/tls/ca.crt` |
| Trust 방식 | Spring PEM SSL Bundle |

Backend는 ca.crt를 read-only로 mount하여 사용합니다.

JVM 기본 cacerts를 수정하거나 별도 PKCS12 truststore를 사용하는 방식은 현재 계약에서 사용하지 않습니다.

다음 TLS 검증을 활성화합니다.

Server Certificate Validation
Hostname Verification

현재 total-k8s Backend Deployment에 남아 있는 기존 rabbitmq.backend.svc.cluster.local:5672 설정과 Spring PEM SSL Bundle 적용은 Backend 연계 후속 작업으로 남깁니다.

---

## 8. 연계 검증

RabbitMQ Application Identity 구성이 완료된 후 다음 항목을 확인합니다.

RabbitMQ
total-prod vhost 존재
total-backend user 존재
management tag 없음
total-prod의 Configure / Write / Read 권한이 계약과 일치
plaintext Management API 15672 미사용
TLS Management API 15671 정상 접근
TLS
rabbitmq.messaging.svc.cluster.local 기준 서버 인증서 검증 성공
CA chain 검증 성공
hostname verification 성공
Backend 연계
AMQPS 5671 연결 성공
total-prod vhost 인증 성공
total-backend credential 인증 성공
Backend publish/consume 정상 동작

Queue HA, classic/quorum queue, exchange/binding, DLQ/retry, acknowledgement, prefetch 등의 Application Messaging Topology는 이 Runbook의 검증 범위에 포함하지 않습니다.

---

## 9. 담당 범위

이 Runbook은 다음 RabbitMQ 영역을 대상으로 합니다.

Application credential 계약
Vhost / User / Permission 구성
RabbitMQ Management API를 통한 Provisioning
Credential 갱신 및 복구
TLS 기반 Management API 검증
Backend 연결 계약 및 연계 검증 기준

다음 영역은 이 Runbook에서 직접 결정하지 않습니다.

Argo CD Application 등록
GitOps 배포 순서 및 Sync 정책
공용 Argo CD 설정
AWS Secrets Manager 실제 SecretVersion 운영 방식
AWS IAM 실행 주체 및 권한 정책
Backend Application Messaging Topology
Queue HA / classic·quorum 정책