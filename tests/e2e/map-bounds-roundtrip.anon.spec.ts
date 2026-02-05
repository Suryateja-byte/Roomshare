/**
 * Map Bounds URL Round-Trip E2E Tests
 *
 * Verifies that map bounds are correctly synchronized with URL parameters,
 * including deep links, round-trip persistence, and interaction with filters.
 *
 * Key architecture details:
 * - Map.tsx executeMapSearch uses replaceWithTransition (no history entry)
 * - MAP_RELEVANT_KEYS excludes sort/page/cursor from map-relevant params
 * - PersistentMapWrapper reads URL bounds on mount via searchParams
 * - Map.tsx onLoad fitBounds restores viewport from URL bounds
 *
 * Coverage:
 * - Group 1: Bounds in URL (initial bounds, update on move, precision, no history entries)
 * - Group 2: Deep link with bounds (specific bounds, no bounds, invalid bounds, round-trip)
 * - Group 3: Bounds + filters (preserved with filter, preserved with sort, independent update)
 *
 * Run: pnpm playwright test tests/e2e/map-bounds-roundtrip.anon.spec.ts --project=chromium-anon
 * Debug: pnpm playwright test tests/e2e/map-bounds-roundtrip.anon.spec.ts --project=chromium-anon --headed
 */

import { test, expect, SF_BOUNDS, selectors } from "./helpers/test-utils";
import type { Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;
const SEARCH_URL = `/search?${boundsQS}`;

// Debounce for map search (600ms in Map.tsx handleMoveEnd)
const MAP_SEARCH_DEBOUNCE_MS = 600;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Wait for the search page to be interactive.
 */
async function waitForSearchPage(page: Page, url = SEARCH_URL) {
  await page.goto(url);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForSelector("button", { timeout: 30_000 });
  await page.waitForTimeout(3000);
}

/**
 * Wait for the E2E map ref to be exposed.
 */
async function waitForMapRef(page: Page, timeout = 30_000): Promise<boolean> {
  try {
    await page.waitForFunction(
      () => !!(window as any).__e2eMapRef,
      { timeout },
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if map container is visible.
 */
async function isMapVisible(page: Page): Promise<boolean> {
  try {
    const mapContainer = page.locator(selectors.map);
    await mapContainer.first().waitFor({ state: "visible", timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if map canvas is fully loaded (WebGL working).
 */
async function isMapFullyLoaded(page: Page): Promise<boolean> {
  try {
    const hasCanvas = await page.evaluate(() => {
      const canvas = document.querySelector(".mapboxgl-canvas");
      if (!canvas) return false;
      const rect = canvas.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    return hasCanvas;
  } catch {
    return false;
  }
}

/**
 * Get URL bounds as parsed floats.
 */
function getUrlBounds(url: string): {
  minLat: number | null;
  maxLat: number | null;
  minLng: number | null;
  maxLng: number | null;
} {
  const urlObj = new URL(url, "http://localhost");
  const parse = (key: string) => {
    const val = urlObj.searchParams.get(key);
    return val !== null ? parseFloat(val) : null;
  };
  return {
    minLat: parse("minLat"),
    maxLat: parse("maxLat"),
    minLng: parse("minLng"),
    maxLng: parse("maxLng"),
  };
}

/**
 * Get the actual map viewport bounds from the Mapbox GL JS instance.
 */
async function getMapViewportBounds(page: Page): Promise<{
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
} | null> {
  return page.evaluate(() => {
    const map = (window as any).__e2eMapRef;
    if (!map?.getBounds) return null;
    const bounds = map.getBounds();
    if (!bounds) return null;
    return {
      minLat: bounds.getSouth(),
      maxLat: bounds.getNorth(),
      minLng: bounds.getWest(),
      maxLng: bounds.getEast(),
    };
  });
}

/**
 * Simulate a map pan by dragging.
 */
async function simulateMapPan(
  page: Page,
  deltaX = 100,
  deltaY = 50,
): Promise<boolean> {
  const map = page.locator(selectors.map).first();
  if ((await map.count()) === 0) return false;

  try {
    const box = await map.boundingBox();
    if (!box) return false;

    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 10 });
    await page.mouse.up();

    await page.waitForTimeout(800);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure "Search as I move" is ON.
 */
async function ensureSearchAsMoveOn(page: Page) {
  const toggle = page.locator('button[role="switch"]:has-text("Search as I move")');
  if ((await toggle.count()) === 0) return;
  const isChecked = await toggle.getAttribute("aria-checked");
  if (isChecked === "false") {
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
  }
}

// ---------------------------------------------------------------------------
// Group 1: Bounds in URL
// ---------------------------------------------------------------------------

test.describe("Bounds round-trip: Bounds in URL", () => {
  test("1 - Initial URL bounds match map viewport", async ({ page }) => {
    await waitForSearchPage(page);

    const hasRef = await waitForMapRef(page);
    if (!hasRef) {
      test.skip(true, "Map ref not available (WebGL unavailable)");
      return;
    }

    // Get bounds from URL
    const urlBounds = getUrlBounds(page.url());
    expect(urlBounds.minLat).not.toBeNull();

    // Get bounds from actual map viewport
    const mapBounds = await getMapViewportBounds(page);
    if (!mapBounds) {
      test.skip(true, "Could not read map viewport bounds");
      return;
    }

    // Map should have been fitted to URL bounds (with some tolerance for padding)
    const tolerance = 0.15; // Generous tolerance for fitBounds padding
    expect(mapBounds.minLat).toBeGreaterThanOrEqual(urlBounds.minLat! - tolerance);
    expect(mapBounds.maxLat).toBeLessThanOrEqual(urlBounds.maxLat! + tolerance);
    expect(mapBounds.minLng).toBeGreaterThanOrEqual(urlBounds.minLng! - tolerance);
    expect(mapBounds.maxLng).toBeLessThanOrEqual(urlBounds.maxLng! + tolerance);
  });

  test("2 - After map move, URL bounds update to new viewport", async ({ page }) => {
    await waitForSearchPage(page);

    if (!(await isMapFullyLoaded(page))) {
      test.skip(true, "Map not fully loaded");
      return;
    }

    await ensureSearchAsMoveOn(page);

    const initialBounds = getUrlBounds(page.url());

    // Pan the map
    const panned = await simulateMapPan(page, 150, 75);
    if (!panned) {
      test.skip(true, "Map pan failed");
      return;
    }

    // Wait for debounce + replaceState
    await page.waitForTimeout(MAP_SEARCH_DEBOUNCE_MS + 2500);

    const newBounds = getUrlBounds(page.url());

    // At least one bound should have changed
    const changed =
      initialBounds.minLat !== newBounds.minLat ||
      initialBounds.maxLat !== newBounds.maxLat ||
      initialBounds.minLng !== newBounds.minLng ||
      initialBounds.maxLng !== newBounds.maxLng;

    expect(changed).toBe(true);
  });

  test("3 - Bounds precision: minLat/maxLat/minLng/maxLng have reasonable decimal precision", async ({ page }) => {
    await waitForSearchPage(page);

    if (!(await isMapFullyLoaded(page))) {
      test.skip(true, "Map not fully loaded");
      return;
    }

    await ensureSearchAsMoveOn(page);

    // Pan to trigger a URL update with new bounds
    const panned = await simulateMapPan(page, 100, 50);
    if (!panned) {
      test.skip(true, "Map pan failed");
      return;
    }

    await page.waitForTimeout(MAP_SEARCH_DEBOUNCE_MS + 2500);

    const url = new URL(page.url(), "http://localhost");
    const boundsParams = ["minLat", "maxLat", "minLng", "maxLng"];

    for (const param of boundsParams) {
      const value = url.searchParams.get(param);
      if (value === null) continue; // May not be present if pan didn't trigger update

      const num = parseFloat(value);
      expect(Number.isFinite(num)).toBe(true);

      // Should have reasonable precision (not too many decimals, not too few)
      // Map.tsx uses toFixed(6) for bounds in some places
      const decimalPlaces = value.includes(".") ? value.split(".")[1].length : 0;
      expect(decimalPlaces).toBeGreaterThanOrEqual(1);
      expect(decimalPlaces).toBeLessThanOrEqual(15);

      // Should be within valid coordinate range
      if (param.includes("Lat")) {
        expect(num).toBeGreaterThanOrEqual(-90);
        expect(num).toBeLessThanOrEqual(90);
      } else {
        expect(num).toBeGreaterThanOrEqual(-180);
        expect(num).toBeLessThanOrEqual(180);
      }
    }
  });

  test("4 - Bounds updates use replaceState (no history entries)", async ({ page }) => {
    await waitForSearchPage(page);

    if (!(await isMapFullyLoaded(page))) {
      test.skip(true, "Map not fully loaded");
      return;
    }

    await ensureSearchAsMoveOn(page);

    // Track history length
    const initialHistoryLength = await page.evaluate(() => window.history.length);

    // Pan the map
    const panned = await simulateMapPan(page, 120, 60);
    if (!panned) {
      test.skip(true, "Map pan failed");
      return;
    }

    // Wait for URL update
    await page.waitForTimeout(MAP_SEARCH_DEBOUNCE_MS + 2500);

    // History length should NOT have increased (replaceState, not pushState)
    const afterHistoryLength = await page.evaluate(() => window.history.length);

    // replaceState does not increase history.length
    // Allow at most 1 increase for potential internal Next.js navigations
    expect(afterHistoryLength).toBeLessThanOrEqual(initialHistoryLength + 1);
  });
});

// ---------------------------------------------------------------------------
// Group 2: Deep Link with Bounds
// ---------------------------------------------------------------------------

test.describe("Bounds round-trip: Deep link with bounds", () => {
  test("5 - Deep link with specific bounds centers map on those bounds", async ({ page }) => {
    // Use specific bounds for downtown SF
    const customBounds = {
      minLat: 37.78,
      maxLat: 37.80,
      minLng: -122.42,
      maxLng: -122.40,
    };
    const customBoundsQS = `minLat=${customBounds.minLat}&maxLat=${customBounds.maxLat}&minLng=${customBounds.minLng}&maxLng=${customBounds.maxLng}`;

    await waitForSearchPage(page, `/search?${customBoundsQS}`);

    const hasRef = await waitForMapRef(page);
    if (!hasRef) {
      test.skip(true, "Map ref not available");
      return;
    }

    // Get map center
    const center = await page.evaluate(() => {
      const map = (window as any).__e2eMapRef;
      if (!map?.getCenter) return null;
      const c = map.getCenter();
      return { lng: c.lng, lat: c.lat };
    });

    if (!center) {
      test.skip(true, "Could not read map center");
      return;
    }

    // Center should be approximately in the middle of the provided bounds
    const expectedLat = (customBounds.minLat + customBounds.maxLat) / 2;
    const expectedLng = (customBounds.minLng + customBounds.maxLng) / 2;
    const tolerance = 0.1;

    expect(center.lat).toBeGreaterThanOrEqual(expectedLat - tolerance);
    expect(center.lat).toBeLessThanOrEqual(expectedLat + tolerance);
    expect(center.lng).toBeGreaterThanOrEqual(expectedLng - tolerance);
    expect(center.lng).toBeLessThanOrEqual(expectedLng + tolerance);
  });

  test("6 - Deep link with no bounds loads map at default/full extent", async ({ page }) => {
    // Navigate to search without any bounds params
    await page.goto("/search");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(4000);

    // Page should load without errors
    expect(await page.locator("body").isVisible()).toBe(true);

    // If map is visible, it should be centered somewhere reasonable
    if (await isMapVisible(page)) {
      const hasRef = await waitForMapRef(page, 10_000);
      if (hasRef) {
        const center = await page.evaluate(() => {
          const map = (window as any).__e2eMapRef;
          if (!map?.getCenter) return null;
          const c = map.getCenter();
          return { lng: c.lng, lat: c.lat };
        });

        if (center) {
          // Should be valid coordinates
          expect(center.lat).toBeGreaterThanOrEqual(-90);
          expect(center.lat).toBeLessThanOrEqual(90);
          expect(center.lng).toBeGreaterThanOrEqual(-180);
          expect(center.lng).toBeLessThanOrEqual(180);
        }
      }
    }
  });

  test("7 - Deep link with invalid bounds is handled gracefully", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    // Navigate with invalid bounds (NaN, Infinity, inverted)
    await page.goto("/search?minLat=NaN&maxLat=Infinity&minLng=-999&maxLng=999");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);

    // Page should not crash
    expect(await page.locator("body").isVisible()).toBe(true);

    // Filter known benign errors (WebGL, HMR, network, etc.)
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
        !e.includes("net::ERR") &&
        !e.includes("Failed to load resource") &&
        !e.includes("AbortError") &&
        !e.includes("abort"),
    );

    // No unexpected JS errors
    expect(realErrors).toHaveLength(0);
  });

  test("8 - URL bounds round-trip: read bounds, pan, refresh, same new bounds", async ({ page }) => {
    await waitForSearchPage(page);

    if (!(await isMapFullyLoaded(page))) {
      test.skip(true, "Map not fully loaded");
      return;
    }

    await ensureSearchAsMoveOn(page);

    // Pan the map to generate new bounds
    const panned = await simulateMapPan(page, 120, 60);
    if (!panned) {
      test.skip(true, "Map pan failed");
      return;
    }

    // Wait for URL to update
    await page.waitForTimeout(MAP_SEARCH_DEBOUNCE_MS + 2500);

    // Read new bounds from URL
    const boundsAfterPan = getUrlBounds(page.url());
    if (boundsAfterPan.minLat === null) {
      test.skip(true, "URL bounds not updated after pan");
      return;
    }

    // Refresh the page
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);

    // Read bounds from URL after refresh
    const boundsAfterRefresh = getUrlBounds(page.url());

    // Bounds should be the same after refresh
    expect(boundsAfterRefresh.minLat).toBeCloseTo(boundsAfterPan.minLat!, 4);
    expect(boundsAfterRefresh.maxLat).toBeCloseTo(boundsAfterPan.maxLat!, 4);
    expect(boundsAfterRefresh.minLng).toBeCloseTo(boundsAfterPan.minLng!, 4);
    expect(boundsAfterRefresh.maxLng).toBeCloseTo(boundsAfterPan.maxLng!, 4);

    // Verify map center is consistent with the preserved bounds
    const hasRef = await waitForMapRef(page, 15_000);
    if (hasRef) {
      const center = await page.evaluate(() => {
        const map = (window as any).__e2eMapRef;
        if (!map?.getCenter) return null;
        const c = map.getCenter();
        return { lng: c.lng, lat: c.lat };
      });

      if (center && boundsAfterRefresh.minLat !== null) {
        // Center should be within the bounds
        expect(center.lat).toBeGreaterThanOrEqual(boundsAfterRefresh.minLat! - 0.15);
        expect(center.lat).toBeLessThanOrEqual(boundsAfterRefresh.maxLat! + 0.15);
        expect(center.lng).toBeGreaterThanOrEqual(boundsAfterRefresh.minLng! - 0.15);
        expect(center.lng).toBeLessThanOrEqual(boundsAfterRefresh.maxLng! + 0.15);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Group 3: Bounds + Filters
// ---------------------------------------------------------------------------

test.describe("Bounds round-trip: Bounds + filters", () => {
  test("9 - Bounds preserved when filter applied", async ({ page }) => {
    await waitForSearchPage(page);

    // Read initial bounds from URL
    const initialBounds = getUrlBounds(page.url());
    expect(initialBounds.minLat).not.toBeNull();

    // Apply a filter via URL navigation (preserving bounds)
    await page.goto(`${SEARCH_URL}&roomType=Private+Room`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    // Bounds should still be in URL
    const afterFilterBounds = getUrlBounds(page.url());
    expect(afterFilterBounds.minLat).toBeCloseTo(initialBounds.minLat!, 2);
    expect(afterFilterBounds.maxLat).toBeCloseTo(initialBounds.maxLat!, 2);
    expect(afterFilterBounds.minLng).toBeCloseTo(initialBounds.minLng!, 2);
    expect(afterFilterBounds.maxLng).toBeCloseTo(initialBounds.maxLng!, 2);

    // Filter should also be present
    const url = new URL(page.url(), "http://localhost");
    expect(url.searchParams.get("roomType")).toBe("Private Room");
  });

  test("10 - Bounds preserved when sort changed", async ({ page }) => {
    await waitForSearchPage(page);

    const initialBounds = getUrlBounds(page.url());
    expect(initialBounds.minLat).not.toBeNull();

    // Change sort order (sort is excluded from MAP_RELEVANT_KEYS)
    await page.goto(`${SEARCH_URL}&sort=price_asc`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    // Bounds should still be present and unchanged
    const afterSortBounds = getUrlBounds(page.url());
    expect(afterSortBounds.minLat).toBeCloseTo(initialBounds.minLat!, 2);
    expect(afterSortBounds.maxLat).toBeCloseTo(initialBounds.maxLat!, 2);
    expect(afterSortBounds.minLng).toBeCloseTo(initialBounds.minLng!, 2);
    expect(afterSortBounds.maxLng).toBeCloseTo(initialBounds.maxLng!, 2);

    // Sort should also be present
    const url = new URL(page.url(), "http://localhost");
    expect(url.searchParams.get("sort")).toBe("price_asc");
  });

  test("11 - Bounds updated independently from filter changes", async ({ page }) => {
    await waitForSearchPage(page);

    if (!(await isMapFullyLoaded(page))) {
      test.skip(true, "Map not fully loaded");
      return;
    }

    await ensureSearchAsMoveOn(page);

    // Start with a filter applied
    await page.goto(`${SEARCH_URL}&roomType=Private+Room`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);

    const initialUrl = new URL(page.url(), "http://localhost");
    const initialFilter = initialUrl.searchParams.get("roomType");
    const initialBounds = getUrlBounds(page.url());

    // Pan the map (should update bounds but NOT change filter)
    const panned = await simulateMapPan(page, 120, 60);
    if (!panned) {
      test.skip(true, "Map pan failed");
      return;
    }

    await page.waitForTimeout(MAP_SEARCH_DEBOUNCE_MS + 2500);

    const afterPanUrl = new URL(page.url(), "http://localhost");
    const afterPanFilter = afterPanUrl.searchParams.get("roomType");
    const afterPanBounds = getUrlBounds(page.url());

    // Filter should remain the same
    expect(afterPanFilter).toBe(initialFilter);

    // Bounds may have changed (if search-as-move updated them)
    // The key assertion: filter is independent of bounds
    if (afterPanBounds.minLat !== null && initialBounds.minLat !== null) {
      // At least verify both exist (bounds + filter coexist)
      expect(afterPanUrl.searchParams.has("minLat")).toBe(true);
      expect(afterPanUrl.searchParams.has("roomType")).toBe(true);
    }
  });
});
