# RabbitMQ EKS overlay

이 디렉터리는 EKS 환경별 설정을 추가하기 위한 overlay 위치입니다. 현재 PR에서는 EKS 및 공통 인프라 구성이 확정되지 않아 별도의 manifest를 추가하지 않고, 이후 결정이 필요한 항목만 정리합니다.

## EKS 구성 시 결정 사항

* Namespace 및 backend 배포 Namespace와의 관계
* RabbitMQ Cluster Operator 및 RabbitMQ image version
* EBS CSI driver, gp3 StorageClass 및 AZ topology
* replica별 PVC 용량과 데이터 보존·백업 정책
* CPU/memory requests 및 limits
* Pod topology spread 및 anti-affinity 정책
* PodDisruptionBudget 및 node/cluster upgrade 대응
* Prometheus metrics, dashboard, alert 및 log 수집
* NetworkPolicy 및 허용 port 범위
* 운영 credential 및 Kubernetes Secret 관리 방식
* AMQP TLS 및 인증서 관리 방식
* RabbitMQ Cluster Operator/CRD가 workload보다 먼저 적용되어야 하는 배포 의존성

## 배치 시 확인 사항

3-member Quorum Queue의 가용성을 고려하여 실제 EKS node/AZ 구성과 RabbitMQ Pod 배치, EBS volume topology를 함께 확인합니다.

`base`에서는 특정 node 구성을 전제로 한 `required` anti-affinity를 적용하지 않으며, 실제 EKS node/AZ 구성이 확정된 뒤 overlay에서 배치 정책을 결정합니다.

