# PostgreSQL(CNPG) 아키텍처 및 운영 명세서: `shared-pg`

---

## 1. 개요

* **대상 워크로드**: 3개 핵심 도메인 서비스 공유 클러스터 (`product`, `wms`, `scm`)  
* **인스턴스 구성**: 2 Replicas (워커 노드 2대와 1:1 매핑)
* **파드 배치 전략 (Affinity)**: `hard (required)`
  * 인스턴스 수와 노드 수가 정확히 일치하므로 강력한 존/노드 분산(Anti-Affinity) 강제
* **스토리지**: EBS `gp3`, `10Gi` (초기 추정 프로비저닝, 운영 모니터링 후 실측 증설)
* **백업 아키텍처**:
  * CNPG 내장 백업 엔진(`barmanObjectStore`) 활용
  * **인증 방식**: AWS EKS IRSA (`eks.amazonaws.com/role-arn` + `inheritFromIAMRole: true`)
  * **저장소**: S3 버킷 (`s3://kurly-db-backup/shared-pg`)

---

## 2. 계정 및 데이터베이스 매핑

공용 계정을 일체 배제하며, 모든 애플리케이션 계정은 원칙적으로 `GRANT OPTION`이 부여되지 않습니다.

| 계정명 | 매핑 데이터베이스 | 소유권 (Owner) | 용도 및 권한 범위 |
| :--- | :--- | :--- | :--- |
| `product_service` | `product_db` | `product_db` | 상품 도메인 서비스 전용 DB 접근 |
| `wms_service` | `wms_db` | `wms_db` | 물류/창고관리(WMS) 도메인 서비스 전용 DB 접근 |
| `scm_service` | `scm_db` | `scm_db` | 공급망관리(SCM) 도메인 서비스 전용 DB 접근 |
| `postgres` | `*.*` (전체) | 시스템 기본 | **클러스터 Bootstrap 및 인프라 관리 전용** (앱 바인딩 금지, `pg_catalog` 불변 유지) |

> **관리자(`postgres`) 접근 화이트리스트:**
> * 임종원
> * 이재혁

---

## 3. 계정 프로비저닝 및 보안 라이프사이클

### 비밀번호 정책
PostgreSQL 확장 모듈(`passwordcheck`, `credcheck`)을 엔진 레벨에 네이티브로 로드하여 강제합니다.

* **만료 주기**: 90일 (`credcheck.password_valid_max: "90"`)
* **최소 길이**: 12자 이상 (`credcheck.password_min_length: "12"`)
* **복잡도 조건**: 4개 문자셋 조합 필수 (영문 대문자, 영문 소문자, 숫자, 특수문자)
* **이력 관리**: 최근 사용한 비밀번호 3회 재사용 금지 (`credcheck.password_reuse_history: "3"`)

### 시크릿 관리 및 생성 파이프라인
1. **자격 증명 생성**: AWS Secrets Manager (AWS KMS CMK 암호화 적용)
2. **동기화 파이프라인**: Terraform 프로비저닝 -> K8s Opaque Secret (`shared-pg-{서비스}-service-credentials`)
3. **선언적 계정 배포**:
   * 별도의 초기화 Job이나 SQL 스크립트 없이 CNPG CRD의 `spec.managed.roles` 및 Database 리소스로 자동 프로비저닝

---

## 4. 감사 로그 (Audit Logging)

* **감사 도구**: `pgaudit` 네이티브 확장을 모든 대상 Database에 활성화
* **로깅 파라미터**: `pgaudit.log: "all, -misc"`, `pgaudit.log_parameter: "on"`, `pgaudit.log_relation: "on"`
* **조회 통제**: 감사 로그 접근 및 분석 권한은 관리자 화이트리스트(임종원, 이재혁)로 제한

---

## 5. 네트워크 및 접근 제어 (보안)

### 네트워크 트래픽 제어
* **제어 방식**: 서비스 메시(mTLS/Istio) 없이 순수 Kubernetes `NetworkPolicy`로 인바운드 트래픽 통제
* **허용 룰**:
  * **포트**: TCP `5432`
  * **인가 소스**: `product-service`, `wms-service`, `scm-service` 라벨을 보유한 Pod만 허용

### 시크릿 접근 통제 (RBAC)
* DB 접속 자격 증명(Credential Secret)에 대한 `get`, `list` 권한은 `shared-pg-secret-reader` 역할(Role/ClusterRole)로 제한
* **인가 대상자**: 임종원, 이재혁 (화이트리스트 관리자 한정)