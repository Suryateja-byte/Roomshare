/**
 * Focus Management Stability Tests
 *
 * Verifies that focus moves to #search-results-heading on filter/sort/query
 * changes but does NOT move on map pan (bounds-only URL changes).
 *
 * The SearchResultsLoadingWrapper computes a filterParamsKey that strips
 * geographic params (minLat, maxLat, minLng, maxLng, lat, lng, zoom).
 * Only when this key changes does focus move to the heading.
 *
 * Run:
 *   pnpm playwright test tests/search-stability/focus-management.anon.spec.ts --project=chromium-anon
 */

import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SF_BOUNDS = {
  minLat: 37.7,
  maxLat: 37.85,
  minLng: -122.52,
  maxLng: -122.35,
};

const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;
const SEARCH_URL = `/search?${boundsQS}`;

// Panned bounds (shifted slightly east and north)
const PANNED_BOUNDS = {
  minLat: 37.72,
  maxLat: 37.87,
  minLng: -122.48,
  maxLng: -122.31,
};
const pannedBoundsQS = `minLat=${PANNED_BOUNDS.minLat}&maxLat=${PANNED_BOUNDS.maxLat}&minLng=${PANNED_BOUNDS.minLng}&maxLng=${PANNED_BOUNDS.maxLng}`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wait for the search page to load and heading to appear */
async function waitForSearchReady(page: import("@playwright/test").Page) {
  await page.waitForLoadState("domcontentloaded");
  await expect(
    page.locator("#search-results-heading"),
  ).toBeAttached({ timeout: 30_000 });
}

/** Get the ID of the currently focused element */
async function getFocusedElementId(page: import("@playwright/test").Page): Promise<string | null> {
  return page.evaluate(() => document.activeElement?.id || null);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Focus Management: search-results-heading", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async () => {
    test.slow();
  });

  test("applying a filter (roomType) moves focus to search-results-heading", async ({ page }) => {
    // 1. Navigate to base search page
    await page.goto(SEARCH_URL);
    await waitForSearchReady(page);

    // Click somewhere neutral to ensure focus is NOT on the heading initially
    await page.locator("body").click();
    const focusBefore = await getFocusedElementId(page);
    expect(focusBefore).not.toBe("search-results-heading");

    // 2. Navigate with a filter param (simulates applying a filter)
    await page.goto(`${SEARCH_URL}&roomType=Private+Room`);
    await waitForSearchReady(page);

    // 3. Wait for the focus effect to fire (runs on filterParamsKey change)
    await expect.poll(
      () => getFocusedElementId(page),
      { timeout: 10_000, message: "Focus should move to search-results-heading after filter change" },
    ).toBe("search-results-heading");
  });

  test("panning the map (bounds-only change) does NOT move focus to heading", async ({ page }) => {
    // 1. Navigate with a filter so the heading focus effect has already fired once
    await page.goto(`${SEARCH_URL}&roomType=Private+Room`);
    await waitForSearchReady(page);

    // Wait for initial focus to settle
    await expect.poll(
      () => getFocusedElementId(page),
      { timeout: 10_000 },
    ).toBe("search-results-heading");

    // 2. Move focus away from the heading to a known element
    await page.evaluate(() => {
      (document.activeElement as HTMLElement)?.blur();
      document.body.focus();
    });

    // Confirm focus is no longer on the heading
    const focusAfterBlur = await getFocusedElementId(page);
    expect(focusAfterBlur).not.toBe("search-results-heading");

    // 3. Navigate with changed bounds only (same filter) -- simulates map pan
    await page.goto(`/search?${pannedBoundsQS}&roomType=Private+Room`);
    await waitForSearchReady(page);

    // 4. Focus should NOT be on the heading (bounds-only change is stripped from filterParamsKey)
    // Wait a moment for any potential (incorrect) focus effect
    await page.waitForTimeout(1_000);
    const focusAfterPan = await getFocusedElementId(page);
    expect(focusAfterPan).not.toBe("search-results-heading");
  });

  test("changing sort param moves focus to heading", async ({ page }) => {
    // 1. Navigate to base search page
    await page.goto(SEARCH_URL);
    await waitForSearchReady(page);

    // Move focus away
    await page.evaluate(() => document.body.focus());

    // 2. Navigate with a sort param change
    await page.goto(`${SEARCH_URL}&sort=price_asc`);
    await waitForSearchReady(page);

    // 3. Focus should move to heading
    await expect.poll(
      () => getFocusedElementId(page),
      { timeout: 10_000, message: "Focus should move to search-results-heading after sort change" },
    ).toBe("search-results-heading");
  });

  test("changing query param moves focus to heading", async ({ page }) => {
    // 1. Navigate to base search page
    await page.goto(SEARCH_URL);
    await waitForSearchReady(page);

    // Move focus away
    await page.evaluate(() => document.body.focus());

    // 2. Navigate with a query param
    await page.goto(`${SEARCH_URL}&q=downtown`);
    await waitForSearchReady(page);

    // 3. Focus should move to heading
    await expect.poll(
      () => getFocusedElementId(page),
      { timeout: 10_000, message: "Focus should move to search-results-heading after query change" },
    ).toBe("search-results-heading");
  });
});
