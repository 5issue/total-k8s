import http from 'k6/http';
import { check, group, sleep } from 'k6';

import { config, validateConfig } from '../lib/config.js';
import { options as testOptions } from '../lib/options.js';

export const options = testOptions;

function appendQuery(path, query) {
  if (!query) {
    return path;
  }

  const normalizedQuery = query.startsWith('?')
    ? query.slice(1)
    : query;

  return `${path}?${normalizedQuery}`;
}

function getProductApi(baseUrl, path, requestName) {
  const response = http.get(`${baseUrl}${path}`, {
    headers: {
      Accept: 'application/json',
    },
    tags: {
      name: requestName,
      api_domain: 'product',
    },
    timeout: '5s',
  });

  check(response, {
    [`${requestName} returns 200`]: (result) => result.status === 200,
  });

  return response;
}

export function setup() {
  validateConfig();

  return {
    baseUrl: config.baseUrl,
  };
}

export function productRead(data) {
  group('product catalogue read journey', () => {
    getProductApi(
      data.baseUrl,
      '/api/v1/products/home-recommendations',
      'GET /api/v1/products/home-recommendations',
    );

    getProductApi(
      data.baseUrl,
      '/api/v1/products/categories',
      'GET /api/v1/products/categories',
    );

    getProductApi(
      data.baseUrl,
      appendQuery('/api/v1/products', config.productsQuery),
      'GET /api/v1/products',
    );

    getProductApi(
      data.baseUrl,
      appendQuery('/api/v1/products/filters', config.filtersQuery),
      'GET /api/v1/products/filters',
    );

    if (config.productId) {
      getProductApi(
        data.baseUrl,
        `/api/v1/products/${config.productId}`,
        'GET /api/v1/products/{productId}',
      );
    }
  });

  sleep(config.thinkTimeSeconds);
}