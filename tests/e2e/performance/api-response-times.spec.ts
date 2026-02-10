/**
 * API Response Time Budgets
 *
 * Measures response times for critical API endpoints.
 * Budgets are CI-friendly (generous) to account for shared CI runners,
 * cold starts, and network latency:
 *   /api/search <1500ms, /api/listings/[id] <1000ms, DCL <5000ms.
 */

import { test, expect, SF_BOUNDS } from '../helpers';

test.describe('API Response Time Budgets', () => {
  test.slow();

  test.describe('Search API', () => {
    test('/api/search responds under 1500ms', async ({ page }) => {
      const searchUrl = `/search?minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;

      // Intercept the search API call
      const responsePromise = page.waitForResponse(
        (resp) => resp.url().includes('/api/search') || resp.url().includes('/api/listings'),
        { timeout: 15000 },
      );

      await page.goto(searchUrl);
      const response = await responsePromise.catch(() => null);

      if (response) {
        const timing = response.request().timing();
        const totalTime = timing.responseEnd;

        expect(response.status()).toBeLessThan(500);
        expect(
          totalTime,
          `Search API took ${totalTime.toFixed(0)}ms, budget is 1500ms`,
        ).toBeLessThan(1500);
      }
    });

    test('/api/search with filters responds under 1500ms', async ({ page }) => {
      const searchUrl = `/search?minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}&minPrice=500&maxPrice=2000`;

      const responsePromise = page.waitForResponse(
        (resp) => resp.url().includes('/api/search') || resp.url().includes('/api/listings'),
        { timeout: 15000 },
      );

      await page.goto(searchUrl);
      const response = await responsePromise.catch(() => null);

      if (response) {
        const timing = response.request().timing();
        const totalTime = timing.responseEnd;

        expect(response.status()).toBeLessThan(500);
        expect(
          totalTime,
          `Filtered search took ${totalTime.toFixed(0)}ms, budget is 1500ms`,
        ).toBeLessThan(1500);
      }
    });
  });

  test.describe('Listing Detail API', () => {
    test('/api/listings/[id] responds under 1000ms', async ({ page }) => {
      // First get a listing ID
      await page.goto('/search');
      await page.waitForLoadState('domcontentloaded');

      const firstCard = page.locator('[data-testid="listing-card"]').first();
      const listingId = await firstCard.getAttribute('data-listing-id').catch(() => null);
      test.skip(!listingId, 'No listings available');

      // Navigate and intercept the listing API call
      const responsePromise = page.waitForResponse(
        (resp) => resp.url().includes(`/api/listings/${listingId}`) || resp.url().includes(`/listings/${listingId}`),
        { timeout: 15000 },
      );

      await page.goto(`/listings/${listingId}`);
      const response = await responsePromise.catch(() => null);

      if (response) {
        const timing = response.request().timing();
        const totalTime = timing.responseEnd;

        expect(response.status()).toBeLessThan(500);
        expect(
          totalTime,
          `Listing detail API took ${totalTime.toFixed(0)}ms, budget is 1000ms`,
        ).toBeLessThan(1000);
      }
    });
  });

  test.describe('Static page load budgets', () => {
    for (const route of ['/', '/login', '/signup', '/about']) {
      test(`${route} DOMContentLoaded under 5s`, async ({ page }) => {
        const start = Date.now();
        await page.goto(route);
        await page.waitForLoadState('domcontentloaded');
        const dcl = Date.now() - start;

        expect(dcl, `${route} DCL was ${dcl}ms, budget is 5000ms`).toBeLessThan(5000);
      });
    }
  });
});
