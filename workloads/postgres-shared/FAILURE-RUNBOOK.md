# PostgreSQL(CNPG) 장애 대응 Runbook

이 문서는 CNPG 기반 공용 PostgreSQL 클러스터 `shared-pg`(product/OMS/WMS/SCM 공용)의 인프라 장애 확인 범위를 정의합니다. 명령은 상태 조회용이며 실제 삭제, 재시작, drain, failover 유발은 승인된 장애 훈련에서만 수행합니다.

## 정상 상태

```bash
kubectl -n backend get cluster shared-pg
kubectl -n backend get pod,pvc,service -l app.kubernetes.io/name=shared-pg
kubectl -n backend describe cluster shared-pg
```

정상 기준은 `Cluster` status의 phase가 `Cluster in healthy state`, ready instance `2`(Primary 1 + Replica 1), 각 Pod readiness 통과, 각 instance의 PVC `Bound`입니다. Primary/Replica 역할은 `cnpg.io/instanceRole` label로 확인하며, 인증 정보(계정/비밀번호)는 화면이나 로그에 출력하지 않습니다.

## Pod 장애 (Replica)

1. Pod event와 이전 container log를 수집합니다.
2. CNPG Operator가 해당 Pod를 재생성하는지, 동일 PVC가 재연결되는지 확인합니다.
3. Replica가 streaming replication에 재합류하고 replication lag이 정상 범위로 수렴하는지 확인합니다.
4. `Cluster` status의 instance 상태와 Service endpoint를 확인합니다.

## Primary 장애 (Failover)

1. Primary Pod event와 log를 수집합니다.
2. CNPG Operator가 Replica를 새 Primary로 자동 승격하는지 확인합니다.
3. 승격 완료 후 `-rw`(read-write) Service가 새 Primary를 가리키는지 확인합니다.
4. 이전 Primary가 복구되면 Replica로 재합류(`pg_rewind` 등)하는지 확인합니다.
5. Failover 전후로 application 연결 오류/재연결 시간을 기록합니다.

## PVC 또는 node 장애

1. PVC/PV 상태, EBS CSI event, node condition을 확인합니다.
2. EBS volume의 AZ와 재스케줄된 Pod의 node AZ가 일치하는지 확인합니다. instance 2개는 zone 기준 hard anti-affinity이므로 AZ가 부족하면 Pending이 발생할 수 있습니다.
3. attach/detach가 진행 중이면 중복 강제 attach를 시도하지 않습니다.
4. 복구 후 replication lag과 재합류 완료 여부를 확인합니다.

## 백업/복구 확인

1. `barmanObjectStore` 대상 S3 경로(`s3://kurly-db-backup/shared-pg`)에 최근 백업 오브젝트가 생성되는지 확인합니다.
2. IRSA(`inheritFromIAMRole: true`)로 자격증명 오류 없이 업로드되는지 CNPG backup job log로 확인합니다.
3. 실제 복구(PITR) 절차는 별도 검증 훈련에서 별도 namespace/cluster로 수행하며, 운영 `shared-pg`에 직접 restore를 실행하지 않습니다.

## 알려진 한계

instance 2개는 hard(required) anti-affinity로 노드/AZ 2개에 정확히 매칭되므로, 노드 부족이나 AZ 장애 시 rescheduling 여유가 없어 Pending이 발생할 수 있습니다. 노드그룹이 AZ별로 분리되어 있지 않아 재기동 시 PVC-AZ 불일치 위험이 있습니다. IRSA Role ARN이 아직 placeholder라 실제 배포 전 교체가 필요하며, 교체 전에는 백업이 실패합니다. `lock_timeout`이 기본값이라 order 서비스의 비관적 락 경합 시 커넥션 풀이 오래 점유될 수 있습니다.
