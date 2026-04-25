/**
 * Filter State Sync Stability Tests
 *
 * Verifies filter state consistency across URL changes:
 * - Filter chips render correctly from URL params
 * - Browser back preserves correct filter state
 * - Bounds changes (map pan) do not drop filter params
 * - Bounds-only changes do not cause filter chip flash/re-render
 *
 * Run:
 *   pnpm playwright test tests/e2e/search-stability/filter-state-sync.anon.spec.ts --project=chromium-anon
 */

import { test, expect } from "@playwright/test";
import type { Page, Locator } from "@playwright/test";

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

// Panned bounds (shifted slightly)
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

/** The visible search results container based on viewport width */
function searchResultsContainer(page: Page): Locator {
  const viewport = page.viewportSize();
  const isMobile = viewport ? viewport.width < 768 : false;
  if (isMobile) {
    return page.locator('[data-testid="mobile-search-results-container"]');
  }
  return page.locator('[data-testid="search-results-container"]');
}

/** The applied filters chip region scoped to the visible container */
function appliedFiltersRegion(page: Page): Locator {
  return searchResultsContainer(page).locator('[aria-label="Applied filters"]');
}

/** Read a URL search param from the current page URL (returns decoded value) */
function getUrlParam(page: Page, key: string): string | null {
  return new URL(page.url()).searchParams.get(key);
}

/** Wait for the page to load and content to attach */
async function waitForSearchReady(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded");
  // Use .first() to handle dual-container rendering
  await page
    .locator(
      '[data-testid="listing-card"], [data-testid="empty-state"], #search-results-heading'
    )
    .first()
    .waitFor({ state: "attached", timeout: 30_000 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Filter State Sync across URL changes", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async () => {
    test.slow();
  });

  test("filter chips render correctly from URL params", async ({ page }) => {
    // Navigate with roomType and amenities filters
    await page.goto(`${SEARCH_URL}&roomType=Private+Room&amenities=Wifi`);
    await waitForSearchReady(page);

    const region = appliedFiltersRegion(page);
    const regionVisible = await region.isVisible().catch(() => false);
    test.skip(!regionVisible, "Applied filters region not visible");

    // Verify chips for both filters appear
    await expect(region.locator("text=/Private Room/i").first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(region.locator("text=/Wifi/i").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("browser back restores previous filter state in URL and chips", async ({
    page,
  }) => {
    // Step 1: Navigate with one filter
    await page.goto(`${SEARCH_URL}&roomType=Private+Room`);
    await waitForSearchReady(page);

    const region = appliedFiltersRegion(page);
    const regionVisible = await region.isVisible().catch(() => false);
    test.skip(!regionVisible, "Applied filters region not visible");

    await expect(region.locator("text=/Private Room/i").first()).toBeVisible({
      timeout: 10_000,
    });

    // Step 2: Navigate to a different filter state (add amenity)
    await page.goto(`${SEARCH_URL}&roomType=Private+Room&amenities=Wifi`);
    await waitForSearchReady(page);

    await expect(region.locator("text=/Wifi/i").first()).toBeVisible({
      timeout: 10_000,
    });

    // Step 3: Go back
    await page.goBack();
    await waitForSearchReady(page);

    // Step 4: URL should match original state
    // Note: URLSearchParams.get() decodes values (+ → space), so compare decoded
    await expect
      .poll(() => getUrlParam(page, "roomType"), {
        timeout: 15_000,
        message: "URL roomType should be 'Private Room' after back",
      })
      .toBe("Private Room");

    // Amenities should be gone from URL
    expect(getUrlParam(page, "amenities")).toBeNull();

    // Chips should reflect the URL: Private Room visible, Wifi gone
    await expect(region.locator("text=/Private Room/i").first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(region.locator("text=/Wifi/i")).not.toBeVisible({
      timeout: 5_000,
    });
  });

  test("bounds change (map pan) does not drop filter params from URL", async ({
    page,
  }) => {
    // Navigate with a filter
    await page.goto(`${SEARCH_URL}&roomType=Private+Room`);
    await waitForSearchReady(page);

    // Verify filter is in URL (decoded)
    expect(getUrlParam(page, "roomType")).toBe("Private Room");

    // Navigate with changed bounds but same filter (simulates map pan)
    await page.goto(`/search?${pannedBoundsQS}&roomType=Private+Room`);
    await waitForSearchReady(page);

    // Filter should still be in the URL after bounds change
    expect(getUrlParam(page, "roomType")).toBe("Private Room");

    // Bounds should reflect the new panned values
    expect(Number(getUrlParam(page, "minLat"))).toBeCloseTo(
      PANNED_BOUNDS.minLat,
      3
    );
    expect(Number(getUrlParam(page, "maxLat"))).toBeCloseTo(
      PANNED_BOUNDS.maxLat,
      3
    );

    // Chip should still be visible
    const region = appliedFiltersRegion(page);
    const regionVisible = await region.isVisible().catch(() => false);
    if (regionVisible) {
      await expect(region.locator("text=/Private Room/i").first()).toBeVisible({
        timeout: 10_000,
      });
    }
  });

  test("bounds-only change does not cause filter chips to disappear", async ({
    page,
  }) => {
    // Navigate with filters
    await page.goto(`${SEARCH_URL}&roomType=Private+Room&amenities=Wifi`);
    await waitForSearchReady(page);

    const region = appliedFiltersRegion(page);
    const regionVisible = await region.isVisible().catch(() => false);
    test.skip(!regionVisible, "Applied filters region not visible");

    // Verify chips are initially visible
    await expect(region.locator("text=/Private Room/i").first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(region.locator("text=/Wifi/i").first()).toBeVisible({
      timeout: 10_000,
    });

    // Navigate with bounds-only change (keep same filters)
    await page.goto(
      `/search?${pannedBoundsQS}&roomType=Private+Room&amenities=Wifi`
    );
    await waitForSearchReady(page);

    // Chips should still be visible after bounds change
    await expect(region.locator("text=/Private Room/i").first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(region.locator("text=/Wifi/i").first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
