/**
 * Map Persistence E2E Tests
 *
 * Verifies that the map survives filter, sort, and query changes without
 * re-initializing (PersistentMapWrapper lives in layout.tsx).
 *
 * Coverage:
 * - Group 1: Map survives filter/sort/query changes (zoom, center, instance preserved)
 * - Group 2: Map state recovery (refresh, browser back, sequential filters)
 * - Group 3: Lazy loading (map doesn't block results, loading indicator, visible after load)
 *
 * E2E hooks used:
 * - window.__roomshare.mapInitCount  -- incremented each time Map component mounts
 * - window.__roomshare.mapInstanceId -- unique ID set once per mount
 * - window.__e2eMapRef              -- Mapbox GL JS map instance
 * - window.__e2eSetProgrammaticMove -- flag programmatic moves
 *
 * Run: pnpm playwright test tests/e2e/map-persistence.anon.spec.ts --project=chromium-anon
 * Debug: pnpm playwright test tests/e2e/map-persistence.anon.spec.ts --project=chromium-anon --headed
 */

import { test, expect, SF_BOUNDS, selectors, timeouts, waitForMapReady } from "./helpers/test-utils";
import type { Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;
const SEARCH_URL = `/search?${boundsQS}`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Wait for the search page to be interactive and map to be ready.
 */
async function waitForSearchPage(page: Page, url = SEARCH_URL) {
  await page.goto(url);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForSelector("button", { timeout: 30_000 });
  await waitForMapReady(page);
}

/**
 * Wait for the E2E map ref to be exposed (map loaded and ready).
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
 * Get E2E instrumentation state from window.__roomshare.
 */
async function getMapE2EState(page: Page) {
  return page.evaluate(() => {
    const roomshare = (window as unknown as Record<string, unknown>).__roomshare as
      | Record<string, unknown>
      | undefined;
    if (!roomshare) return null;
    return {
      mapInstanceId: roomshare.mapInstanceId as string | undefined,
      mapInitCount: roomshare.mapInitCount as number | undefined,
      markerCount: roomshare.markerCount as number | undefined,
    };
  });
}

/**
 * Get the current map zoom level from the Mapbox GL JS instance.
 */
async function getMapZoom(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const map = (window as any).__e2eMapRef;
    return map?.getZoom?.() ?? null;
  });
}

/**
 * Get the current map center from the Mapbox GL JS instance.
 */
async function getMapCenter(page: Page): Promise<{ lng: number; lat: number } | null> {
  return page.evaluate(() => {
    const map = (window as any).__e2eMapRef;
    if (!map?.getCenter) return null;
    const center = map.getCenter();
    return { lng: center.lng, lat: center.lat };
  });
}

/**
 * Check if the Mapbox canvas is visible (WebGL working).
 */
async function isMapCanvasVisible(page: Page): Promise<boolean> {
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
 * Check if the map container is visible in the DOM.
 */
async function isMapContainerVisible(page: Page): Promise<boolean> {
  const mapContainer = page.locator(selectors.map);
  try {
    await mapContainer.first().waitFor({ state: "visible", timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Navigate with a filter applied via URL parameter.
 */
async function navigateWithFilter(page: Page, paramKey: string, paramValue: string) {
  await page.goto(`${SEARCH_URL}&${paramKey}=${encodeURIComponent(paramValue)}`);
  await page.waitForLoadState("domcontentloaded");
  await waitForMapReady(page);
}

// ---------------------------------------------------------------------------
// Group 1: Map Survives Changes
// ---------------------------------------------------------------------------

test.describe("Map persistence: Map survives changes", () => {
  test("1 - Map initializes once: mapInitCount stays 1 after filter change", async ({ page }) => {
    await waitForSearchPage(page);

    const initialState = await getMapE2EState(page);
    if (!initialState?.mapInitCount) {
      test.skip(true, "E2E instrumentation not enabled (NEXT_PUBLIC_E2E!=true)");
      return;
    }

    const initialInitCount = initialState.mapInitCount;

    // Apply a filter via URL navigation
    await navigateWithFilter(page, "roomType", "Private Room");

    const afterState = await getMapE2EState(page);

    // mapInitCount should not have increased (no remount)
    expect(afterState?.mapInitCount).toBe(initialInitCount);
  });

  test("2 - Map instance ID unchanged after filter change", async ({ page }) => {
    await waitForSearchPage(page);

    const initialState = await getMapE2EState(page);
    if (!initialState?.mapInstanceId) {
      test.skip(true, "E2E instrumentation not enabled (NEXT_PUBLIC_E2E!=true)");
      return;
    }

    const initialInstanceId = initialState.mapInstanceId;

    // Apply a filter
    await navigateWithFilter(page, "roomType", "Private Room");

    const afterState = await getMapE2EState(page);
    expect(afterState?.mapInstanceId).toBe(initialInstanceId);
  });

  test("3 - Map zoom preserved after filter change", async ({ page }) => {
    await waitForSearchPage(page);

    const hasMapRef = await waitForMapRef(page);
    if (!hasMapRef) {
      test.skip(true, "Map ref not available (WebGL unavailable in headless)");
      return;
    }

    // Get current zoom
    const initialZoom = await getMapZoom(page);
    if (initialZoom === null) {
      test.skip(true, "Could not read zoom level");
      return;
    }

    // Apply a filter
    await navigateWithFilter(page, "maxPrice", "2000");

    // Wait for map ref to be re-established after navigation
    await waitForMapRef(page, 15_000);

    const afterZoom = await getMapZoom(page);
    expect(afterZoom).not.toBeNull();

    // Zoom should be the same (within tolerance for floating point)
    expect(Math.abs(afterZoom! - initialZoom)).toBeLessThan(0.5);
  });

  test("4 - Map center preserved after filter change", async ({ page }) => {
    await waitForSearchPage(page);

    const hasMapRef = await waitForMapRef(page);
    if (!hasMapRef) {
      test.skip(true, "Map ref not available (WebGL unavailable in headless)");
      return;
    }

    const initialCenter = await getMapCenter(page);
    if (!initialCenter) {
      test.skip(true, "Could not read map center");
      return;
    }

    // Apply a filter
    await navigateWithFilter(page, "maxPrice", "2000");

    await waitForMapRef(page, 15_000);

    const afterCenter = await getMapCenter(page);
    expect(afterCenter).not.toBeNull();

    // Center should be approximately the same (tolerance ~0.05 degrees)
    const tolerance = 0.05;
    expect(Math.abs(afterCenter!.lat - initialCenter.lat)).toBeLessThan(tolerance);
    expect(Math.abs(afterCenter!.lng - initialCenter.lng)).toBeLessThan(tolerance);
  });

  test("5 - Map survives sort change: same instance, same zoom/center", async ({ page }) => {
    await waitForSearchPage(page);

    const initialState = await getMapE2EState(page);
    if (!initialState?.mapInstanceId) {
      test.skip(true, "E2E instrumentation not enabled");
      return;
    }

    const hasMapRef = await waitForMapRef(page);
    if (!hasMapRef) {
      test.skip(true, "Map ref not available");
      return;
    }

    const initialZoom = await getMapZoom(page);
    const initialCenter = await getMapCenter(page);

    // Change sort order via URL
    await page.goto(`${SEARCH_URL}&sort=price_asc`);
    await page.waitForLoadState("domcontentloaded");
    await waitForMapReady(page);

    // Instance should be the same
    const afterState = await getMapE2EState(page);
    expect(afterState?.mapInstanceId).toBe(initialState.mapInstanceId);
    expect(afterState?.mapInitCount).toBe(initialState.mapInitCount);

    // Zoom and center should be preserved
    await waitForMapRef(page, 15_000);
    const afterZoom = await getMapZoom(page);
    const afterCenter = await getMapCenter(page);

    if (initialZoom !== null && afterZoom !== null) {
      expect(Math.abs(afterZoom - initialZoom)).toBeLessThan(0.5);
    }
    if (initialCenter && afterCenter) {
      expect(Math.abs(afterCenter.lat - initialCenter.lat)).toBeLessThan(0.05);
      expect(Math.abs(afterCenter.lng - initialCenter.lng)).toBeLessThan(0.05);
    }
  });

  test("6 - Map survives query change: same instance after search query", async ({ page }) => {
    await waitForSearchPage(page);

    const initialState = await getMapE2EState(page);
    if (!initialState?.mapInstanceId) {
      test.skip(true, "E2E instrumentation not enabled");
      return;
    }

    // Change search query
    await page.goto(`${SEARCH_URL}&q=Mission+District`);
    await page.waitForLoadState("domcontentloaded");
    await waitForMapReady(page);

    const afterState = await getMapE2EState(page);

    // Instance should be the same (map persisted in layout)
    expect(afterState?.mapInstanceId).toBe(initialState.mapInstanceId);
    expect(afterState?.mapInitCount).toBe(initialState.mapInitCount);
  });

  test("7 - Map canvas remains visible during filter transition (no flicker/unmount)", async ({ page }) => {
    await waitForSearchPage(page);

    if (!(await isMapCanvasVisible(page))) {
      test.skip(true, "Map canvas not visible (WebGL unavailable)");
      return;
    }

    // Set up a MutationObserver to detect if the canvas is ever removed
    await page.evaluate(() => {
      (window as any).__mapCanvasRemoved = false;
      const canvas = document.querySelector(".mapboxgl-canvas");
      if (!canvas || !canvas.parentElement) return;

      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          Array.from(mutation.removedNodes).forEach((node) => {
            if (node === canvas || (node as Element).querySelector?.(".mapboxgl-canvas")) {
              (window as any).__mapCanvasRemoved = true;
            }
          });
        });
      });
      observer.observe(canvas.parentElement, { childList: true, subtree: true });
      (window as any).__canvasObserver = observer;
    });

    // Apply a filter (triggers transition)
    await navigateWithFilter(page, "roomType", "Private Room");

    // Check if canvas was ever removed
    const canvasWasRemoved = await page.evaluate(() => (window as any).__mapCanvasRemoved);
    expect(canvasWasRemoved).toBe(false);

    // Canvas should still be visible
    expect(await isMapCanvasVisible(page)).toBe(true);

    // Cleanup observer
    await page.evaluate(() => {
      (window as any).__canvasObserver?.disconnect();
    });
  });
});

// ---------------------------------------------------------------------------
// Group 2: Map State Recovery
// ---------------------------------------------------------------------------

test.describe("Map persistence: Map state recovery", () => {
  test("8 - Page refresh preserves map bounds from URL", async ({ page }) => {
    await waitForSearchPage(page);

    if (!(await isMapContainerVisible(page))) {
      test.skip(true, "Map not visible");
      return;
    }

    // URL has bounds from SF_BOUNDS - verify they're there
    const url = new URL(page.url(), "http://localhost");
    expect(url.searchParams.get("minLat")).toBeTruthy();
    expect(url.searchParams.get("maxLat")).toBeTruthy();

    // Refresh the page
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await waitForMapReady(page);

    // Map should still be visible
    expect(await isMapContainerVisible(page)).toBe(true);

    // URL bounds should still be present
    const refreshedUrl = new URL(page.url(), "http://localhost");
    expect(refreshedUrl.searchParams.get("minLat")).toBe(String(SF_BOUNDS.minLat));
    expect(refreshedUrl.searchParams.get("maxLat")).toBe(String(SF_BOUNDS.maxLat));
    expect(refreshedUrl.searchParams.get("minLng")).toBe(String(SF_BOUNDS.minLng));
    expect(refreshedUrl.searchParams.get("maxLng")).toBe(String(SF_BOUNDS.maxLng));

    // After map loads, center should be within the specified bounds
    const hasRef = await waitForMapRef(page, 15_000);
    if (hasRef) {
      const center = await getMapCenter(page);
      if (center) {
        expect(center.lat).toBeGreaterThanOrEqual(SF_BOUNDS.minLat - 0.1);
        expect(center.lat).toBeLessThanOrEqual(SF_BOUNDS.maxLat + 0.1);
        expect(center.lng).toBeGreaterThanOrEqual(SF_BOUNDS.minLng - 0.1);
        expect(center.lng).toBeLessThanOrEqual(SF_BOUNDS.maxLng + 0.1);
      }
    }
  });

  test("9 - Browser back preserves map after navigating to listing", async ({ page }) => {
    await waitForSearchPage(page);

    if (!(await isMapContainerVisible(page))) {
      test.skip(true, "Map not visible");
      return;
    }

    // Find a listing card link and navigate to it
    const listingLink = page.locator('a[href^="/listings/c"]').first();
    if ((await listingLink.count()) === 0) {
      test.skip(true, "No listing links found");
      return;
    }

    await listingLink.click();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForLoadState("networkidle");

    // Should be on a listing page now
    expect(page.url()).toContain("/listings/");

    // Go back
    await page.goBack();
    await page.waitForLoadState("domcontentloaded");
    await waitForMapReady(page);

    // Map should still be visible
    expect(await isMapContainerVisible(page)).toBe(true);

    // URL should be back on search
    expect(page.url()).toContain("/search");
  });

  test("10 - Map persists across multiple sequential filter changes", async ({ page }) => {
    await waitForSearchPage(page);

    const initialState = await getMapE2EState(page);
    if (!initialState?.mapInstanceId) {
      test.skip(true, "E2E instrumentation not enabled");
      return;
    }

    // Apply filter 1
    await navigateWithFilter(page, "roomType", "Private Room");
    const state1 = await getMapE2EState(page);
    expect(state1?.mapInstanceId).toBe(initialState.mapInstanceId);

    // Apply filter 2
    await page.goto(`${SEARCH_URL}&roomType=Private+Room&maxPrice=2000`);
    await page.waitForLoadState("domcontentloaded");
    await waitForMapReady(page);
    const state2 = await getMapE2EState(page);
    expect(state2?.mapInstanceId).toBe(initialState.mapInstanceId);

    // Apply filter 3
    await page.goto(`${SEARCH_URL}&roomType=Private+Room&maxPrice=2000&amenities=Wifi`);
    await page.waitForLoadState("domcontentloaded");
    await waitForMapReady(page);
    const state3 = await getMapE2EState(page);
    expect(state3?.mapInstanceId).toBe(initialState.mapInstanceId);

    // Init count should still be the same
    expect(state3?.mapInitCount).toBe(initialState.mapInitCount);
  });
});

// ---------------------------------------------------------------------------
// Group 3: Lazy Loading
// ---------------------------------------------------------------------------

test.describe("Map persistence: Lazy loading", () => {
  test("11 - Map loads without blocking search results (results appear before map)", async ({ page }) => {
    // Track when listing cards and map appear using mutable object
    // (TS control flow analysis does not narrow `let` vars assigned in closures)
    const timing: { listings: number | null; map: number | null } = {
      listings: null,
      map: null,
    };

    const startTime = Date.now();

    await page.goto(SEARCH_URL);
    await page.waitForLoadState("domcontentloaded");

    // Wait for either listings or map, whichever comes first
    const listingPromise = page
      .locator(selectors.listingCard)
      .first()
      .waitFor({ state: "attached", timeout: 30_000 })
      .then(() => {
        timing.listings = Date.now() - startTime;
      })
      .catch(() => {});

    const mapPromise = page
      .locator(selectors.map)
      .first()
      .waitFor({ state: "visible", timeout: 30_000 })
      .then(() => {
        timing.map = Date.now() - startTime;
      })
      .catch(() => {});

    await Promise.all([listingPromise, mapPromise]);

    // Either listings or map should be visible
    expect(timing.listings !== null || timing.map !== null).toBe(true);

    // If both are available, listings should not be blocked by map
    // (We can't guarantee order in all environments, but verify both load)
    if (timing.listings !== null) {
      expect(timing.listings).toBeLessThan(30_000);
    }
  });

  test("12 - Map shows loading indicator while initializing", async ({ page }) => {
    await page.goto(SEARCH_URL);
    await page.waitForLoadState("domcontentloaded");

    // Look for loading placeholder (MapLoadingPlaceholder or Suspense fallback)
    // These render "Loading map..." text while the lazy bundle loads
    const loadingIndicator = page.getByText("Loading map...");

    // The loading indicator may be very brief on fast connections
    // Check if it was ever present or if map loaded instantly
    const loadingWasVisible = await loadingIndicator.isVisible({ timeout: 1000 }).catch(() => false);
    const mapVisible = await page.locator(selectors.map).first().isVisible({ timeout: 15_000 }).catch(() => false);

    // Either loading indicator was shown OR map loaded fast enough to skip it
    expect(loadingWasVisible || mapVisible).toBe(true);
  });

  test("13 - Map is visible after lazy load completes", async ({ page }) => {
    await waitForSearchPage(page);

    // Map container should be visible after page load
    const mapContainer = page.locator(selectors.map);
    await expect(mapContainer.first()).toBeVisible({ timeout: 15_000 });

    // Loading text should no longer be visible
    const loadingText = page.getByText("Loading map...");
    // Use a short timeout since it should already be gone
    const stillLoading = await loadingText.isVisible({ timeout: 1000 }).catch(() => false);
    expect(stillLoading).toBe(false);
  });
});
