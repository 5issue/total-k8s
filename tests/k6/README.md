# k6 상품 조회 부하 테스트

상품 조회 API의 응답시간과 실패율을 검증하는 k6 테스트입니다.

## 테스트 대상

- GET /api/v1/products/home-recommendations
- GET /api/v1/products/categories
- GET /api/v1/products
- GET /api/v1/products/filters
- GET /api/v1/products/{productId}

## 스크립트 검사

실제 HTTP 요청 없이 설정과 문법만 검사합니다.

    k6 inspect tests/k6/scenarios/product-read.js

Load 프로파일을 검사합니다.

    k6 inspect -e TEST_TYPE=load tests/k6/scenarios/product-read.js

## Smoke 테스트

product-service 배포 및 API 정상 응답 확인 후 실행합니다.

    BASE_URL=https://cloudyim.store TEST_TYPE=smoke k6 run tests/k6/scenarios/product-read.js

상품 상세 조회를 포함하려면 유효한 상품 ID를 전달합니다.

    BASE_URL=https://cloudyim.store TEST_TYPE=smoke PRODUCT_ID=1 k6 run tests/k6/scenarios/product-read.js

검색 조건을 전달할 수 있습니다.

    BASE_URL=https://cloudyim.store TEST_TYPE=smoke PRODUCTS_QUERY='keyword=사과&page=0&size=20' FILTERS_QUERY='keyword=사과' k6 run tests/k6/scenarios/product-read.js

## Load 테스트

팀과 대상 환경 및 실행 시간을 합의한 후에만 실행합니다.

    BASE_URL=https://cloudyim.store TEST_TYPE=load PRODUCT_ID=1 k6 run tests/k6/scenarios/product-read.js

기본 Load 프로파일:

- 1분 동안 10 VU까지 증가
- 3분 동안 10 VU 유지
- 1분 동안 0 VU로 감소

## 성능 기준

- HTTP 요청 실패율 1% 미만
- Check 성공률 99% 초과
- P95 응답시간 500ms 미만
- P99 응답시간 1,000ms 미만

## 주의사항

- API가 503을 반환하는 동안 실제 테스트를 실행하지 않습니다.
- 공용 환경에서 Load 테스트를 임의로 실행하지 않습니다.
- 인증 토큰과 개인정보를 결과 또는 Git에 기록하지 않습니다.