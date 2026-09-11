```bash
k apply -f .
k delete -f .
kubectl get ns frontend
```

```bash
# Pod 상태 확인
kubectl get pod -n frontend

# Ingress의 ADDRESS 컬럼에 ALB DNS 주소가 채워지는지 실시간 확인
kubectl get ingress -n frontend -w
```


```bash
kubectl get ns dev
kubectl get secret -n dev total-client-secret
```