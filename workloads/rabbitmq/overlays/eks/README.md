# RabbitMQ EKS overlay

이 overlay는 `backend` Namespace에서 3-node RabbitMQ 운영 baseline을 렌더링합니다.

## 구현 항목

* encrypted `gp3` StorageClass와 replica당 `5Gi` PVC
* request `250m/512Mi`, limit `1 CPU/1.5Gi`
* on-demand node preference와 hostname/AZ soft anti-affinity
* `maxUnavailable: 1` PDB와 120초 graceful termination
* non-root/read-only-root-filesystem security context
* TLS-only listener와 certificate Secret contract
* VPC CNI NetworkPolicy용 application/peer ingress와 Operator HTTPS Management API 최소 허용 rule

## 적용 전 선행 조건

1. `k8s/addons/cert-manager/v1.21.1`의 cert-manager가 Ready 상태여야 합니다.
2. `k8s/addons/rabbitmq-cluster-operator/v2.22.5`의 CRD/API, webhook과 Operator Deployment가 Ready 상태여야 합니다.
3. `backend` Namespace가 존재해야 합니다.
4. `gp3` StorageClass와 EBS CSI driver가 준비되어 있어야 합니다.
5. `rabbitmq-server-tls`와 `rabbitmq-ca` Secret이 `backend` Namespace에 제공되어 있어야 합니다.

실제 credential 또는 certificate 값은 이 repository에 저장하지 않습니다.

Backend 연계 시에는 TLS port `5671`과 `rabbitmq-ca`를 통한 CA trust 구성이 필요합니다. service user/vhost/permission과 messaging topology는 Backend 요구사항 확정 후 별도 연계가 필요합니다.

## 버전 및 EKS 검증

Broker image는 `rabbitmq:4.3.5`, CRD API는 `rabbitmq.com/v1beta1`로 고정되어 있습니다.

2026-09-07 `test-eks`의 Kubernetes `1.36` 환경에서 RabbitMQ Cluster Operator `v2.22.5`와 RabbitMQ `4.3.5` 구성의 runtime validation을 완료했습니다.

## TLS DNS 계약

TLS certificate는 Service DNS와 세 RabbitMQ Pod DNS에 대해 short `.svc` 및 long `.svc.cluster.local` SAN을 모두 포함합니다.

전체 DNS 목록과 Secret key 계약은 상위 [README](../../README.md)의 TLS prerequisite를 참고합니다.

## NetworkPolicy

Operator의 HTTPS Management API 접근을 위해 `15671/TCP` ingress를 최소 범위로 허용합니다.

허용 대상은 `rabbitmq-system` Namespace에서 다음 label이 모두 일치하는 RabbitMQ Cluster Operator Pod입니다.

* `app.kubernetes.io/name=rabbitmq-cluster-operator`
* `app.kubernetes.io/component=rabbitmq-operator`
