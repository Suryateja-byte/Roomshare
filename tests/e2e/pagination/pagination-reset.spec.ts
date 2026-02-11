/**
 * Pagination Reset Tests
 *
 * Verifies that cursor and accumulated listings reset when search parameters
 * change (filters, sort, query).
 *
 * Strategy:
 * - Initial page loads real DB data (~12 items from ~19 seed listings).
 * - "Load more" is mocked via server action interception (POST only).
 * - After accumulating extra items, we navigate to a new URL with different
 *   params. This remounts SearchResultsClient (due to `key` change),
 *   resetting all pagination state.
 *
 * Key architecture detail:
 *   <SearchResultsClient key={searchParamsString} ... />
 *
 * The `key` prop is derived from the serialized search params. When any
 * filter/sort/query changes, the key changes, React UNMOUNTS the old instance
 * and MOUNTS a fresh one. This guarantees:
 *   - Cursor resets to initialNextCursor
 *   - extraListings state resets to []
 *   - seenIdsRef resets to new Set(initialListings.map(l => l.id))
 *
 * Run: pnpm playwright test tests/e2e/pagination/pagination-reset.spec.ts --project=chromium
 */

import { test, expect, SF_BOUNDS, searchResultsContainer } from "../helpers/test-utils";
import { setupPaginationMock } from "../helpers/pagination-mock-factory";

const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;

const sel = {
  card: '[data-testid="listing-card"]',
  loadMoreBtn: 'button:has-text("Show more places")',
  sortSelect: '[data-testid="sort-select"], select[name="sort"]',
} as const;

test.describe("Pagination Reset on Param Change", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async () => {
    test.slow();
  });

  // -------------------------------------------------------------------------
  // Helper: load initial page and click load-more once to accumulate 24 items
  // -------------------------------------------------------------------------
  async function loadAndAccumulate(page: import("@playwright/test").Page) {
    const container = searchResultsContainer(page);
    const cards = container.locator(sel.card);
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });

    const loadMoreBtn = container.locator(sel.loadMoreBtn);
    await expect(loadMoreBtn).toBeVisible({ timeout: 30_000 });

    // Click load-more to accumulate 24 items (12 initial + 12 mock loaded)
    await loadMoreBtn.click();
    await expect(cards).toHaveCount(24, { timeout: 30_000 });

    return cards;
  }

  // -------------------------------------------------------------------------
  // 1. Filter change resets cursor
  // -------------------------------------------------------------------------
  test("1.1 applying price filter resets accumulated listings", async ({
    page,
  }) => {
    test.slow();

    // 24 mock items available for load-more (we only use 12 in one click)
    await setupPaginationMock(page, { totalLoadMoreItems: 24 });
    await page.goto(`/search?${boundsQS}`);

    // Accumulate 24 items (12 real + 12 mock)
    await loadAndAccumulate(page);

    // Apply a price filter by navigating to a URL with minPrice
    // This simulates what happens when a user adjusts the price slider.
    // The URL change triggers a new SSR or client-side navigation,
    // which remounts SearchResultsClient with a new key.
    await page.goto(`/search?${boundsQS}&minPrice=1000`);

    // Wait for the page to settle with new results
    const container = searchResultsContainer(page);
    const cards = container.locator(sel.card);
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });

    // Count should reset to <= 12 (initial page only, no accumulated extras)
    const resetCount = await cards.count();
    expect(resetCount).toBeLessThanOrEqual(12);
    expect(resetCount).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // 2. Sort change resets cursor
  // -------------------------------------------------------------------------
  test("2.1 changing sort order resets accumulated listings", async ({
    page,
  }) => {
    test.slow();

    await setupPaginationMock(page, { totalLoadMoreItems: 24 });
    await page.goto(`/search?${boundsQS}&sort=newest`);

    // Accumulate 24 items
    await loadAndAccumulate(page);

    // Change sort by navigating to a URL with different sort param
    await page.goto(`/search?${boundsQS}&sort=price_asc`);

    // Wait for the page to settle
    const container = searchResultsContainer(page);
    const cards = container.locator(sel.card);
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });

    // Count should reset
    const resetCount = await cards.count();
    expect(resetCount).toBeLessThanOrEqual(12);
    expect(resetCount).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // 3. Query change resets cursor
  // -------------------------------------------------------------------------
  test("3.1 changing search query resets accumulated listings", async ({
    page,
  }) => {
    test.slow();

    // Start without a query filter so we get 12+ results and can load more.
    // Then add a query to test that the param change triggers reset.
    await setupPaginationMock(page, { totalLoadMoreItems: 24 });
    await page.goto(`/search?${boundsQS}`);

    // Accumulate 24 items
    await loadAndAccumulate(page);

    // Change query by navigating to a URL with a q param
    await page.goto(`/search?${boundsQS}&q=sunset`);

    // Wait for the page to settle
    const container = searchResultsContainer(page);
    const cards = container.locator(sel.card);
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });

    // Count should reset
    const resetCount = await cards.count();
    expect(resetCount).toBeLessThanOrEqual(12);
    expect(resetCount).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // 4. Accumulated items cleared on remount (fresh dedup set)
  // -------------------------------------------------------------------------
  test("4.1 seenIds is fresh after filter change (no stale dedup)", async ({
    page,
  }) => {
    test.slow();

    await setupPaginationMock(page, { totalLoadMoreItems: 24 });
    await page.goto(`/search?${boundsQS}`);
    const container = searchResultsContainer(page);

    // Accumulate 24 items from pages 1 and 2
    const cards = container.locator(sel.card);
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });

    // Collect IDs from initial page
    const initialIds = await cards.evaluateAll((elements) =>
      elements.map((el) => el.getAttribute("data-listing-id")).filter(Boolean),
    );

    // Load more
    const loadMoreBtn = container.locator(sel.loadMoreBtn);
    await expect(loadMoreBtn).toBeVisible({ timeout: 30_000 });
    await loadMoreBtn.click();
    await expect(cards).toHaveCount(24, { timeout: 30_000 });

    // Navigate to a new filter set (remounts the component)
    await page.goto(`/search?${boundsQS}&roomType=private`);

    // Wait for remounted component to render
    // (container locator is lazy, re-queries DOM after navigation)
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });

    // Collect IDs after remount
    const remountedIds = await cards.evaluateAll((elements) =>
      elements.map((el) => el.getAttribute("data-listing-id")).filter(Boolean),
    );

    // After remount, the initial IDs should be present again
    // (they weren't filtered out by stale seenIdsRef).
    // Since the DB returns real listings for both URLs, many of the same
    // real listing IDs should appear again, proving dedup was reset.
    expect(remountedIds.length).toBeGreaterThanOrEqual(1);
    expect(remountedIds.length).toBeLessThanOrEqual(12);

    // The IDs should include items from the initial set
    // (if seenIdsRef was stale, these would be deduped out)
    if (initialIds.length > 0 && remountedIds.length > 0) {
      const overlap = remountedIds.filter((id) =>
        initialIds.includes(id as string),
      );
      // There SHOULD be overlap (same real DB data), proving dedup was reset
      expect(overlap.length).toBeGreaterThan(0);
    }
  });
});
