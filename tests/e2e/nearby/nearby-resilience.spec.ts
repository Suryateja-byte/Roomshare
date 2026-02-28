/**
 * Layer 2: Resilience Tests — Nearby Places
 *
 * Verifies error handling, network failures, race conditions, and recovery.
 * All error responses match actual src/app/api/nearby/route.ts behavior.
 */

import { test, expect } from '../helpers/test-utils';
import { NearbyPlacesPage } from './nearby-page.pom';
import {
  mockNearbyApi,
  mockNearbyApiWithDelay,
  mockNearbyApiSequence,
  buildNearbyResponse,
  groceryPlaces,
  restaurantPlaces,
  errorResponses,
} from './nearby-mock-factory';

test.describe('Nearby Places — Resilience @nearby', () => {
  let nearby: NearbyPlacesPage;

  test.beforeEach(async ({ page }) => {
    nearby = new NearbyPlacesPage(page);
  });

  // --------------------------------------------------------------------------
  // API error responses
  // --------------------------------------------------------------------------

  test('R-001: API returns 500 — error message shown', async ({ page }) => {
    await mockNearbyApi(page, errorResponses.serverError);
    await nearby.goto();
    await nearby.scrollToSection();

    await nearby.selectCategory('Grocery');
    await nearby.waitForResults();

    await expect(nearby.errorState).toBeVisible();
    await expect(nearby.errorState).toContainText('Failed to fetch nearby places');
  });

  test('R-002: API returns 401 — error shown', async ({ page }) => {
    await mockNearbyApi(page, errorResponses.unauthorized);
    await nearby.goto();
    await nearby.scrollToSection();

    await nearby.selectCategory('Grocery');
    await nearby.waitForResults();

    await expect(nearby.errorState).toBeVisible();
    await expect(nearby.errorState).toContainText('Unauthorized');
  });

  test('R-003: API returns 429 — rate limit message', async ({ page }) => {
    await mockNearbyApi(page, errorResponses.rateLimit);
    await nearby.goto();
    await nearby.scrollToSection();

    await nearby.selectCategory('Grocery');
    await nearby.waitForResults();

    await expect(nearby.errorState).toBeVisible();
    await expect(nearby.errorState).toContainText('rate limit');
  });

  test('R-004: API returns 504 — timeout message', async ({ page }) => {
    await mockNearbyApi(page, errorResponses.radarTimeout);
    await nearby.goto();
    await nearby.scrollToSection();

    await nearby.selectCategory('Grocery');
    await nearby.waitForResults();

    await expect(nearby.errorState).toBeVisible();
    await expect(nearby.errorState).toContainText('timed out');
  });

  test('R-005: API returns 503 — circuit breaker message', async ({ page }) => {
    await mockNearbyApi(page, errorResponses.circuitBreaker);
    await nearby.goto();
    await nearby.scrollToSection();

    await nearby.selectCategory('Grocery');
    await nearby.waitForResults();

    await expect(nearby.errorState).toBeVisible();
    await expect(nearby.errorState).toContainText('temporarily unavailable');
  });

  // --------------------------------------------------------------------------
  // Network failures
  // --------------------------------------------------------------------------

  test('R-006: Network offline during search — error then recovery', async ({ page }) => {
    // Start with a working response mock for recovery
    let shouldFail = true;
    await page.route('**/api/nearby', async (route) => {
      if (shouldFail) {
        await route.abort('failed');
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(buildNearbyResponse(groceryPlaces)),
        });
      }
    });

    await nearby.goto();
    await nearby.scrollToSection();

    // Search while "offline" (request aborted)
    await nearby.selectCategory('Grocery');
    await page.waitForTimeout(1000);

    // Error should appear (fetch failed → catch block)
    await expect(nearby.errorState).toBeVisible();

    // "Recover" — next request succeeds
    shouldFail = false;
    await nearby.selectCategory('Restaurants');
    await nearby.waitForResults();

    // Error should clear, results visible
    await expect(nearby.errorState).toBeHidden();
  });

  // --------------------------------------------------------------------------
  // Loading state
  // --------------------------------------------------------------------------

  test('R-007: Slow API response shows loading skeleton', async ({ page }) => {
    await mockNearbyApiWithDelay(
      page,
      { body: buildNearbyResponse(groceryPlaces) },
      2000,
    );
    await nearby.goto();
    await nearby.scrollToSection();

    await nearby.selectCategory('Grocery');

    // Loading skeleton should appear immediately
    await expect(nearby.loadingSkeleton).toBeVisible({ timeout: 2000 });
    // Then disappear once response arrives
    await expect(nearby.loadingSkeleton).toBeHidden({ timeout: 10_000 });
  });

  // --------------------------------------------------------------------------
  // Race conditions
  // --------------------------------------------------------------------------

  test('R-008: Rapid category switching — only last response rendered', async ({ page }) => {
    // First response is slow, second is fast
    let callCount = 0;
    await page.route('**/api/nearby', async (route) => {
      callCount++;
      const isFirst = callCount === 1;
      if (isFirst) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      const places = isFirst ? groceryPlaces : restaurantPlaces;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildNearbyResponse(places)),
      });
    });

    await nearby.goto();
    await nearby.scrollToSection();

    // Click Grocery, then immediately click Restaurants
    await nearby.selectCategory('Grocery');
    await page.waitForTimeout(100);
    await nearby.selectCategory('Restaurants');
    await nearby.waitForResults();

    // Only restaurant results should show (first request aborted)
    await expect(nearby.placeByName('Chipotle Mexican Grill')).toBeVisible();
    // Grocery should NOT appear
    await expect(nearby.placeByName('Whole Foods Market')).toBeHidden();
  });

  test('R-009: Double-click search button — no duplicate results', async ({ page }) => {
    let callCount = 0;
    await page.route('**/api/nearby', async (route) => {
      callCount++;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildNearbyResponse(restaurantPlaces)),
      });
    });

    await nearby.goto();
    await nearby.scrollToSection();

    // Type query to make search button appear
    await nearby.searchInput.fill('Chipotle');

    // Double-click the search button rapidly
    await nearby.searchButton.dblclick();
    await nearby.waitForResults();

    // Due to abort controller, at most 2 calls, but second aborts the first
    // Results should be consistent (no duplicates)
    const count = await nearby.getPlaceCount();
    expect(count).toBe(restaurantPlaces.length);
  });

  // --------------------------------------------------------------------------
  // Recovery
  // --------------------------------------------------------------------------

  test('R-010: Category click after error — recovers', async ({ page }) => {
    await mockNearbyApiSequence(page, [
      errorResponses.serverError,
      { body: buildNearbyResponse(groceryPlaces) },
    ]);

    await nearby.goto();
    await nearby.scrollToSection();

    // First search → error
    await nearby.selectCategory('Grocery');
    await nearby.waitForResults();
    await expect(nearby.errorState).toBeVisible();

    // Second search → success
    await nearby.selectCategory('Restaurants');
    await nearby.waitForResults();
    await expect(nearby.errorState).toBeHidden();
    const count = await nearby.getPlaceCount();
    expect(count).toBeGreaterThan(0);
  });

  test('R-011: API returns malformed JSON — graceful error', async ({ page }) => {
    await page.route('**/api/nearby', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: 'not valid json {{{',
      });
    });

    await nearby.goto();
    await nearby.scrollToSection();

    await nearby.selectCategory('Grocery');
    await page.waitForTimeout(1000);

    // Should show error, not crash
    await expect(nearby.errorState).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // Large result set
  // --------------------------------------------------------------------------

  test('R-014: Very large result set renders without crash', async ({ page }) => {
    // Generate 50 places
    const bigSet = Array.from({ length: 50 }, (_, i) => ({
      id: `big-${i}`,
      name: `Place ${i + 1}`,
      address: `${100 + i} Market St, SF`,
      category: 'restaurant',
      location: { lat: 37.77 + i * 0.001, lng: -122.41 + i * 0.001 },
      distanceMiles: 0.1 + i * 0.05,
    }));

    await mockNearbyApi(page, { body: buildNearbyResponse(bigSet) });
    await nearby.goto();
    await nearby.scrollToSection();

    await nearby.selectCategory('Restaurants');
    await nearby.waitForResults();

    const count = await nearby.getPlaceCount();
    expect(count).toBe(50);

    // Verify scrollable
    const resultsAreaBox = await nearby.resultsArea.boundingBox();
    expect(resultsAreaBox).not.toBeNull();
  });
});
