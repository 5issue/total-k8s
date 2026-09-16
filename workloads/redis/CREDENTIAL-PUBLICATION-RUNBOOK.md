# Redis 자격 증명 Publication Runbook

이 Runbook은 Redis `requirepass`에 사용하는 password를 AWS Secrets Manager의 기존 `AWSCURRENT` SecretVersion에서 Kubernetes Secret으로 publication하고 검증하는 절차를 정의합니다.

## 1. 자격 증명 계약

| 항목                     | 값                                                  |
| ---------------------- | -------------------------------------------------- |
| Source of Truth        | AWS Secrets Manager `prod/total/redis-credentials` |
| Payload schema         | `password`: 비어 있지 않은 문자열                |
| Target                 | `backend/redis-credentials`                        |
| Kubernetes Secret type | `Opaque`                                           |
| Kubernetes Secret key  | `password`                                         |
| Source annotation      | `total.io/source-secret`                           |
| Version annotation     | `total.io/source-version-id`                       |

AWS Secrets Manager resource와 publication 구현은 `total-infra`에서 관리합니다.

Terraform은 Secret container만 관리하며 실제 password와 SecretVersion은 Terraform state에서 관리하지 않습니다. 최초 password와 SecretVersion 생성 및 password rotation은 별도 승인된 운영 절차로 수행합니다.

Publication script는 새로운 password나 SecretVersion을 생성하지 않고 기존 `AWSCURRENT`만 사용합니다.

## 2. Publication prerequisite

실행 전에 다음 상태가 준비되어 있어야 합니다.

1. `total-infra`의 Redis credential publication 구현을 사용합니다.
2. 유효한 AWS session과 대상 EKS kubeconfig가 준비되어 있어야 합니다.
3. `backend` Namespace가 존재해야 합니다.
4. `prod/total/redis-credentials`가 삭제 예약 상태가 아니어야 합니다.
5. `AWSCURRENT` stage를 가진 SecretVersion이 정확히 하나 존재해야 합니다.
6. Secret payload가 정의된 `password` schema와 일치해야 합니다.

Publication script는 실행 전에 AWS account, region, EKS cluster와 kubeconfig endpoint/profile의 정합성을 검증하며 조건이 일치하지 않으면 중단합니다.

Secret 값은 prerequisite 확인, 실행 또는 검증 과정에서 stdout, stderr, shell history, 임시파일이나 Git에 출력하지 않습니다.

## 3. Publication 및 검증

`total-infra` repository에서 다음 명령을 실행합니다.

```bash
make redis-credential-publish
make redis-credential-verify
```

Publication script는 실행 시작 시 현재 `AWSCURRENT` VersionId를 고정하고 해당 version의 payload를 사용하여 `backend/redis-credentials`를 publication합니다.

다음 항목을 함께 검증합니다.

* Secret type이 `Opaque`인지
* Secret data가 정의된 `password` schema와 일치하는지
* `total.io/source-secret`이 `prod/total/redis-credentials`인지
* `total.io/source-version-id`가 고정한 `AWSCURRENT` VersionId와 일치하는지

`make redis-credential-verify`는 Secret payload를 조회하지 않고 현재 `AWSCURRENT` metadata와 Kubernetes Secret의 type, key 및 source annotation 정합성을 확인합니다.

## 4. EKS 재생성 후 복구

EKS 재생성만으로 새로운 password나 SecretVersion을 만들지 않습니다.

1. AWS Secrets Manager Secret이 삭제 예약 상태가 아니며 `AWSCURRENT`가 정확히 하나인지 확인합니다.
2. 대상 EKS와 `backend` Namespace가 준비되었는지 확인합니다.
3. `make redis-credential-publish`를 실행하여 기존 `AWSCURRENT`를 `backend/redis-credentials`로 다시 publication합니다.
4. `make redis-credential-verify`로 publication 결과를 확인합니다.
5. Redis StatefulSet이 별도의 수동 sync나 restart 없이 정상 기동하는지 확인합니다.
6. Redis가 Ready 상태에 도달하면 password를 출력하지 않고 authenticated `PING/PONG`을 확인합니다.

Publication 이후에도 Pod가 준비되지 않으면 임의로 credential을 변경하지 않고 Pod event, Secret metadata/key, PVC 및 Redis log를 확인합니다.

상세 장애 진단은 [FAILURE-RUNBOOK.md](FAILURE-RUNBOOK.md)를 따릅니다.

## 5. Password rotation

현재 Redis는 single-password `requirepass` 구조이므로 Kubernetes Secret publication만으로 실행 중인 Redis와 Backend credential이 자동 전환되지 않습니다.

Password rotation 시에는 새로운 SecretVersion과 `AWSCURRENT` 전환, Redis password 적용, Backend credential 반영 및 재연결 순서를 하나의 변경 절차로 계획해야 합니다.

현재 dual-password 기반 무중단 rotation은 구현되어 있지 않으며, rotation 전 서비스 영향과 rollback 기준을 별도로 확인해야 합니다.

## 6. 검증 완료 기준

Credential publication 완료 기준은 다음과 같습니다.

* `backend/redis-credentials`가 존재함
* Secret type, key 및 source annotation이 계약과 일치함
* source VersionId가 현재 `AWSCURRENT`와 일치함
* Redis Pod가 credential을 사용하여 Ready 상태에 도달함
* authenticated `PING/PONG`이 성공함

본 Runbook의 검증 범위는 Redis credential publication과 Redis authentication까지입니다.

Backend 전체 production runtime 계약 및 Backend → Redis E2E는 별도 후속 범위로 관리합니다.
