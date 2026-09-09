function readPositiveNumber(name, defaultValue) {
  const value = Number(__ENV[name] || defaultValue);

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }

  return value;
}

const rawBaseUrl = __ENV.BASE_URL || '';

export const config = {
  baseUrl: rawBaseUrl.endsWith('/')
    ? rawBaseUrl.slice(0, -1)
    : rawBaseUrl,
  testType: __ENV.TEST_TYPE || 'smoke',
  productId: __ENV.PRODUCT_ID || '',
  productsQuery: __ENV.PRODUCTS_QUERY || '',
  filtersQuery: __ENV.FILTERS_QUERY || '',
  thinkTimeSeconds: readPositiveNumber('THINK_TIME_SECONDS', 1),
  p95ThresholdMs: readPositiveNumber('P95_THRESHOLD_MS', 500),
  p99ThresholdMs: readPositiveNumber('P99_THRESHOLD_MS', 1000),
};

export function validateConfig() {
  if (!config.baseUrl) {
    throw new Error('BASE_URL is required');
  }

  const isHttpUrl =
    config.baseUrl.startsWith('http://') ||
    config.baseUrl.startsWith('https://');

  if (!isHttpUrl) {
    throw new Error('BASE_URL must start with http:// or https://');
  }

  if (!['smoke', 'load'].includes(config.testType)) {
    throw new Error('TEST_TYPE must be smoke or load');
  }
}