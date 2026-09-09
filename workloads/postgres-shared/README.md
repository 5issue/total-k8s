# PostgreSQL(CNPG) Kubernetes 구성

이 디렉터리는 CloudNativePG(CNPG) 기반의 공용 PostgreSQL 클러스터 `shared-pg` 공통 구성과 AWS EKS overlay를 관리합니다. product/OMS/WMS/SCM 4개 서비스가 이 클러스터 하나를 공유하며, 서비스별 database(schema) + 별도 DB 계정으로 논리적으로 분리됩니다. 최초에는 서비스별 완전 독립 클러스터(4개)로 설계했으나, 노드 리소스(t3.medium 2대) 제약으로 물리 클러스터는 통합하고 DB/계정 레벨 분리로 절충했습니다.

## 현재 base

`base`는 환경 독립적인 다음 계약만 정의합니다.

* `Cluster/shared-pg`, `instances: 2` (Primary 1 + Replica 1)
* postgres image `ghcr.io/cloudnative-pg/postgresql:16.4` (팀 표준 버전 재확인 필요)

CNPG는 MOCO와 달리 instance 수에 홀수 제약이 없습니다. `wal_level: logical`은 별도로 설정하지 않습니다 — Outbox 패턴은 Spring 애플리케이션 레벨에서 구현하며 CDC/Debezium을 사용하지 않기로 확정했기 때문입니다.

CNPG Operator와 CRD는 workload보다 먼저 설치되어야 합니다. `base`만으로는 배포할 수 없습니다 — CNPG는 `.spec.storage`를 필수로 요구하며, storage는 `overlays/eks`에서만 정의합니다.

## Backend contract

서비스별 database/계정 이름, 권한 범위는 아직 미확정입니다. 각 서비스는 자신의 schema로 권한을 제한한 계정만 사용해야 하며(공용 계정 금지), 실제 계정 목록이 확정되기 전에는 manifest에 가짜 계정/권한을 만들지 않습니다. Object owner 화이트리스트도 미확정입니다.

order 서비스는 비관적 락(`SELECT ... FOR UPDATE`)을 사용합니다. 락 경합 시 커넥션 풀 고갈을 막기 위해 `lock_timeout`을 기본값보다 낮게 설정하는 방안을 검토 중이며 아직 반영하지 않았습니다. product 서비스의 재고 관리에서 Redis(임시 홀드)와 PostgreSQL(영구 확정)의 정확한 역할 분담은 API 명세만으로는 불명확하며, 이는 PostgreSQL 스키마 설계에 영향을 주므로 Backend팀 확인이 필요합니다.

## EKS overlay

`overlays/eks`는 다음 운영 기본안을 적용합니다.

| 항목 | 값 |
| --- | --- |
| Namespace | `backend` |
| Instances | `2` |
| StorageClass/PVC | `gp3`, `30Gi` (서비스 4개 공용이라 단일 서비스 대비 확대) |
| Resources | request `250m/512Mi`, limit `1 CPU/1.5Gi` |
| Placement | on-demand node 선호, zone 기준 hard pod anti-affinity(`required`) |
| PDB | `maxUnavailable: 1` (CNPG가 자동 생성하는 PDB와 별개로 명시적 정의) |
| Monitoring | `enablePodMonitor: true` |
| Backup | S3(`barmanObjectStore`), IRSA(`inheritFromIAMRole: true`) |
| Audit | `pgaudit.log: all, -misc` 등 (D-17) |
| NetworkPolicy | `product-service`/`oms-service`/`wms-service`/`scm-service` label을 가진 Pod에서만 TCP `5432` 허용 |
| RBAC | `shared-pg-secret-reader` Role/RoleBinding — `shared-pg-app`/`shared-pg-superuser` Secret 조회를 인가된 관리자로 제한 (현재 subjects 비어있어 아무도 접근 불가) |

노드 2대(AZ `ap-northeast-2a`/`2c`) 환경에서 instance 2개는 노드 수와 정확히 1:1 매칭되므로, MySQL과 달리 hard anti-affinity(`required`)를 채택했습니다 — 배치 조건이 깨지면 Pending으로 명확히 드러나는 것이 장점입니다. On-demand 배치는 preferred로 두어 재스케줄링을 막지 않습니다.

## 백업

CNPG는 S3 백업을 내장 지원합니다(`spec.backup.barmanObjectStore`). Access Key를 하드코딩하지 않고 IRSA(`serviceAccountTemplate`의 `eks.amazonaws.com/role-arn` + `s3Credentials.inheritFromIAMRole: true`)로 접근 권한을 구성합니다. **IRSA Role ARN은 현재 placeholder이며 실제 값으로 교체해야 합니다.** 실제 설치 버전에 따라 `barmanObjectStore` 방식이 별도 `ObjectStore` CRD 방식으로 바뀔 수 있어, CNPG 버전 확정 후 재검증이 필요합니다.

## Audit

D-17(Audit Table 접근 인가 관리자 화이트리스트) 대응으로 [`pgaudit`](https://cloudnative-pg.io/documentation/1.24/postgresql_conf/)를 활성화했습니다. `spec.postgresql.parameters`에 `pgaudit.*` 값을 넣으면 CNPG가 `shared_preload_libraries` 추가와 클러스터 내 모든 database에 대한 `CREATE EXTENSION pgaudit`을 자동으로 관리합니다. 다만 이건 로그를 남기는 인프라일 뿐이고, "인가된 관리자만 접근했는지" 화이트리스트 자체를 강제하는 것은 아닙니다 — 계정(D-02/D-06)이 확정된 뒤 실제 접근 로그를 검증하는 절차가 별도로 필요합니다.

## Security

* mTLS/Istio는 서비스 간 통신에 사용하지 않습니다(보안팀 v2.1 인증/인가 설계서 확정, VPC CNI NetworkPolicy 기반 격리로 대체).
* Backend-DB 연결 구간 자체의 TLS 적용 여부는 미확정입니다(개인정보/결제 데이터 포함, 보안팀 확인 우선순위 높음).
* NetworkPolicy는 현재 `product-service`/`oms-service`/`wms-service`/`scm-service` Pod label 단위까지 제한합니다(D-10).
* credential Secret 조회는 `shared-pg-secret-reader` Role/RoleBinding으로 제한합니다(D-04). `subjects`는 보안팀 D-04 화이트리스트가 확정되기 전까지 비워둬 현재는 아무도 접근할 수 없습니다(fail-closed). `shared-pg-superuser` Secret은 `spec.enableSuperuserAccess`가 켜져 있을 때만 실제로 생성됩니다(현재 미설정).
* CNPG Operator의 헬스체크/관리 전용 포트는 아직 확인하지 않았습니다(RabbitMQ Cluster Operator가 Management API `15671`을 별도로 요구했던 사례가 있어 동일 패턴을 우려하고 있습니다).

장애 확인 절차는 [FAILURE-RUNBOOK.md](FAILURE-RUNBOOK.md)를 따릅니다.

## Pending

* StorageClass(`gp3`) `volumeBindingMode`가 `WaitForFirstConsumer`인지 확인 (PVC 재바인딩 AZ 일치 전제조건)
* 노드그룹 AZ별 분리(`worker_node_2a`/`2c`) — 현재 단일 그룹이 서브넷을 상속받는 구조라 재기동 시 AZ 불일치로 PVC Pending 위험
* IRSA Role ARN 실제 값 교체, CNPG 버전 확정 후 `barmanObjectStore` vs `ObjectStore` CRD 방식 재검증
* 서비스별 database/계정/권한 및 Object Owner 화이트리스트 확정 (KISA D-02/D-06/D-20: 공용계정 금지)
* 비밀번호 만료/복잡도/재사용 기준값 확정 (KISA D-03/D-05) — D-05(재사용 제한)는 PostgreSQL 네이티브 기능으로는 불가하여 별도 방안(Vault 등) 검토 필요
* Backend-DB 연결 TLS 적용 여부 확정 (확정 시 `.spec.certificates` 추가 필요)
* CNPG Operator 관리 전용 포트 확인 후 NetworkPolicy 반영
* D-04 인가된 DB 관리자 화이트리스트 확정 → `rbac-secret-access.yaml`의 `subjects`에 실제 User/Group 반영
* `lock_timeout` 튜닝 (order 서비스 비관적 락 대응)
* product 서비스 재고 관리 — Redis/PostgreSQL 역할 분담 Backend팀 확인 (스키마 설계에 영향)
* CNPG 자동 PDB와 수동 PDB 중복 여부 정리 (`spec.enablePDB` 검토)
* CNPG/CRD 설치 방식과 infrastructure/GitOps ownership 확정 (Redis/RabbitMQ와 동일 상태)

## Render 검증

```bash
kubectl kustomize workloads/postgres-shared/base
kubectl kustomize workloads/postgres-shared/overlays/eks
```

## 배포 후 검증 계획

* 실제 AZ 배치 확인 (`kubectl get pods -o wide`)
* 노드 재기동 시뮬레이션 → PVC 재바인딩 정상 확인 (최우선 검증 항목)
* Failover 테스트 (Primary 강제 종료 → 자동 승격 확인)
* TLS 연결 확인 시 SAN에 short/long DNS 포함 여부 검증 (RabbitMQ에서 누락으로 hostname verification 실패를 겪은 전례 있음, CNPG 내부 복제 TLS 구성 시 동일 주의 필요)
* S3 백업 실제 파일 생성 확인
