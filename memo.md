### 배포 테스트
```bash
kubectl apply -f k8s/argocd/ -f k8s/frontend/ -f k8s/grafana/
kubectl delete -f k8s/argocd/ -f k8s/frontend/ -f k8s/grafana/
```

### rollout 테스트
```bash
kubectl rollout restart deployment argocd-server -n argocd
kubectl rollout status deployment argocd-server -n argocd
```