/**
 * Map Style Toggle E2E Tests (Scenarios 9.1-9.3)
 *
 * Verifies map style toggle functionality on the search page:
 * - Standard, Satellite, and Transit style buttons
 * - sessionStorage persistence (key: roomshare-map-style)
 * - Style persistence across navigation/reload
 *
 * NOTE: Mapbox GL JS requires WebGL. In headless Chromium without GPU,
 * the map may not fully initialize, so style toggle controls may not render.
 * Tests gracefully handle this with skip conditions.
 *
 * For full visual testing, run with --headed flag:
 *   pnpm playwright test tests/e2e/map-style.anon.spec.ts --project=chromium-anon --headed
 */

import { test, expect, SF_BOUNDS, timeouts, waitForMapReady } from "./helpers/test-utils";

const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;
const SEARCH_URL = `/search?${boundsQS}`;

const SESSION_STORAGE_KEY = "roomshare-map-style";

// Helper: get the map style radiogroup container
function getStyleContainer(page: import("@playwright/test").Page) {
  return page.getByRole("radiogroup", { name: "Map style" });
}

// Helper: get specific style button within the radiogroup
function getStyleButton(page: import("@playwright/test").Page, style: "Standard" | "Satellite" | "Transit") {
  return getStyleContainer(page).getByRole("radio", { name: style });
}

// Helper: wait for the search page to be interactive
async function waitForSearchPage(page: import("@playwright/test").Page) {
  await page.goto(SEARCH_URL);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForSelector("button", { timeout: timeouts.navigation });
  // Wait for map and controls to initialize
  await waitForMapReady(page);
}

// Helper: check if map style controls are rendered (depends on WebGL/map load)
async function mapStyleControlsAvailable(page: import("@playwright/test").Page): Promise<boolean> {
  const container = getStyleContainer(page);
  return (await container.count()) > 0;
}

// Helper: clear sessionStorage before test to ensure clean state
async function clearMapStyleStorage(page: import("@playwright/test").Page) {
  await page.evaluate((key) => sessionStorage.removeItem(key), SESSION_STORAGE_KEY);
}

// Helper: poll sessionStorage until it matches the expected value
async function expectSessionStorage(
  page: import("@playwright/test").Page,
  expectedValue: string,
) {
  await expect.poll(
    () => page.evaluate((key) => sessionStorage.getItem(key), SESSION_STORAGE_KEY),
    { timeout: 5000 },
  ).toBe(expectedValue);
}

// Map tests need extra time for WebGL rendering and tile loading in CI
test.beforeEach(async () => { test.slow(); });

// ---------------------------------------------------------------------------
// 9.1: Style toggle buttons visible (Standard/Satellite/Transit) - P0
// ---------------------------------------------------------------------------
test.describe("9.1: Map style toggle buttons visibility", () => {
  test.beforeEach(async ({ page }) => {
    await waitForSearchPage(page);
    if (!(await mapStyleControlsAvailable(page))) {
      test.skip(true, "Map style controls not rendered (WebGL unavailable in headless mode)");
    }
  });

  test("Standard style button is visible", async ({ page }) => {
    const standardBtn = getStyleButton(page, "Standard");
    await expect(standardBtn).toBeVisible();
  });

  test("Satellite style button is visible", async ({ page }) => {
    const satelliteBtn = getStyleButton(page, "Satellite");
    await expect(satelliteBtn).toBeVisible();
  });

  test("Transit style button is visible", async ({ page }) => {
    const transitBtn = getStyleButton(page, "Transit");
    await expect(transitBtn).toBeVisible();
  });

  test("all three style toggle buttons are present and clickable", async ({ page }) => {
    const standardBtn = getStyleButton(page, "Standard");
    const satelliteBtn = getStyleButton(page, "Satellite");
    const transitBtn = getStyleButton(page, "Transit");

    // Verify all buttons are visible
    await expect(standardBtn).toBeVisible();
    await expect(satelliteBtn).toBeVisible();
    await expect(transitBtn).toBeVisible();

    // Verify buttons are enabled (clickable)
    await expect(standardBtn).toBeEnabled();
    await expect(satelliteBtn).toBeEnabled();
    await expect(transitBtn).toBeEnabled();
  });
});

// ---------------------------------------------------------------------------
// 9.2: Style persists to sessionStorage (roomshare-map-style) - P0
// ---------------------------------------------------------------------------
test.describe("9.2: Map style sessionStorage persistence", () => {
  test.beforeEach(async ({ page }) => {
    await waitForSearchPage(page);
    if (!(await mapStyleControlsAvailable(page))) {
      test.skip(true, "Map style controls not rendered (WebGL unavailable in headless mode)");
    }
    // Clear any existing style preference for clean test
    await clearMapStyleStorage(page);
  });

  test("clicking Standard persists 'standard' to sessionStorage", async ({ page }) => {
    const standardBtn = getStyleButton(page, "Standard");
    await standardBtn.click();
    await expectSessionStorage(page, "standard");
  });

  test("clicking Satellite persists 'satellite' to sessionStorage", async ({ page }) => {
    const satelliteBtn = getStyleButton(page, "Satellite");
    await satelliteBtn.click();
    await expectSessionStorage(page, "satellite");
  });

  test("clicking Transit persists 'transit' to sessionStorage", async ({ page }) => {
    const transitBtn = getStyleButton(page, "Transit");
    await transitBtn.click();
    await expectSessionStorage(page, "transit");
  });

  test("switching styles updates sessionStorage value", async ({ page }) => {
    const standardBtn = getStyleButton(page, "Standard");
    const satelliteBtn = getStyleButton(page, "Satellite");
    const transitBtn = getStyleButton(page, "Transit");

    // Start with standard
    await standardBtn.click();
    await expectSessionStorage(page, "standard");

    // Switch to satellite
    await satelliteBtn.click();
    await expectSessionStorage(page, "satellite");

    // Switch to transit
    await transitBtn.click();
    await expectSessionStorage(page, "transit");
  });
});

// ---------------------------------------------------------------------------
// 9.3: Style persists across navigation (reload loads saved style) - P0
// ---------------------------------------------------------------------------
test.describe("9.3: Map style persistence across navigation", () => {
  test.beforeEach(async ({ page }) => {
    await waitForSearchPage(page);
    if (!(await mapStyleControlsAvailable(page))) {
      test.skip(true, "Map style controls not rendered (WebGL unavailable in headless mode)");
    }
  });

  test("satellite style persists after page reload", async ({ page }) => {
    // Clear and set satellite style
    await clearMapStyleStorage(page);
    const satelliteBtn = getStyleButton(page, "Satellite");
    await satelliteBtn.click();
    await expectSessionStorage(page, "satellite");

    // Reload the page
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await waitForMapReady(page);

    // Verify sessionStorage still has the value after reload
    await expectSessionStorage(page, "satellite");
  });

  test("transit style persists after navigating to search page", async ({ page }) => {
    // Clear and set transit style
    await clearMapStyleStorage(page);
    const transitBtn = getStyleButton(page, "Transit");
    await transitBtn.click();
    await expectSessionStorage(page, "transit");

    // Navigate away and back to search
    await page.goto(SEARCH_URL);
    await page.waitForLoadState("domcontentloaded");
    await waitForMapReady(page);

    // Verify sessionStorage retained the value
    await expectSessionStorage(page, "transit");
  });

  test("standard style persists across multiple navigations", async ({ page }) => {
    // Clear and set standard style
    await clearMapStyleStorage(page);
    const standardBtn = getStyleButton(page, "Standard");
    await standardBtn.click();
    await expectSessionStorage(page, "standard");

    // Navigate to a different search URL
    await page.goto(`/search?q=San+Francisco&${boundsQS}`);
    await page.waitForLoadState("domcontentloaded");
    await waitForMapReady(page);

    // Verify sessionStorage retained the value
    await expectSessionStorage(page, "standard");

    // Navigate back to original search URL
    await page.goto(SEARCH_URL);
    await page.waitForLoadState("domcontentloaded");
    await waitForMapReady(page);

    // Verify style is still persisted
    await expectSessionStorage(page, "standard");
  });

  test("sessionStorage value does not persist in new browser context (session isolation)", async ({
    browser,
  }) => {
    // Create first context
    const context1 = await browser.newContext();
    const page1 = await context1.newPage();
    await page1.goto(SEARCH_URL);
    await page1.waitForLoadState("domcontentloaded");
    await waitForMapReady(page1);

    // Check if controls are available in this context
    if (!(await mapStyleControlsAvailable(page1))) {
      await context1.close();
      test.skip(true, "Map style controls not rendered (WebGL unavailable)");
      return;
    }

    // Set satellite style in first context
    const satelliteBtn = getStyleButton(page1, "Satellite");
    await satelliteBtn.click();
    await expectSessionStorage(page1, "satellite");

    await context1.close();

    // Create new context (simulates new session)
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    await page2.goto(SEARCH_URL);
    await page2.waitForLoadState("domcontentloaded");
    await waitForMapReady(page2);

    // In new session, sessionStorage should be empty
    const stored2 = await page2.evaluate((key) => sessionStorage.getItem(key), SESSION_STORAGE_KEY);
    expect(stored2).toBeNull();

    await context2.close();
  });
});
