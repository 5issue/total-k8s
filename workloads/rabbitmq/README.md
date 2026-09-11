# RabbitMQ Kubernetes 구성

이 디렉터리는 RabbitMQ Cluster Operator 기반의 3-node RabbitMQ 공통 구성과 AWS EKS overlay를 관리합니다.

## 현재 기본 구성

`base`는 환경에 종속되지 않는 RabbitMQ 기본 구성을 정의합니다.

- `RabbitmqCluster/rabbitmq`, `replicas: 3`
- broker image `rabbitmq:4.3.5`
- Operator가 관리하는 StatefulSet, readiness, Service, replica별 PVC
- RabbitMQ ClusterIP Service
- Operator가 생성하는 `rabbitmq-default-user` bootstrap Secret

3 replicas는 단일 장애점(SPOF) 완화를 위한 현재 인프라 기준입니다. 다만 broker replica 수만으로 queue durability나 message HA가 보장되지는 않으며, 실제 메시지 가용성은 queue type과 durability 설정에 따라 달라집니다.

RabbitMQ Cluster Operator와 CRD는 워크로드보다 먼저 준비되어 있어야 합니다.

## 버전 및 선행 구성

- RabbitMQ broker: `4.3.5`
- RabbitMQ Cluster Operator: `v2.22.5` (`k8s/addons/rabbitmq-cluster-operator/v2.22.5`)
- RabbitMQ CRD API: `rabbitmq.com/v1beta1`
- cert-manager: `v1.21.1` (`k8s/addons/cert-manager/v1.21.1`)

RabbitMQ 워크로드는 다음 기술적 선행 관계를 가집니다.

```text
cert-manager
        ↓
RabbitMQ Cluster Operator
        ↓
RabbitMQ workload
```

현재 cert-manager와 RabbitMQ Cluster Operator는 `k8s/addons/`에 구성되어 있습니다.

EKS overlay 적용 전에는 다음 항목이 준비되어 있어야 합니다.

1. cert-manager `v1.21.1`
2. RabbitMQ Cluster Operator `v2.22.5` 및 `rabbitmq.com/v1beta1` CRD
3. `gp3` StorageClass 및 EBS CSI Driver
4. Backend trust 제공을 위한 `backend` Namespace

EKS overlay는 `messaging` Namespace를 생성하며 Namespace 범위의 Issuer와 Certificate를 통해 TLS Secret의 수명 주기를 관리합니다.

이 디렉터리에서는 RabbitMQ workload에 필요한 리소스와 기술적 선행조건을 정의합니다. 실제 GitOps Application 구성, 배포 순서 및 Sync 정책은 배포/GitOps 영역에서 결정합니다.

2026-09-07 `test-eks` Kubernetes `1.36` 환경에서 RabbitMQ Cluster Operator `v2.22.5`와 RabbitMQ `4.3.5` 구성을 실환경에서 검증했습니다. 이 기록은 Namespace 이동 전 검증이며, `messaging` Namespace endpoint와 Namespace 간 NetworkPolicy는 향후 실환경에서 다시 검증해야 합니다.

## Backend 연결 계약

RabbitMQ는 전체 MSA가 사용하는 message broker입니다.

Producer/Consumer, exchange, queue, routing key, durable/quorum 여부, DLQ/retry, publisher confirm, acknowledgement, prefetch 등 Application Messaging Topology는 Backend 영역에서 정의합니다.

Backend에 제공하는 EKS 연결 계약은 다음과 같습니다.

| 항목 | 값 |
| --- | --- |
| Host | `rabbitmq.messaging.svc.cluster.local` |
| Port | `5671` |
| Protocol | AMQPS |
| Vhost | `total-prod` |
| Username | `total-backend` |
| Password | `backend/rabbitmq-app-credentials/password` |
| Hostname verification | enabled |
| CA trust | `backend/rabbitmq-ca/ca.crt` → `/etc/rabbitmq/tls/ca.crt` |
| Trust configuration | Spring PEM SSL Bundle |

plaintext listener `5672`는 EKS overlay에서 비활성화합니다. Application 자격 증명의 Backend 적용은 별도 연계 범위입니다.

## EKS 오버레이

`overlays/eks`는 다음 운영 baseline을 적용합니다.

| 항목 | 값 |
| --- | --- |
| Namespace | `messaging` |
| Replicas | `3` |
| StorageClass/PVC | 암호화 `gp3`, replica당 `5Gi` |
| Resources | request `250m/512Mi`, limit `1 CPU/1.5Gi` |
| 배치 | On-Demand node 선호, hostname/AZ soft anti-affinity |
| PDB | `maxUnavailable: 1` |
| Graceful termination | `120s` |
| TLS | `rabbitmq-server-tls`, `rabbitmq-ca`, non-TLS listener 비활성화 |
| NetworkPolicy | Backend TLS `5671`, RabbitMQ peer `4369/25672`, Operator/Provisioner HTTPS `15671` 최소 허용 |

EKS overlay는 다음 파일로 구성됩니다.

| 파일 | 역할 |
| --- | --- |
| `kustomization.yaml` | EKS overlay 구성 |
| `namespace.yaml` | `messaging` Namespace |
| `rabbitmq-cluster-patch.yaml` | EKS resource, storage, TLS 및 placement 설정 |
| `rabbitmq-tls.yaml` | CA 및 RabbitMQ server certificate |
| `network-policy.yaml` | RabbitMQ ingress 접근 제어 |
| `pdb.yaml` | Pod disruption 제한 |
| `provisioning-service-account.yaml` | Application Identity Provisioner ServiceAccount |
| `provisioning-script.yaml` | Vhost/User/Permission 구성 로직 |
| `provisioning-job.yaml` | Application Identity Provisioning Job |

`messaging` Namespace는 RabbitMQ cluster, TLS/PKI, persistence와 NetworkPolicy를 Backend Application workload에서 분리하는 플랫폼 경계입니다. `gp3`는 `total-infra`의 EBS CSI 구성과 연계합니다.

Kubernetes namespaced resource는 Namespace 간 in-place 이동이 불가능합니다. Runtime에 `backend` Namespace의 RabbitMQ가 존재한다면 새 `messaging` cluster/PVC를 생성하는 전환이 필요합니다.

현재 정적 manifest는 다음 작업을 수행하지 않습니다.

- 기존 broker data migration
- 기존 PVC 이동 또는 재사용
- 기존 `backend` RabbitMQ resource 제거
- AWS resource 변경

실제 전환 방식은 현재 runtime 상태를 확인한 후 별도로 결정합니다.

RabbitMQ broker 3 replicas / EKS worker 2 nodes가 현재 전제입니다. RabbitMQ Pod의 hostname 및 AZ anti-affinity는 `preferred`로 설정합니다.

사용 가능한 worker 수가 RabbitMQ replica 수보다 적은 경우 동일 node에 둘 이상의 RabbitMQ Pod가 배치될 수 있으며, hard constraint로 인해 Pod 복구가 차단되는 상황을 피하도록 구성했습니다.

On-Demand node 배치 역시 hard pinning하지 않고 preference로 적용합니다.

RabbitMQ와 setup container에는 UID/GID `999`, non-root, read-only root filesystem, privilege escalation 금지, capability drop, `RuntimeDefault` seccomp를 적용합니다.

## TLS 선행 조건

EKS overlay는 다음 Secret 이름과 key를 계약으로 사용합니다. 실제 Secret 값은 repository에 저장하지 않습니다.

| Resource | 역할 | Required keys | 소비자 |
| --- | --- | --- | --- |
| `messaging/rabbitmq-ca-signing` | CA signing | `tls.crt`, `tls.key` | cert-manager CA Issuer만 |
| `messaging/rabbitmq-server-tls` | RabbitMQ server identity | `tls.crt`, `tls.key` | RabbitMQ server |
| `messaging/rabbitmq-ca` | RabbitMQ CA trust | `ca.crt`만 | RabbitMQ |
| `backend/rabbitmq-ca` | Application CA trust | `ca.crt`만 | Backend |

cert-manager는 `messaging`에 signing과 server identity Secret을 생성합니다.

Public CA trust는 `messaging/rabbitmq-ca-signing`의 `tls.crt`만 사용하여 다음 두 Secret에 제공합니다.

- `messaging/rabbitmq-ca`
- `backend/rabbitmq-ca`

Signing Secret 전체 또는 `tls.key`를 trust Secret으로 복제하지 않습니다.

상세한 CA trust 배포 절차는 [TRUST-PUBLICATION-RUNBOOK.md](TRUST-PUBLICATION-RUNBOOK.md)를 따릅니다.

`rabbitmq-selfsigned Issuer → rabbitmq-ca Certificate/rabbitmq-ca-signing Secret → rabbitmq-ca Issuer → rabbitmq-server Certificate` 체인으로 private CA와 server certificate를 발급합니다.

CA certificate는 5년 유효기간을 사용하고 `renewal.policy: Disabled`로 자동 갱신을 비활성화합니다. Server certificate는 90일 유효기간과 15일 전 자동 갱신 기준을 사용합니다.

| Certificate | Target Secret | Duration | Renewal | Private Key |
| --- | --- | --- | --- | --- |
| `rabbitmq-ca` | `rabbitmq-ca-signing` | 5년 | 자동 갱신 비활성 (`Disabled`) | RSA 4096, 기존 key 유지 |
| `rabbitmq-server` | `rabbitmq-server-tls` | 90일 | 15일 전 자동 갱신 (`RenewBefore`) | RSA 2048, 갱신 시 rotation |

위 duration과 renewal policy는 보안 요구사항이 아닌 현재 프로젝트의 Engineering Decision입니다.

cert-manager가 `rabbitmq-server-tls`를 자동 갱신하며, 실제 certificate, private key 또는 credential은 repository에 저장하지 않습니다.

`rabbitmq-ca-signing`은 RabbitMQ 또는 Backend Pod에 mount하지 않으며 해당 ServiceAccount에 이 Secret의 `get/list/watch` 권한을 부여하지 않습니다.

Backend 연결 시에는 `rabbitmq-ca`에서 `ca.crt` key만 명시적으로 projection하고 whole-Secret mount 또는 `envFrom`을 사용하지 않습니다.

CA는 자동 교체하지 않으며 만료 180일 전까지 계획된 rollover를 시작하는 것을 운영 기준으로 합니다. Dual trust 구성, 신규 CA 기반 server certificate 전환 및 기존 CA 제거 기준은 [CA-ROLLOVER-RUNBOOK.md](CA-ROLLOVER-RUNBOOK.md)를 따릅니다.

`renewal.policy: Disabled`는 만료 기반 자동 갱신만 막습니다. Certificate spec 변경, target Secret 삭제 또는 명시적 재발급은 certificate를 변경할 수 있으므로 CA Certificate에 일반적인 `cmctl renew`를 사용하지 않습니다.

trust-manager는 source Secret read 권한을 상시 controller에 부여해 signing key 접근 주체를 확대하므로 도입하지 않습니다. Kubernetes RBAC는 Secret key 단위 제한을 제공하지 않으므로 CA trust publication에 필요한 source Secret 접근은 필요한 시점에 한정합니다.

### TLS DNS 계약

인증서 SAN은 Backend Service와 Operator의 per-Pod Management API ServerName을 모두 만족하도록 short `.svc`와 long `.svc.cluster.local` DNS를 함께 포함합니다.

3-replica `rabbitmq` cluster에서 사용하는 DNS 계약은 다음과 같습니다.

```text
rabbitmq.messaging.svc
rabbitmq.messaging.svc.cluster.local
*.rabbitmq-nodes.messaging.svc
*.rabbitmq-nodes.messaging.svc.cluster.local
rabbitmq-server-0.rabbitmq-nodes.messaging.svc
rabbitmq-server-0.rabbitmq-nodes.messaging.svc.cluster.local
rabbitmq-server-1.rabbitmq-nodes.messaging.svc
rabbitmq-server-1.rabbitmq-nodes.messaging.svc.cluster.local
rabbitmq-server-2.rabbitmq-nodes.messaging.svc
rabbitmq-server-2.rabbitmq-nodes.messaging.svc.cluster.local
```

Namespace 이동 전 runtime에서 `.svc.cluster.local` SAN만 포함하면 Operator의 short `.svc` ServerName HTTPS Management API `15671` hostname verification이 실패하는 것을 확인했습니다.

동일한 short/long DNS coverage 원칙을 `messaging` Namespace에 적용했으며 새 endpoint의 runtime 재검증은 남아 있습니다.

## 인증, vhost와 권한

Operator가 생성하는 `rabbitmq-default-user`는 Application Identity 구성 및 운영 복구에 사용하는 bootstrap identity입니다. Backend에서 사용하지 않고 Application credential 갱신 목적으로 Secret을 삭제하지 않습니다.

Provisioning Job은 HTTPS Management API `15671`와 public CA trust를 사용해 다음 상태를 구성합니다.

- Vhost: `total-prod`
- User: `total-backend`
- Management tag: 없음
- Configure: `.*`
- Write: `.*`
- Read: `.*`

`.*` 권한은 RabbitMQ 전체가 아니라 `total-prod` vhost 범위에만 적용합니다.

Provisioning Job은 `PUT`을 사용해 vhost, user, permission을 멱등적으로 수렴한 후 `GET`으로 결과를 다시 검증합니다.

Provisioning Job은 다음 Secret만 사용합니다.

- `rabbitmq-default-user`
- `messaging/rabbitmq-app-credentials`
- `messaging/rabbitmq-ca`

CA signing private key, RabbitMQ server private key 및 Backend Secret은 Provisioning Job에 제공하지 않습니다.

Application credential의 Source of Truth는 AWS Secrets Manager이며 동일 source/version을 기준으로 다음 Secret에 제공합니다.

| Secret | Required keys | 소비자 |
| --- | --- | --- |
| `messaging/rabbitmq-app-credentials` | `username`, `password` | Provisioning Job |
| `backend/rabbitmq-app-credentials` | `username`, `password` | Backend Application |

실제 Secret 값은 Git 또는 Terraform state에 저장하지 않습니다.

Application 자격 증명의 구성·갱신·복구 기준은 [CREDENTIAL-PROVISIONING-RUNBOOK.md](CREDENTIAL-PROVISIONING-RUNBOOK.md)를 따릅니다.

Provisioning Job은 RabbitMQ Cluster와 필요한 Secret이 준비된 이후 실행해야 합니다. 실제 Job 실행 및 GitOps 연계 방식은 배포/GitOps 구성에서 결정합니다.

## NetworkPolicy와 관리 API

RabbitMQ Service는 ClusterIP만 사용합니다. Management UI는 NodePort, LoadBalancer 또는 Ingress로 외부에 노출하지 않으며 필요한 경우 Kubernetes API를 통한 port-forward 방식으로 접근할 수 있습니다.

EKS NetworkPolicy는 다음 ingress를 허용합니다.

| Source | Port | 목적 |
| --- | --- | --- |
| `backend` Namespace | `5671/TCP` | AMQPS Application Traffic |
| `messaging`의 RabbitMQ Pod | `4369/TCP`, `25672/TCP` | Peer Discovery / Distribution |
| RabbitMQ Cluster Operator | `15671/TCP` | HTTPS Management API |
| RabbitMQ Provisioner | `15671/TCP` | Application Identity Provisioning |

Operator용 `15671` rule은 `rabbitmq-system` Namespace에서 다음 label이 모두 일치하는 RabbitMQ Cluster Operator Pod에만 허용합니다.

- `app.kubernetes.io/name=rabbitmq-cluster-operator`
- `app.kubernetes.io/component=rabbitmq-operator`

Provisioner는 동일 `messaging` Namespace에서 다음 label이 모두 일치하는 Pod만 `15671`에 접근할 수 있습니다.

- `app.kubernetes.io/name=rabbitmq-provisioner`
- `app.kubernetes.io/component=credential-provisioning`

다음 endpoint는 허용하지 않습니다.

- AMQP plaintext `5672`
- Management HTTP `15672`
- 외부 Management Ingress
- Management LoadBalancer

일반 Pod에는 Management 및 Prometheus port를 추가로 노출하지 않습니다.

Prometheus metrics 연계는 monitoring collector Namespace와 수집 방식이 확정된 이후 별도 연계합니다.

## 영속 저장소와 장애 범위

각 RabbitMQ replica는 독립 PVC를 사용하며 Operator가 Pod 및 cluster reconciliation을 수행합니다.

PDB `maxUnavailable: 1`은 voluntary disruption 시 동시에 unavailable 상태가 되는 Pod 수를 제한합니다.

2026-09-07 runtime validation에서는 단일 RabbitMQ Pod 삭제 후 새 Pod가 기존 PVC/PV/EBS를 다시 사용해 cluster에 합류하는 것을 확인했습니다. 장애 중에는 나머지 두 endpoint를 통한 AMQPS 연결도 유지되었습니다.

Worker node 및 AZ 장애 복구는 해당 validation 범위에 포함하지 않았습니다.

Broker가 3개이더라도 queue type과 durability가 확정되지 않은 상태에서는 message HA 또는 무손실을 보장하지 않습니다.

장애 확인 범위와 절차는 [FAILURE-RUNBOOK.md](FAILURE-RUNBOOK.md)를 참고합니다.

## 렌더링 검증

Repository root에서 다음 명령으로 공통 구성과 EKS overlay를 렌더링할 수 있습니다.

```bash
kubectl kustomize workloads/rabbitmq/base
kubectl kustomize workloads/rabbitmq/overlays/eks
```

EKS overlay 렌더링 시 최소 다음 항목을 확인합니다.

- 모든 namespaced resource가 `messaging` Namespace를 사용하는지
- RabbitMQ replicas가 `3`인지
- TLS Secret 참조가 일치하는지
- Server certificate SAN이 Service DNS와 일치하는지
- plaintext `5672`, `15672`가 허용되지 않는지
- NetworkPolicy selector와 Provisioner label이 일치하는지
- 실제 credential 또는 private key가 manifest에 포함되지 않는지

## Runtime 재검증

2026-09-07 `test-eks` 검증은 Namespace 이동 전 baseline입니다.

`messaging` Namespace 적용 후 다음 항목은 runtime에서 다시 확인해야 합니다.

- RabbitmqCluster `rabbitmq` 3/3 Ready
- Service endpoint `rabbitmq.messaging.svc.cluster.local`
- AMQPS `5671` 연결
- plaintext `5672` listener 비활성
- Management HTTP `15672` 비활성
- Server certificate SAN 및 CA chain
- Server certificate validation 및 hostname verification
- `total-prod` vhost
- `total-backend` Application Identity
- Management tag 없음
- `total-prod` 범위의 Configure / Write / Read `.*`
- Backend Application credential 인증
- Backend publish/consume
- Backend `5671`, Operator/Provisioner `15671` NetworkPolicy 허용
- 비허용 source/port 차단
- EKS worker 2 nodes 환경의 soft placement 및 PVC binding

이 검증 범위는 RabbitMQ broker cluster와 연결 계약을 대상으로 하며, Queue/Message HA를 보장한다는 의미는 아닙니다.

## 후속 연계사항

### 인프라

- RabbitMQ Application credential용 AWS Secrets Manager resource 및 최소 IAM 구성
- 동일 credential을 `messaging`, `backend` Namespace에 제공하는 one-shot publication 절차 확정
- CA 만료 관측 및 사전 경고 연계

### 배포 / GitOps

- `workloads/rabbitmq/overlays/eks`의 실제 배포 경로 연결
- cert-manager와 RabbitMQ Cluster Operator의 기술적 선행조건 반영
- Provisioning Job 실행 방식 연계
- 필요한 경우 RabbitmqCluster health 판정 방식 검토

이 디렉터리에서는 RabbitMQ workload에 필요한 리소스와 선행조건을 정의하며, 실제 GitOps Application 구성, 배포 순서 및 Sync 정책은 배포/GitOps 영역에서 결정합니다.

### 모니터링

- monitoring collector Namespace 및 수집 방식 확정 후 RabbitMQ metrics 연계

### Backend

- 기존 `rabbitmq.backend.svc.cluster.local:5672` 연결 정보 정리
- Spring PEM SSL Bundle 적용
- `backend/rabbitmq-ca/ca.crt`의 read-only `/etc/rabbitmq/tls/ca.crt` mount
- Server certificate validation 및 hostname verification 적용
- RabbitMQ Java Client `5.35+` security upgrade 검토
- exchange, queue, routing key 및 classic/quorum/durability 정책
- DLQ/retry/acknowledgement/publisher confirm 등 Application Messaging Topology

## 관련 문서

| 문서 | 역할 |
| --- | --- |
| [CREDENTIAL-PROVISIONING-RUNBOOK.md](CREDENTIAL-PROVISIONING-RUNBOOK.md) | Application 자격 증명 구성·갱신·복구 |
| [TRUST-PUBLICATION-RUNBOOK.md](TRUST-PUBLICATION-RUNBOOK.md) | Public CA trust 배포 |
| [CA-ROLLOVER-RUNBOOK.md](CA-ROLLOVER-RUNBOOK.md) | CA 교체 |
| [FAILURE-RUNBOOK.md](FAILURE-RUNBOOK.md) | RabbitMQ 장애 확인 및 복구 |

`overlays/eks/README.md`의 EKS 관련 내용은 이 문서에 통합하며, 이후 RabbitMQ 구성의 기준 문서는 이 `README.md`를 사용합니다.