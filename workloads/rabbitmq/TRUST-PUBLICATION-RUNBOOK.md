# RabbitMQ CA 신뢰 정보 배포 Runbook

RabbitMQ public CA trust의 배포 및 CA 교체 시 실행 방법을 정의합니다.

## 배포 계약

| Source                                  | Target                  | Key      |
| --------------------------------------- | ----------------------- | -------- |
| `messaging/rabbitmq-ca-signing/tls.crt` | `messaging/rabbitmq-ca` | `ca.crt` |
| `messaging/rabbitmq-ca-signing/tls.crt` | `backend/rabbitmq-ca`   | `ca.crt` |
| `messaging/rabbitmq-ca-signing/tls.crt` | `dev/rabbitmq-ca`       | `ca.crt` |

Production과 Dev Backend는 `messaging` RabbitMQ를 공유하며 동일한 CA를 신뢰합니다.

## 기본 실행

저장소 루트에서 실행합니다.

```bash
./workloads/rabbitmq/scripts/publish-ca-trust.sh \
  arn:aws:eks:ap-northeast-2:596601390909:cluster/test-eks
```

한 번의 실행으로 `messaging`, `backend`, `dev`의 `rabbitmq-ca`를 동일한 CA trust로 수렴시킵니다.

## CA 교체

CA-A와 CA-B를 함께 신뢰하는 전환 단계:

```bash
./workloads/rabbitmq/scripts/publish-ca-trust.sh \
  <kubectl-context> \
  rabbitmq-ca-signing \
  rabbitmq-ca-signing-next
```

CA-B 전환 완료 후:

```bash
./workloads/rabbitmq/scripts/publish-ca-trust.sh \
  <kubectl-context> \
  rabbitmq-ca-signing-next
```

CA 교체 순서와 rollback 기준은 [CA-ROLLOVER-RUNBOOK.md](CA-ROLLOVER-RUNBOOK.md)를 따릅니다.

## 확인

실행 완료 후 다음 상태를 확인합니다.

* `messaging/rabbitmq-ca`
* `backend/rabbitmq-ca`
* `dev/rabbitmq-ca`
* 각 Secret의 data key: `ca.crt`
* Backend AMQPS `5671` 연결 및 hostname verification

인증서 유효성, CA 여부, Target Secret 구성 및 Source/Target 일치 검증은 publication script에서 수행합니다.
