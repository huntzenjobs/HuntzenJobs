/**
 * k6 Load Testing Script for HuntZen Backend
 *
 * Tests Railway auto-scaling capacity (8-16 workers)
 * Target: 800-1,600 concurrent requests
 *
 * Execution:
 *   k6 run tests/load_test.js
 *
 * Thresholds:
 *   - P95 latency < 500ms
 *   - Error rate < 0.1%
 *   - Throughput: 800-1,600 req/s
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const searchLatency = new Trend('search_latency');
const healthLatency = new Trend('health_latency');

// Load testing stages (progressive ramp-up)
export const options = {
  stages: [
    // Warm-up: 0 → 100 users in 1min
    { duration: '1m', target: 100 },

    // Ramp-up: 100 → 500 users in 2min
    { duration: '2m', target: 500 },

    // Peak load: 500 → 1000 users in 2min
    { duration: '2m', target: 1000 },

    // Sustained peak: Hold 1000 users for 5min
    { duration: '5m', target: 1000 },

    // Spike test: 1000 → 1500 users in 1min
    { duration: '1m', target: 1500 },

    // Hold spike: 1500 users for 2min
    { duration: '2m', target: 1500 },

    // Scale down: 1500 → 0 in 2min
    { duration: '2m', target: 0 },
  ],

  thresholds: {
    // P95 latency must be < 500ms
    http_req_duration: ['p(95)<500'],

    // Error rate must be < 0.1% (1 error per 1000 requests)
    errors: ['rate<0.001'],

    // 95% of requests must succeed
    http_req_failed: ['rate<0.05'],

    // Search endpoint specific
    'search_latency': ['p(95)<600'],

    // Health check should be very fast
    'health_latency': ['p(95)<100'],
  },
};

const BASE_URL = 'https://huntzenjobs-production.up.railway.app';

// Realistic job search queries for load testing
const searchQueries = [
  { job_title: 'Software Engineer', country_code: 'fr', city: 'Paris' },
  { job_title: 'Data Scientist', country_code: 'fr', city: 'Lyon' },
  { job_title: 'Product Manager', country_code: 'fr', city: 'Toulouse' },
  { job_title: 'DevOps Engineer', country_code: 'fr', city: 'Nantes' },
  { job_title: 'Full Stack Developer', country_code: 'fr', city: 'Bordeaux' },
  { job_title: 'Backend Developer', country_code: 'fr' },
  { job_title: 'Frontend Developer', country_code: 'fr' },
  { job_title: 'ML Engineer', country_code: 'fr', city: 'Paris' },
];

export default function () {
  // 80% job search, 20% health check (realistic ratio)
  const isHealthCheck = Math.random() < 0.2;

  if (isHealthCheck) {
    // Health check endpoint
    const healthRes = http.get(`${BASE_URL}/health`, {
      tags: { name: 'HealthCheck' },
    });

    check(healthRes, {
      'health check status 200': (r) => r.status === 200,
      'health check has status field': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.status === 'healthy';
        } catch {
          return false;
        }
      },
    }) || errorRate.add(1);

    healthLatency.add(healthRes.timings.duration);
  } else {
    // Job search endpoint (main load)
    const query = searchQueries[Math.floor(Math.random() * searchQueries.length)];

    const payload = JSON.stringify(query);

    const params = {
      headers: {
        'Content-Type': 'application/json',
      },
      tags: { name: 'JobSearch' },
    };

    const searchRes = http.post(`${BASE_URL}/api/jobs/search`, payload, params);

    const searchCheckResult = check(searchRes, {
      'job search status 200 or 201': (r) => r.status === 200 || r.status === 201,
      'job search response time < 2s': (r) => r.timings.duration < 2000,
      'job search has jobs array': (r) => {
        try {
          const body = JSON.parse(r.body);
          return Array.isArray(body.jobs);
        } catch {
          return false;
        }
      },
    });

    if (!searchCheckResult) {
      errorRate.add(1);
      console.error(`Job search failed: ${searchRes.status} - ${searchRes.body.substring(0, 200)}`);
    }

    searchLatency.add(searchRes.timings.duration);
  }

  // Random sleep between 1-3 seconds (realistic user behavior)
  sleep(Math.random() * 2 + 1);
}

/**
 * Setup function (runs once before load test)
 */
export function setup() {
  console.log('🚀 Starting HuntZen Load Test');
  console.log(`📊 Target: ${BASE_URL}`);
  console.log('⏱️  Duration: ~17 minutes (warm-up → peak → spike → cool-down)');
  console.log('🎯 Thresholds: P95<500ms, Error rate<0.1%\n');

  // Verify backend is healthy before starting
  const healthRes = http.get(`${BASE_URL}/health`);
  if (healthRes.status !== 200) {
    throw new Error(`Backend unhealthy: ${healthRes.status}`);
  }
  console.log('✅ Backend health check passed\n');
}

/**
 * Teardown function (runs once after load test)
 */
export function teardown(data) {
  console.log('\n✅ Load test completed');
  console.log('📊 Check summary above for detailed metrics');
}

/**
 * Custom summary for better readability
 */
export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'load_test_results.json': JSON.stringify(data, null, 2),
  };
}

function textSummary(data, opts) {
  const indent = opts.indent || '';
  const enableColors = opts.enableColors || false;

  const metrics = data.metrics;

  return `
${indent}📊 HuntZen Load Test Results
${indent}${'='.repeat(50)}

${indent}🔢 Request Stats:
${indent}  Total Requests: ${metrics.http_reqs?.values?.count || 0}
${indent}  Failed Requests: ${metrics.http_req_failed?.values?.rate ? (metrics.http_req_failed.values.rate * 100).toFixed(2) : 0}%
${indent}  Error Rate: ${metrics.errors?.values?.rate ? (metrics.errors.values.rate * 100).toFixed(3) : 0}%

${indent}⚡ Performance:
${indent}  P95 Latency: ${metrics.http_req_duration?.values?.['p(95)']?.toFixed(2) || 'N/A'}ms
${indent}  P99 Latency: ${metrics.http_req_duration?.values?.['p(99)']?.toFixed(2) || 'N/A'}ms
${indent}  Avg Latency: ${metrics.http_req_duration?.values?.avg?.toFixed(2) || 'N/A'}ms

${indent}🔍 Search Endpoint:
${indent}  P95: ${metrics.search_latency?.values?.['p(95)']?.toFixed(2) || 'N/A'}ms
${indent}  Avg: ${metrics.search_latency?.values?.avg?.toFixed(2) || 'N/A'}ms

${indent}❤️ Health Check:
${indent}  P95: ${metrics.health_latency?.values?.['p(95)']?.toFixed(2) || 'N/A'}ms
${indent}  Avg: ${metrics.health_latency?.values?.avg?.toFixed(2) || 'N/A'}ms

${indent}📈 Throughput:
${indent}  Requests/sec: ${metrics.http_reqs?.values?.rate?.toFixed(2) || 'N/A'}

${indent}${'='.repeat(50)}
${indent}${data.thresholds && Object.values(data.thresholds).every(t => t.ok) ? '✅ All thresholds PASSED' : '❌ Some thresholds FAILED'}
`;
}
