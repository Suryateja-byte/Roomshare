/**
 * Mock data factory for Nearby Places E2E tests.
 *
 * All fixtures derived from src/types/nearby.ts (NearbyPlace, NearbySearchResponse).
 * Error responses derived from src/app/api/nearby/route.ts.
 */

import { Page, Route } from '@playwright/test';

// --------------------------------------------------------------------------
// Types (mirrors src/types/nearby.ts for test isolation)
// --------------------------------------------------------------------------

interface MockNearbyPlace {
  id: string;
  name: string;
  address: string;
  category: string;
  chain?: string;
  location: { lat: number; lng: number };
  distanceMiles: number;
}

interface MockNearbyResponse {
  places: MockNearbyPlace[];
  meta: { cached: boolean; count: number };
}

// --------------------------------------------------------------------------
// Listing coordinates used in tests (San Francisco)
// --------------------------------------------------------------------------

export const LISTING_COORDS = {
  lat: 37.7749,
  lng: -122.4194,
} as const;

// --------------------------------------------------------------------------
// Place fixtures
// --------------------------------------------------------------------------

export const groceryPlaces: MockNearbyPlace[] = [
  {
    id: 'g1',
    name: 'Whole Foods Market',
    address: '1765 California St, San Francisco, CA',
    category: 'food-grocery',
    chain: 'Whole Foods',
    location: { lat: 37.7905, lng: -122.4207 },
    distanceMiles: 0.4,
  },
  {
    id: 'g2',
    name: "Trader Joe's",
    address: '401 Bay St, San Francisco, CA',
    category: 'food-grocery',
    chain: "Trader Joe's",
    location: { lat: 37.8058, lng: -122.4157 },
    distanceMiles: 0.7,
  },
  {
    id: 'g3',
    name: 'Safeway',
    address: '2020 Market St, San Francisco, CA',
    category: 'supermarket',
    chain: 'Safeway',
    location: { lat: 37.7688, lng: -122.4271 },
    distanceMiles: 0.9,
  },
];

export const restaurantPlaces: MockNearbyPlace[] = [
  {
    id: 'r1',
    name: 'Chipotle Mexican Grill',
    address: '240 Kearny St, San Francisco, CA',
    category: 'restaurant',
    chain: 'Chipotle',
    location: { lat: 37.7907, lng: -122.4037 },
    distanceMiles: 0.3,
  },
  {
    id: 'r2',
    name: 'Tartine Bakery',
    address: '600 Guerrero St, San Francisco, CA',
    category: 'food-beverage',
    location: { lat: 37.7614, lng: -122.4244 },
    distanceMiles: 0.5,
  },
  {
    id: 'r3',
    name: 'Zuni Cafe',
    address: '1658 Market St, San Francisco, CA',
    category: 'restaurant',
    location: { lat: 37.7730, lng: -122.4215 },
    distanceMiles: 0.6,
  },
  {
    id: 'r4',
    name: 'Hog Island Oyster Co',
    address: '1 Ferry Building, San Francisco, CA',
    category: 'restaurant',
    location: { lat: 37.7955, lng: -122.3934 },
    distanceMiles: 1.2,
  },
  {
    id: 'r5',
    name: 'Burma Superstar',
    address: '309 Clement St, San Francisco, CA',
    category: 'restaurant',
    location: { lat: 37.7829, lng: -122.4628 },
    distanceMiles: 1.8,
  },
];

export const pharmacyPlaces: MockNearbyPlace[] = [
  {
    id: 'p1',
    name: 'CVS Pharmacy',
    address: '731 Market St, San Francisco, CA',
    category: 'pharmacy',
    chain: 'CVS',
    location: { lat: 37.7868, lng: -122.4034 },
    distanceMiles: 0.3,
  },
  {
    id: 'p2',
    name: 'Walgreens Pharmacy',
    address: '498 Castro St, San Francisco, CA',
    category: 'pharmacy',
    chain: 'Walgreens',
    location: { lat: 37.7612, lng: -122.4350 },
    distanceMiles: 0.8,
  },
];

export const mixedPlaces: MockNearbyPlace[] = [
  groceryPlaces[0],
  restaurantPlaces[0],
  restaurantPlaces[1],
  pharmacyPlaces[0],
  {
    id: 'gs1',
    name: 'Shell Gas Station',
    address: '100 Van Ness Ave, San Francisco, CA',
    category: 'gas-station',
    chain: 'Shell',
    location: { lat: 37.7747, lng: -122.4198 },
    distanceMiles: 0.1,
  },
  {
    id: 'f1',
    name: 'Planet Fitness',
    address: '1200 Van Ness Ave, San Francisco, CA',
    category: 'gym',
    chain: 'Planet Fitness',
    location: { lat: 37.7878, lng: -122.4214 },
    distanceMiles: 0.5,
  },
  {
    id: 'sh1',
    name: 'Target',
    address: '789 Mission St, San Francisco, CA',
    category: 'shopping-retail',
    chain: 'Target',
    location: { lat: 37.7848, lng: -122.4014 },
    distanceMiles: 0.6,
  },
  restaurantPlaces[2],
];

/** 20 diverse places for scroll / overflow testing */
export const largePlaceSet: MockNearbyPlace[] = Array.from({ length: 20 }, (_, i) => ({
  id: `lp-${i}`,
  name: `Place ${i + 1} - ${['Grocery', 'Restaurant', 'Pharmacy', 'Gym', 'Gas'][i % 5]}`,
  address: `${100 + i} Market St, San Francisco, CA`,
  category: ['food-grocery', 'restaurant', 'pharmacy', 'gym', 'gas-station'][i % 5],
  location: {
    lat: 37.7749 + (i * 0.002),
    lng: -122.4194 + (i * 0.001),
  },
  distanceMiles: 0.1 + (i * 0.15),
}));

export const singlePlace: MockNearbyPlace[] = [groceryPlaces[0]];

export const emptyPlacesResponse: MockNearbyResponse = {
  places: [],
  meta: { cached: false, count: 0 },
};

/** Places far outside all radius options (> 5 mi) */
export const farAwayPlaces: MockNearbyPlace[] = [
  {
    id: 'far1',
    name: 'Distant Grocery',
    address: '1 Far Away Rd, Oakland, CA',
    category: 'food-grocery',
    location: { lat: 37.8044, lng: -122.2712 },
    distanceMiles: 8.5,
  },
];

// --------------------------------------------------------------------------
// Response builders
// --------------------------------------------------------------------------

export function buildNearbyResponse(places: MockNearbyPlace[]): MockNearbyResponse {
  return {
    places,
    meta: { cached: false, count: places.length },
  };
}

// --------------------------------------------------------------------------
// Error response fixtures (from src/app/api/nearby/route.ts)
// --------------------------------------------------------------------------

export const errorResponses = {
  unauthorized: {
    status: 401,
    body: { error: 'Unauthorized' },
  },
  radarTimeout: {
    status: 504,
    body: { error: 'Nearby search timed out', details: 'The request took too long, please try again' },
  },
  circuitBreaker: {
    status: 503,
    body: { error: 'Nearby search temporarily unavailable', details: 'Service is recovering, please try again later' },
  },
  rateLimit: {
    status: 429,
    body: { error: 'Radar API rate limit exceeded', details: 'Too many requests, please try again later' },
  },
  invalidParams: {
    status: 400,
    body: { error: 'Invalid search parameters', details: 'The search parameters were rejected by the service' },
  },
  serverError: {
    status: 500,
    body: { error: 'Failed to fetch nearby places' },
  },
} as const;

// --------------------------------------------------------------------------
// API mock helpers
// --------------------------------------------------------------------------

/**
 * Mock the /api/nearby endpoint with a given response.
 * Must be called BEFORE navigating to the page.
 */
export async function mockNearbyApi(
  page: Page,
  response: { status?: number; body: unknown },
): Promise<void> {
  await page.route('**/api/nearby', async (route: Route) => {
    await route.fulfill({
      status: response.status ?? 200,
      contentType: 'application/json',
      body: JSON.stringify(response.body ?? response),
    });
  });
}

/**
 * Mock the /api/nearby endpoint with artificial delay.
 */
export async function mockNearbyApiWithDelay(
  page: Page,
  response: { status?: number; body: unknown },
  delayMs: number,
): Promise<void> {
  await page.route('**/api/nearby', async (route: Route) => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    await route.fulfill({
      status: response.status ?? 200,
      contentType: 'application/json',
      body: JSON.stringify(response.body ?? response),
    });
  });
}

/**
 * Mock the /api/nearby endpoint to return different responses on each call.
 * Useful for testing sequential interactions (e.g., first search then category click).
 */
export async function mockNearbyApiSequence(
  page: Page,
  responses: Array<{ status?: number; body: unknown }>,
): Promise<void> {
  let callIndex = 0;
  await page.route('**/api/nearby', async (route: Route) => {
    const response = responses[Math.min(callIndex, responses.length - 1)];
    callIndex++;
    await route.fulfill({
      status: response.status ?? 200,
      contentType: 'application/json',
      body: JSON.stringify(response.body ?? response),
    });
  });
}
