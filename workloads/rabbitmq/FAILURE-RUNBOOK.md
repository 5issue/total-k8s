# RabbitMQ 장애 대응 Runbook

이 Runbook은 Cluster Operator 기반 3-node RabbitMQ의 장애 확인 및 복구 기준을 정의합니다. 파괴적 조치는 영향 범위를 확인한 후 필요한 경우에만 수행합니다.

## 정상 상태

```bash
kubectl -n messaging get rabbitmqcluster rabbitmq
kubectl -n messaging get pod,pvc,service,pdb -l app.kubernetes.io/name=rabbitmq
kubectl -n messaging describe rabbitmqcluster rabbitmq
kubectl -n rabbitmq-system logs -l app.kubernetes.io/name=rabbitmq-cluster-operator
```

정상 기준은 RabbitmqCluster Ready, 세 Pod Ready, replica별 PVC Bound, TLS Service endpoint 존재입니다. Management 접근이 필요하면 외부 Service를 추가하지 않고 필요한 경우 port-forward를 사용합니다.

2026-09-07 test-eks Kubernetes 1.36 환경에서는 3/3 Ready, 3 running members, alarm/partition 없음, TLS 1.3, AMQPS 5671, plaintext listener 없음, strict CA/hostname verification을 확인했습니다. 당시 연결 검증에는 간이 mTLS 방식으로 publish/consume을 확인했으며 quorumStatus=ok도 확인했습니다.

해당 기록은 현재 messaging Namespace 전환 및 application user/password 기반 접근 인증 적용 이전의 검증 결과입니다. 현재 최종 연결 계약은 AMQPS + server certificate verification + application user/password이며, messaging 배치 후 해당 기준으로 다시 검증해야 합니다.

## Pod 1개 장애
Pod event, 이전 container log와 RabbitmqCluster status를 수집합니다.
나머지 두 broker의 readiness와 cluster member 상태를 확인합니다.
Operator가 Pod를 재생성하고 기존 PVC를 다시 연결하는지 확인합니다.
복구 후 cluster member, partition, certificate load 오류를 확인합니다.

2026-09-07 runtime validation에서 RabbitMQ Pod 1개를 삭제한 뒤 새 Pod가 동일 PVC/PV/EBS를 사용해 복구되고 cluster에 다시 합류하는 것을 확인했습니다. 장애 중에는 나머지 두 endpoint를 통한 AMQPS 연결도 유지되었습니다.

Broker가 세 개여도 queue type과 durability가 확정되지 않은 상태에서는 message availability 또는 무손실을 보장하지 않습니다.

## Worker node 장애
node condition과 영향받은 Pod/PVC를 식별합니다.
voluntary disruption인 경우 PDB의 maxUnavailable: 1이 적용되는지 확인합니다.
재배치가 발생하면 EBS volume과 대상 node의 AZ를 확인합니다.
EBS attach/detach가 완료되기 전 강제 중복 attach를 피합니다.
RabbitMQ Pod 수가 일시적으로 감소하면 남은 broker의 readiness, member 상태와 partition 여부를 우선 확인합니다.

RabbitMQ placement는 hostname/AZ soft anti-affinity를 사용합니다. 따라서 사용 가능한 worker 수가 RabbitMQ replica 수보다 적으면 동일 node에 둘 이상의 RabbitMQ Pod가 배치될 수 있습니다.

2026-09-07 validation은 single-Pod recovery까지 수행했으며 worker node 및 AZ 장애 복구는 별도로 검증하지 않았습니다. EBS는 AZ 종속 리소스이므로 AZ 장애는 일반적인 Pod 또는 worker node 복구와 동일하게 취급하지 않습니다.

## TLS 또는 자격 증명 장애
Secret 존재와 key 이름만 확인하고 값을 출력하지 않습니다.
certificate 유효기간, CA chain과 Service/per-Pod의 short .svc 및 long .svc.cluster.local SAN을 확인합니다.
인증서 갱신 또는 교체 후 각 node의 certificate 적용 상태를 확인합니다.
인증 실패와 network timeout을 분리하여 진단합니다.

Operator의 quorum check가 실패하면 rabbitmq-system의 Operator Pod에서 broker HTTPS Management API 15671로 가는 NetworkPolicy rule과 hostname verification을 함께 확인합니다.

## Application Identity 구성 실패
RabbitMQ Cluster가 Ready 상태이고 HTTPS Management API 15671에 접근 가능한지 확인합니다.
rabbitmq-default-user, messaging/rabbitmq-app-credentials, messaging/rabbitmq-ca Secret의 존재와 필수 key 이름만 확인하고 값을 출력하지 않습니다.
Provisioner Pod label과 RabbitMQ 15671 NetworkPolicy selector가 일치하는지 확인합니다.
Provisioning Job의 상태와 로그를 확인하여 TLS, NetworkPolicy, bootstrap authentication, application credential 문제를 구분합니다. Credential 값은 디버그 로그에 출력하지 않습니다.
원인을 해결한 후 Provisioning Job을 다시 실행하고 total-prod vhost, total-backend user 및 permission이 계약 상태로 수렴했는지 확인합니다.

Provisioning Job은 PUT 기반으로 vhost/user/permission을 수렴하며 기존 리소스를 삭제하지 않습니다. 실제 Job 실행 및 재실행 방식은 배포/GitOps 구성에 따릅니다.

Application credential 갱신 또는 Provisioning Job 복구를 위해 rabbitmq-default-user Secret을 삭제하지 않습니다. 기존 PVC를 사용한 복구에서는 Kubernetes bootstrap Secret과 RabbitMQ 내부 credential의 정합성을 먼저 확인합니다.

Application credential 구성·갱신·복구 기준은 CREDENTIAL-PROVISIONING-RUNBOOK.md를 따릅니다.