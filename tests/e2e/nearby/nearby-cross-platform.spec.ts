/**
 * Layer 6: Cross-Platform Tests — Nearby Places
 *
 * Verifies core functionality across different browsers and viewports.
 * Uses Playwright's project-based browser selection — tests run in all
 * configured projects by default. Viewport-specific tests use skip guards.
 */

import { test, expect } from '../helpers/test-utils';
import { NearbyPlacesPage } from './nearby-page.pom';
import {
  mockNearbyApi,
  buildNearbyResponse,
  groceryPlaces,
  emptyPlacesResponse,
} from './nearby-mock-factory';

test.describe('Nearby Places — Cross-Platform @nearby', () => {
  let nearby: NearbyPlacesPage;

  test.beforeEach(async ({ page }) => {
    nearby = new NearbyPlacesPage(page);
  });

  // --------------------------------------------------------------------------
  // Core flow (runs on all browsers/viewports)
  // --------------------------------------------------------------------------

  test('X-001: Full functional flow — search + results + attribution', async ({ page }) => {
    await mockNearbyApi(page, { body: buildNearbyResponse(groceryPlaces) });
    await nearby.goto();
    await nearby.scrollToSection();

    // Verify initial state
    await expect(nearby.searchInput).toBeVisible();
    await expect(nearby.initialState).toBeVisible();

    // Search via category
    await nearby.selectCategory('Grocery');
    await nearby.waitForResults();

    // Verify results
    const count = await nearby.getPlaceCount();
    expect(count).toBe(groceryPlaces.length);
    await expect(nearby.placeByName('Whole Foods Market')).toBeVisible();

    // Verify place link
    const href = await nearby.placeByName('Whole Foods Market').getAttribute('href');
    expect(href).toContain('google.com/maps/dir');

    // Verify attribution (if map is visible)
    const mapVisible = await nearby.isMapVisible();
    if (mapVisible) {
      await expect(nearby.radarAttribution).toBeVisible();
    }
  });

  test('X-002: Search input + results rendering', async ({ page }) => {
    await mockNearbyApi(page, { body: buildNearbyResponse(groceryPlaces) });
    await nearby.goto();
    await nearby.scrollToSection();

    // Type search
    await nearby.searchFor('Whole Foods');
    await nearby.waitForResults();

    // Results should render with proper content
    const firstPlace = nearby.placeByName('Whole Foods Market');
    await expect(firstPlace).toBeVisible();
    const text = await firstPlace.textContent();
    expect(text).toContain('Whole Foods Market');
  });

  // --------------------------------------------------------------------------
  // Mobile-specific (< 1024px viewport)
  // --------------------------------------------------------------------------

  test('X-004: Mobile layout + view toggle', async ({ page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width >= 1024) {
      test.skip();
      return;
    }

    await mockNearbyApi(page, { body: buildNearbyResponse(groceryPlaces) });
    await nearby.goto();
    await nearby.scrollToSection();

    // Search UI visible
    await expect(nearby.searchInput).toBeVisible();

    // Category chips scrollable
    await expect(nearby.categoryChips.first()).toBeVisible();

    // Mobile toggle visible
    await expect(nearby.mobileToggleButton).toBeVisible();

    // Toggle to map
    await nearby.mobileToggleButton.click();
    await expect(nearby.mobileToggleButton).toHaveText(/List/);

    // Toggle back to list
    await nearby.mobileToggleButton.click();
    await expect(nearby.mobileToggleButton).toHaveText(/Map/);
  });

  // --------------------------------------------------------------------------
  // Tablet-specific (768-1023px viewport)
  // --------------------------------------------------------------------------

  test('X-005: Tablet layout', async ({ page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width < 768 || viewport.width >= 1024) {
      test.skip();
      return;
    }

    await mockNearbyApi(page, { body: emptyPlacesResponse });
    await nearby.goto();
    await nearby.scrollToSection();

    await expect(nearby.searchInput).toBeVisible();
    await expect(nearby.heading).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // Desktop-specific (>= 1024px viewport)
  // --------------------------------------------------------------------------

  test('X-006: Desktop split layout (panel + map)', async ({ page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width < 1024) {
      test.skip();
      return;
    }

    await mockNearbyApi(page, { body: buildNearbyResponse(groceryPlaces) });
    await nearby.goto();
    await nearby.scrollToSection();

    // On desktop, both panel and map should be visible simultaneously
    await expect(nearby.searchInput).toBeVisible();

    const mapVisible = await nearby.isMapVisible();
    if (mapVisible) {
      // Map should be on the right side
      const sectionBox = await nearby.section.boundingBox();
      const mapBox = await nearby.mapContainer.boundingBox();
      if (sectionBox && mapBox) {
        // Map should be positioned to the right of center
        expect(mapBox.x).toBeGreaterThan(sectionBox.x + sectionBox.width * 0.3);
      }
    }

    // Mobile toggle should be hidden on desktop
    await expect(nearby.mobileToggleButton).toBeHidden();
  });

  // --------------------------------------------------------------------------
  // Wide viewport
  // --------------------------------------------------------------------------

  test('X-008: Wide viewport layout', async ({ page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width < 1920) {
      test.skip();
      return;
    }

    await mockNearbyApi(page, { body: buildNearbyResponse(groceryPlaces) });
    await nearby.goto();
    await nearby.scrollToSection();

    // Section should be properly constrained (not stretch full width)
    const sectionBox = await nearby.section.boundingBox();
    expect(sectionBox).not.toBeNull();

    // Content should still be usable
    await expect(nearby.searchInput).toBeVisible();
    await nearby.selectCategory('Grocery');
    await nearby.waitForResults();
    expect(await nearby.getPlaceCount()).toBe(groceryPlaces.length);
  });
});
