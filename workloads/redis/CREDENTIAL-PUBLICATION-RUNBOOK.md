# Redis 자격 증명 Publication Runbook

Redis credential의 개별 publication, 검증 및 rotation 기준을 정의합니다.

Fresh EKS의 전체 publication은 `total-infra/WORKLOAD-SECRET-PUBLICATION-RUNBOOK.md`의 bootstrap 절차를 사용합니다.

## Credential 계약

| 항목          | 값                                                    |
| ----------- | ---------------------------------------------------- |
| Source      | AWS Secrets Manager `prod/total/redis-credentials`   |
| Version     | `AWSCURRENT`                                         |
| Targets     | `backend/redis-credentials`, `dev/redis-credentials` |
| Secret type | `Opaque`                                             |
| Key         | `password`                                           |

Terraform은 Secret container를 관리하며 password와 SecretVersion은 별도 운영 절차에서 관리합니다.

## 개별 Publication

`total-infra`에서 실행합니다.

```bash
make redis-credential-publish
make redis-credential-verify
```

Publisher는 실행 시작 시 `AWSCURRENT` VersionId를 고정하고 동일 credential을 `backend`, `dev`에 publication합니다.

Publication과 verify 과정에서 다음 항목을 확인합니다.

* Secret type 및 key
* Source Secret annotation
* Source VersionId
* 두 Target의 `AWSCURRENT` 정합성

일부 Target만 반영된 경우 동일 명령을 재실행하여 현재 `AWSCURRENT` 기준으로 수렴시킵니다.

## Runtime 확인

Publication 완료 후 다음을 확인합니다.

* `backend/redis-credentials`
* `dev/redis-credentials`
* Redis Pod Ready
* authenticated `PING/PONG`
* `backend`, `dev`에서 `redis.backend.svc.cluster.local:6379` 접근

장애 진단은 [FAILURE-RUNBOOK.md](FAILURE-RUNBOOK.md)를 따릅니다.

## Password Rotation

Redis는 single-password `requirepass` 구조를 사용합니다.

Rotation 시 다음 변경을 하나의 작업으로 관리합니다.

1. 새로운 SecretVersion 준비
2. `AWSCURRENT` 전환
3. Redis password 적용
4. Kubernetes credential publication
5. Backend 재연결 및 인증 확인

Rotation 전 서비스 영향과 rollback 기준을 확인합니다.
