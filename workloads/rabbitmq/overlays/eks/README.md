# RabbitMQ EKS overlay

이 overlay는 `backend` Namespace에서 3-node RabbitMQ 운영 baseline을 렌더링합니다.

구현된 항목:

* encrypted `gp3` StorageClass와 replica당 `5Gi` PVC
* request `250m/512Mi`, limit `1 CPU/1.5Gi`
* on-demand node preference와 hostname/AZ soft anti-affinity
* `maxUnavailable: 1` PDB와 120초 graceful termination
* non-root/read-only-root-filesystem security context
* TLS-only listener와 certificate Secret contract
* VPC CNI NetworkPolicy용 application/peer ingress rule

적용 전 선행 조건:

1. RabbitMQ Cluster Operator와 CRD가 호환 가능한 고정 버전으로 설치되어 있어야 합니다. 현재 candidate는 `2.22.5`이며 저장소에는 설치 구성이 없습니다.
2. `backend` Namespace가 존재해야 합니다.
3. `gp3` StorageClass와 EBS CSI driver가 준비되어 있어야 합니다.
4. `rabbitmq-server-tls`와 `rabbitmq-ca` Secret이 `backend` Namespace에 있어야 합니다.
5. Backend가 TLS port 5671과 CA trust를 사용하도록 구성되어야 합니다.

실제 credential 또는 certificate 값은 이 repository에 저장하지 않습니다. service user/vhost/permission과 messaging topology는 Backend 계약 이후 별도 리소스로 추가합니다.

Broker image는 `rabbitmq:4.3.5`, CRD API는 `rabbitmq.com/v1beta1`로 고정되어 있습니다. Operator 설치 전 cert-manager 준비, EKS Kubernetes `1.36` runtime compatibility 검증, infrastructure/GitOps ownership 확정이 필요합니다.
