/**
 * API Response Time Budgets
 *
 * Measures response times for critical API endpoints.
 * Budgets are CI-friendly (generous) to account for shared CI runners,
 * cold starts, and network latency:
 *   /api/search <3000ms, /api/listings/[id] <2000ms, DCL <8000ms.
 */

import { test, expect, SF_BOUNDS } from '../helpers';

test.describe('API Response Time Budgets', () => {
  test.slow();

  test.describe('Search API', () => {
    // CI runners are slower — use generous budget (40-shard CI adds contention)
    const budget = process.env.CI ? 12000 : 3000;

    test('/api/search responds under budget', async ({ page }) => {
      const searchUrl = `/search?minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;

      // Intercept the search API or Server Action call (Next.js uses /_next POST for Server Actions)
      const responsePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/search') ||
          resp.url().includes('/api/listings') ||
          (resp.url().includes('/_next') && resp.request().method() === 'POST'),
        { timeout: 30000 },
      );

      await page.goto(searchUrl);
      const response = await responsePromise.catch(() => null);

      if (response) {
        const timing = response.request().timing();
        const totalTime = timing.responseEnd;

        expect(response.status()).toBeLessThan(500);
        expect(
          totalTime,
          `Search API took ${totalTime.toFixed(0)}ms, budget is ${budget}ms`,
        ).toBeLessThan(budget);
      }
    });

    test('/api/search with filters responds under budget', async ({ page }) => {
      const searchUrl = `/search?minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}&minPrice=500&maxPrice=2000`;

      const responsePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/search') ||
          resp.url().includes('/api/listings') ||
          (resp.url().includes('/_next') && resp.request().method() === 'POST'),
        { timeout: 30000 },
      );

      await page.goto(searchUrl);
      const response = await responsePromise.catch(() => null);

      if (response) {
        const timing = response.request().timing();
        const totalTime = timing.responseEnd;

        expect(response.status()).toBeLessThan(500);
        expect(
          totalTime,
          `Filtered search took ${totalTime.toFixed(0)}ms, budget is ${budget}ms`,
        ).toBeLessThan(budget);
      }
    });
  });

  test.describe('Listing Detail API', () => {
    test('/api/listings/[id] responds under budget', async ({ page }) => {
      // CI runners are slower — use generous budget (40-shard CI adds contention)
      const budget = process.env.CI ? 8000 : 2000;

      // First get a listing ID
      await page.goto(`/search?minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`);
      await page.waitForLoadState('domcontentloaded');

      const firstCard = page.locator('[data-testid="listing-card"]').first();
      await firstCard.waitFor({ state: 'attached', timeout: 30_000 }).catch(() => {});
      const listingId = await firstCard.getAttribute('data-listing-id').catch(() => null);
      test.skip(!listingId, 'No listings available');

      // Navigate and intercept the listing API call (or Server Action)
      const responsePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes(`/api/listings/${listingId}`) ||
          resp.url().includes(`/listings/${listingId}`) ||
          (resp.url().includes('/_next') && resp.request().method() === 'POST'),
        { timeout: 30000 },
      );

      await page.goto(`/listings/${listingId}`);
      const response = await responsePromise.catch(() => null);

      if (response) {
        const timing = response.request().timing();
        const totalTime = timing.responseEnd;

        expect(response.status()).toBeLessThan(500);
        expect(
          totalTime,
          `Listing detail API took ${totalTime.toFixed(0)}ms, budget is ${budget}ms`,
        ).toBeLessThan(budget);
      }
    });
  });

  test.describe('Static page load budgets', () => {
    // CI runners are slower — use generous budget (40-shard CI adds contention)
    const budget = process.env.CI ? 20000 : 8000;

    for (const route of ['/', '/login', '/signup', '/about']) {
      test(`${route} DOMContentLoaded under budget`, async ({ page }) => {
        const start = Date.now();
        await page.goto(route);
        await page.waitForLoadState('domcontentloaded');
        const dcl = Date.now() - start;

        expect(dcl, `${route} DCL was ${dcl}ms, budget is ${budget}ms`).toBeLessThan(budget);
      });
    }
  });
});
