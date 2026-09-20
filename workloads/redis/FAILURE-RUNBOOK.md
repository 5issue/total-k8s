# Redis 장애 대응 Runbook

Single-replica Redis의 장애 확인 및 복구 기준을 정의합니다.

## 정상 상태

```bash
kubectl -n backend get statefulset redis
kubectl -n backend get pod,pvc,service -l app.kubernetes.io/name=redis
kubectl -n backend describe pod redis-0
```

정상 기준:

* StatefulSet `1/1 Ready`
* Redis / `redis-exporter` Pod `2/2 Ready`
* PVC `Bound`
* Redis Service endpoint 정상
* authenticated `PING/PONG` 정상
* AOF loading 및 write 상태 정상
* On-Demand Node 배치

## Credential 장애

1. Pod status와 event에서 Secret 관련 오류를 확인합니다.
2. Pod Namespace의 `redis-credentials` 존재와 `password` key를 확인합니다.
3. Source 및 Version annotation을 확인합니다.
4. Credential을 현재 `AWSCURRENT` 기준으로 다시 publication합니다.
5. Redis Ready 및 authenticated `PING/PONG`을 확인합니다.

Credential publication과 검증은 [CREDENTIAL-PUBLICATION-RUNBOOK.md](CREDENTIAL-PUBLICATION-RUNBOOK.md)를 따릅니다.

## Pod 장애

1. Pod event와 이전 container log를 확인합니다.
2. StatefulSet의 `redis-0` 재생성 상태를 확인합니다.
3. 기존 PVC/PV 재연결 상태를 확인합니다.
4. Pod `2/2 Ready`와 authenticated `PING/PONG`을 확인합니다.
5. AOF loading 및 write 상태를 확인합니다.

데이터 유지 검증이 필요한 경우 비민감 테스트 key를 사용하고 검증 후 정리합니다.

## PVC / Node 장애

1. PVC/PV, EBS CSI event, Node condition을 확인합니다.
2. EBS volume과 대상 Node의 AZ를 확인합니다.
3. EBS attach/detach 완료 상태를 확인합니다.
4. Redis Pod의 On-Demand 배치를 확인합니다.
5. 복구 후 authenticated `PING/PONG`과 AOF 상태를 확인합니다.

## 운영 한계

Redis는 single replica로 운영하므로 Pod 또는 Node 복구 과정에서 서비스 중단이 발생할 수 있습니다.

PDB `minAvailable: 1`은 계획된 disruption을 제한하며 Redis failover는 제공하지 않습니다.
