# RabbitMQ 장애 대응 Runbook

이 문서는 Cluster Operator 기반 3-node RabbitMQ의 인프라 장애 확인 범위를 정의합니다. 파괴적 명령은 승인된 장애 훈련에서만 수행합니다.

## 정상 상태

```bash
kubectl -n backend get rabbitmqcluster rabbitmq
kubectl -n backend get pod,pvc,service,pdb -l app.kubernetes.io/name=rabbitmq
kubectl -n backend describe rabbitmqcluster rabbitmq
kubectl -n rabbitmq-system logs -l app.kubernetes.io/name=rabbitmq-cluster-operator
```

정상 기준은 RabbitmqCluster Ready, 세 Pod Ready, replica별 PVC Bound, TLS Service endpoint 존재입니다. Management 접근이 필요하면 외부 Service를 만들지 않고 승인된 세션에서 port-forward를 사용합니다.

## Pod 1개 장애

1. Pod event, 이전 container log와 RabbitmqCluster status를 수집합니다.
2. 나머지 두 broker의 readiness와 cluster member 상태를 확인합니다.
3. Operator가 Pod를 재생성하고 기존 PVC를 다시 연결하는지 확인합니다.
4. 복구 후 cluster member, partition, certificate load 오류를 확인합니다.

Broker가 세 개여도 queue type과 durability가 미확정이면 message availability 또는 무손실을 주장하지 않습니다.

## Worker node 또는 AZ 장애

1. node condition과 영향받은 Pod/PVC를 식별합니다.
2. PDB 때문에 voluntary disruption이 동시에 둘 이상 진행되지 않는지 확인합니다.
3. EBS volume AZ와 rescheduled Pod node AZ를 확인합니다.
4. attach/detach가 완료되기 전 강제 중복 attach를 피합니다.
5. 세 번째 Pod가 즉시 배치되지 않더라도 남은 broker 상태와 partition 여부를 먼저 확인합니다.

현재 2개 이상의 worker node에 3개 Pod를 배치하므로 모든 Pod의 node-level 격리를 보장하지 않습니다. Soft anti-affinity는 가용 node가 부족할 때 복구를 우선합니다.

## TLS 또는 credential 장애

1. Secret 존재와 key 이름만 확인하고 값을 출력하지 않습니다.
2. certificate 유효기간, SAN, CA chain 및 RabbitMQ TLS log를 확인합니다.
3. rotation 후 각 node의 certificate reload 상태를 확인합니다.
4. 인증 실패와 network timeout을 분리하여 진단합니다.

## Backend topology 이후 추가할 검증

* quorum queue leader가 위치한 Pod 장애
* publisher confirm 성공/실패와 재발행
* consumer acknowledgement와 redelivery
* DLQ, retry 및 TTL
* service user별 publish/consume 권한 차단
* durable queue/message 재시작 복구
