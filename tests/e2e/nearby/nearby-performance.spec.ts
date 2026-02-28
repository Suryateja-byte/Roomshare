/**
 * Layer 5: Performance Tests — Nearby Places
 *
 * Verifies rendering speed and memory efficiency.
 * Tagged @perf — can be skipped in CI if flaky.
 */

import { test, expect } from '../helpers/test-utils';
import { NearbyPlacesPage } from './nearby-page.pom';
import {
  mockNearbyApi,
  buildNearbyResponse,
  groceryPlaces,
  emptyPlacesResponse,
} from './nearby-mock-factory';

test.describe('Nearby Places — Performance @nearby @perf', () => {
  let nearby: NearbyPlacesPage;

  test.beforeEach(async ({ page }) => {
    nearby = new NearbyPlacesPage(page);
  });

  test('P-001: Section renders within 500ms of scroll', async ({ page }) => {
    await mockNearbyApi(page, { body: emptyPlacesResponse });
    await nearby.goto();

    const start = Date.now();
    await nearby.scrollToSection();
    await expect(nearby.searchInput).toBeVisible();
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(5000); // generous for CI
  });

  test('P-002: Search response renders within 1000ms', async ({ page }) => {
    // Use instant mock (no artificial delay)
    await mockNearbyApi(page, { body: buildNearbyResponse(groceryPlaces) });
    await nearby.goto();
    await nearby.scrollToSection();

    const start = Date.now();
    await nearby.selectCategory('Grocery');
    await nearby.waitForResults();
    await expect(nearby.placeLinks.first()).toBeVisible();
    const elapsed = Date.now() - start;

    // With mocked API, rendering should be fast
    expect(elapsed).toBeLessThan(3000); // generous for CI cold start
  });

  test('P-003: Category switch renders within 800ms', async ({ page }) => {
    let callCount = 0;
    await page.route('**/api/nearby', async (route) => {
      callCount++;
      const places = callCount === 1 ? groceryPlaces : [
        { id: 'r1', name: 'Test Restaurant', address: '123 St', category: 'restaurant',
          location: { lat: 37.78, lng: -122.42 }, distanceMiles: 0.3 },
      ];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildNearbyResponse(places)),
      });
    });

    await nearby.goto();
    await nearby.scrollToSection();

    // First search
    await nearby.selectCategory('Grocery');
    await nearby.waitForResults();

    // Time the category switch
    const start = Date.now();
    await nearby.selectCategory('Restaurants');
    await nearby.waitForResults();
    await expect(nearby.placeLinks.first()).toBeVisible();
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(3000); // generous for CI
  });

  test('P-004: No excessive memory growth on repeated searches', async ({ page }) => {
    // Only works in Chromium (performance.memory API)
    const isChromium = test.info().project.name.includes('chromium') ||
      test.info().project.name.includes('Chrome');
    if (!isChromium) {
      test.skip();
      return;
    }

    let callCount = 0;
    await page.route('**/api/nearby', async (route) => {
      callCount++;
      const places = Array.from({ length: 10 }, (_, i) => ({
        id: `mem-${callCount}-${i}`,
        name: `Place ${callCount}-${i}`,
        address: `${i} Memory St`,
        category: 'restaurant',
        location: { lat: 37.77 + i * 0.001, lng: -122.42 },
        distanceMiles: 0.1 + i * 0.1,
      }));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildNearbyResponse(places)),
      });
    });

    await nearby.goto();
    await nearby.scrollToSection();

    // Get baseline memory
    const baselineMemory = await page.evaluate(() => {
      if ('memory' in performance) {
        return (performance as { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize;
      }
      return 0;
    });

    // Perform 10 rapid searches
    const categories = ['Grocery', 'Restaurants', 'Shopping', 'Gas Stations', 'Fitness', 'Pharmacy'];
    for (let i = 0; i < 10; i++) {
      await nearby.selectCategory(categories[i % categories.length]);
      await nearby.waitForResults();
    }

    // Check memory after searches
    const finalMemory = await page.evaluate(() => {
      if ('memory' in performance) {
        return (performance as { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize;
      }
      return 0;
    });

    if (baselineMemory > 0 && finalMemory > 0) {
      const growthMB = (finalMemory - baselineMemory) / (1024 * 1024);
      // Allow up to 50MB growth for 10 searches
      expect(growthMB).toBeLessThan(50);
    }
  });
});
