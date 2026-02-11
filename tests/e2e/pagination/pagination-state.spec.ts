/**
 * Pagination State Management Tests
 *
 * Verifies URL state behavior related to pagination:
 * - Cursor is NEVER serialized to the URL (ephemeral client state)
 * - Page refresh loses "load more" state (resets to initial page)
 * - Browser back/forward navigation handles search results gracefully
 * - URL filter params are preserved when loading more results
 *
 * Strategy:
 * - Initial page loads real DB data (~12 items from ~19 seed listings).
 * - "Load more" is mocked via server action interception (POST only).
 * - URL assertions verify that cursor/pagination params never leak into the URL.
 *
 * Key invariants (from CLAUDE.md / SearchResultsClient.tsx):
 * - Cursor reset: SearchResultsClient is keyed by searchParamsString. Any
 *   filter/sort/query change remounts and resets cursor + accumulated listings.
 * - URL shareability: URLs contain only initial search params (no cursor).
 *   "Load more" state is ephemeral client state.
 *
 * Run: pnpm playwright test tests/e2e/pagination/pagination-state.spec.ts --project=chromium
 */

import { test, expect, SF_BOUNDS, searchResultsContainer } from "../helpers/test-utils";
import { setupPaginationMock } from "../helpers/pagination-mock-factory";

const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;

const sel = {
  card: '[data-testid="listing-card"]',
  loadMoreBtn: 'button:has-text("Show more places")',
  feed: '[role="feed"][aria-label="Search results"]',
} as const;

test.describe("Pagination URL State", () => {
  test.beforeEach(async () => {
    test.slow();
  });

  // -------------------------------------------------------------------------
  // 1. Cursor never appears in URL
  // -------------------------------------------------------------------------
  test("1.1 URL never contains cursor param after loading more results", async ({
    page,
  }) => {
    test.slow();

    // 36 mock items for 3 load-more clicks (12 * 3)
    await setupPaginationMock(page, { totalLoadMoreItems: 36 });
    await page.goto(`/search?${boundsQS}`);
    const container = searchResultsContainer(page);

    const cards = container.locator(sel.card);
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });

    // Check URL before any load-more
    expect(page.url()).not.toContain("cursor");

    // Load more 3 times
    for (let i = 0; i < 3; i++) {
      const loadMoreBtn = container.locator(sel.loadMoreBtn);
      await expect(loadMoreBtn).toBeVisible({ timeout: 30_000 });
      await loadMoreBtn.click();
      // 12 initial + (i+1)*12 mock items = (i+2)*12
      await expect(cards).toHaveCount((i + 2) * 12, { timeout: 30_000 });

      // Assert URL never contains cursor after each load-more
      const currentUrl = page.url();
      expect(currentUrl).not.toContain("cursor");
      expect(currentUrl).not.toContain("cursorStack");
      expect(currentUrl).not.toContain("pageNumber");
    }
  });

  // -------------------------------------------------------------------------
  // 2. Page refresh loses load-more state
  // -------------------------------------------------------------------------
  test("2.1 refreshing the page resets to initial page of results", async ({
    page,
  }) => {
    test.slow();

    // 24 mock items for load-more
    await setupPaginationMock(page, { totalLoadMoreItems: 24 });
    await page.goto(`/search?${boundsQS}`);
    const container = searchResultsContainer(page);

    const cards = container.locator(sel.card);
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });

    // Load more to accumulate 24 items (12 real + 12 mock)
    const loadMoreBtn = container.locator(sel.loadMoreBtn);
    await expect(loadMoreBtn).toBeVisible({ timeout: 30_000 });
    await loadMoreBtn.click();
    await expect(cards).toHaveCount(24, { timeout: 30_000 });

    // Refresh the page
    await page.reload();

    // Wait for page to re-render
    // (container locator is lazy, re-queries DOM after reload)
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });

    // Should be back to the initial page count (at most 12)
    const countAfterRefresh = await cards.count();
    expect(countAfterRefresh).toBeLessThanOrEqual(12);
    expect(countAfterRefresh).toBeGreaterThanOrEqual(1);

    // "Show more places" button should reappear (there are more items in DB)
    await expect(container.locator(sel.loadMoreBtn)).toBeVisible({
      timeout: 30_000,
    });
  });

  // -------------------------------------------------------------------------
  // 3. Back/forward navigation
  // -------------------------------------------------------------------------
  test("3.1 browser back from listing detail returns to search results", async ({
    page,
  }) => {
    test.slow();

    // Mock not strictly needed for this test, but set up for consistency
    await setupPaginationMock(page, { totalLoadMoreItems: 12 });
    await page.goto(`/search?${boundsQS}`);
    const container = searchResultsContainer(page);

    const cards = container.locator(sel.card);
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });

    // Record the count before navigation
    const initialCount = await cards.count();
    expect(initialCount).toBeGreaterThanOrEqual(1);

    // Extract a listing link href from the first card to navigate directly.
    // Using page.goto instead of clicking avoids carousel drag-handler interference.
    const firstCardLink = container
      .locator(`${sel.card} a[href^="/listings/"]`)
      .first();

    if ((await firstCardLink.count()) > 0) {
      const href = await firstCardLink.getAttribute("href");
      expect(href).toBeTruthy();

      // Navigate directly to the listing detail page
      await page.goto(href!);
      await page.waitForURL(/\/listings\//, { timeout: 30_000, waitUntil: "commit" });

      // Go back to search results
      await page.goBack();

      // Search results should be visible again
      await page.waitForURL(/\/search/, { timeout: 30_000 });
      await expect(cards.first()).toBeVisible({ timeout: 30_000 });

      // Results should be present (count may vary depending on bfcache behavior)
      const countAfterBack = await cards.count();
      expect(countAfterBack).toBeGreaterThanOrEqual(1);
    } else {
      // No clickable link found in card - skip this portion
      console.warn(
        "[pagination-state] Could not find a clickable link in listing card. " +
          "Skipping back-navigation assertion.",
      );
    }
  });

  // -------------------------------------------------------------------------
  // 4. URL filter params preserved across load-more
  // -------------------------------------------------------------------------
  test("4.1 URL retains original filter params after loading more", async ({
    page,
  }) => {
    test.slow();

    // 12 mock items for one load-more page
    await setupPaginationMock(page, { totalLoadMoreItems: 12 });

    // Navigate with multiple filter params
    const filterParams = `${boundsQS}&minPrice=500&maxPrice=2000&roomType=private&sort=price_asc`;
    await page.goto(`/search?${filterParams}`);
    const container = searchResultsContainer(page);

    const cards = container.locator(sel.card);
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });

    // Record the URL before load-more
    const urlBefore = new URL(page.url());
    const paramsBefore = Object.fromEntries(urlBefore.searchParams.entries());

    // Click load more
    const loadMoreBtn = container.locator(sel.loadMoreBtn);
    const hasLoadMore = await loadMoreBtn.isVisible({ timeout: 30_000 }).catch(() => false);
    if (!hasLoadMore) {
      test.skip(true, 'Load more button not available (fewer results than page size)');
      return;
    }
    const countBefore = await cards.count();
    await loadMoreBtn.click();
    // Wait for card count to increase (filters may reduce matched items)
    await expect(async () => {
      const count = await cards.count();
      expect(count).toBeGreaterThan(countBefore);
    }).toPass({ timeout: 30_000 });
    const countAfter = await cards.count();
    expect(countAfter).toBeGreaterThan(0);

    // Check URL after load-more
    const urlAfter = new URL(page.url());
    const paramsAfter = Object.fromEntries(urlAfter.searchParams.entries());

    // All original params should still be present
    expect(paramsAfter.minPrice).toBe(paramsBefore.minPrice);
    expect(paramsAfter.maxPrice).toBe(paramsBefore.maxPrice);
    expect(paramsAfter.roomType).toBe(paramsBefore.roomType);
    expect(paramsAfter.sort).toBe(paramsBefore.sort);
    expect(paramsAfter.minLat).toBe(paramsBefore.minLat);
    expect(paramsAfter.maxLat).toBe(paramsBefore.maxLat);
    expect(paramsAfter.minLng).toBe(paramsBefore.minLng);
    expect(paramsAfter.maxLng).toBe(paramsBefore.maxLng);

    // No cursor-related params should have been added
    expect(urlAfter.searchParams.has("cursor")).toBe(false);
    expect(urlAfter.searchParams.has("cursorStack")).toBe(false);
    expect(urlAfter.searchParams.has("page")).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 5. Shared URL loads only initial page (bonus invariant test)
  // -------------------------------------------------------------------------
  test("5.1 shared URL only loads initial page of results", async ({
    page,
    context,
  }) => {
    test.slow();

    // 24 mock items for load-more
    await setupPaginationMock(page, { totalLoadMoreItems: 24 });
    await page.goto(`/search?${boundsQS}`);
    const container = searchResultsContainer(page);

    const cards = container.locator(sel.card);
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });

    // Load more to accumulate 24 items
    const loadMoreBtn = container.locator(sel.loadMoreBtn);
    await expect(loadMoreBtn).toBeVisible({ timeout: 30_000 });
    await loadMoreBtn.click();
    await expect(cards).toHaveCount(24, { timeout: 30_000 });

    // Copy the current URL (which should NOT contain cursor)
    const sharedUrl = page.url();
    expect(sharedUrl).not.toContain("cursor");

    // Open the same URL in a new tab (simulating a shared link)
    const newPage = await context.newPage();

    // Set up the same mock for the new page
    await setupPaginationMock(newPage, { totalLoadMoreItems: 24 });
    await newPage.goto(sharedUrl);
    const newContainer = searchResultsContainer(newPage);

    // The new page should only show the initial page of results
    const newCards = newContainer.locator(sel.card);
    await expect(newCards.first()).toBeVisible({ timeout: 30_000 });

    const newPageCount = await newCards.count();
    expect(newPageCount).toBeLessThanOrEqual(12);
    expect(newPageCount).toBeGreaterThanOrEqual(1);

    await newPage.close();
  });

  // -------------------------------------------------------------------------
  // 4.3 Total count display shows exact count or "100+" [P1]
  // -------------------------------------------------------------------------
  test("4.3 total count display shows exact count or 100+", async ({
    page,
  }) => {
    test.slow();

    // Setup mock for consistency with other tests in this file
    // (not strictly needed since this test only checks the initial page)
    await setupPaginationMock(page, { totalLoadMoreItems: 12 });
    await page.goto(`/search?${boundsQS}`);
    const container = searchResultsContainer(page);

    const cards = container.locator(sel.card);
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });

    // The result count header should show either "N places" or "100+ places".
    // Located in the header bar above the search results grid.
    // With ~19 seed listings the total is a real number, so we expect "N places".
    const countHeader = container.locator("text=/\\d+ places|100\\+ places/");
    await expect(countHeader.first()).toBeVisible({ timeout: 30_000 });

    const headerText = await countHeader.first().textContent();
    expect(headerText).toBeTruthy();

    // Verify the text matches one of the expected patterns
    const matchesExact = /\d+ places?/.test(headerText!.trim());
    const matches100Plus = /100\+ places/.test(headerText!.trim());
    expect(matchesExact || matches100Plus).toBe(true);

    // Check the aria-live region for a corresponding announcement.
    // The sr-only live region announces "Found N listings" or
    // "Found more than 100 listings" on initial render.
    // Scope to the visible container to avoid strict mode violation
    // (desktop + mobile containers both have aria-live regions).
    const liveRegion = container.locator(
      '[aria-live="polite"][aria-atomic="true"]',
    );
    await expect(liveRegion).toBeAttached({ timeout: 30_000 });

    const announceText = await liveRegion.textContent();
    expect(announceText).toBeTruthy();

    if (matches100Plus) {
      // 100+: aria-live should say "Found more than 100 listings"
      expect(announceText).toContain("Found more than 100 listings");
    } else {
      // Exact count: aria-live should say "Found N listings" or "Found N listing"
      expect(announceText).toMatch(/Found \d+ listings?/);
    }
  });
});
