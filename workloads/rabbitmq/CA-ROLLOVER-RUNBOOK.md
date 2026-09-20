# RabbitMQ CA 교체 Runbook

RabbitMQ private CA를 CA-A에서 CA-B로 전환하는 절차를 정의합니다.

## 전환 원칙

CA 교체는 다음 순서로 진행합니다.

**Dual trust → Server certificate 전환 → CA-B 단일 trust**

Trust publication은 [TRUST-PUBLICATION-RUNBOOK.md](TRUST-PUBLICATION-RUNBOOK.md)를 사용합니다.

## 전환 절차

1. **CA-B 준비**

   * CA-B Certificate, signing Secret, Issuer를 준비합니다.

2. **Dual trust 적용**

   * CA-A와 CA-B를 함께 publication합니다.
   * `messaging`, `backend`, `dev`의 trust 상태를 확인합니다.

3. **Server certificate 전환**

   * RabbitMQ server Certificate의 issuer를 CA-B로 전환합니다.
   * `rabbitmq-server-tls` 재발급 및 RabbitMQ 적용 상태를 확인합니다.
   * 필요 시 quorum을 유지하며 rolling restart를 수행합니다.

4. **연결 검증**

   * RabbitMQ가 CA-B 기반 certificate를 제공하는지 확인합니다.
   * AMQPS `5671`, hostname verification, Backend 재연결을 확인합니다.

5. **CA-B 단일 trust 전환**

   * 관찰 기간 후 CA-B만 publication합니다.
   * `messaging`, `backend`, `dev`의 trust와 연결 상태를 다시 확인합니다.

6. **CA-A 정리**

   * CA-B 기반 server identity와 trust 상태를 확인합니다.
   * CA-A Issuer와 signing Secret을 정리합니다.

## Rollback

| 시점                      | 조치                                       |
| ----------------------- | ---------------------------------------- |
| Server certificate 전환 전 | Dual trust를 유지하고 CA-B 구성을 수정             |
| Server certificate 전환 중 | Dual trust를 유지하고 CA-A 기반 certificate로 복구 |
| CA-B 단일 trust 전환 후      | CA-A가 유효한 경우 dual trust로 복구              |

## 완료 기준

* RabbitMQ server certificate가 CA-B 기반으로 전환됨
* `messaging`, `backend`, `dev`가 CA-B를 신뢰함
* AMQPS `5671` 및 hostname verification 정상
* Backend 재연결 정상
* CA-B 단일 trust 적용 완료