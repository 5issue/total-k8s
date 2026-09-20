# RabbitMQ 장애 대응 Runbook

RabbitMQ 장애 발생 시 상태 확인과 복구 기준을 정의합니다.

## Pod 장애

1. Pod event, container log, RabbitmqCluster status를 확인합니다.
2. 나머지 broker의 readiness와 cluster membership을 확인합니다.
3. Operator의 Pod 재생성과 PVC 재연결 상태를 확인합니다.
4. 복구된 Pod의 cluster 재가입과 partition 상태를 확인합니다.

기존 PVC를 사용하는 복구에서는 RabbitMQ cluster membership과 credential 정합성을 함께 확인합니다.

## Worker Node 장애

1. Node condition과 영향받은 RabbitMQ Pod/PVC를 확인합니다.
2. PDB `maxUnavailable: 1` 적용 상태를 확인합니다.
3. 재배치 시 EBS volume과 대상 Node의 AZ를 확인합니다.
4. EBS attach/detach 완료 후 RabbitMQ readiness와 membership을 확인합니다.

RabbitMQ는 On-Demand Node를 필수 배치 대상으로 사용하며 hostname/AZ 기준 soft anti-affinity로 replica 분산을 시도합니다.

## TLS / CA Trust 장애

다음을 순서대로 확인합니다.

1. `messaging/rabbitmq-ca-signing/tls.crt`
2. `messaging/rabbitmq-ca/ca.crt`
3. `backend/rabbitmq-ca/ca.crt`
4. `dev/rabbitmq-ca/ca.crt`
5. RabbitMQ server certificate의 유효기간, CA chain, SAN
6. Backend AMQPS `5671` 및 hostname verification
7. RabbitMQ NetworkPolicy의 대상 Namespace 허용 상태

Production과 Dev Backend는 `messaging` RabbitMQ와 동일한 CA trust를 사용합니다.

CA trust 배포 및 복구는 [TRUST-PUBLICATION-RUNBOOK.md](TRUST-PUBLICATION-RUNBOOK.md)를 따릅니다.

## Application Identity 장애

1. RabbitmqCluster 상태와 Management API `15671` 접근 상태를 확인합니다.
2. application credential 관련 Secret의 존재와 key 구성을 확인합니다.
3. Provisioning Job 상태와 로그를 확인합니다.
4. TLS, NetworkPolicy, bootstrap authentication, application credential 상태를 구분합니다.
5. 원인 조치 후 Provisioning Job을 다시 실행합니다.
6. vhost, application user, permission이 계약 상태로 수렴했는지 확인합니다.

Application Identity 구성과 복구는 [CREDENTIAL-PROVISIONING-RUNBOOK.md](CREDENTIAL-PROVISIONING-RUNBOOK.md)를 따릅니다.