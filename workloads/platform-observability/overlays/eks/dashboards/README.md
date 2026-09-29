# Load Test Overview

`load-test-overview.json` correlates load-generator results with platform metrics in one Grafana dashboard.

The dashboard is provisioned by the Grafana sidecar from the
`load-test-overview-grafana-dashboard` ConfigMap. Argo CD deploys it as part of
the `platform-observability` application.

## Panels

- k6 RPS, error rate, p95 and p99
- workload replicas and HPA desired replicas
- Pod CPU and memory usage as a percentage of limits
- Pod restarts, Pending Pods and Not Ready Pods
- node CPU and memory usage
- Redis throughput and clients
- RabbitMQ queue depth and message rate
- PostgreSQL/MySQL connections when their exporters expose the metrics
- firing Prometheus alerts, excluding Watchdog

Use the `Namespace`, `Workload`, `Pod`, and `k6 Test ID` variables to scope a
test. Set the dashboard time range to the k6 execution window.

## Stream k6 metrics

The Kubernetes and dependency panels work without additional setup. The four
k6 panels require the Prometheus remote-write receiver to be enabled in
`kube-prometheus-stack`:

```hcl
prometheus = {
  prometheusSpec = {
    enableRemoteWriteReceiver = true
  }
}
```

After the Terraform/Helm change is applied, expose the Prometheus service only
to the local test terminal:

```bash
AWS_PROFILE=target-infra kubectl -n prometheus port-forward \
  service/prometheus-kube-prometheus-prometheus 9090:9090
```

In another terminal, give every run a unique `testid` and stream the metrics:

```bash
K6_PROMETHEUS_RW_SERVER_URL=http://localhost:9090/api/v1/write \
K6_PROMETHEUS_RW_TREND_STATS='p(95),p(99),max' \
k6 run -o experimental-prometheus-rw \
  --tag testid=product-capacity-20260929 \
  tests/k6/scenarios/product-read.js
```

Do not expose the Prometheus remote-write endpoint through a public Ingress.
