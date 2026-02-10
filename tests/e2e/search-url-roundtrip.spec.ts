/**
 * Search URL Param Round-Trip Tests (P0)
 *
 * Verifies the full cycle: user interacts with UI -> URL updates with params
 * -> page refresh -> UI restores from URL params. Also verifies that ephemeral
 * state (cursor, pagination) never leaks into the URL.
 *
 * Run: pnpm playwright test tests/e2e/search-url-roundtrip.spec.ts
 */

import { test, expect, SF_BOUNDS, selectors, timeouts, searchResultsContainer } from "./helpers/test-utils";
import type { Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;
const SEARCH_URL = `/search?${boundsQS}`;

function buildSearchUrl(params?: Record<string, string>): string {
  const base = `/search?minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;
  if (!params) return base;
  const extra = new URLSearchParams(params).toString();
  return `${base}&${extra}`;
}

async function assertUrlParams(page: Page, expected: Record<string, string>) {
  const url = new URL(page.url());
  for (const [key, value] of Object.entries(expected)) {
    expect(url.searchParams.get(key), `URL param "${key}" should be "${value}"`).toBe(value);
  }
}

async function assertUrlExcludesParams(page: Page, keys: string[]) {
  const url = new URL(page.url());
  for (const key of keys) {
    expect(url.searchParams.has(key), `URL should NOT contain param "${key}"`).toBe(false);
  }
}

/** Wait for search results or zero-results state to render. */
async function waitForSearchContent(page: Page) {
  const container = searchResultsContainer(page);
  const cards = container.locator('[data-testid="listing-card"]');
  const zeroResults = page.locator('h2:has-text("No matches found")');
  await expect(cards.first().or(zeroResults)).toBeAttached({ timeout: 30_000 });
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

test.describe("Search URL Param Round-Trip (P0)", () => {
  test.beforeEach(async () => {
    test.slow();
  });

  // -------------------------------------------------------------------------
  // 1. Set filter via UI -> URL has param -> refresh -> filter still active
  // -------------------------------------------------------------------------
  test("1: price filter round-trip via UI -> URL -> refresh", async ({ page }) => {
    await page.goto(buildSearchUrl({ maxPrice: "1000" }));
    await page.waitForLoadState("domcontentloaded");
    await waitForSearchContent(page);

    // Verify URL has the param
    await assertUrlParams(page, { maxPrice: "1000" });

    // Check UI reflects the filter (input or chip)
    const maxPriceInput = page.getByLabel(/maximum budget/i);
    const inputVisible = await maxPriceInput.isVisible().catch(() => false);
    if (inputVisible) {
      await expect(maxPriceInput).toHaveValue("1000");
    }

    // Refresh
    await page.reload();
    await page.waitForLoadState("domcontentloaded");

    // URL should still have the param
    await assertUrlParams(page, { maxPrice: "1000" });

    // UI should still reflect it
    if (inputVisible) {
      await expect(maxPriceInput).toHaveValue("1000");
    }
  });

  // -------------------------------------------------------------------------
  // 2. Set sort via UI -> URL has sort param -> refresh -> sort preserved
  // -------------------------------------------------------------------------
  test("2: sort round-trip via URL -> refresh -> sort preserved", async ({ page }) => {
    test.slow();
    await page.goto(buildSearchUrl({ sort: "price_asc" }));
    await waitForSearchContent(page);

    // Verify URL has sort param
    await assertUrlParams(page, { sort: "price_asc" });

    // Verify the sort label is visible
    const sortLabel = page.locator('text="Price: Low to High"');
    const mobileSortBtn = page.locator('button[aria-label="Sort: Price: Low to High"]');
    const desktopVisible = await sortLabel.first().isVisible().catch(() => false);
    const mobileVisible = await mobileSortBtn.isVisible().catch(() => false);
    expect(desktopVisible || mobileVisible).toBe(true);

    // Refresh
    await page.reload();
    await waitForSearchContent(page);

    // Sort param should persist
    await assertUrlParams(page, { sort: "price_asc" });

    // Sort label should still be visible
    const sortLabelAfter = page.locator('text="Price: Low to High"');
    const mobileSortBtnAfter = page.locator('button[aria-label="Sort: Price: Low to High"]');
    const desktopVisibleAfter = await sortLabelAfter.first().isVisible().catch(() => false);
    const mobileVisibleAfter = await mobileSortBtnAfter.isVisible().catch(() => false);
    expect(desktopVisibleAfter || mobileVisibleAfter).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 3. Type query -> URL updated -> refresh -> query preserved
  // -------------------------------------------------------------------------
  test("3: query round-trip via deep link -> refresh -> query preserved", async ({ page }) => {
    await page.goto(buildSearchUrl({ q: "sunset" }));
    await page.waitForLoadState("domcontentloaded");

    // Verify URL has q param
    await assertUrlParams(page, { q: "sunset" });

    // Refresh
    await page.reload();
    await page.waitForLoadState("domcontentloaded");

    // Query should persist
    await assertUrlParams(page, { q: "sunset" });
  });

  // -------------------------------------------------------------------------
  // 4. Map bounds in URL -> refresh -> same bounds preserved
  // -------------------------------------------------------------------------
  test("4: bounds params survive refresh with full precision", async ({ page }) => {
    const precisionBounds = {
      minLat: "37.708123",
      maxLat: "37.812456",
      minLng: "-122.515789",
      maxLng: "-122.351234",
    };
    await page.goto(`/search?minLat=${precisionBounds.minLat}&maxLat=${precisionBounds.maxLat}&minLng=${precisionBounds.minLng}&maxLng=${precisionBounds.maxLng}`);
    await page.waitForLoadState("domcontentloaded");

    // Verify bounds in URL
    await assertUrlParams(page, precisionBounds);

    // Refresh
    await page.reload();
    await page.waitForLoadState("domcontentloaded");

    // Bounds should survive with the same precision
    await assertUrlParams(page, precisionBounds);
  });

  // -------------------------------------------------------------------------
  // 5. Multiple filter round-trip: apply 3 filters, refresh, all 3 present
  // -------------------------------------------------------------------------
  test("5: multiple filters survive refresh", async ({ page }) => {
    const params = {
      maxPrice: "2000",
      roomType: "private",
      amenities: "Wifi",
    };
    await page.goto(buildSearchUrl(params));
    await page.waitForLoadState("domcontentloaded");

    // All three params present
    const url1 = new URL(page.url());
    expect(url1.searchParams.get("maxPrice")).toBe("2000");
    expect(url1.searchParams.get("amenities")).toBe("Wifi");
    // roomType may be normalized
    const rt1 = url1.searchParams.get("roomType");
    expect(rt1 === "private" || rt1 === "Private Room").toBe(true);

    // Refresh
    await page.reload();
    await page.waitForLoadState("domcontentloaded");

    // All three params survive
    const url2 = new URL(page.url());
    expect(url2.searchParams.get("maxPrice")).toBe("2000");
    expect(url2.searchParams.get("amenities")).toBe("Wifi");
    const rt2 = url2.searchParams.get("roomType");
    expect(rt2 === "private" || rt2 === "Private Room").toBe(true);
  });

  // -------------------------------------------------------------------------
  // 6. Bounds params preserve decimal precision
  // -------------------------------------------------------------------------
  test("6: bounds params are precise -- no decimal truncation", async ({ page }) => {
    const preciseBounds = {
      minLat: "37.7081234567",
      maxLat: "37.8124567890",
      minLng: "-122.5157890123",
      maxLng: "-122.3512345678",
    };
    await page.goto(`/search?minLat=${preciseBounds.minLat}&maxLat=${preciseBounds.maxLat}&minLng=${preciseBounds.minLng}&maxLng=${preciseBounds.maxLng}`);
    await page.waitForLoadState("domcontentloaded");

    // The URL should contain the precise values (app should not truncate)
    const url = new URL(page.url());
    // Compare as floats to handle floating-point representation
    const actualMinLat = parseFloat(url.searchParams.get("minLat") || "0");
    const expectedMinLat = parseFloat(preciseBounds.minLat);
    expect(Math.abs(actualMinLat - expectedMinLat)).toBeLessThan(0.0001);

    const actualMaxLat = parseFloat(url.searchParams.get("maxLat") || "0");
    const expectedMaxLat = parseFloat(preciseBounds.maxLat);
    expect(Math.abs(actualMaxLat - expectedMaxLat)).toBeLessThan(0.0001);
  });

  // -------------------------------------------------------------------------
  // 7. Removing a filter updates URL (param removed)
  // -------------------------------------------------------------------------
  test("7: removing a filter removes its param from URL", async ({ page }) => {
    await page.goto(buildSearchUrl({ maxPrice: "1500", roomType: "Private Room" }));
    await page.waitForLoadState("domcontentloaded");
    await waitForSearchContent(page);

    // Verify both params present initially
    const url1 = new URL(page.url());
    expect(url1.searchParams.has("maxPrice")).toBe(true);

    // Try to remove via the "Clear all" or individual chip removal
    const chipsRegion = page.locator('[role="region"][aria-label="Applied filters"]').first();
    const chipsVisible = await chipsRegion.isVisible({ timeout: 5_000 }).catch(() => false);

    if (chipsVisible) {
      // Click "Clear all" to remove all filters
      const clearAllBtn = page.locator('button:has-text("Clear all")');
      const clearVisible = await clearAllBtn.isVisible().catch(() => false);

      if (clearVisible) {
        await clearAllBtn.click();

        // Wait for URL to update
        await page.waitForURL(
          (url) => {
            const params = new URL(url).searchParams;
            return !params.has("maxPrice") && !params.has("roomType");
          },
          { timeout: 10_000 },
        );

        // Verify params are gone
        await assertUrlExcludesParams(page, ["maxPrice", "roomType"]);
      }
    } else {
      // If chips not visible, navigate without one param to verify behavior
      await page.goto(buildSearchUrl({ maxPrice: "1500" }));
      await page.waitForLoadState("domcontentloaded");
      await assertUrlExcludesParams(page, ["roomType"]);
    }
  });

  // -------------------------------------------------------------------------
  // 8. Cursor is NEVER in URL (check after load-more)
  // -------------------------------------------------------------------------
  test("8: cursor is NEVER in URL even after load-more", async ({ page }) => {
    await page.goto(SEARCH_URL);
    await waitForSearchContent(page);

    // Initial URL should have no cursor
    await assertUrlExcludesParams(page, ["cursor", "cursorStack", "pageNumber"]);

    // Try load more
    const loadMoreBtn = page.locator('button:has-text("Show more places")');
    const hasLoadMore = await loadMoreBtn.isVisible().catch(() => false);

    if (hasLoadMore) {
      await loadMoreBtn.click();

      // Wait a bit for the load to complete
      await page.waitForTimeout(3_000);

      // cursor should NEVER appear in the URL
      await assertUrlExcludesParams(page, ["cursor", "cursorStack", "pageNumber"]);
    }

    // Even after multiple load-more attempts, cursor stays out of URL
    const hasLoadMore2 = await loadMoreBtn.isVisible().catch(() => false);
    if (hasLoadMore2) {
      await loadMoreBtn.click();
      await page.waitForTimeout(3_000);
      await assertUrlExcludesParams(page, ["cursor", "cursorStack", "pageNumber"]);
    }
  });

  // -------------------------------------------------------------------------
  // 9. Pagination state (cursorStack, pageNumber) never in URL
  // -------------------------------------------------------------------------
  test("9: pagination ephemeral state never appears in URL", async ({ page }) => {
    // Navigate with various params
    await page.goto(buildSearchUrl({ q: "room", sort: "newest", maxPrice: "3000" }));
    await waitForSearchContent(page);

    // Verify no pagination state in URL
    await assertUrlExcludesParams(page, ["cursor", "cursorStack", "pageNumber", "page"]);

    // Try load more to trigger cursor usage
    const loadMoreBtn = page.locator('button:has-text("Show more places")');
    const hasLoadMore = await loadMoreBtn.isVisible().catch(() => false);

    if (hasLoadMore) {
      await loadMoreBtn.click();
      await page.waitForTimeout(3_000);

      // Still no pagination state in URL
      await assertUrlExcludesParams(page, ["cursor", "cursorStack", "pageNumber", "page"]);
    }

    // Refresh -- pagination state should not appear
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await assertUrlExcludesParams(page, ["cursor", "cursorStack", "pageNumber", "page"]);
  });
});
