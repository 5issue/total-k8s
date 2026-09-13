# RabbitMQ CA 교체 Runbook

이 Runbook은 24시간 서비스에서 RabbitMQ private CA를 CA-A에서 CA-B로 계획된 방식으로 전환하는 순서를 정의합니다. CA 교체를 실행하는 controller나 자동화는 현재 repository에 포함하지 않습니다.

## 불변 보안 경계

* CA signing Secret은 `tls.crt`, `tls.key`를 포함하며 cert-manager CA Issuer만 사용합니다.
* `messaging/rabbitmq-ca`와 `backend/rabbitmq-ca` trust Secret은 public CA certificate를 `ca.crt`에만 담습니다.
* signing Secret 전체나 `tls.key`를 trust Secret으로 복제하지 않습니다.
* 새 CA를 RabbitMQ server identity에 적용하기 전에 모든 trust consumer가 새 CA를 신뢰해야 합니다.
* CA-A로 서명된 server certificate가 남아 있는 동안 CA-A를 trust bundle에서 제거하지 않습니다.

## 준비 조건

CA Certificate의 `status.notAfter`를 관측하고 만료 180일 전까지 rollover 작업을 시작합니다. 작업 전에 Backend 소비자 목록, `rabbitmq-ca` 배포 방식, RabbitMQ rolling restart/reload 방식, AMQPS 검증 주체와 rollback 담당자를 확정합니다.

최초 provisioning과 rollover 모두 [trust publication runbook](TRUST-PUBLICATION-RUNBOOK.md)이 `messaging/rabbitmq-ca-signing/tls.crt`만 취급하고 두 Namespace의 `rabbitmq-ca/ca.crt`를 생성하는 것을 전제로 합니다. publication은 승인된 시점에 수행하는 one-shot 절차이며 상시 controller로 자동화하지 않습니다.

`renewal.policy: Disabled`는 만료 기반 자동 갱신만 막으므로 CA Certificate의 spec을 수정하거나 target Secret을 삭제하지 않습니다. CA-A → CA-B 전환은 기존 CA Certificate에 `cmctl renew`를 실행하는 방식이 아니라, CA-B를 별도 signing resource로 준비하는 아래 순서를 따릅니다.

## 전환 순서

1. CA-A와 별도의 private key를 사용하는 CA-B Certificate, signing Secret과 Issuer를 준비합니다. 기존 CA-A Secret과 Issuer를 덮어쓰지 않습니다.
2. [trust publication script](scripts/publish-ca-trust.sh)에 CA-A, CA-B signing Secret을 순서대로 지정해 dual trust bundle을 `messaging/rabbitmq-ca`와 `backend/rabbitmq-ca`의 `ca.crt`로 publication합니다. Backend와 RabbitMQ가 두 CA를 모두 신뢰하는지 확인합니다.
3. RabbitMQ server Certificate의 issuer를 CA-B로 전환해 `rabbitmq-server-tls`를 재발급합니다. Operator가 Secret 갱신을 즉시 reload하지 않는 것으로 검증된 경우, quorum과 endpoint 가용성을 유지하는 one-at-a-time rolling restart를 수행합니다.
4. 각 RabbitMQ Pod가 CA-B로 서명된 server certificate를 제공하는지 확인하고, Backend에서 RabbitMQ Service DNS를 통한 AMQPS 연결, 재연결과 hostname verification을 검증합니다.
5. 모든 server identity가 CA-B로 전환되고 모든 Backend instance에 dual trust가 반영된 후, 충분한 관찰 기간을 거칩니다.
6. publication script에 CA-B signing Secret만 지정해 CA-B-only bundle을 `messaging`, `backend`의 `rabbitmq-ca/ca.crt`로 다시 publication하고 AMQPS와 hostname verification을 검증합니다.
7. CA-A가 더 이상 server certificate 발급과 trust에 사용되지 않음을 확인한 후에만 CA-A Issuer와 signing Secret을 폐기합니다.

## 되돌리기 경계

* 3단계 전: dual trust bundle을 유지한 채 CA-B 배포 문제를 수정합니다.
* 3~5단계: CA-A Issuer와 CA-A+CA-B trust를 유지하고 server certificate를 CA-A로 되돌릴 수 있어야 합니다.
* 6단계 후 문제 발생 시: CA-A가 아직 유효하고 안전하면 dual trust bundle을 즉시 복구합니다.
* CA-A signing material은 CA-B-only 검증과 관찰 기간이 완료되기 전에 삭제하지 않습니다.

## 교체 검증

CA 교체 과정에서 다음 항목을 단계별로 확인합니다.

* CA-A + CA-B dual trust가 정상 반영되는지 확인
* CA-B 기반 RabbitMQ server certificate 발급 확인
* RabbitMQ가 CA-B 인증서를 정상 제공하는지 확인
* AMQPS 5671 연결 및 hostname verification 확인
* Backend 재연결 확인
* CA-A 제거 후 CA-B-only trust 상태에서 최종 연결 확인
* 실패 시 단계별 rollback 가능 여부 확인
