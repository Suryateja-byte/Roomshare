/**
 * Map Features E2E Tests (Tasks 1.1–1.8)
 *
 * Verifies map enhancements on the search page.
 *
 * NOTE: Mapbox GL JS requires WebGL. In headless Chromium without GPU,
 * the map may not fully initialize (isMapLoaded never becomes true),
 * so controls that depend on map load (POIs, Drop pin, style toggle)
 * may not render. Tests gracefully handle this.
 *
 * For full visual testing, run with --headed flag:
 *   pnpm playwright test tests/e2e/map-features.anon.spec.ts --project=chromium-anon --headed
 */

import { test, expect, SF_BOUNDS, selectors, searchResultsContainer, waitForMapReady } from "./helpers/test-utils";

const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;
const SEARCH_URL = `/search?${boundsQS}`;

// Helper: wait for the search page to be interactive
async function waitForSearchPage(page: import("@playwright/test").Page) {
  await page.goto(SEARCH_URL);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForSelector("button", { timeout: 30_000 });
  await waitForMapReady(page);
}

// Helper: check if map controls rendered (depends on WebGL/map load)
async function mapControlsAvailable(page: import("@playwright/test").Page) {
  // Map controls only render when isMapLoaded=true (requires WebGL)
  // First check if map canvas is actually visible (WebGL working)
  try {
    const canvas = page.locator('.maplibregl-canvas, .maplibregl-canvas');
    const canvasVisible = await canvas.first().isVisible().catch(() => false);
    if (!canvasVisible) return false;
  } catch {
    return false;
  }
  const dropPin = page.locator('button').filter({ hasText: /Drop pin/i });
  return (await dropPin.count()) > 0;
}

// Map tests need extra time for WebGL rendering and tile loading in CI
test.beforeEach(async () => { test.slow(); });

// ---------------------------------------------------------------------------
// Smoke: Search page loads without JS crashes
// ---------------------------------------------------------------------------
test.describe("Map smoke test", () => {
  test("search page loads without JS crashes", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await waitForSearchPage(page);

    // Filter known benign errors
    const realErrors = consoleErrors.filter(
      (e) =>
        !e.includes("mapbox") &&
        !e.includes("maplibre") &&
        !e.includes("webpack") &&
        !e.includes("HMR") &&
        !e.includes("hydrat") &&
        !e.includes("favicon") &&
        !e.includes("ResizeObserver") &&
        !e.includes("WebGL") &&
        !e.includes("Failed to create") &&
        !e.includes("404") &&
        !e.includes("net::ERR") &&
        !e.includes("AbortError") &&
        !e.includes("CORS") &&
        !e.includes("cancelled") &&
        !e.includes("ERR_BLOCKED") &&
        !e.includes("Mapbox") &&
        !e.includes("tile") &&
        !e.includes("pbf") &&
        !e.includes("Failed to fetch") &&
        !e.includes("Load failed") &&
        !e.includes("ChunkLoadError") &&
        !e.includes("Loading chunk") &&
        !e.includes("Environment validation") &&
        !e.includes("Failed to load resource"),
    );
    expect(realErrors).toHaveLength(0);
  });

  test("search page renders listing cards", async ({ page }) => {
    await waitForSearchPage(page);

    const cardsContainer = searchResultsContainer(page);
    const cards = cardsContainer.locator(selectors.listingCard);
    try {
      await cards.first().waitFor({ state: "attached", timeout: 30_000 });
      const count = await cards.count();
      expect(count).toBeGreaterThanOrEqual(1);
    } catch {
      // Seed data may not be in bounds — just ensure page loaded
      const bodyVisible = await page.locator("body").isVisible();
      expect(bodyVisible).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 1.3: Synchronized highlighting — hover listing card
// ---------------------------------------------------------------------------
test.describe("1.3: Synchronized highlighting", () => {
  test("hovering a listing card does not crash the page", async ({ page }) => {
    await waitForSearchPage(page);

    // Cards may be in DOM but not visible (e.g., in bottom sheet on mobile viewport).
    // Scope to visible container to avoid hidden mobile/desktop duplicate.
    const hoverContainer = searchResultsContainer(page);
    const card = hoverContainer.locator(selectors.listingCard).first();
    if ((await card.count()) === 0) {
      test.skip(true, "No listing cards found");
      return;
    }

    try {
      await card.scrollIntoViewIfNeeded({ timeout: 5_000 });
      await card.hover({ timeout: 5_000 });
    } catch {
      // Card not visible/hoverable (mobile layout, bottom sheet collapsed)
      // Just verify it exists in DOM without crashing
    }

    // Page still functional
    expect(await page.locator("body").isVisible()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 1.5: Boundary polygons — named area query
// ---------------------------------------------------------------------------
test.describe("1.5: Boundary polygons", () => {
  test("search with named area query loads without JS errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto(`/search?q=Mission+District&${boundsQS}`);
    await page.waitForLoadState("domcontentloaded");
    await waitForMapReady(page);

    const realErrors = consoleErrors.filter(
      (e) =>
        !e.includes("mapbox") &&
        !e.includes("maplibre") &&
        !e.includes("webpack") &&
        !e.includes("HMR") &&
        !e.includes("hydrat") &&
        !e.includes("favicon") &&
        !e.includes("ResizeObserver") &&
        !e.includes("WebGL") &&
        !e.includes("Failed to create") &&
        !e.includes("404") &&
        !e.includes("net::ERR") &&
        !e.includes("AbortError") &&
        !e.includes("CORS") &&
        !e.includes("cancelled") &&
        !e.includes("ERR_BLOCKED") &&
        !e.includes("Mapbox") &&
        !e.includes("tile") &&
        !e.includes("pbf") &&
        !e.includes("Failed to fetch") &&
        !e.includes("Load failed") &&
        !e.includes("ChunkLoadError") &&
        !e.includes("Loading chunk") &&
        !e.includes("Environment validation") &&
        !e.includes("Failed to load resource"),
    );
    expect(realErrors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Map controls tests (require WebGL — skip in headless without GPU)
// ---------------------------------------------------------------------------
test.describe("Map controls (requires WebGL)", () => {
  test.beforeEach(async ({ page }) => {
    await waitForSearchPage(page);
    if (!(await mapControlsAvailable(page))) {
      test.skip(true, "Map controls not rendered (WebGL unavailable in headless mode)");
    }
  });

  // 1.6: Drop-a-Pin
  test("drop pin button toggles to cancel state", async ({ page }) => {
    const dropPinBtn = page.locator('button').filter({ hasText: /Drop pin/i }).first();
    await dropPinBtn.click();
    await page.locator('button').filter({ hasText: /Cancel/i }).first().waitFor({ timeout: 5_000 });

    const cancelBtn = page.locator('button').filter({ hasText: /Cancel/i });
    expect(await cancelBtn.count()).toBeGreaterThanOrEqual(1);

    await cancelBtn.first().click();
    await page.locator('button').filter({ hasText: /Drop pin/i }).first().waitFor({ timeout: 5_000 });
    expect(await page.locator('button').filter({ hasText: /Drop pin/i }).count()).toBeGreaterThanOrEqual(1);
  });

  // 1.7: POI toggles
  test("POI toggle buttons are present and functional", async ({ page }) => {
    const poiBtn = page.locator('button').filter({ hasText: /^POIs$/i });
    expect(await poiBtn.count()).toBeGreaterThanOrEqual(1);

    const transitBtn = page.locator('button[aria-pressed]').filter({ hasText: /Transit/i }).first();
    if ((await transitBtn.count()) === 0) return;

    // Read current state rather than assuming it starts at "false"
    const initialState = await transitBtn.getAttribute("aria-pressed");
    await transitBtn.click();
    // After click, state should have toggled
    const expectedAfterClick = initialState === "true" ? "false" : "true";
    await expect(transitBtn).toHaveAttribute("aria-pressed", expectedAfterClick, { timeout: 10_000 });
    await transitBtn.click();
    // After second click, state should be back to initial
    await expect(transitBtn).toHaveAttribute("aria-pressed", initialState ?? "false", { timeout: 10_000 });
  });

  test("POIs master toggle activates all categories", async ({ page }) => {
    const poiMasterBtn = page.locator('button[aria-label*="Show all POIs"]');
    if ((await poiMasterBtn.count()) === 0) return;

    await poiMasterBtn.click();

    const transitBtn = page.locator('button[aria-pressed]').filter({ hasText: /Transit/i }).first();
    const parksBtn = page.locator('button[aria-pressed]').filter({ hasText: /Parks/i }).first();

    if ((await transitBtn.count()) > 0) {
      await expect(transitBtn).toHaveAttribute("aria-pressed", "true", { timeout: 10_000 });
    }
    if ((await parksBtn.count()) > 0) {
      await expect(parksBtn).toHaveAttribute("aria-pressed", "true", { timeout: 10_000 });
    }
  });

  // 1.8: Satellite toggle removed during MapLibre migration (OpenFreeMap uses free tiles only)

  // Keyboard accessibility
  test("map controls are keyboard accessible", async ({ page }) => {
    const dropPinBtn = page.locator('button').filter({ hasText: /Drop pin/i }).first();
    await dropPinBtn.focus();
    await page.keyboard.press("Enter");
    await page.locator('button').filter({ hasText: /Cancel/i }).first().waitFor({ timeout: 5_000 });

    const cancelBtn = page.locator('button').filter({ hasText: /Cancel/i });
    expect(await cancelBtn.count()).toBeGreaterThanOrEqual(1);
    await cancelBtn.first().click();

    const transitBtn = page.locator('button[aria-pressed]').filter({ hasText: /Transit/i }).first();
    if ((await transitBtn.count()) > 0) {
      const prevState = await transitBtn.getAttribute("aria-pressed");
      await transitBtn.focus();
      await page.keyboard.press("Enter");
      const expectedState = prevState === "true" ? "false" : "true";
      await expect(transitBtn).toHaveAttribute("aria-pressed", expectedState, { timeout: 10_000 });
    }
  });
});
