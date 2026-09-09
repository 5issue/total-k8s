import { config } from './config.js';

const smokeScenario = {
  executor: 'constant-vus',
  vus: 1,
  duration: '30s',
};

const loadScenario = {
  executor: 'ramping-vus',
  startVUs: 0,
  stages: [
    { duration: '1m', target: 10 },
    { duration: '3m', target: 10 },
    { duration: '1m', target: 0 },
  ],
  gracefulRampDown: '30s',
};

const selectedScenario =
  config.testType === 'load' ? loadScenario : smokeScenario;

export const options = {
  scenarios: {
    product_read: {
      ...selectedScenario,
      exec: 'productRead',
      gracefulStop: '10s',
      tags: {
        service: 'product',
        test_type: config.testType,
      },
    },
  },

  thresholds: {
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
    'http_req_duration{scenario:product_read}': [
      `p(95)<${config.p95ThresholdMs}`,
      `p(99)<${config.p99ThresholdMs}`,
    ],
  },

  discardResponseBodies: true,

  tags: {
    project: '5issue',
    test_type: config.testType,
  },
};