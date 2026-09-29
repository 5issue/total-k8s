import http from 'k6/http';
import { check } from 'k6';

import { config, validateConfig } from '../lib/config.js';

function readPositiveInteger(name, defaultValue) {
  const value = Number(__ENV[name] || defaultValue);

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return value;
}

const startRps = readPositiveInteger('START_RPS', 50);
const secondRps = readPositiveInteger('SECOND_RPS', 100);
const thirdRps = readPositiveInteger('THIRD_RPS', 200);
const peakRps = readPositiveInteger('PEAK_RPS', 300);
const preAllocatedVUs = readPositiveInteger('PRE_ALLOCATED_VUS', 300);
const maxVUs = readPositiveInteger('MAX_VUS', 600);

export const options = {
  scenarios: {
    product_capacity: {
      executor: 'ramping-arrival-rate',
      exec: 'productCapacity',
      startRate: startRps,
      timeUnit: '1s',
      preAllocatedVUs,
      maxVUs,
      stages: [
        { duration: '30s', target: startRps },
        { duration: '30s', target: secondRps },
        { duration: '30s', target: secondRps },
        { duration: '30s', target: thirdRps },
        { duration: '30s', target: thirdRps },
        { duration: '30s', target: peakRps },
        { duration: '1m', target: peakRps },
        { duration: '30s', target: 0 },
      ],
      gracefulStop: '10s',
      tags: {
        service: 'product',
        test_type: 'capacity',
      },
    },
  },

  thresholds: {
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
    http_req_duration: [
      `p(95)<${config.p95ThresholdMs}`,
      `p(99)<${config.p99ThresholdMs}`,
    ],
    dropped_iterations: ['count==0'],
  },

  discardResponseBodies: true,

  tags: {
    project: '5issue',
    test_type: 'capacity',
  },
};

function appendQuery(path, query) {
  const normalizedQuery = query.startsWith('?')
    ? query.slice(1)
    : query;

  return `${path}?${normalizedQuery}`;
}

export function setup() {
  validateConfig();

  if (!config.productsQuery) {
    throw new Error('PRODUCTS_QUERY is required');
  }

  if (!config.filtersQuery) {
    throw new Error('FILTERS_QUERY is required');
  }

  const requests = [
    {
      path: '/api/v1/products/home-recommendations',
      name: 'GET /api/v1/products/home-recommendations',
    },
    {
      path: '/api/v1/products/categories',
      name: 'GET /api/v1/products/categories',
    },
    {
      path: appendQuery('/api/v1/products', config.productsQuery),
      name: 'GET /api/v1/products',
    },
    {
      path: appendQuery('/api/v1/products/filters', config.filtersQuery),
      name: 'GET /api/v1/products/filters',
    },
  ];

  if (config.productId) {
    requests.push({
      path: `/api/v1/products/${config.productId}`,
      name: 'GET /api/v1/products/{productId}',
    });
  }

  return {
    baseUrl: config.baseUrl,
    requests,
  };
}

export function productCapacity(data) {
  const request =
    data.requests[Math.floor(Math.random() * data.requests.length)];

  const response = http.get(`${data.baseUrl}${request.path}`, {
    headers: {
      Accept: 'application/json',
    },
    tags: {
      name: request.name,
      api_domain: 'product',
    },
    timeout: '5s',
  });

  check(response, {
    [`${request.name} returns 200`]: (result) => result.status === 200,
  });
}