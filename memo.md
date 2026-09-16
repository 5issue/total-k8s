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


[user1@mgmt ~]$ kubectl port-forward -n dev svc/swagger-ui 8080:8080

스웨거 설정 파일을 보니 원인이 정확히 파악되었습니다!

현재 swagger-ui 컨테이너 내부의 환경변수(URLS)에 각 백엔드 서비스의 API 명세 주소가 [https://dev.cloudyim.store/api/v1/auth/v3/api-docs](https://dev.cloudyim.store/api/v1/auth/v3/api-docs) 형태로 박혀 있습니다.

하지만 이전 대화에서 확인하셨듯이, 백엔드 서비스들의 실제 라우팅 규칙은 인그레스에서 다음과 같이 잡혀 있습니다:

인그레스 규칙: - path: /api/v1/auth -> 백엔드 auth-service (포트 8080)

여기서 두 가지 문제가 겹쳐 있습니다:

스프링부트 기본 OpenAPI(Swagger) 경로 불일치: 스프링부트의 기본 OpenAPI 3 JSON 문서는 보통 /v3/api-docs 경로로 열리지만, 인그레스에는 /api/v1/auth/v3/api-docs라는 경로가 등록되어 있습니다. 만약 백엔드 앱의 컨텍스트 경로(/context-path)나 API 서빙 경로에 /v3/api-docs가 제대로 매핑되어 있지 않다면 해당 주소로 요청을 보냈을 때 백엔드가 404를 뱉게 됩니다.

백엔드 파드 상태: 아까 보셨듯 백엔드 파드들이 CrashLoopBackOff 상태로 꺼져 있기 때문에 애초에 저 주소로 요청을 받아줄 서버가 살아있지 않습니다.

🛠️ 해결 방법 (스웨거 페이지만 단독으로 완벽하게 쓰려면)
만약 백엔드 파드들이 안 떠 있는 상태에서 스웨거 화면을 에러 없이 깔끔하게 보고 싶거나, 혹은 로컬/외부에서 더미 명세를 띄워 테스트하고 싶다면 URLS 환경변수의 주소 경로를 백엔드 앱이 실제로 응답하는 올바른 OpenAPI 경로로 맞춰주어야 합니다.

예를 들어 백엔드 서비스들이 공통적으로 /v3/api-docs를 제공한다면, 인그레스 경로와 맞춰지도록 수정해야 합니다.

현재 각 백엔드 서비스들의 스프링부트 설정에서 OpenAPI(Swagger) 기본 경로가 어떻게 지정되어 있는지 확인해 보셨나요? 아니면 백엔드 파드가 꺼져 있는 문제를 먼저 해결하시겠습니까?