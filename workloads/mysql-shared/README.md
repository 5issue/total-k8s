# MySQL(MOCO) 아키텍처 및 운영 명세서: `shared-mysql`

---

## 1. 개요

* **대상 워크로드**: 5개 핵심 도메인 서비스 공유 클러스터 (`member`, `auth`, `order`, `payment`, `oms`)
* **인스턴스 구성**: 3 Replicas (쿼럼 유지를 위해 홀수 구성 필수)
* **파드 배치 전략 (Affinity)**: `soft` (인프라 노드가 2대인 환경 특성상 완전 분산 불가에 따른 연성 안티-어피니티 적용)
* **스토리지**: EBS `gp3`, `20Gi` (초기 프로비저닝 추정치, 운영 간 실측 후 증설 검토)
* **백업 아키텍처**:
  * 자체 내장 백업 미사용
  * **수행 방식**: K8s `CronJob` 기반 `Percona XtraBackup` + Binary Log 실시간 아카이빙
  * **저장소**: S3 버킷 (`kurly-mysql-backup`)

---

## 2. 계정 및 데이터베이스 매핑

공용 계정을 일체 배제하며, 모든 애플리케이션 계정은 원칙적으로 `GRANT OPTION`이 부여되지 않습니다.

| 계정명 | 매핑 데이터베이스 | 용도 및 권한 범위 |
| :--- | :--- | :--- |
| `member_service` | `member_db` | 회원 도메인 서비스 전용 DB 접근 |
| `auth_service` | `auth_db` | 인증/인가 도메인 서비스 전용 DB 접근 |
| `order_service` | `order_db` | 주문 도메인 서비스 전용 DB 접근 |
| `payment_service` | `payment_db` | 결제 도메인 서비스 전용 DB 접근 |
| `oms_service` | `oms_db` | 주문관리시스템(OMS) 전용 DB 접근 |
| `root` | `*.*` (전체) | **클러스터 Bootstrap 및 인프라 유지보수 전용** (애플리케이션 직접 바인딩 금지) |

> **관리자(root) 접근 화이트리스트:**
> * 임종원
> * 이재혁

---

## 3. 계정 프로비저닝 및 보안 라이프사이클

### 비밀번호 정책
`validate_password` 및 `password_history` 플러그인을 통해 데이터베이스 엔진 레벨에서 강제 적용합니다.

* **만료 주기**: 90일
* **최소 길이**: 12자 이상
* **복잡도 조건**: 4개 문자셋 조합 필수 (영문 대문자, 영문 소문자, 숫자, 특수문자)
* **이력 관리**: 최근 사용한 비밀번호 3회 재사용 금지

### 시크릿 관리 및 생성 파이프라인
1. **자격 증명 생성**: AWS Secrets Manager (AWS KMS CMK 암호화 적용)
2. **동기화 파이프라인**: Terraform 프로비저닝 -> K8s Opaque Secret (`shared-mysql-accounts`)
3. **계정 배포 방식**:
   * 클러스터 기동 후 K8s `Job`이 SQL을 실행하여 데이터베이스 및 서비스 계정 초기화
   * 비밀번호는 SQL 텍스트나 Pod 로그에 평문 노출되지 않도록 **옵션 파일(`my.cnf` 계열)로 분리 마운트**하여 안전하게 주입

---

## 4. 네트워크 및 접근 제어 (보안)

### 네트워크 트래픽 제어
* **제어 방식**: 서비스 메시(mTLS/Istio) 없이 순수 Kubernetes `NetworkPolicy`로 인바운드 트래픽 제어
* **허용 룰**:
  * **포트**: TCP `3306`
  * **인증 소스**: `member`, `auth`, `order`, `payment`, `oms` 서비스 Pod의 라벨(Label)만 인바운드 허용

### 시크릿 접근 통제 (RBAC)
* 데이터베이스 접속 자격 증명(Credential Secret)에 대한 `get`, `list` 권한은 `shared-mysql-secret-reader` 역할(Role/ClusterRole)을 통해서만 제한적으로 부여
* **인가 대상자**: 임종원, 이재혁 (화이트리스트 관리자 한정)