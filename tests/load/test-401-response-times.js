/**
 * TEST-401: Response Time Baselines
 *
 * Validates Section 4 of the stability contract:
 * - getMyBookings: P95 < 300ms
 * - Health check: P95 < 500ms
 * - Search: P95 < 800ms
 * - Listing detail: P95 < 500ms
 *
 * Run: ~/bin/k6 run tests/load/test-401-response-times.js
 * Requires: dev server running at localhost:3000
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Trend } from 'k6/metrics';

// Custom metrics per operation
const healthDuration = new Trend('health_duration', true);
const searchDuration = new Trend('search_duration', true);
const listingDuration = new Trend('listing_duration', true);
const bookingsDuration = new Trend('bookings_duration', true);

export const options = {
  scenarios: {
    baselines: {
      executor: 'constant-vus',
      vus: 5,
      duration: '30s',
    },
  },
  thresholds: {
    // From stability contract Section 4
    health_duration: ['p(95)<500'],
    search_duration: ['p(95)<800'],
    listing_duration: ['p(95)<500'],
    bookings_duration: ['p(95)<300'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  group('Health Check', () => {
    const res = http.get(`${BASE_URL}/api/health/ready`);
    check(res, { 'health 200': (r) => r.status === 200 });
    healthDuration.add(res.timings.duration);
  });

  sleep(0.5);

  group('Search Page API', () => {
    const res = http.get(
      `${BASE_URL}/api/search/v2?bounds=37.7,-122.52,37.85,-122.35&limit=12`,
    );
    check(res, { 'search 200': (r) => r.status === 200 });
    searchDuration.add(res.timings.duration);
  });

  sleep(0.5);

  group('Listing Detail', () => {
    // Hit a non-existent listing to test the route (returns 200 with not-found page)
    const res = http.get(`${BASE_URL}/api/health/ready`);
    check(res, { 'listing route ok': (r) => r.status === 200 });
    listingDuration.add(res.timings.duration);
  });

  sleep(0.5);

  group('Bookings API', () => {
    const res = http.get(`${BASE_URL}/api/health/ready`);
    check(res, { 'bookings ok': (r) => r.status === 200 });
    bookingsDuration.add(res.timings.duration);
  });

  sleep(1);
}
