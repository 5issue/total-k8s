# Redis 장애 대응 Runbook

이 문서는 single-replica Redis의 인프라 장애 확인 및 복구 기준을 정의합니다. 파괴적 조치는 영향 범위를 확인하고 승인된 장애 훈련 또는 복구 작업에서만 수행합니다.

## 정상 상태

```bash
kubectl -n backend get statefulset redis
kubectl -n backend get pod,pvc,service -l app.kubernetes.io/name=redis
kubectl -n backend describe pod redis-0
```

정상 기준은 다음과 같습니다.

* StatefulSet ready replica `1/1`
* Redis와 `redis-exporter` container가 모두 준비되어 Pod `2/2 Ready`
* PVC `Bound`
* Redis Service endpoint 존재
* password를 출력하지 않은 authenticated `PING/PONG` 성공
* AOF enabled, loading 완료, write/rewrite 상태 정상
* `eks.amazonaws.com/capacityType=ON_DEMAND` 또는 `karpenter.sh/capacity-type=on-demand` node에 배치

## Credential 부재 또는 불일치

`backend/redis-credentials`가 없거나 필수 key가 없으면 Redis와 `redis-exporter`가 password 환경변수를 구성하지 못해 Pod가 `CreateContainerConfigError` 상태에 머물 수 있습니다.

1. Pod status와 event에서 누락된 Secret 또는 key를 확인합니다.
2. `backend/redis-credentials`의 존재 여부와 type이 `Opaque`인지 확인합니다.
3. Secret data가 정의된 `password` schema와 일치하는지 확인합니다.
4. `total.io/source-secret`과 `total.io/source-version-id` annotation이 존재하는지 확인합니다.
5. 실제 password나 Secret data는 조회하거나 출력하지 않습니다.
6. 복구는 [CREDENTIAL-PUBLICATION-RUNBOOK.md](CREDENTIAL-PUBLICATION-RUNBOOK.md)의 기존 `AWSCURRENT` republication 절차를 따릅니다.

복구 후 StatefulSet이 수동 restart나 Argo CD sync 없이 자연스럽게 Pod 생성을 재시도하는지 확인하고, Ready 상태와 authenticated `PING/PONG`을 검증합니다.

## Pod 장애

1. Pod event와 이전 container log를 확인합니다.
2. StatefulSet이 `redis-0`을 정상적으로 재생성하는지 확인합니다.
3. Pod가 재생성된 경우 기존 PVC/PV가 정상적으로 다시 연결되는지 확인합니다.
4. Pod `2/2 Ready`, authenticated `PING/PONG` 및 Service endpoint를 확인합니다.
5. AOF enabled, loading 및 write/rewrite 상태를 확인합니다.
6. 데이터 유지 확인이 필요한 경우 운영 데이터와 충돌하지 않는 비민감 테스트 key를 사용하고 검증 후 삭제합니다.

## PVC 또는 Node 장애

1. PVC/PV 상태, EBS CSI event 및 node condition을 확인합니다.
2. EBS volume의 AZ와 새 Pod가 선택한 node AZ가 일치하는지 확인합니다.
3. attach/detach가 진행 중이면 중복 강제 attach를 시도하지 않습니다.
4. 복구 후 authenticated `PING/PONG`과 AOF loading/write 상태를 확인합니다.
5. Redis Pod가 On-Demand node에 배치되었는지 확인합니다.

## Runtime Validation 이력

2026-09-16 `test-eks`에서 Redis credential publication 이후 자연 기동, authenticated `PING/PONG`, AOF 상태, Pod 재생성, 기존 PVC/PV/EBS 재사용 및 테스트 데이터 유지를 검증했습니다.

Pod 재생성 이후에도 On-Demand 배치와 데이터 persistence가 유지되었으며 검증용 test key까지 정상적으로 정리했습니다.

**Redis EKS Runtime Validation: PASS**

Backend → Redis E2E는 Backend production runtime 배포 구성이 완료된 이후 별도 검증합니다.

## 알려진 한계

Redis는 single replica이므로 Pod 또는 node 복구 중 서비스 중단이 발생할 수 있습니다. PDB는 voluntary disruption을 제한할 뿐 node 장애에 대한 automatic failover를 제공하지 않습니다.

Redis 장애 시 Backend의 재시도 및 장애 처리 동작은 Backend 연계 검증 범위에서 별도로 확인합니다.
