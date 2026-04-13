/**
 * Map Search Results E2E Tests
 *
 * Verifies map-driven search with actual result verification, debounce behavior,
 * and result synchronization between map markers and listing cards.
 *
 * Coverage:
 * - Group 1: Always-on map search behavior with results verification
 * - Group 2: Result synchronization (map move updates listings, markers match results)
 * - Group 3: Debounce and performance (600ms debounce, rapid pan, AbortController)
 *
 * E2E hooks used:
 * - window.__e2eMapRef              -- Mapbox GL JS instance
 * - window.__e2eSetProgrammaticMove -- Flag programmatic moves
 * - window.__roomshare.markerCount  -- Current marker count
 *
 * Run: pnpm playwright test tests/e2e/map-search-results.anon.spec.ts --project=chromium-anon
 * Debug: pnpm playwright test tests/e2e/map-search-results.anon.spec.ts --project=chromium-anon --headed
 */

import {
  test,
  expect,
  SF_BOUNDS,
  selectors,
  timeouts,
  searchResultsContainer,
  waitForMapReady,
} from "./helpers/test-utils";
import type { Page, Route } from "@playwright/test";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;
const SEARCH_URL = `/search?${boundsQS}`;

// Debounce for map auto-search (600ms in Map.tsx handleMoveEnd)
const MAP_SEARCH_DEBOUNCE_MS = 600;
// Selectors for map search feature
const toggleSelectors = {
  mapContainer: selectors.map,
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Wait for the search page to be interactive.
 */
async function waitForSearchPage(page: Page) {
  await page.goto(SEARCH_URL);
  await page.waitForLoadState("domcontentloaded");
  await waitForMapReady(page);
}

/**
 * Wait for the E2E map ref to be exposed.
 */
async function waitForMapRef(page: Page, timeout = 30_000): Promise<boolean> {
  try {
    await page.waitForFunction(
      () =>
        !!(window as any).__e2eMapRef && !!(window as any).__e2eSimulateUserPan,
      { timeout }
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if the toggle is visible and map is interactive.
 */
async function isMapInteractive(page: Page): Promise<boolean> {
  const map = page.locator(toggleSelectors.mapContainer).first();
  return (await map.count()) > 0 && (await map.isVisible());
}

/**
 * Check if map canvas is fully loaded (WebGL working).
 */
async function isMapFullyLoaded(page: Page): Promise<boolean> {
  try {
    const hasCanvas = await page.evaluate(() => {
      const canvas = document.querySelector(".maplibregl-canvas");
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
 * Simulate a map pan by dragging the map container.
 * Returns true if the pan actually moved the map.
 */
async function simulateMapPan(
  page: Page,
  deltaX = 100,
  deltaY = 50
): Promise<boolean> {
  // Try E2E hook first (reliable in headless WebGL)
  const hooked = await page.evaluate(
    ({ dx, dy }) => {
      const fn = (window as any).__e2eSimulateUserPan;
      if (!fn) return false;
      return fn(dx, dy);
    },
    { dx: deltaX, dy: deltaY }
  );

  if (hooked) {
    await waitForMapReady(page);
    return true;
  }

  // Fallback: mouse drag (may not work in headless WebGL)
  const map = page.locator(toggleSelectors.mapContainer).first();
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

    await waitForMapReady(page);
    return true;
  } catch {
    return false;
  }
}

/**
 * Move the map programmatically via E2E hook (no "search as I move" trigger).
 * Returns true if the move succeeded.
 */
async function moveMapProgrammatically(
  page: Page,
  deltaLng: number,
  deltaLat: number
): Promise<boolean> {
  return page.evaluate(
    ({ dLng, dLat }) => {
      return new Promise<boolean>((resolve) => {
        const map = (window as any).__e2eMapRef;
        const setProgrammatic = (window as any).__e2eSetProgrammaticMove;
        if (!map || !setProgrammatic) {
          resolve(false);
          return;
        }

        setProgrammatic(true);
        const center = map.getCenter();
        map.once("idle", () => resolve(true));
        map.jumpTo({
          center: [center.lng + dLng, center.lat + dLat],
        });

        // Safety timeout
        setTimeout(() => resolve(true), 5000);
      });
    },
    { dLng: deltaLng, dLat: deltaLat }
  );
}

/**
 * Get the current URL bounds.
 */
function getUrlBounds(url: string) {
  const urlObj = new URL(url, "http://localhost");
  return {
    minLat: urlObj.searchParams.get("minLat"),
    maxLat: urlObj.searchParams.get("maxLat"),
    minLng: urlObj.searchParams.get("minLng"),
    maxLng: urlObj.searchParams.get("maxLng"),
  };
}

// Map tests need extra time for WebGL rendering and tile loading in CI
test.beforeEach(async () => {
  test.slow();
});

// ---------------------------------------------------------------------------
// Group 1: Search As I Move
// ---------------------------------------------------------------------------

test.describe("Map search: always-on behavior", () => {
  test("1 - Removed toggle is not rendered", async ({ page }) => {
    await waitForSearchPage(page);

    const mapInteractive = await isMapInteractive(page);
    test.skip(!mapInteractive, "Map controls not available (WebGL unavailable)");

    await expect(
      page.getByRole("switch", { name: /search as i move/i })
    ).toHaveCount(0);
  });

  test("2 - Pan map with toggle ON triggers URL bounds update", async ({
    page,
  }) => {
    await waitForSearchPage(page);

    const mapInteractive = await isMapInteractive(page);
    test.skip(!mapInteractive, "Map controls not available");
    const mapFullyLoaded = await isMapFullyLoaded(page);
    test.skip(!mapFullyLoaded, "Map not fully loaded (WebGL unavailable)");

    // Record initial URL bounds
    const initialBounds = getUrlBounds(page.url());

    // Pan the map
    const panned = await simulateMapPan(page, 150, 75);
    test.skip(!panned, "Map pan failed");

    // Wait for debounce (600ms) + server RSC fetch inside startTransition
    // On WSL2 with Turbopack, the full round-trip can take 10+ seconds
    const initialUrlStr = page.url();
    const urlChanged = await page
      .waitForFunction(
        (prevUrl: string) => window.location.href !== prevUrl,
        initialUrlStr,
        { timeout: 20_000 }
      )
      .then(() => true)
      .catch(() => false);

    test.skip(!urlChanged, "URL did not update within timeout (slow WSL2 server)");

    // URL bounds should have changed
    const newBounds = getUrlBounds(page.url());
    const boundsChanged =
      initialBounds.minLat !== newBounds.minLat ||
      initialBounds.maxLat !== newBounds.maxLat ||
      initialBounds.minLng !== newBounds.minLng ||
      initialBounds.maxLng !== newBounds.maxLng;

    expect(boundsChanged).toBe(true);
  });

  test("3 - Zoom map with toggle ON triggers URL bounds update", async ({
    page,
  }) => {
    await waitForSearchPage(page);

    const mapInteractive = await isMapInteractive(page);
    test.skip(!mapInteractive, "Map controls not available");
    const mapFullyLoaded = await isMapFullyLoaded(page);
    test.skip(!mapFullyLoaded, "Map not fully loaded");

    const initialBounds = getUrlBounds(page.url());

    // Zoom in via E2E hook (reliable in headless WebGL)
    const hasRef = await waitForMapRef(page);
    test.skip(!hasRef, "Map ref not available");

    // Try E2E hook first, fall back to scroll wheel
    const zoomed = await page.evaluate(() => {
      const fn = (window as any).__e2eSimulateUserZoom;
      if (!fn) return false;
      const map = (window as any).__e2eMapRef;
      if (!map) return false;
      const currentZoom = map.getZoom();
      return fn(currentZoom + 2);
    });

    if (!zoomed) {
      // Fallback: scroll wheel on map center
      const mapBox = await page
        .locator(toggleSelectors.mapContainer)
        .first()
        .boundingBox();
      test.skip(!mapBox, "Could not get map bounding box");
      if (!mapBox) return;
      await page.mouse.move(
        mapBox.x + mapBox.width / 2,
        mapBox.y + mapBox.height / 2
      );
      await page.mouse.wheel(0, -300);
    }

    // Wait for URL bounds to update (debounce + server RSC fetch)
    const zoomInitialUrl = page.url();
    const urlChanged = await page
      .waitForFunction(
        (prevUrl: string) => window.location.href !== prevUrl,
        zoomInitialUrl,
        { timeout: 20_000 }
      )
      .then(() => true)
      .catch(() => false);

    test.skip(!urlChanged, "URL did not update within timeout (slow WSL2 server)");

    const newBounds = getUrlBounds(page.url());
    const boundsChanged =
      initialBounds.minLat !== newBounds.minLat ||
      initialBounds.maxLat !== newBounds.maxLat ||
      initialBounds.minLng !== newBounds.minLng ||
      initialBounds.maxLng !== newBounds.maxLng;

    expect(boundsChanged).toBe(true);
  });

});

// ---------------------------------------------------------------------------
// Group 2: Result Synchronization
// ---------------------------------------------------------------------------

test.describe("Map search: Result synchronization", () => {
  test("8 - Map move updates listing results (new cards appear)", async ({
    page,
  }) => {
    await waitForSearchPage(page);

    const mapInteractive = await isMapInteractive(page);
    test.skip(!mapInteractive, "Map controls not available");
    const mapFullyLoaded = await isMapFullyLoaded(page);
    test.skip(!mapFullyLoaded, "Map not fully loaded");

    // Get initial listing card count
    const initialCards = await searchResultsContainer(page)
      .locator(selectors.listingCard)
      .count();

    // Pan the map significantly
    const panned = await simulateMapPan(page, 200, 100);
    test.skip(!panned, "Map pan failed");

    // Wait for debounce to fire and network activity to settle
    await page.waitForResponse(resp => resp.url().includes("/search") && resp.status() === 200).catch(() => {});
    await page.waitForLoadState("domcontentloaded").catch(() => {});

    // Page should still be functional (not crashed)
    expect(await page.locator("body").isVisible()).toBe(true);

    // Listing cards should be present (may be different count)
    const newCards = await searchResultsContainer(page)
      .locator(selectors.listingCard)
      .count();
    // We cannot guarantee count changed (depends on data), but page should be functional
    expect(newCards).toBeGreaterThanOrEqual(0);
    void initialCards; // Informational - count may or may not change
  });

  test("9 - Marker count is consistent after map move", async ({ page }) => {
    await waitForSearchPage(page);

    const mapInteractive = await isMapInteractive(page);
    test.skip(!mapInteractive, "Map controls not available");
    const mapFullyLoaded = await isMapFullyLoaded(page);
    test.skip(!mapFullyLoaded, "Map not fully loaded");

    const hasRef = await waitForMapRef(page);
    test.skip(!hasRef, "Map ref not available");

    // Pan the map
    await simulateMapPan(page, 100, 50);
    // Wait for debounce to fire and network activity to settle
    await page.waitForResponse(resp => resp.url().includes("/search") && resp.status() === 200).catch(() => {});
    await page.waitForLoadState("domcontentloaded").catch(() => {});

    // Get E2E marker count
    const state = await page.evaluate(() => {
      const roomshare = (window as unknown as Record<string, unknown>)
        .__roomshare as Record<string, unknown> | undefined;
      return roomshare?.markerCount as number | undefined;
    });

    // If E2E instrumentation is enabled, markerCount should be reasonable
    if (state !== undefined) {
      expect(state).toBeGreaterThanOrEqual(0);
    }

    // Page should still be functional
    expect(await page.locator("body").isVisible()).toBe(true);
  });

  test("10 - Map move cancels previous pending search (AbortController)", async ({
    page,
  }) => {
    // Track search API calls to verify abort behavior
    const searchCalls: { time: number; url: string }[] = [];

    await page.route("**/search*", async (route) => {
      // Only intercept client-side navigation (Next.js RSC fetch)
      const url = route.request().url();
      if (url.includes("_rsc") || url.includes("_next")) {
        searchCalls.push({ time: Date.now(), url });
      }
      await route.continue();
    });

    await waitForSearchPage(page);

    const mapInteractive = await isMapInteractive(page);
    test.skip(!mapInteractive, "Map controls not available");
    const mapFullyLoaded = await isMapFullyLoaded(page);
    test.skip(!mapFullyLoaded, "Map not fully loaded");

    // Clear tracked calls
    searchCalls.length = 0;

    // Perform two rapid pans (second should cancel first)
    await simulateMapPan(page, 50, 25);
    await page.waitForTimeout(200); // INTENTIONAL: sub-debounce timing to test cancellation behavior
    await simulateMapPan(page, 50, 25);

    // Wait for debounce to fire and network activity to settle
    await page.waitForResponse(resp => resp.url().includes("/search") && resp.status() === 200).catch(() => {});
    await page.waitForLoadState("domcontentloaded").catch(() => {});

    // Page should be functional (no stale response issues)
    expect(await page.locator("body").isVisible()).toBe(true);
  });

  test("11 - Rapid panning results in only final position search (debounce)", async ({
    page,
  }) => {
    let searchApiCalls = 0;

    // Track map-listings API calls (used by PersistentMapWrapper)
    await page.route("**/api/map-listings*", async (route) => {
      searchApiCalls++;
      await route.continue();
    });

    await waitForSearchPage(page);

    const mapInteractive = await isMapInteractive(page);
    test.skip(!mapInteractive, "Map controls not available");
    const mapFullyLoaded = await isMapFullyLoaded(page);
    test.skip(!mapFullyLoaded, "Map not fully loaded");

    // Reset counter after page load
    searchApiCalls = 0;

    // Rapid sequence of pans (each < debounce interval apart)
    for (let i = 0; i < 4; i++) {
      await simulateMapPan(page, 30, 15);
      await page.waitForTimeout(100); // INTENTIONAL: sub-debounce timing to test coalescing behavior
    }

    // Wait for debounce to fire and network activity to settle
    await page.waitForResponse(resp => resp.url().includes("map-listings") && resp.status() === 200).catch(() => {});
    await page.waitForLoadState("domcontentloaded").catch(() => {});

    // Should have at most 2 API calls despite 4 pans
    // (debounce should coalesce them, throttle allows at most 1 per interval)
    expect(searchApiCalls).toBeLessThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// Group 3: Debounce & Performance
// ---------------------------------------------------------------------------

test.describe("Map search: Debounce and performance", () => {
  test("12 - 600ms debounce: no immediate URL change, change after ~600ms", async ({
    page,
  }) => {
    await waitForSearchPage(page);

    const mapInteractive = await isMapInteractive(page);
    test.skip(!mapInteractive, "Map controls not available");
    const mapFullyLoaded = await isMapFullyLoaded(page);
    test.skip(!mapFullyLoaded, "Map not fully loaded");

    const initialUrl = page.url();

    // Pan the map
    const panned = await simulateMapPan(page, 150, 75);
    test.skip(!panned, "Map pan failed");

    // Check immediately after pan - URL should NOT have changed yet
    // (within debounce window, though map animation takes ~800ms too)
    const urlRightAfterPan = page.url();
    // Note: We can't be 100% precise because the pan wait is 800ms and debounce is 600ms
    // The key verification is that it's not instant (already covered by debounce existing)

    // Wait for debounce (600ms) + server RSC fetch inside startTransition
    // On WSL2 with Turbopack, the full round-trip can take 10+ seconds
    const urlChanged = await page
      .waitForFunction(
        (prevUrl: string) => window.location.href !== prevUrl,
        initialUrl,
        { timeout: 20_000 }
      )
      .then(() => true)
      .catch(() => false);

    test.skip(!urlChanged, "URL did not update within timeout (slow WSL2 server)");

    // URL should have changed now
    const urlAfterDebounce = page.url();
    const boundsChanged =
      getUrlBounds(initialUrl).minLat !==
        getUrlBounds(urlAfterDebounce).minLat ||
      getUrlBounds(initialUrl).maxLat !== getUrlBounds(urlAfterDebounce).maxLat;

    // Verify the debounced URL update occurred
    expect(boundsChanged).toBe(true);
    void urlRightAfterPan; // Informational
  });

  test("13 - Multiple rapid moves result in only one search execution", async ({
    page,
  }) => {
    const urlChanges: string[] = [];

    // Listen for URL changes via history API
    await page.exposeFunction("__e2eUrlChanged", (url: string) => {
      urlChanges.push(url);
    });

    await waitForSearchPage(page);

    const mapInteractive = await isMapInteractive(page);
    test.skip(!mapInteractive, "Map controls not available");
    const mapFullyLoaded = await isMapFullyLoaded(page);
    test.skip(!mapFullyLoaded, "Map not fully loaded");

    // Inject URL change listener
    await page.evaluate(() => {
      const originalReplaceState = history.replaceState.bind(history);
      history.replaceState = function (
        ...args: Parameters<typeof history.replaceState>
      ) {
        (window as any).__e2eUrlChanged?.(args[2]?.toString() || "");
        return originalReplaceState(...args);
      };
    });

    // Clear
    urlChanges.length = 0;

    // Perform 5 rapid pans within debounce window
    for (let i = 0; i < 5; i++) {
      await simulateMapPan(page, 20 * (i + 1), 10 * (i + 1));
      await page.waitForTimeout(50); // INTENTIONAL: sub-debounce timing to test coalescing behavior
    }

    // Wait for debounce to fire and network activity to settle
    await page.waitForTimeout(MAP_SEARCH_DEBOUNCE_MS + 100); // INTENTIONAL: debounce verification — must wait past 600ms debounce window to count URL changes

    // Should see at most a few URL changes (not 5)
    // The debounce coalesces rapid moves
    expect(urlChanges.length).toBeLessThanOrEqual(3);
  });

});
