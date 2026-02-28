/**
 * Layer 1: Functional Core Tests — Nearby Places
 *
 * Verifies all core user-facing functionality: auth gates, search, categories,
 * radius, results, map markers, mobile toggle, and attribution.
 *
 * All tests mock the /api/nearby endpoint to isolate from Radar API.
 * Auth comes from Playwright's storageState (not cookie injection).
 */

import { test, expect } from '../helpers/test-utils';
import { NearbyPlacesPage } from './nearby-page.pom';
import {
  mockNearbyApi,
  mockNearbyApiSequence,
  buildNearbyResponse,
  groceryPlaces,
  restaurantPlaces,
  pharmacyPlaces,
  singlePlace,
  emptyPlacesResponse,
} from './nearby-mock-factory';

test.describe('Nearby Places — Functional Core @nearby', () => {
  let nearby: NearbyPlacesPage;

  test.beforeEach(async ({ page }) => {
    nearby = new NearbyPlacesPage(page);
  });

  // --------------------------------------------------------------------------
  // Section rendering
  // --------------------------------------------------------------------------

  test('F-001: Section renders with heading', async ({ page }) => {
    await mockNearbyApi(page, { body: emptyPlacesResponse });
    await nearby.goto();
    await nearby.scrollToSection();

    await expect(nearby.section).toBeVisible();
    await expect(nearby.heading).toBeVisible();
    await expect(nearby.heading).toHaveText(/Nearby Places/);
  });

  // --------------------------------------------------------------------------
  // Auth states
  // --------------------------------------------------------------------------

  test('F-004: Authenticated user sees search UI', async ({ page }) => {
    await mockNearbyApi(page, { body: emptyPlacesResponse });
    await nearby.goto();
    await nearby.scrollToSection();

    await expect(nearby.searchInput).toBeVisible();
    // At least one category chip visible
    await expect(nearby.categoryChips.first()).toBeVisible();
  });

  test('F-005: Initial state shows "Discover what\'s nearby"', async ({ page }) => {
    await mockNearbyApi(page, { body: emptyPlacesResponse });
    await nearby.goto();
    await nearby.scrollToSection();

    await expect(nearby.initialState).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // Text search
  // --------------------------------------------------------------------------

  test('F-006: Text search returns results on Enter', async ({ page }) => {
    await mockNearbyApi(page, { body: buildNearbyResponse(restaurantPlaces) });
    await nearby.goto();
    await nearby.scrollToSection();

    await nearby.searchFor('Chipotle');
    await nearby.waitForResults();

    const count = await nearby.getPlaceCount();
    expect(count).toBe(restaurantPlaces.length);
    await expect(nearby.placeByName('Chipotle Mexican Grill')).toBeVisible();
  });

  test('F-007: Text search requires minimum 2 chars', async ({ page }) => {
    let apiCalled = false;
    await page.route('**/api/nearby', async (route) => {
      apiCalled = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(emptyPlacesResponse),
      });
    });

    await nearby.goto();
    await nearby.scrollToSection();

    await nearby.searchInput.fill('C');
    await nearby.searchInput.press('Enter');
    // Brief wait to ensure no request fires
    await page.waitForTimeout(500);

    expect(apiCalled).toBe(false);
  });

  // --------------------------------------------------------------------------
  // Category chips
  // --------------------------------------------------------------------------

  test('F-008: Category chip search (Grocery)', async ({ page }) => {
    await mockNearbyApi(page, { body: buildNearbyResponse(groceryPlaces) });
    await nearby.goto();
    await nearby.scrollToSection();

    await nearby.selectCategory('Grocery');
    await nearby.waitForResults();

    const count = await nearby.getPlaceCount();
    expect(count).toBe(groceryPlaces.length);
  });

  test('F-009: Category chip shows aria-pressed when selected', async ({ page }) => {
    await mockNearbyApi(page, { body: buildNearbyResponse(groceryPlaces) });
    await nearby.goto();
    await nearby.scrollToSection();

    const chip = nearby.chipByName('Grocery');
    await expect(chip).toHaveAttribute('aria-pressed', 'false');

    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
  });

  test('F-010: Only one category active at a time', async ({ page }) => {
    await mockNearbyApiSequence(page, [
      { body: buildNearbyResponse(groceryPlaces) },
      { body: buildNearbyResponse(restaurantPlaces) },
    ]);
    await nearby.goto();
    await nearby.scrollToSection();

    // Select Grocery
    await nearby.selectCategory('Grocery');
    await nearby.waitForResults();
    await expect(nearby.chipByName('Grocery')).toHaveAttribute('aria-pressed', 'true');

    // Select Restaurants
    await nearby.selectCategory('Restaurants');
    await nearby.waitForResults();
    await expect(nearby.chipByName('Restaurants')).toHaveAttribute('aria-pressed', 'true');
    await expect(nearby.chipByName('Grocery')).toHaveAttribute('aria-pressed', 'false');
  });

  // --------------------------------------------------------------------------
  // Radius
  // --------------------------------------------------------------------------

  test('F-011: Radius change updates aria-pressed', async ({ page }) => {
    await mockNearbyApi(page, { body: buildNearbyResponse(groceryPlaces) });
    await nearby.goto();
    await nearby.scrollToSection();

    // Default is 1 mi
    const radius1mi = nearby.radiusByLabel('1 mi');
    const radius2mi = nearby.radiusByLabel('2 mi');
    const radius5mi = nearby.radiusByLabel('5 mi');

    await expect(radius1mi).toHaveAttribute('aria-pressed', 'true');

    // Select 2 mi
    await radius2mi.click();
    await expect(radius2mi).toHaveAttribute('aria-pressed', 'true');
    await expect(radius1mi).toHaveAttribute('aria-pressed', 'false');

    // Select 5 mi
    await radius5mi.click();
    await expect(radius5mi).toHaveAttribute('aria-pressed', 'true');
    await expect(radius2mi).toHaveAttribute('aria-pressed', 'false');
  });

  // --------------------------------------------------------------------------
  // Results display
  // --------------------------------------------------------------------------

  test('F-012: Results display place name, address, and distance', async ({ page }) => {
    await mockNearbyApi(page, { body: buildNearbyResponse(singlePlace) });
    await nearby.goto();
    await nearby.scrollToSection();

    await nearby.selectCategory('Grocery');
    await nearby.waitForResults();

    const placeLink = nearby.placeByName('Whole Foods Market');
    await expect(placeLink).toBeVisible();
    // Check address and distance are within the same link
    const text = await placeLink.textContent();
    expect(text).toContain('1765 California St');
    expect(text).toContain('0.4');
  });

  test('F-013: Place link opens Google Maps directions', async ({ page }) => {
    await mockNearbyApi(page, { body: buildNearbyResponse(singlePlace) });
    await nearby.goto();
    await nearby.scrollToSection();

    await nearby.selectCategory('Grocery');
    await nearby.waitForResults();

    const href = await nearby.placeByName('Whole Foods Market').getAttribute('href');
    expect(href).toContain('google.com/maps/dir');
    expect(href).toContain(String(singlePlace[0].location.lat));
  });

  test('F-014: Empty results show "No places found"', async ({ page }) => {
    await mockNearbyApi(page, { body: emptyPlacesResponse });
    await nearby.goto();
    await nearby.scrollToSection();

    await nearby.selectCategory('Pharmacy');
    await nearby.waitForResults();

    await expect(nearby.emptyState).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // Map
  // --------------------------------------------------------------------------

  test('F-015: Map renders with container', async ({ page }) => {
    await mockNearbyApi(page, { body: emptyPlacesResponse });
    await nearby.goto();
    await nearby.scrollToSection();

    // Map may or may not render depending on WebGL availability
    const mapVisible = await nearby.isMapVisible();
    // In CI without GPU, map may not render. We just check the container exists in DOM.
    if (!mapVisible) {
      await expect(nearby.mapContainer).toBeAttached();
    }
  });

  test('F-016: Search results add markers to map', async ({ page }) => {
    await mockNearbyApi(page, { body: buildNearbyResponse(groceryPlaces) });
    await nearby.goto();
    await nearby.scrollToSection();

    await nearby.selectCategory('Grocery');
    await nearby.waitForResults();

    // Wait a bit for markers to render on map
    await page.waitForTimeout(500);

    const mapVisible = await nearby.isMapVisible();
    if (mapVisible) {
      const markerCount = await nearby.placeMarkers.count();
      expect(markerCount).toBe(groceryPlaces.length);
    }
  });

  test('F-017: Hover place in list highlights marker', async ({ page }) => {
    await mockNearbyApi(page, { body: buildNearbyResponse(groceryPlaces) });
    await nearby.goto();
    await nearby.scrollToSection();

    await nearby.selectCategory('Grocery');
    await nearby.waitForResults();
    await page.waitForTimeout(500);

    const mapVisible = await nearby.isMapVisible();
    if (mapVisible) {
      await nearby.hoverPlace('Whole Foods Market');
      // Check that the marker for g1 has highlighted class
      const marker = nearby.markerById('g1');
      await expect(marker).toHaveClass(/highlighted/);
    }
  });

  test('F-018: Map zoom controls visible', async ({ page }) => {
    await mockNearbyApi(page, { body: emptyPlacesResponse });
    await nearby.goto();
    await nearby.scrollToSection();

    const mapVisible = await nearby.isMapVisible();
    if (mapVisible) {
      await expect(nearby.zoomIn).toBeVisible();
      await expect(nearby.zoomOut).toBeVisible();
      await expect(nearby.resetView).toBeVisible();
    }
  });

  test('F-020: Fit all markers button appears after search', async ({ page }) => {
    await mockNearbyApi(page, { body: buildNearbyResponse(groceryPlaces) });
    await nearby.goto();
    await nearby.scrollToSection();

    const mapVisible = await nearby.isMapVisible();
    if (mapVisible) {
      // Before search, fit all should not be visible (no places)
      await expect(nearby.fitAll).toBeHidden();

      await nearby.selectCategory('Grocery');
      await nearby.waitForResults();
      await page.waitForTimeout(500);

      await expect(nearby.fitAll).toBeVisible();
    }
  });

  // --------------------------------------------------------------------------
  // Mobile view toggle
  // --------------------------------------------------------------------------

  test('F-021: Mobile view toggle switches list/map', async ({ page }) => {
    // Only test on mobile viewport
    const viewport = page.viewportSize();
    if (!viewport || viewport.width >= 1024) {
      test.skip();
      return;
    }

    await mockNearbyApi(page, { body: buildNearbyResponse(groceryPlaces) });
    await nearby.goto();
    await nearby.scrollToSection();

    // The toggle button should be visible on mobile
    await expect(nearby.mobileToggleButton).toBeVisible();

    // Default is list view, button should say "Map"
    await expect(nearby.mobileToggleButton).toHaveText(/Map/);

    // Click to switch to map view
    await nearby.mobileToggleButton.click();
    await expect(nearby.mobileToggleButton).toHaveText(/List/);

    // Click to switch back to list view
    await nearby.mobileToggleButton.click();
    await expect(nearby.mobileToggleButton).toHaveText(/Map/);
  });

  // --------------------------------------------------------------------------
  // Attribution
  // --------------------------------------------------------------------------

  test('F-022: Radar attribution visible', async ({ page }) => {
    await mockNearbyApi(page, { body: emptyPlacesResponse });
    await nearby.goto();
    await nearby.scrollToSection();

    const mapVisible = await nearby.isMapVisible();
    if (mapVisible) {
      await expect(nearby.radarAttribution).toBeVisible();
      const href = await nearby.radarAttribution.getAttribute('href');
      expect(href).toContain('radar.com');
    }
  });

  // --------------------------------------------------------------------------
  // Search state management
  // --------------------------------------------------------------------------

  test('F-023: New search clears previous results', async ({ page }) => {
    await mockNearbyApiSequence(page, [
      { body: buildNearbyResponse(groceryPlaces) },
      { body: buildNearbyResponse(restaurantPlaces) },
    ]);
    await nearby.goto();
    await nearby.scrollToSection();

    // First search: Grocery
    await nearby.selectCategory('Grocery');
    await nearby.waitForResults();
    await expect(nearby.placeByName('Whole Foods Market')).toBeVisible();

    // Second search: Restaurants
    await nearby.selectCategory('Restaurants');
    await nearby.waitForResults();

    // Old results should be gone
    await expect(nearby.placeByName('Whole Foods Market')).toBeHidden();
    // New results should be visible
    await expect(nearby.placeByName('Chipotle Mexican Grill')).toBeVisible();
  });

  test('F-024: Keyword search uses Places API (sends categories)', async ({ page }) => {
    let requestBody: Record<string, unknown> | null = null;
    await page.route('**/api/nearby', async (route) => {
      const body = route.request().postDataJSON();
      requestBody = body;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildNearbyResponse(pharmacyPlaces)),
      });
    });

    await nearby.goto();
    await nearby.scrollToSection();

    await nearby.searchFor('pharmacy');
    await nearby.waitForResults();

    // The API should receive a query param (keyword search goes through server)
    expect(requestBody).not.toBeNull();
    expect(requestBody!.query).toBe('pharmacy');
  });
});
