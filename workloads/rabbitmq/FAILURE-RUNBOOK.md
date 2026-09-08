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

2026-09-07 `test-eks` Kubernetes `1.36` 환경에서 3/3 Ready, 3 running members, alarm/partition 없음, TLS 1.3, AMQPS `5671`, plaintext listener 없음, strict CA/hostname verification, mTLS publish/consume 및 `quorumStatus=ok`를 확인했습니다.

## Pod 1개 장애

1. Pod event, 이전 container log와 RabbitmqCluster status를 수집합니다.
2. 나머지 두 broker의 readiness와 cluster member 상태를 확인합니다.
3. Operator가 Pod를 재생성하고 기존 PVC를 다시 연결하는지 확인합니다.
4. 복구 후 cluster member, partition, certificate load 오류를 확인합니다.

2026-09-07 runtime validation에서 RabbitMQ Pod 1개를 삭제한 뒤 새 Pod가 동일 PVC/PV/EBS를 사용해 복구되고 cluster에 다시 합류하는 것을 확인했습니다. 장애 중에는 나머지 두 endpoint를 통한 AMQPS 연결도 유지되었습니다.

Broker가 세 개여도 queue type과 durability가 확정되지 않은 상태에서는 message availability 또는 무손실을 보장하지 않습니다.

## Worker node 장애

1. node condition과 영향받은 Pod/PVC를 식별합니다.
2. voluntary disruption인 경우 PDB의 `maxUnavailable: 1`이 적용되는지 확인합니다.
3. 재배치가 발생하면 EBS volume과 대상 node의 AZ를 확인합니다.
4. EBS attach/detach가 완료되기 전 강제 중복 attach를 피합니다.
5. RabbitMQ Pod 수가 일시적으로 감소하면 남은 broker의 readiness, member 상태와 partition 여부를 우선 확인합니다.

RabbitMQ placement는 hostname/AZ soft anti-affinity를 사용합니다. 따라서 사용 가능한 worker 수가 RabbitMQ replica 수보다 적으면 동일 node에 둘 이상의 RabbitMQ Pod가 배치될 수 있습니다.

2026-09-07 validation은 single-Pod recovery까지 수행했으며 worker node 및 AZ 장애 복구는 별도로 검증하지 않았습니다. EBS는 AZ 종속 리소스이므로 AZ 장애는 일반적인 Pod 또는 worker node 복구와 동일하게 취급하지 않습니다.

## TLS 또는 credential 장애

1. Secret 존재와 key 이름만 확인하고 값을 출력하지 않습니다.
2. certificate 유효기간, CA chain과 Service/per-Pod의 short `.svc` 및 long `.svc.cluster.local` SAN을 확인합니다.
3. rotation 후 각 node의 certificate reload 상태를 확인합니다.
4. 인증 실패와 network timeout을 분리하여 진단합니다.

Operator의 quorum check가 실패하면 `rabbitmq-system`의 Operator Pod에서 broker HTTPS Management API `15671`로 가는 NetworkPolicy rule과 hostname verification을 함께 확인합니다.