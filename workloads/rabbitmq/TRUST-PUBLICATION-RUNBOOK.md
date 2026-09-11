# RabbitMQ CA 신뢰 정보 배포 Runbook

이 Runbook은 `messaging/rabbitmq-ca-signing`의 public `tls.crt`만 `messaging/rabbitmq-ca`와 `backend/rabbitmq-ca`의 `ca.crt`로 배포하는 one-shot 절차를 정의합니다.

CA signing private key는 배포 대상에 포함하지 않으며, CA 신뢰 정보 배포를 위한 상시 controller는 사용하지 않습니다.

## 실행 시점

| 상황 | 배포 필요 여부 | 이유 |
| --- | --- | --- |
| 최초 CA 구성 | 필요 | RabbitMQ와 Backend에 최초 trust anchor 제공 |
| 같은 CA의 server certificate 갱신 | 불필요 | Server identity만 변경되고 trust anchor는 유지 |
| CA 교체 dual trust 단계 | 필요 | CA-A + CA-B trust bundle 제공 |
| CA 교체 완료 | 필요 | CA-A를 제거한 CA-B-only trust bundle 제공 |

Server certificate의 일반적인 자동 갱신은 동일 CA를 사용하므로 `rabbitmq-ca`를 다시 배포할 필요가 없습니다.

CA 자체를 교체하는 경우에는 [CA-ROLLOVER-RUNBOOK.md](CA-ROLLOVER-RUNBOOK.md)의 교체 기준을 함께 확인합니다.

## 보안 경계

Source Secret:

- Namespace: `messaging`
- Secret: `rabbitmq-ca-signing`
- Public certificate: `tls.crt`
- Private signing key: `tls.key`

Target Secret:

| Namespace | Secret | 배포하는 Key |
| --- | --- | --- |
| `messaging` | `rabbitmq-ca` | `ca.crt` |
| `backend` | `rabbitmq-ca` | `ca.crt` |

Target에는 public CA certificate만 제공합니다.

다음 정보는 배포하지 않습니다.

- `rabbitmq-ca-signing/tls.key`
- RabbitMQ server private key
- signing Secret 전체
- 기타 credential

Kubernetes RBAC는 Secret 내부 key 단위로 조회 권한을 제한할 수 없습니다. 따라서 source Secret을 조회할 수 있는 실행 주체는 기술적으로 `tls.key`에도 접근할 수 있습니다.

Source Secret 접근 권한은 CA 신뢰 정보 배포가 필요한 시점에만 사용하고, RabbitMQ Pod, Backend Pod 또는 상시 ServiceAccount/controller에는 부여하지 않습니다.

실행 중에는 다음 원칙을 준수합니다.

- shell tracing을 사용하지 않습니다.
- Source Secret 전체를 YAML/JSON으로 출력하지 않습니다.
- certificate 또는 private key 내용을 로그에 출력하지 않습니다.
- certificate를 임시 디스크 파일로 저장하지 않습니다.

## 실행 전 확인

실행 전에 다음 항목을 확인합니다.

1. 대상 Kubernetes cluster와 `kubectl` context가 올바른지 확인합니다.
2. `messaging/rabbitmq-ca-signing` Secret이 존재하는지 확인합니다.
3. Source Secret 조회 및 대상 `rabbitmq-ca` 생성/갱신에 필요한 권한이 있는지 확인합니다.
4. 대상 Namespace가 `messaging`, `backend`인지 확인합니다.
5. CA 교체 작업인 경우 사용할 CA signing Secret과 현재 교체 단계를 확인합니다.

실제 권한 부여 방식은 해당 Kubernetes 접근 관리 기준에 따르며, 필요한 Secret과 Namespace 범위로 최소화합니다.

## 최초 CA 신뢰 정보 배포

기본 실행은 `messaging/rabbitmq-ca-signing/tls.crt`를 두 Namespace의 `rabbitmq-ca/ca.crt`로 배포합니다.

```bash
workloads/rabbitmq/scripts/publish-ca-trust.sh <kubectl-context>
```

스크립트는 다음 순서로 처리합니다.

1. 지정된 context를 확인합니다.
2. `messaging/rabbitmq-ca-signing`에서 `tls.crt`만 읽습니다.
3. X.509 certificate 유효성과 CA basic constraint를 확인합니다.
4. `messaging/rabbitmq-ca`의 `ca.crt`를 생성 또는 갱신합니다.
5. `backend/rabbitmq-ca`의 `ca.crt`를 생성 또는 갱신합니다.
6. 두 대상 Secret의 key 구성과 certificate 일치 여부를 확인합니다.

Source Secret 전체나 `tls.key`는 출력하거나 Target Secret으로 복제하지 않습니다.

## CA 교체 시 Dual Trust 배포

CA 교체 과정에서는 기존 CA와 신규 CA를 함께 신뢰해야 하는 단계가 있습니다.

예를 들어 기존 CA signing Secret이 `rabbitmq-ca-signing`, 신규 CA signing Secret이 `rabbitmq-ca-signing-next`라면 다음과 같이 실행합니다.

```bash
workloads/rabbitmq/scripts/publish-ca-trust.sh \
  <kubectl-context> \
  rabbitmq-ca-signing \
  rabbitmq-ca-signing-next
```

스크립트는 지정된 각 signing Secret의 `tls.crt`만 읽어 순서대로 결합하고, 생성된 trust bundle을 다음 두 Secret의 `ca.crt`에 동일하게 배포합니다.

- `messaging/rabbitmq-ca`
- `backend/rabbitmq-ca`

`rabbitmq-ca-signing-next`는 CA 교체 과정에서 사용할 예시 이름이며 현재 기본 manifest가 생성하는 Resource가 아닙니다.

신규 CA 기반 server certificate 적용과 기존 CA 제거 시점은 [CA-ROLLOVER-RUNBOOK.md](CA-ROLLOVER-RUNBOOK.md)를 따릅니다.

## CA-B-only 전환

RabbitMQ server identity가 신규 CA로 전환되고 필요한 연결 검증이 완료된 후에는 신규 CA만 포함한 trust bundle으로 전환합니다.

예시:

```bash
workloads/rabbitmq/scripts/publish-ca-trust.sh \
  <kubectl-context> \
  rabbitmq-ca-signing-next
```

기존 CA가 더 이상 필요한 server certificate의 trust anchor로 사용되지 않는지 확인한 후 수행합니다.

## 스크립트 동작 기준

`publish-ca-trust.sh`는 다음 기준으로 동작합니다.

- Source Secret 전체를 YAML/JSON으로 출력하지 않습니다.
- 각 signing Secret에서 `tls.crt`만 선택합니다.
- Certificate를 디스크 파일로 저장하지 않습니다.
- X.509 certificate의 유효성을 확인합니다.
- CA basic constraint를 확인합니다.
- 여러 CA가 지정된 경우 입력 순서대로 trust bundle을 구성합니다.
- Target Secret의 `/data`는 `ca.crt` 하나만 포함하도록 갱신합니다.
- Target Secret이 존재하지 않으면 `ca.crt`만 포함한 Secret을 생성합니다.
- 실제 certificate 내용을 출력하지 않고 Source와 Target의 일치 여부를 확인합니다.

이 동작을 통해 signing private key와 trust certificate의 경계를 유지합니다.

## 배포 후 확인

배포 후 다음 항목을 확인합니다.

- `messaging/rabbitmq-ca`가 존재하는지 확인
- `backend/rabbitmq-ca`가 존재하는지 확인
- 두 Secret의 data key가 `ca.crt`만 포함하는지 확인
- Source의 public CA와 Target trust certificate가 일치하는지 확인
- CA 교체 중인 경우 의도한 CA들이 trust bundle에 포함되어 있는지 확인

실제 certificate 또는 Secret value를 출력해서 비교하지 않습니다.

최초 구성 이후에는 RabbitMQ server certificate와 Backend 연결에서 해당 trust anchor가 정상적으로 사용되는지 별도로 검증합니다.

## 실패 및 재실행

스크립트는 다음 Resource를 수정하지 않습니다.

- CA signing Secret
- CA Issuer
- RabbitMQ server Certificate
- RabbitMQ server TLS Secret

첫 번째 Namespace 갱신 후 두 번째 Namespace에서 실패하면 두 Namespace의 trust bundle이 일시적으로 서로 다른 상태가 될 수 있습니다.

이 경우 원인을 해결한 후 동일한 Source CA 구성으로 스크립트를 다시 실행합니다. 동일한 CA certificate를 기준으로 반복 실행할 수 있으며 두 Target Secret을 동일 상태로 다시 수렴시킵니다.

CA 교체 중 문제가 발생한 경우 trust bundle을 임의로 축소하지 않고 [CA-ROLLOVER-RUNBOOK.md](CA-ROLLOVER-RUNBOOK.md)의 단계별 교체 및 되돌리기 기준을 따릅니다.

## 담당 범위

이 Runbook은 다음 범위를 대상으로 합니다.

- CA public certificate 추출
- `messaging`, `backend` Namespace의 trust Secret 생성 및 갱신
- Dual trust bundle 배포
- CA-B-only trust bundle 전환
- Source/Target certificate 정합성 확인
- signing private key와 public trust material의 보안 경계 유지

다음 영역은 이 Runbook에서 직접 결정하지 않습니다.

- Kubernetes 접근 권한의 실제 발급·회수 절차
- 전체 GitOps 배포 순서
- Backend Application 배포 방식
- CA 교체 시 RabbitMQ workload 실행 순서
- CA 만료 관측 및 알림 방식

CA 자체의 교체 절차는 [CA-ROLLOVER-RUNBOOK.md](CA-ROLLOVER-RUNBOOK.md)를 따릅니다.