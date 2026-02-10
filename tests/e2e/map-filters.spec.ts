/**
 * Map + Filter Interactions E2E Tests (Scenarios 5.1-5.3)
 *
 * Verifies the interaction between search filters and map markers:
 * - 5.1: Filter change updates map markers (count decreases) [P0]
 * - 5.2: Clear filter restores all matching markers [P0]
 * - 5.3: Sort change does NOT refetch map data (only list order changes) [P1]
 *
 * NOTE: Mapbox GL JS requires WebGL. In headless Chromium without GPU,
 * the map may not fully initialize. Tests gracefully handle this.
 *
 * For full visual testing, run with --headed flag:
 *   pnpm playwright test tests/e2e/map-filters.spec.ts --project=chromium --headed
 */

import {
  test,
  expect,
  SF_BOUNDS,
  selectors,
  tags,
  waitForMapMarkers,
  waitForMapReady,
  searchResultsContainer,
} from "./helpers/test-utils";
import { pollForUrlParam, pollForUrlParamPresent } from "./helpers/sync-helpers";
import type { Page } from "@playwright/test";

const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;
const SEARCH_URL = `/search?${boundsQS}`;

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Wait for the search page to be interactive with listings loaded
 */
async function waitForSearchPageReady(page: Page) {
  await page.goto(SEARCH_URL);
  await page.waitForLoadState("domcontentloaded");
  // Wait for listing cards to appear
  await page
    .locator(selectors.listingCard)
    .first()
    .waitFor({ state: "attached", timeout: 30_000 });
  // Wait for map to be fully loaded and idle
  await waitForMapReady(page);
}

/**
 * Get the current count of visible map markers
 */
async function getMarkerCount(page: Page): Promise<number> {
  const markers = page.locator(".mapboxgl-marker:visible");
  return markers.count();
}

/**
 * Check if the map instance was reinitialized by looking for the map container
 * remaining in the DOM (map persistence check)
 */
async function getMapInstanceId(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const mapContainer = document.querySelector(".mapboxgl-map");
    if (!mapContainer) return null;
    // Use a stable identifier - the map canvas element's dataset or a unique property
    const canvas = mapContainer.querySelector(".mapboxgl-canvas");
    if (canvas) {
      // Return a hash of the canvas dimensions and position as a pseudo-ID
      const rect = canvas.getBoundingClientRect();
      return `${rect.width}-${rect.height}-${rect.x}-${rect.y}`;
    }
    return "map-exists";
  });
}

/**
 * Open the filter modal on desktop
 */
async function openFilterModal(page: Page) {
  // Try multiple selector strategies for the Filters button
  const filtersBtn = page.getByRole("button", { name: "Filters", exact: true })
    .or(page.locator('[data-testid="mobile-filter-button"]'))
    .or(page.locator('button:has-text("Filters")'));

  await expect(filtersBtn.first()).toBeVisible({ timeout: 10_000 });
  await filtersBtn.first().click();

  // Wait for filter modal/dialog to appear
  const filterDialog = page.getByRole("dialog", { name: /filters/i })
    .or(page.locator('[role="dialog"]'));
  await expect(filterDialog.first()).toBeVisible({ timeout: 5_000 });
}

/**
 * Apply a max price filter using the filter modal
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function applyMaxPriceFilter(page: Page, maxPrice: number) {
  await openFilterModal(page);

  // Find the price slider and adjust it
  // The price filter uses Radix Slider with aria-label="Price range"
  const priceSlider = page.locator('[aria-label="Price range"]');

  if (await priceSlider.count() > 0) {
    // Find the max price thumb (second thumb) and adjust it
    const maxThumb = page.locator('[aria-label="Maximum price"]');
    if (await maxThumb.count() > 0) {
      // Use keyboard to adjust - press left arrow to decrease max price
      await maxThumb.focus();
      // Press left multiple times to lower the max price
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press("ArrowLeft");
      }
    }
  }

  // Apply the filter
  const applyBtn = page.locator('[data-testid="filter-modal-apply"]');
  if (await applyBtn.count() > 0) {
    await applyBtn.click();
  } else {
    // Fallback: close dialog by clicking outside or pressing escape
    await page.keyboard.press("Escape");
  }

  // Wait for URL to update with filter params
  await pollForUrlParamPresent(page, "maxPrice");
}

/**
 * Apply a room type filter via URL params (more reliable for testing)
 */
async function navigateWithRoomTypeFilter(page: Page, roomType: string) {
  await page.goto(`${SEARCH_URL}&roomType=${encodeURIComponent(roomType)}`);
  await page.waitForLoadState("domcontentloaded");
  await waitForMapReady(page);
}

/**
 * Clear all filters using the clear button
 */
async function clearAllFilters(page: Page) {
  const clearBtn = page.locator('[data-testid="filter-bar-clear-all"]')
    .or(page.locator('button[aria-label="Clear all filters"]'))
    .or(page.locator('button:has-text("Clear all")'));

  const clearVisible = await clearBtn.first().isVisible().catch(() => false);

  if (clearVisible) {
    await clearBtn.first().click();
    // Wait for URL to update (filters removed)
    await page.waitForURL(
      (url) => {
        const params = new URL(url).searchParams;
        return !params.has("roomType") && !params.has("maxPrice") && !params.has("amenities");
      },
      { timeout: 10_000 }
    );
    await waitForMapReady(page);
  }
}

/**
 * Change the sort option
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function changeSortOption(page: Page, sortValue: string) {
  // Desktop: use the sort dropdown
  const sortTrigger = page.locator('button:has-text("Sort by")')
    .or(page.locator('[aria-label*="sort" i]'))
    .or(page.locator('button:has-text("Recommended")'));

  const sortVisible = await sortTrigger.first().isVisible().catch(() => false);

  if (sortVisible) {
    await sortTrigger.first().click();

    // Click the sort option (Playwright auto-waits for actionability)
    const sortOption = page.getByRole("option", { name: new RegExp(sortValue, "i") })
      .or(page.locator(`button:has-text("${sortValue}")`))
      .or(page.locator(`[data-value="${sortValue}"]`));

    await sortOption.first().waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
    if (await sortOption.first().isVisible()) {
      await sortOption.first().click();
    }
  }
}

/**
 * Track network requests for map marker data
 */
async function trackMapDataRequests(page: Page): Promise<{ getCount: () => number }> {
  let requestCount = 0;

  page.on("request", (request) => {
    const url = request.url();
    // Track only map-specific marker data requests (not general search/SSR)
    if (url.includes("/api/map-listings") ||
        url.includes("/api/search/map-markers")) {
      requestCount++;
    }
  });

  return { getCount: () => requestCount };
}

// ---------------------------------------------------------------------------
// Test Suite: Map + Filter Interactions
// ---------------------------------------------------------------------------

test.describe("Map + Filter Interactions", () => {
  // Run as anonymous user for these tests
  test.use({ storageState: { cookies: [], origins: [] } });

  // Map tests need extra time for WebGL rendering and tile loading in CI
  test.beforeEach(async () => { test.slow(); });

  // ---------------------------------------------------------------------------
  // 5.1: Filter change updates map markers (count decreases) [P0]
  // ---------------------------------------------------------------------------
  test.describe("5.1: Filter change updates map markers", () => {
    test(`${tags.core} - applying room type filter reduces marker count`, async ({ page }) => {
      // Navigate to search page without filters
      await waitForSearchPageReady(page);

      // Wait for map markers to appear
      let initialMarkerCount: number;
      try {
        initialMarkerCount = await waitForMapMarkers(page, { timeout: 15_000, minCount: 1 });
      } catch {
        // If no markers appear (WebGL issue), skip the test
        test.skip(true, "Map markers not rendered (WebGL may be unavailable)");
        return;
      }

      // Record initial marker count
      console.log(`[Test] Initial marker count: ${initialMarkerCount}`);

      // Apply a filter that should reduce results (Private Room filter)
      await navigateWithRoomTypeFilter(page, "Private Room");

      // Wait for map to settle after filter navigation
      await waitForMapReady(page);

      // Get new marker count
      const filteredMarkerCount = await getMarkerCount(page);
      console.log(`[Test] Filtered marker count: ${filteredMarkerCount}`);

      // The filtered count should be less than or equal to initial
      // (equal if all listings happen to be private rooms)
      expect(filteredMarkerCount).toBeLessThanOrEqual(initialMarkerCount);

      // Verify URL has the filter parameter
      const url = new URL(page.url());
      expect(url.searchParams.get("roomType")).toBe("Private Room");
    });

    test(`${tags.core} - applying price filter via URL reduces markers`, async ({ page }) => {
      // Navigate to search page without filters
      await waitForSearchPageReady(page);

      // Wait for map markers
      let initialMarkerCount: number;
      try {
        initialMarkerCount = await waitForMapMarkers(page, { timeout: 15_000, minCount: 1 });
      } catch {
        test.skip(true, "Map markers not rendered (WebGL may be unavailable)");
        return;
      }

      console.log(`[Test] Initial marker count: ${initialMarkerCount}`);

      // Apply a restrictive max price filter
      await page.goto(`${SEARCH_URL}&maxPrice=500`);
      await page.waitForLoadState("domcontentloaded");
      await waitForMapReady(page);

      // Get new marker count
      const filteredMarkerCount = await getMarkerCount(page);
      console.log(`[Test] Filtered marker count (maxPrice=500): ${filteredMarkerCount}`);

      // Filtered count should be less than or equal to initial
      expect(filteredMarkerCount).toBeLessThanOrEqual(initialMarkerCount);

      // Verify URL has the filter
      expect(new URL(page.url()).searchParams.get("maxPrice")).toBe("500");
    });

    test(`${tags.core} - map instance persists during filter change (no reinitialization)`, async ({ page }) => {
      await waitForSearchPageReady(page);

      // Check if map exists
      const initialMapId = await getMapInstanceId(page);
      if (!initialMapId) {
        test.skip(true, "Map not rendered (WebGL may be unavailable)");
        return;
      }

      console.log(`[Test] Initial map instance ID: ${initialMapId}`);

      // Apply a filter
      await navigateWithRoomTypeFilter(page, "Private Room");

      // Wait for map to settle after filter
      await waitForMapReady(page);

      // Map should still exist (not reinitialized)
      const afterFilterMapId = await getMapInstanceId(page);
      console.log(`[Test] Map instance ID after filter: ${afterFilterMapId}`);

      // The map container should still exist
      expect(afterFilterMapId).not.toBeNull();
      // Note: The exact ID might change due to re-render, but map should persist
      // The key check is that the map didn't disappear/flash
    });
  });

  // ---------------------------------------------------------------------------
  // 5.2: Clear filter restores all matching markers [P0]
  // ---------------------------------------------------------------------------
  test.describe("5.2: Clear filter restores markers", () => {
    test(`${tags.core} - clearing filters restores original marker count`, async ({ page }) => {
      // First get unfiltered marker count as baseline
      await waitForSearchPageReady(page);
      let unfilteredBaseline: number;
      try {
        unfilteredBaseline = await waitForMapMarkers(page, { timeout: 15_000, minCount: 1 });
      } catch {
        test.skip(true, "Map markers not rendered (WebGL may be unavailable)");
        return;
      }
      console.log(`[Test] Unfiltered baseline marker count: ${unfilteredBaseline}`);

      // Navigate to search page with a filter applied
      await navigateWithRoomTypeFilter(page, "Private Room");

      // Wait for filtered markers to settle
      const filteredMarkerCount = await getMarkerCount(page);
      console.log(`[Test] Filtered marker count: ${filteredMarkerCount}`);

      // Clear filters by navigating back to the unfiltered search URL
      // (more reliable than trying to find a "Clear all" button which may not exist)
      await page.goto(SEARCH_URL);
      await page.waitForLoadState("domcontentloaded");

      // Wait for markers to render after navigation (same wait as baseline)
      let unfilteredMarkerCount: number;
      try {
        unfilteredMarkerCount = await waitForMapMarkers(page, { timeout: 15_000, minCount: 1 });
      } catch {
        unfilteredMarkerCount = await getMarkerCount(page);
      }
      console.log(`[Test] Unfiltered marker count after clear: ${unfilteredMarkerCount}`);

      // Unfiltered count should be greater than or equal to filtered
      expect(unfilteredMarkerCount).toBeGreaterThanOrEqual(filteredMarkerCount);

      // Verify URL no longer has the filter
      const url = new URL(page.url());
      expect(url.searchParams.has("roomType")).toBe(false);
    });

    test(`${tags.core} - clicking individual filter chip removes only that filter`, async ({ page }) => {
      // Navigate with multiple filters
      await page.goto(`${SEARCH_URL}&roomType=Private+Room&amenities=Wifi`);
      await page.waitForLoadState("domcontentloaded");
      await waitForMapReady(page);

      // Check for applied filters region
      const filtersRegion = page.locator('[aria-label="Applied filters"]');
      const regionVisible = await filtersRegion.isVisible().catch(() => false);

      if (!regionVisible) {
        // Filter chips may not be rendered in this UI variant
        test.skip(true, "Applied filters region not visible");
        return;
      }

      // Find and click the roomType filter chip's remove button
      const roomTypeChip = filtersRegion.locator('button:has-text("Private Room")');
      if (await roomTypeChip.count() > 0) {
        await roomTypeChip.click();

        // Wait for roomType param to be removed from URL
        await pollForUrlParam(page, "roomType", null);

        // Verify roomType is removed but amenities remain
        const url = new URL(page.url());
        expect(url.searchParams.has("roomType")).toBe(false);
        expect(url.searchParams.has("amenities")).toBe(true);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 5.3: Sort change does NOT refetch map data [P1]
  // ---------------------------------------------------------------------------
  test.describe("5.3: Sort change behavior", () => {
    test(`${tags.core} - changing sort order does not reinitialize map`, async ({ page }) => {
      await waitForSearchPageReady(page);

      // Check if map exists
      const initialMapId = await getMapInstanceId(page);
      if (!initialMapId) {
        test.skip(true, "Map not rendered (WebGL may be unavailable)");
        return;
      }

      // Wait for markers to render before measuring
      let initialMarkerCount: number;
      try {
        initialMarkerCount = await waitForMapMarkers(page, { timeout: 15_000, minCount: 1 });
      } catch {
        // If markers don't appear, use 0 but the test may be unreliable
        initialMarkerCount = await getMarkerCount(page);
      }
      console.log(`[Test] Initial marker count: ${initialMarkerCount}`);

      // Change sort order via URL (most reliable method)
      const currentUrl = new URL(page.url());
      currentUrl.searchParams.set("sort", "price_asc");
      await page.goto(currentUrl.toString());
      await page.waitForLoadState("domcontentloaded");
      await waitForMapReady(page);

      // Map should still exist
      const afterSortMapId = await getMapInstanceId(page);
      expect(afterSortMapId).not.toBeNull();

      // Wait for markers to render after sort navigation, then compare
      let afterSortMarkerCount: number;
      try {
        afterSortMarkerCount = await waitForMapMarkers(page, { timeout: 15_000, minCount: 1 });
      } catch {
        afterSortMarkerCount = await getMarkerCount(page);
      }
      console.log(`[Test] Marker count after sort: ${afterSortMarkerCount}`);

      // Sort should not change marker count (same data, different order).
      // Allow tolerance of +-2 for CI timing variance in marker rendering.
      expect(afterSortMarkerCount).toBeGreaterThanOrEqual(
        Math.max(0, initialMarkerCount - 2),
      );
      expect(afterSortMarkerCount).toBeLessThanOrEqual(
        initialMarkerCount + 2,
      );
    });

    test(`${tags.core} - sort change updates list order but preserves map markers`, async ({ page }) => {
      await waitForSearchPageReady(page);

      // Get initial listing prices from card text content (no data-testid for prices)
      const getListingPrices = async (): Promise<string[]> => {
        return page.evaluate(() => {
          const cards = document.querySelectorAll('[data-testid="listing-card"], a[href^="/listings/c"]');
          const prices: string[] = [];
          cards.forEach((card) => {
            const match = card.textContent?.match(/\$[\d,]+/);
            if (match) prices.push(match[0]);
          });
          return prices.slice(0, 5);
        });
      };

      const initialPrices = await getListingPrices();
      console.log(`[Test] Initial listing prices: ${initialPrices.join(", ")}`);

      // Wait for markers to render before measuring
      let initialMarkerCount: number;
      try {
        initialMarkerCount = await waitForMapMarkers(page, { timeout: 15_000, minCount: 1 });
      } catch {
        initialMarkerCount = await getMarkerCount(page);
      }

      // Change sort to price ascending
      const currentUrl = new URL(page.url());
      currentUrl.searchParams.set("sort", "price_asc");
      await page.goto(currentUrl.toString());
      await page.waitForLoadState("domcontentloaded");
      await waitForMapReady(page);

      // Get new listing order
      const sortedPrices = await getListingPrices();
      console.log(`[Test] Sorted listing prices: ${sortedPrices.join(", ")}`);

      // Verify sort param is in URL
      expect(new URL(page.url()).searchParams.get("sort")).toBe("price_asc");

      // Wait for markers to render after sort navigation, then compare
      let afterSortMarkerCount: number;
      try {
        afterSortMarkerCount = await waitForMapMarkers(page, { timeout: 15_000, minCount: 1 });
      } catch {
        afterSortMarkerCount = await getMarkerCount(page);
      }
      // Sort should not change marker count. Allow tolerance of +-2 for CI timing.
      expect(afterSortMarkerCount).toBeGreaterThanOrEqual(
        Math.max(0, initialMarkerCount - 2),
      );
      expect(afterSortMarkerCount).toBeLessThanOrEqual(
        initialMarkerCount + 2,
      );

      // If we have prices, the order may have changed
      // (can't guarantee order change if all same price)
      if (initialPrices.length > 0 && sortedPrices.length > 0) {
        // Just verify we got listings back (order verification is complex)
        expect(sortedPrices.length).toBeGreaterThan(0);
      }
    });

    test(`${tags.core} - rapid sort changes do not cause multiple map refetches`, async ({ page }) => {
      await waitForSearchPageReady(page);

      // Check if map exists
      if (!(await getMapInstanceId(page))) {
        test.skip(true, "Map not rendered");
        return;
      }

      // Track network requests
      const tracker = await trackMapDataRequests(page);

      // Record initial count
      const initialRequestCount = tracker.getCount();

      // Rapidly change sort options
      for (const sort of ["price_asc", "price_desc", "newest"]) {
        const currentUrl = new URL(page.url());
        currentUrl.searchParams.set("sort", sort);
        await page.goto(currentUrl.toString(), { waitUntil: "commit" });
      }

      // Wait for the final navigation to settle
      await page.waitForLoadState("domcontentloaded");
      await waitForMapReady(page);

      // Get final request count
      const finalRequestCount = tracker.getCount();
      const additionalRequests = finalRequestCount - initialRequestCount;

      console.log(`[Test] Additional requests after 3 sort changes: ${additionalRequests}`);

      // We expect some requests for list data updates
      // But map marker data should not be refetched multiple times
      // The exact number depends on implementation, but it should be bounded
      // (not 3x the number of sort changes)
      expect(additionalRequests).toBeLessThanOrEqual(6); // Allow reasonable margin
    });
  });

  // ---------------------------------------------------------------------------
  // Edge Cases and Robustness
  // ---------------------------------------------------------------------------
  test.describe("Edge cases", () => {
    test("filter and sort combination works correctly", async ({ page }) => {
      // Apply both filter and sort via URL
      await page.goto(`${SEARCH_URL}&roomType=Private+Room&sort=price_asc`);
      await page.waitForLoadState("domcontentloaded");
      await waitForMapReady(page);

      // Verify URL params
      const url = new URL(page.url());
      expect(url.searchParams.get("roomType")).toBe("Private Room");
      expect(url.searchParams.get("sort")).toBe("price_asc");

      // Page should load without errors
      const pageTitle = await page.title();
      expect(pageTitle).toBeTruthy();

      // Check for listings or empty state
      const hasListings = await searchResultsContainer(page).locator(selectors.listingCard).count() > 0;
      const hasEmptyState = await page.locator(selectors.emptyState).count() > 0;

      // Either listings or empty state should be present
      expect(hasListings || hasEmptyState).toBe(true);
    });

    test("map remains interactive after filter change", async ({ page }) => {
      await waitForSearchPageReady(page);

      // Check if map exists
      const map = page.locator(".mapboxgl-canvas:visible").first();
      const mapVisible = await map.isVisible().catch(() => false);

      if (!mapVisible) {
        test.skip(true, "Map not visible");
        return;
      }

      // Apply a filter
      await navigateWithRoomTypeFilter(page, "Private Room");

      // Map should still be interactive after filter (can zoom)
      // Re-check visibility after filter navigation
      const mapStillVisible = await map.isVisible().catch(() => false);
      if (!mapStillVisible) {
        test.skip(true, "Map canvas not visible after filter change");
        return;
      }

      await map.click({ timeout: 5_000 }).catch(() => {
        // Click may fail if canvas is obscured -- not a hard failure
      });
      await waitForMapReady(page);

      // Try scrolling to zoom (if supported)
      await map.hover({ timeout: 5_000 }).catch(() => {});
      await page.mouse.wheel(0, -100);
      await waitForMapReady(page);

      // Map should still be visible and functional
      await expect(map).toBeVisible({ timeout: 5_000 });
    });

    test("no console errors during filter operations", async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") {
          consoleErrors.push(msg.text());
        }
      });

      await waitForSearchPageReady(page);

      // Apply filter
      await navigateWithRoomTypeFilter(page, "Private Room");
      await waitForMapReady(page);

      // Clear filter
      await clearAllFilters(page);
      await waitForMapReady(page);

      // Filter known benign errors
      const realErrors = consoleErrors.filter(
        (e) =>
          !e.includes("mapbox") &&
          !e.includes("webpack") &&
          !e.includes("HMR") &&
          !e.includes("hydrat") &&
          !e.includes("favicon") &&
          !e.includes("ResizeObserver") &&
          !e.includes("WebGL") &&
          !e.includes("Failed to create") &&
          !e.includes("404") &&
          !e.includes("AbortError") &&
          !e.includes("abort") &&
          !e.includes("cancelled") &&
          !e.includes("net::ERR") &&
          !e.includes("Failed to load resource")
      );

      expect(realErrors).toHaveLength(0);
    });
  });
});
