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

## Capacity 탐색 테스트

목표 HTTP RPS를 단계적으로 높이며 Product API의 안정 처리량과 병목 구간을 확인합니다. 기존 `product-read.js`와 달리 iteration당 요청을 1개만 실행하므로 설정한 arrival rate가 목표 HTTP RPS와 1:1로 대응합니다.

Backend Pod와 DB가 모두 정상이고 팀과 실행 시간을 합의한 후에만 실행합니다.

    BASE_URL=https://cloudyim.store \
    PRODUCTS_QUERY='keyword=사과&page=0&size=20' \
    FILTERS_QUERY='keyword=사과' \
    k6 run tests/k6/scenarios/product-capacity.js

유효한 상품 ID가 준비되면 상세 조회도 포함할 수 있습니다.

    BASE_URL=https://cloudyim.store \
    PRODUCTS_QUERY='keyword=사과&page=0&size=20' \
    FILTERS_QUERY='keyword=사과' \
    PRODUCT_ID=<실제 상품 ID> \
    k6 run tests/k6/scenarios/product-capacity.js

기본 Capacity 프로파일:

- 50 RPS에서 시작
- 100 RPS와 200 RPS를 거쳐 단계적으로 증가
- 300 RPS를 1분간 유지
- 30초 동안 0 RPS로 감소
- 전체 실행 시간 약 4분
- 최대 600 VU
- dropped iterations 0건 요구

환경변수로 부하를 조절할 수 있습니다.

- `START_RPS`: 시작 RPS, 기본 50
- `SECOND_RPS`: 두 번째 RPS, 기본 100
- `THIRD_RPS`: 세 번째 RPS, 기본 200
- `PEAK_RPS`: Peak RPS, 기본 300
- `PRE_ALLOCATED_VUS`: 사전 할당 VU, 기본 300
- `MAX_VUS`: 최대 VU, 기본 600

테스트 중 실제 RPS, 오류율, p95·p99, dropped iterations와 함께 Pod CPU·메모리, OOM, Restart 및 서비스 가용성을 확인합니다.