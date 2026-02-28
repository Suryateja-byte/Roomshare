/**
 * Layer 4: Visual Regression Tests — Nearby Places
 *
 * Screenshot-based visual regression testing. Map canvas is masked (non-deterministic tiles).
 * Focus: panel layout, controls, results rendering, theme consistency.
 */

import { test, expect } from '../helpers/test-utils';
import { NearbyPlacesPage } from './nearby-page.pom';
import {
  mockNearbyApi,
  buildNearbyResponse,
  groceryPlaces,
  errorResponses,
  emptyPlacesResponse,
} from './nearby-mock-factory';

test.describe('Nearby Places — Visual Regression @nearby @visual', () => {
  let nearby: NearbyPlacesPage;

  test.beforeEach(async ({ page }) => {
    nearby = new NearbyPlacesPage(page);
  });

  test('V-001: Initial state (authenticated) — desktop', async ({ page }) => {
    await mockNearbyApi(page, { body: emptyPlacesResponse });
    await nearby.goto();
    await nearby.scrollToSection();

    await expect(nearby.searchInput).toBeVisible();

    await expect(nearby.section).toHaveScreenshot('nearby-initial-desktop.png', {
      mask: [nearby.mapCanvas, nearby.mapContainer],
      maxDiffPixelRatio: 0.01,
    });
  });

  test('V-002: With search results — desktop', async ({ page }) => {
    await mockNearbyApi(page, { body: buildNearbyResponse(groceryPlaces) });
    await nearby.goto();
    await nearby.scrollToSection();

    await nearby.selectCategory('Grocery');
    await nearby.waitForResults();

    await expect(nearby.section).toHaveScreenshot('nearby-results-desktop.png', {
      mask: [nearby.mapCanvas, nearby.mapContainer],
      maxDiffPixelRatio: 0.01,
    });
  });

  test('V-003: Error state — desktop', async ({ page }) => {
    await mockNearbyApi(page, errorResponses.serverError);
    await nearby.goto();
    await nearby.scrollToSection();

    await nearby.selectCategory('Grocery');
    await nearby.waitForResults();

    await expect(nearby.section).toHaveScreenshot('nearby-error-desktop.png', {
      mask: [nearby.mapCanvas, nearby.mapContainer],
      maxDiffPixelRatio: 0.01,
    });
  });

  test('V-004: Dark mode initial state', async ({ page }) => {
    await mockNearbyApi(page, { body: emptyPlacesResponse });

    // Enable dark mode via class (Next.js themes use class strategy)
    await page.addInitScript(() => {
      document.documentElement.classList.add('dark');
    });

    await nearby.goto();
    await nearby.scrollToSection();

    await expect(nearby.section).toHaveScreenshot('nearby-initial-dark.png', {
      mask: [nearby.mapCanvas, nearby.mapContainer],
      maxDiffPixelRatio: 0.01,
    });
  });

  test('V-005: Mobile list view', async ({ page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width >= 1024) {
      test.skip();
      return;
    }

    await mockNearbyApi(page, { body: buildNearbyResponse(groceryPlaces) });
    await nearby.goto();
    await nearby.scrollToSection();

    await nearby.selectCategory('Grocery');
    await nearby.waitForResults();

    await expect(nearby.section).toHaveScreenshot('nearby-mobile-list.png', {
      mask: [nearby.mapCanvas, nearby.mapContainer],
      maxDiffPixelRatio: 0.02,
    });
  });

  test('V-006: Mobile map view', async ({ page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width >= 1024) {
      test.skip();
      return;
    }

    await mockNearbyApi(page, { body: emptyPlacesResponse });
    await nearby.goto();
    await nearby.scrollToSection();

    // Switch to map view
    if (await nearby.mobileToggleButton.isVisible()) {
      await nearby.mobileToggleButton.click();
    }

    await expect(nearby.section).toHaveScreenshot('nearby-mobile-map.png', {
      mask: [nearby.mapCanvas],
      maxDiffPixelRatio: 0.02,
    });
  });
});
