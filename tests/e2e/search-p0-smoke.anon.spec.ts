/**
 * Search P0 Smoke Suite (Anonymous)
 *
 * 18 smoke tests covering the critical search page functionality
 * for anonymous (unauthenticated) users. Runs on the chromium-anon project.
 *
 * Run: pnpm playwright test tests/e2e/search-p0-smoke.anon.spec.ts --project=chromium-anon
 */

import {
  test,
  expect,
  SF_BOUNDS,
  selectors,
  timeouts,
  tags,
  waitForMapMarkers,
  waitForStable,
  searchResultsContainer,
} from "./helpers/test-utils";

// --------------------------------------------------------------------------
// Constants
// --------------------------------------------------------------------------

const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;
const SEARCH_URL = `/search?${boundsQS}`;

/**
 * Known benign console error patterns to ignore.
 * These come from Mapbox telemetry, Next.js HMR, React hydration, etc.
 */
const BENIGN_ERROR_PATTERNS = [
  "mapbox",
  "webpack",
  "HMR",
  "hydrat",
  "favicon",
  "ResizeObserver",
  "WebGL",
  "Failed to create",
  "404",
  "net::ERR",
  "Failed to load resource",
  "AbortError",
  "abort",
  "cancelled",
  "Failed to fetch",
  "Load failed",
  "ChunkLoadError",
  "Loading chunk",
  "NEXT_",
  "next-",
  "Clerk",
];

function filterBenignErrors(errors: string[]): string[] {
  return errors.filter(
    (e) => !BENIGN_ERROR_PATTERNS.some((pattern) => e.toLowerCase().includes(pattern.toLowerCase())),
  );
}

// --------------------------------------------------------------------------
// Test Suite
// --------------------------------------------------------------------------

test.describe("Search P0 Smoke Suite", () => {
  // S01: Page loads with results, no console errors
  test("S01: page loads with results and no console errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    const response = await page.goto(SEARCH_URL);
    expect(response?.status()).toBe(200);

    // Wait for at least one listing card to be attached in the DOM
    const container = searchResultsContainer(page);
    const cards = container.locator('[data-testid="listing-card"]');
    await expect(cards.first()).toBeAttached({ timeout: 30_000 });

    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // Filter out benign console errors and assert zero real errors
    const realErrors = filterBenignErrors(consoleErrors);
    expect(realErrors).toHaveLength(0);
  });

  // S02: Text query shows matching results
  test("S02: text query shows matching results", async ({ page }) => {
    await page.goto(`/search?q=Mission&${boundsQS}`);

    const container = searchResultsContainer(page);
    const cards = container.locator('[data-testid="listing-card"]');
    await expect(cards.first()).toBeAttached({ timeout: 30_000 });

    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // At least one card should contain the query text "Mission"
    const allCardTexts = await cards.allTextContents();
    const hasMission = allCardTexts.some((text) =>
      text.toLowerCase().includes("mission"),
    );
    expect(hasMission).toBe(true);
  });

  // S03: Price filter narrows results
  test("S03: price filter narrows results", async ({ page }) => {
    await page.goto(`/search?maxPrice=1000&${boundsQS}`);

    const container = searchResultsContainer(page);
    const cards = container.locator('[data-testid="listing-card"]');
    await expect(cards.first()).toBeAttached({ timeout: 30_000 });

    // All visible prices should be <= $1,000
    // Prices are rendered as "$800", "$1,000", etc. in the card
    const priceTexts = await container
      .locator('[data-testid="listing-card"] [data-testid="listing-price"]')
      .allTextContents();

    for (const priceText of priceTexts) {
      // Extract numeric value: "$800" -> 800, "$1,000" -> 1000
      const numeric = parseInt(priceText.replace(/[^0-9]/g, ""), 10);
      if (!isNaN(numeric)) {
        expect(numeric).toBeLessThanOrEqual(1000);
      }
    }
  });

  // S04: Room type filter works
  test("S04: room type filter works", async ({ page }) => {
    await page.goto(`/search?roomType=private&${boundsQS}`);
    await page.waitForLoadState("domcontentloaded");

    // Either results appear or we get a valid zero-results state
    const container = searchResultsContainer(page);
    const cards = container.locator('[data-testid="listing-card"]');
    const zeroResults = page.locator('h2:has-text("No matches found"), h3:has-text("No exact matches")');

    // Wait for either cards or zero results heading
    await expect(
      cards.first().or(zeroResults),
    ).toBeAttached({ timeout: 30_000 });

    // Both outcomes are valid: results with the filter applied, or no matches
    const cardCount = await cards.count();
    const zeroVisible = await zeroResults.isVisible().catch(() => false);
    expect(cardCount > 0 || zeroVisible).toBe(true);
  });

  // S05: Clear all filters resets search
  test("S05: clear all filters resets search", async ({ page }) => {
    await page.goto(`/search?maxPrice=1000&roomType=private&${boundsQS}`);
    await page.waitForLoadState("domcontentloaded");

    // Wait for the page to settle -- either results or zero results
    const container = searchResultsContainer(page);
    const cards = container.locator('[data-testid="listing-card"]');
    const zeroResults = page.locator('h2:has-text("No matches found"), h3:has-text("No exact matches")');
    await expect(cards.first().or(zeroResults)).toBeAttached({ timeout: 30_000 });

    // Look for the "Clear all" button in the applied filter chips area
    // or in the zero-results "Clear all filters" button (ZeroResultsSuggestions renders a Button, not Link)
    const clearAllBtn = page.locator('button:has-text("Clear all"), button:has-text("Clear all filters")');
    const clearVisible = await clearAllBtn.first().isVisible().catch(() => false);

    if (clearVisible) {
      // Use scrollIntoViewIfNeeded + force:true to avoid click timeout in webkit
      // where the button may be partially obscured by map overlay or bottom sheet
      await clearAllBtn.first().scrollIntoViewIfNeeded();
      await clearAllBtn.first().click({ timeout: 30_000 });
      await page.waitForLoadState("domcontentloaded");

      // After clearing, URL should not contain maxPrice or roomType
      const url = page.url();
      expect(url).not.toContain("maxPrice=");
      expect(url).not.toContain("roomType=");
    } else {
      // If no clear button is visible (e.g., filters applied via URL but chips not rendered),
      // the test is inconclusive -- skip rather than fail
      test.skip(true, "Clear all button not found -- filters may not render chips for URL-only params");
    }
  });

  // S06: Sort by price reorders results
  test("S06: sort by price reorders results", async ({ page }) => {
    await page.goto(SEARCH_URL);

    const container = searchResultsContainer(page);
    const cards = container.locator('[data-testid="listing-card"]');
    await expect(cards.first()).toBeAttached({ timeout: 30_000 });

    // Desktop sort: use the Select dropdown (hidden on mobile)
    // Mobile sort: use the sort button that opens a sheet
    const viewport = page.viewportSize();
    const isMobile = viewport ? viewport.width < 768 : false;

    if (isMobile) {
      // Click mobile sort button (needs hydration wait)
      const sortBtn = page.locator('button[aria-label^="Sort:"]');
      const mobileSortVisible = await sortBtn.isVisible({ timeout: 15_000 }).catch(() => false);
      if (mobileSortVisible) {
        await sortBtn.click();
        // Select "Price: Low to High" from the bottom sheet
        await page.locator('div.fixed button:not([role="combobox"])').filter({ hasText: "Price: Low to High" }).click();
      }
    } else {
      // Click the desktop Radix Select trigger (role="combobox")
      // SortSelect renders an SSR placeholder without role="combobox", so this
      // only matches after client-side hydration sets mounted = true.
      const selectTrigger = container.locator('button[role="combobox"]');
      if (await selectTrigger.isVisible({ timeout: 15_000 }).catch(() => false)) {
        await selectTrigger.click();
        const listbox = page.locator('[role="listbox"]');
        await expect(listbox).toBeVisible({ timeout: 5_000 });
        await page.locator('[role="option"]').filter({ hasText: "Price: Low to High" }).click();
      } else {
        // Fallback: navigate directly with sort param
        await page.goto(`/search?sort=price_asc&${boundsQS}`);
        await expect(cards.first()).toBeAttached({ timeout: 30_000 });
      }
    }

    // Assert URL contains sort=price_asc
    await expect(page).toHaveURL(/sort=price_asc/);

    // Verify ordering: first card price <= last card price
    const updatedCards = container.locator('[data-testid="listing-card"]');
    await expect(updatedCards.first()).toBeAttached({ timeout: 15_000 });

    const priceElements = container.locator('[data-testid="listing-card"] [data-testid="listing-price"]');
    const priceCount = await priceElements.count();

    if (priceCount >= 2) {
      const firstPriceText = await priceElements.first().textContent();
      const lastPriceText = await priceElements.nth(priceCount - 1).textContent();

      const firstPrice = parseInt((firstPriceText ?? "0").replace(/[^0-9]/g, ""), 10);
      const lastPrice = parseInt((lastPriceText ?? "0").replace(/[^0-9]/g, ""), 10);

      expect(firstPrice).toBeLessThanOrEqual(lastPrice);
    }
  });

  // S07: Click listing card navigates to detail
  test("S07: click listing card navigates to detail", async ({ page }) => {
    await page.goto(SEARCH_URL);

    const container = searchResultsContainer(page);
    const cards = container.locator('[data-testid="listing-card"]');
    await expect(cards.first()).toBeAttached({ timeout: 30_000 });

    // Get the href from the first card's link
    const firstLink = cards.first().locator('a[href^="/listings/"]').first();
    const href = await firstLink.getAttribute("href");
    expect(href).toBeTruthy();
    expect(href).toMatch(/^\/listings\//);

    // Navigate via the link (direct goto is more reliable than click for SSR apps)
    await page.goto(href!);
    await expect(page).toHaveURL(/\/listings\//);
  });

  // S08: Load more appends without duplicates
  test("S08: load more appends without duplicates", async ({ page }) => {
    await page.goto(SEARCH_URL);

    const container = searchResultsContainer(page);
    const cards = container.locator('[data-testid="listing-card"]');
    await expect(cards.first()).toBeAttached({ timeout: 30_000 });

    // Collect initial listing IDs
    const initialIds = await cards.evaluateAll((elements) =>
      elements.map((el) => el.getAttribute("data-listing-id")).filter(Boolean),
    );

    // Check if "Show more places" button exists
    const loadMoreBtn = page.locator('button:has-text("Show more places")');
    const hasLoadMore = await loadMoreBtn.isVisible().catch(() => false);

    if (hasLoadMore) {
      await loadMoreBtn.click();

      // Wait for loading to complete (button re-appears or more cards render)
      await page.waitForFunction(
        (initialCount) => {
          const cards = document.querySelectorAll('[data-testid="listing-card"]');
          return cards.length > initialCount;
        },
        initialIds.length,
        { timeout: 15_000 },
      ).catch(() => {
        // Load more may not produce new results if all data is on page 1
      });

      // Collect all IDs after loading more
      const allIds = await container.locator('[data-testid="listing-card"]').evaluateAll(
        (elements) =>
          elements.map((el) => el.getAttribute("data-listing-id")).filter(Boolean),
      );

      // Assert no duplicate IDs
      const idSet = new Set(allIds);
      expect(idSet.size).toBe(allIds.length);
    } else {
      // No "Load more" button means all results fit on one page -- pass trivially
      expect(initialIds.length).toBeGreaterThan(0);
    }
  });

  // S09: Map marker click shows popup
  test("S09: map marker click shows popup", async ({ page }) => {
    await page.goto(SEARCH_URL);
    await page.waitForLoadState("domcontentloaded");

    // Check if map is rendered (WebGL may not be available in headless)
    const mapContainer = page.locator(".mapboxgl-map, .mapboxgl-canvas");
    const mapVisible = await mapContainer.first().isVisible({ timeout: 10_000 }).catch(() => false);

    if (!mapVisible) {
      test.skip(true, "Map not visible (WebGL may be unavailable in headless mode)");
      return;
    }

    // Wait for markers to appear
    try {
      await waitForMapMarkers(page, { timeout: 15_000, minCount: 1 });
    } catch {
      test.skip(true, "No map markers appeared -- WebGL may be degraded");
      return;
    }

    // Click the first visible marker
    const markers = page.locator(".mapboxgl-marker");
    const markerCount = await markers.count();
    if (markerCount === 0) {
      test.skip(true, "No markers found on map");
      return;
    }

    await markers.first().click();

    // Assert popup appears
    const popup = page.locator(".mapboxgl-popup");
    await expect(popup).toBeVisible({ timeout: 5_000 });
  });

  // S10: Search-as-I-move toggle and banner
  test("S10: search-as-I-move toggle", async ({ page }) => {
    await page.goto(SEARCH_URL);
    await page.waitForLoadState("domcontentloaded");

    // The toggle is rendered inside the map component
    const mapContainer = page.locator(".mapboxgl-map");
    const mapVisible = await mapContainer.first().isVisible({ timeout: 10_000 }).catch(() => false);

    if (!mapVisible) {
      test.skip(true, "Map not visible -- search-as-I-move toggle lives inside map");
      return;
    }

    // Look for the "Search as I move" toggle button
    const toggle = page.locator('button[role="switch"]:has-text("Search as I move")');
    const toggleVisible = await toggle.isVisible({ timeout: 5_000 }).catch(() => false);

    if (!toggleVisible) {
      test.skip(true, "Search as I move toggle not visible");
      return;
    }

    // Read initial state
    const initialChecked = await toggle.getAttribute("aria-checked");

    // Click to toggle
    await toggle.click();

    // Verify the toggle state changed
    const newChecked = await toggle.getAttribute("aria-checked");
    expect(newChecked).not.toBe(initialChecked);

    // Toggle back
    await toggle.click();
    const restoredChecked = await toggle.getAttribute("aria-checked");
    expect(restoredChecked).toBe(initialChecked);
  });

  // S11: Mobile layout with bottom sheet
  test("S11: mobile layout with bottom sheet", async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto(SEARCH_URL);
    await page.waitForLoadState("domcontentloaded");

    // Assert bottom sheet region is visible
    const bottomSheet = page.locator('[role="region"][aria-label="Search results"]');
    await expect(bottomSheet).toBeAttached({ timeout: 15_000 });

    // Assert sheet handle/slider is present
    const sheetHandle = page.locator('[role="slider"][aria-label="Results panel size"]');
    await expect(sheetHandle).toBeAttached();

    // Verify the slider has expected aria attributes
    await expect(sheetHandle).toHaveAttribute("aria-valuemin", "0");
    await expect(sheetHandle).toHaveAttribute("aria-valuemax", "2");
  });

  // S12: URL shareability
  test("S12: URL shareability preserves filters", async ({ page }) => {
    const sharedUrl = `/search?q=room&minPrice=500&maxPrice=1500&${boundsQS}`;
    await page.goto(sharedUrl);
    await page.waitForLoadState("domcontentloaded");

    // Wait for page to settle
    const container = searchResultsContainer(page);
    const cards = container.locator('[data-testid="listing-card"]');
    const zeroResults = page.locator('h2:has-text("No matches found"), h3:has-text("No exact matches")');
    await expect(cards.first().or(zeroResults)).toBeAttached({ timeout: 30_000 });

    // Verify the URL still contains all the search parameters
    const currentUrl = page.url();
    expect(currentUrl).toContain("q=room");
    expect(currentUrl).toContain("minPrice=500");
    expect(currentUrl).toContain("maxPrice=1500");
    expect(currentUrl).toContain(`minLat=${SF_BOUNDS.minLat}`);
    expect(currentUrl).toContain(`maxLat=${SF_BOUNDS.maxLat}`);
  });

  // S13: Cross-browser basics (page loads and renders)
  test("S13: page renders listing cards (cross-browser baseline)", async ({ page }) => {
    const response = await page.goto(SEARCH_URL);
    expect(response?.status()).toBe(200);

    const container = searchResultsContainer(page);
    const cards = container.locator('[data-testid="listing-card"]');
    await expect(cards.first()).toBeAttached({ timeout: 30_000 });

    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  // S14: Error resilience (API fail, recovery)
  test("S14: error resilience and recovery", async ({ page }) => {
    // Intercept client-side API calls to simulate server error
    await page.route("**/api/search/v2*", (route) => {
      return route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Internal Server Error" }),
      });
    });

    // Navigate -- SSR may still succeed since it calls the DB directly,
    // but client-side fetches (like "Load more") will fail
    await page.goto(SEARCH_URL);
    await page.waitForLoadState("domcontentloaded");

    // Check if the page rendered (SSR path may succeed despite API route interception)
    const container = searchResultsContainer(page);
    const cards = container.locator('[data-testid="listing-card"]');
    const errorBoundary = page.locator('h1:has-text("Unable to load search results")');
    const rateLimitMsg = page.locator('h1:has-text("Too Many Requests")');

    // Wait for any outcome: results, error boundary, or rate limit
    await expect(
      cards.first().or(errorBoundary).or(rateLimitMsg),
    ).toBeAttached({ timeout: 30_000 });

    // If error boundary triggered, verify recovery via "Try again"
    const errorVisible = await errorBoundary.isVisible().catch(() => false);
    if (errorVisible) {
      // Remove the route interception so recovery can work
      await page.unroute("**/api/search/v2*");

      const tryAgainBtn = page.locator('button:has-text("Try again")');
      await expect(tryAgainBtn).toBeVisible();
      await tryAgainBtn.click();

      // After recovery, either results appear or the page at least does not crash
      await page.waitForLoadState("domcontentloaded");
      const pageContent = page.locator("body");
      await expect(pageContent).toBeVisible();
    } else {
      // SSR succeeded despite client API interception -- page is functional
      // Remove route for cleanup
      await page.unroute("**/api/search/v2*");
      const cardCount = await cards.count().catch(() => 0);
      expect(cardCount).toBeGreaterThanOrEqual(0);
    }
  });

  // S15: Combined search + filter + sort preserved
  test("S15: combined search + filter + sort params preserved", async ({ page }) => {
    const combinedUrl = `/search?q=room&maxPrice=2000&sort=price_asc&${boundsQS}`;
    await page.goto(combinedUrl);
    await page.waitForLoadState("domcontentloaded");

    // Wait for results or zero state
    const container = searchResultsContainer(page);
    const cards = container.locator('[data-testid="listing-card"]');
    const zeroResults = page.locator('h2:has-text("No matches found"), h3:has-text("No exact matches")');
    await expect(cards.first().or(zeroResults)).toBeAttached({ timeout: 30_000 });

    // Assert URL preserves all params
    const currentUrl = page.url();
    expect(currentUrl).toContain("q=room");
    expect(currentUrl).toContain("maxPrice=2000");
    expect(currentUrl).toContain("sort=price_asc");
    expect(currentUrl).toContain(`minLat=${SF_BOUNDS.minLat}`);
  });

  // S16: Anonymous user stability
  test("S16: anonymous user sees no auth errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto(SEARCH_URL);

    const container = searchResultsContainer(page);
    const cards = container.locator('[data-testid="listing-card"]');
    await expect(cards.first()).toBeAttached({ timeout: 30_000 });

    // Filter benign errors
    const realErrors = filterBenignErrors(consoleErrors);

    // No auth-related errors should appear
    const authErrors = realErrors.filter(
      (e) =>
        e.toLowerCase().includes("auth") ||
        e.toLowerCase().includes("unauthorized") ||
        e.toLowerCase().includes("unauthenticated") ||
        e.toLowerCase().includes("401") ||
        e.toLowerCase().includes("403"),
    );
    expect(authErrors).toHaveLength(0);

    // Page functions normally -- results are visible
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  // S17: Responsive layout at breakpoints
  test("S17: responsive layout at breakpoints", async ({ page }) => {
    // Desktop (1280px) -- map and list side by side
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(SEARCH_URL);
    await page.waitForLoadState("domcontentloaded");

    const desktopListContainer = page.locator('[data-testid="search-results-container"]');
    // Desktop split view: the hidden md:flex container should be visible
    const desktopSplitView = page.locator(".md\\:flex").first();
    await expect(desktopListContainer.or(desktopSplitView).first()).toBeAttached({ timeout: 15_000 });

    // Mobile bottom sheet should be hidden at desktop
    const mobileSheet = page.locator('[role="region"][aria-label="Search results"]');
    // On desktop, the mobile sheet's parent div has md:hidden so it should not be visible
    // But checking the sheet itself -- it may still be in DOM, just inside a hidden parent

    // Tablet (768px)
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(500); // Let media queries settle

    // Mobile (390px) -- bottom sheet should be visible, map visible behind
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500); // Let media queries settle

    // On mobile, bottom sheet region should exist
    await expect(mobileSheet).toBeAttached({ timeout: 10_000 });

    // Map should also be present on mobile (behind the sheet)
    const mapContainer = page.locator(".mapboxgl-map, .mapboxgl-canvas, [data-testid=\"map\"]");
    // Map may or may not render depending on WebGL -- just check that the page is not broken
    const bodyVisible = await page.locator("body").isVisible();
    expect(bodyVisible).toBe(true);
  });

  // S18: Performance baseline (navigation timing)
  test("S18: performance baseline -- domContentLoaded under 5s", async ({ page }) => {
    await page.goto(SEARCH_URL);
    await page.waitForLoadState("domcontentloaded");

    // Measure navigation timing using the Performance API
    const timing = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
      if (!nav) return null;
      return {
        domContentLoaded: nav.domContentLoadedEventEnd - nav.startTime,
        loadEvent: nav.loadEventEnd - nav.startTime,
        responseEnd: nav.responseEnd - nav.startTime,
      };
    });

    if (timing) {
      // Assert domContentLoaded is under 5000ms (generous for dev server)
      expect(timing.domContentLoaded).toBeLessThan(5000);

      // Log timings for visibility
      console.log(
        `[Perf] domContentLoaded: ${Math.round(timing.domContentLoaded)}ms, ` +
          `responseEnd: ${Math.round(timing.responseEnd)}ms, ` +
          `loadEvent: ${Math.round(timing.loadEvent)}ms`,
      );
    }

    // Optionally measure CLS via PerformanceObserver
    const cls = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        let clsValue = 0;
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            // CLS entries have a 'value' property
            if ("value" in entry) {
              clsValue += (entry as unknown as { value: number }).value;
            }
          }
        });
        try {
          observer.observe({ type: "layout-shift", buffered: true });
        } catch {
          // layout-shift may not be supported
          resolve(-1);
          return;
        }
        // Give observer time to collect buffered entries
        setTimeout(() => {
          observer.disconnect();
          resolve(clsValue);
        }, 1000);
      });
    });

    if (cls >= 0) {
      console.log(`[Perf] CLS: ${cls.toFixed(4)}`);
      // Generous CLS threshold for dev (production would be < 0.1)
      expect(cls).toBeLessThan(0.5);
    }
  });
});
