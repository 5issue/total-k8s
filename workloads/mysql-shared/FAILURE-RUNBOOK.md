# MySQL(MOCO) 장애 대응 Runbook

이 문서는 MOCO 기반 공용 MySQL 클러스터 `shared-mysql`(member/auth/order/payment 공용)의 인프라 장애 확인 범위를 정의합니다. 명령은 상태 조회용이며 실제 삭제, 재시작, drain, failover 유발은 승인된 장애 훈련에서만 수행합니다.

## 정상 상태

```bash
kubectl -n backend get mysqlcluster shared-mysql
kubectl -n backend get pod,pvc,service -l app.kubernetes.io/name=shared-mysql
kubectl -n backend describe mysqlcluster shared-mysql
```

정상 기준은 `MySQLCluster` status의 `Healthy` condition true, ready replica `3`, 각 Pod readiness 통과, 각 replica의 PVC `Bound`입니다. Primary/Replica 역할은 MOCO status 또는 label로 확인하며, 인증 정보(계정/비밀번호)는 화면이나 로그에 출력하지 않습니다.

## Pod 장애 (Replica)

1. Pod event와 이전 container log를 수집합니다.
2. MOCO Operator가 해당 Pod를 재생성하는지, 동일 PVC가 재연결되는지 확인합니다.
3. Replica가 클러스터에 재합류(semi-sync catch-up)하는지 확인합니다.
4. `MySQLCluster` status의 replica 상태와 Service endpoint를 확인합니다.

## Primary 장애 (Failover)

1. Primary Pod event와 log를 수집합니다.
2. MOCO Operator가 남은 healthy replica 중 하나를 새 Primary로 승격하는지 확인합니다.
3. 승격 완료 후 quorum(3 중 2 이상 healthy)이 유지되는지 확인합니다.
4. 이전 Primary가 복구되면 replica로 재합류하는지 확인합니다.
5. Failover 전후로 application 연결 오류/재연결 시간을 기록합니다.

## PVC 또는 node 장애

1. PVC/PV 상태, EBS CSI event, node condition을 확인합니다.
2. EBS volume의 AZ와 재스케줄된 Pod의 node AZ가 일치하는지 확인합니다.
3. attach/detach가 진행 중이면 중복 강제 attach를 시도하지 않습니다.
4. 복구 후 replication lag과 semi-sync catch-up 완료 여부를 확인합니다.

## 알려진 한계

MOCO는 백업 기능을 내장하지 않으며 현재 xtrabackup/binlog 아카이빙이 구성되어 있지 않아 PITR이 불가능합니다. 노드그룹이 AZ별로 분리되어 있지 않아 재기동 시 PVC-AZ 불일치로 Pending이 발생할 수 있습니다. `innodb_lock_wait_timeout`이 기본값이라 order 서비스의 비관적 락 경합 시 커넥션 풀이 오래 점유될 수 있습니다.
