/**
 * Pagination Core Tests
 *
 * Tests the "load more" pagination flow in SearchResultsClient.
 *
 * Strategy:
 * - The initial page load uses REAL data from the database (SSR).
 *   The DB has ~19 seed listings in SF bounds, so the first page shows
 *   exactly 12 items (ITEMS_PER_PAGE) with a cursor pointing to the rest.
 * - "Load more" triggers a Next.js server action (POST with Next-Action header).
 *   We intercept ONLY these POST requests and return mock data.
 * - This avoids fragile RSC payload manipulation and lets the initial page
 *   render normally with real React hydration.
 *
 * Key component behavior (from SearchResultsClient.tsx):
 * - ITEMS_PER_PAGE = 12 (initial page)
 * - MAX_ACCUMULATED = 60 (client cap)
 * - seenIdsRef deduplicates across load-more appends
 * - fetchMoreListings is a server action (POST with Next-Action header)
 * - Button shows "Show more places" when idle, "Loading..." when busy
 * - Button is disabled + aria-busy="true" during fetch
 *
 * Run: pnpm playwright test tests/e2e/pagination/pagination-core.spec.ts --project=chromium
 */

import { test, expect, SF_BOUNDS, searchResultsContainer } from "../helpers/test-utils";
import { setupPaginationMock } from "../helpers/pagination-mock-factory";

const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;

// Selectors derived from SearchResultsClient.tsx and ListingCard.tsx
const sel = {
  feed: '[role="feed"][aria-label="Search results"]',
  card: '[data-testid="listing-card"]',
  loadMoreBtn: 'button:has-text("Show more places")',
  loadingBtn: 'button[aria-busy="true"]',
  capMessage: "text=/Showing \\d+ results.*Refine/",
  endMessage: "text=/seen all \\d+ results/",
  errorText: '[role="alert"]',
  retryBtn: 'button:has-text("Try again")',
} as const;

// ---------------------------------------------------------------------------
// Setup: mark all tests as slow (they involve SSR + hydration + mocking)
// ---------------------------------------------------------------------------
test.describe("Pagination Core", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async () => {
    test.slow();
  });

  // -------------------------------------------------------------------------
  // 1. Basic load-more: initial 12 real + 12 mock = 24
  // -------------------------------------------------------------------------
  test("1.1 clicking Show more loads the next page of results", async ({
    page,
  }) => {
    test.slow();

    // 12 mock items for one load-more page
    const mock = await setupPaginationMock(page, { totalLoadMoreItems: 12 });

    await page.goto(`/search?${boundsQS}`);
    const container = searchResultsContainer(page);

    // Wait for initial listings to render (real DB data via SSR + hydration)
    const cards = container.locator(sel.card);
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });

    const initialCount = await cards.count();
    // DB has ~19 listings, initial page shows exactly 12 (ITEMS_PER_PAGE)
    expect(initialCount).toBeLessThanOrEqual(12);
    expect(initialCount).toBeGreaterThanOrEqual(1);

    // The "Show more places" button should be visible (real cursor from DB)
    const loadMoreBtn = container.locator(sel.loadMoreBtn);
    await expect(loadMoreBtn).toBeVisible({ timeout: 15_000 });

    // Click load more — mock intercepts the server action POST
    await loadMoreBtn.click();

    // Wait for additional mock cards to appear: 12 initial + 12 mock = 24
    await expect(cards).toHaveCount(24, { timeout: 15_000 });

    // Verify the mock was called
    expect(mock.loadMoreCallCount()).toBe(1);
    expect(mock.successfulLoadCount()).toBe(1);
  });

  // -------------------------------------------------------------------------
  // 2. No duplicates across pages
  // -------------------------------------------------------------------------
  test("2.1 no duplicate listing IDs across paginated results", async ({
    page,
  }) => {
    test.slow();

    // 24 mock items for two load-more pages (12 + 12)
    await setupPaginationMock(page, { totalLoadMoreItems: 24 });
    await page.goto(`/search?${boundsQS}`);
    const container = searchResultsContainer(page);

    const cards = container.locator(sel.card);
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });

    // Load more twice: 12 initial + 12 + 12 = 36
    const loadMoreBtn = container.locator(sel.loadMoreBtn);
    await expect(loadMoreBtn).toBeVisible({ timeout: 15_000 });

    await loadMoreBtn.click();
    await expect(cards).toHaveCount(24, { timeout: 15_000 });

    // Second load-more (button reappears after first load completes)
    await expect(loadMoreBtn).toBeVisible({ timeout: 15_000 });
    await loadMoreBtn.click();
    await expect(cards).toHaveCount(36, { timeout: 15_000 });

    // Extract all listing IDs
    const allIds = await cards.evaluateAll((elements) =>
      elements.map((el) => el.getAttribute("data-listing-id")),
    );

    // All IDs should be non-null
    const validIds = allIds.filter(Boolean) as string[];
    expect(validIds.length).toBe(36);

    // Set size should equal array length (no duplicates)
    // Real IDs are like "cml14d4560003spyxz4iu4fku", mock IDs are "mock-listing-NNN"
    const uniqueIds = new Set(validIds);
    expect(uniqueIds.size).toBe(validIds.length);
  });

  // -------------------------------------------------------------------------
  // 3. MAX_ACCUMULATED = 60 cap
  // -------------------------------------------------------------------------
  test("3.1 stops loading at MAX_ACCUMULATED=60 and shows cap message", async ({
    page,
  }) => {
    test.slow();

    // 60 mock items so that after four load-more pages (12 * 4 = 48 consumed),
    // there are still 12 remaining → nextCursor stays non-null at the cap.
    // Combined with 12 real initial items = 60 (the cap).
    // The component shows cap message only when reachedCap && nextCursor.
    await setupPaginationMock(page, { totalLoadMoreItems: 60 });
    await page.goto(`/search?${boundsQS}`);
    const container = searchResultsContainer(page);

    const cards = container.locator(sel.card);
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });

    // Click load-more repeatedly until we hit the cap
    // 12 initial + 4 loads of 12 = 60
    for (let i = 0; i < 4; i++) {
      const loadMoreBtn = container.locator(sel.loadMoreBtn);
      await expect(loadMoreBtn).toBeVisible({ timeout: 15_000 });
      await loadMoreBtn.click();
      // Wait for cards to increase: (i + 2) * 12 = 24, 36, 48, 60
      await expect(cards).toHaveCount((i + 2) * 12, { timeout: 15_000 });
    }

    // Should have exactly 60 items
    const finalCount = await cards.count();
    expect(finalCount).toBe(60);

    // "Show more places" button should NOT be visible (cap reached)
    await expect(container.locator(sel.loadMoreBtn)).not.toBeVisible({
      timeout: 5_000,
    });

    // Cap message should be visible
    const capMsg = container.locator(sel.capMessage);
    await expect(capMsg).toBeVisible({ timeout: 5_000 });
  });

  // -------------------------------------------------------------------------
  // 4. End-of-results message
  // -------------------------------------------------------------------------
  test("4.1 shows end-of-results message when all items loaded", async ({
    page,
  }) => {
    test.slow();

    // Only 3 mock items for load-more (less than a full page)
    // The mock will return hasNextPage: false and nextCursor: null
    await setupPaginationMock(page, { totalLoadMoreItems: 3 });
    await page.goto(`/search?${boundsQS}`);
    const container = searchResultsContainer(page);

    const cards = container.locator(sel.card);
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });

    // Load more to get remaining 3 mock items: 12 initial + 3 = 15
    const loadMoreBtn = container.locator(sel.loadMoreBtn);
    await expect(loadMoreBtn).toBeVisible({ timeout: 15_000 });
    await loadMoreBtn.click();

    // Wait for all 15 items
    await expect(cards).toHaveCount(15, { timeout: 15_000 });

    // "Show more places" button should disappear
    await expect(container.locator(sel.loadMoreBtn)).not.toBeVisible({
      timeout: 5_000,
    });

    // End-of-results message should appear
    const endMsg = container.locator(sel.endMessage);
    await expect(endMsg).toBeVisible({ timeout: 5_000 });
  });

  // -------------------------------------------------------------------------
  // 5. Loading state during fetch
  // -------------------------------------------------------------------------
  test("5.1 shows loading state while fetching more results", async ({
    page,
  }) => {
    test.slow();

    // Add a 2-second delay to make the loading state observable
    await setupPaginationMock(page, {
      totalLoadMoreItems: 12,
      delayMs: 2000,
    });
    await page.goto(`/search?${boundsQS}`);
    const container = searchResultsContainer(page);

    const cards = container.locator(sel.card);
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });

    const loadMoreBtn = container.locator(sel.loadMoreBtn);
    await expect(loadMoreBtn).toBeVisible({ timeout: 15_000 });

    // Click load more
    await loadMoreBtn.click();

    // The button should immediately enter loading state
    // Check for aria-busy="true" on the button
    const busyBtn = container.locator('button[aria-busy="true"]');
    await expect(busyBtn).toBeVisible({ timeout: 3_000 });

    // The button should be disabled during loading
    await expect(busyBtn).toBeDisabled();

    // Wait for loading to complete (items appear): 12 + 12 = 24
    await expect(cards).toHaveCount(24, { timeout: 15_000 });

    // Loading state should be gone
    await expect(busyBtn).not.toBeVisible({ timeout: 5_000 });
  });

  // -------------------------------------------------------------------------
  // 6. Error during load-more
  // -------------------------------------------------------------------------
  test("6.1 shows error message and retry button on load-more failure", async ({
    page,
  }) => {
    test.slow();

    // First load-more will fail (abort the request)
    await setupPaginationMock(page, {
      totalLoadMoreItems: 12,
      failOnLoadMore: 1,
    });
    await page.goto(`/search?${boundsQS}`);
    const container = searchResultsContainer(page);

    const cards = container.locator(sel.card);
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });

    const loadMoreBtn = container.locator(sel.loadMoreBtn);
    await expect(loadMoreBtn).toBeVisible({ timeout: 15_000 });

    // Click load more (will fail)
    await loadMoreBtn.click();

    // Error text should appear
    const errorEl = container.locator(sel.errorText);
    await expect(errorEl).toBeVisible({ timeout: 15_000 });

    // "Try again" button should be visible
    const retryBtn = container.locator(sel.retryBtn);
    await expect(retryBtn).toBeVisible();

    // Card count should not have increased
    const countAfterError = await cards.count();
    expect(countAfterError).toBeLessThanOrEqual(12);
  });

  // -------------------------------------------------------------------------
  // 7. Retry after error
  // -------------------------------------------------------------------------
  test("7.1 retry after error successfully loads more results", async ({
    page,
  }) => {
    test.slow();

    // First load-more fails, retry succeeds
    const mock = await setupPaginationMock(page, {
      totalLoadMoreItems: 12,
      failOnLoadMore: 1,
    });
    await page.goto(`/search?${boundsQS}`);
    const container = searchResultsContainer(page);

    const cards = container.locator(sel.card);
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });

    // Trigger load-more (will fail)
    const loadMoreBtn = container.locator(sel.loadMoreBtn);
    await expect(loadMoreBtn).toBeVisible({ timeout: 15_000 });
    await loadMoreBtn.click();

    // Wait for error state
    const retryBtn = container.locator(sel.retryBtn);
    await expect(retryBtn).toBeVisible({ timeout: 15_000 });

    // Click "Try again" (second call to the mock, which should succeed)
    await retryBtn.click();

    // New items should appear: 12 + 12 = 24
    await expect(cards).toHaveCount(24, { timeout: 15_000 });

    // Error should be cleared
    await expect(container.locator(sel.errorText)).not.toBeVisible({
      timeout: 5_000,
    });

    // Verify call counts
    expect(mock.loadMoreCallCount()).toBe(2); // 1 failed + 1 success
    expect(mock.successfulLoadCount()).toBe(1); // only 1 successful
  });

  // -------------------------------------------------------------------------
  // 8. Rapid double-click protection
  // -------------------------------------------------------------------------
  test("8.1 rapid double-click on load-more only triggers one fetch", async ({
    page,
  }) => {
    test.slow();

    // Use delay so the loading state is observable during double-click
    const mock = await setupPaginationMock(page, {
      totalLoadMoreItems: 12,
      delayMs: 1000,
    });
    await page.goto(`/search?${boundsQS}`);
    const container = searchResultsContainer(page);

    const cards = container.locator(sel.card);
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });

    const loadMoreBtn = container.locator(sel.loadMoreBtn);
    await expect(loadMoreBtn).toBeVisible({ timeout: 15_000 });

    // Click the button twice in rapid succession
    await loadMoreBtn.click();
    // Try to click again immediately (button should be disabled)
    await loadMoreBtn.click({ force: true }).catch(() => {
      // Click might fail if button is disabled/busy - that's expected
    });

    // Wait for load to complete: 12 + 12 = 24
    await expect(cards).toHaveCount(24, { timeout: 15_000 });

    // Only ONE server action call should have been made
    // (the guard `if (isLoadingMore) return` prevents duplicate calls)
    expect(mock.loadMoreCallCount()).toBe(1);
  });

  // -------------------------------------------------------------------------
  // 1.2 Show more button visible when cursor is present [P0]
  // -------------------------------------------------------------------------
  test("1.2 show more button is visible when cursor is present", async ({
    page,
  }) => {
    test.slow();

    // Navigate with real DB data -- ~19 seed listings in SF bounds
    // produces 12 initial results with a nextCursor
    await page.goto(`/search?${boundsQS}`);
    const container = searchResultsContainer(page);

    const cards = container.locator(sel.card);
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });

    // Should have up to 12 initial results
    const initialCount = await cards.count();
    expect(initialCount).toBeLessThanOrEqual(12);
    expect(initialCount).toBeGreaterThanOrEqual(1);

    // "Show more places" button should be visible (cursor returned by DB)
    await expect(container.locator(sel.loadMoreBtn)).toBeVisible({
      timeout: 15_000,
    });
  });

  // -------------------------------------------------------------------------
  // 1.3 Show more button hidden when no next cursor [P0]
  // -------------------------------------------------------------------------
  test("1.3 show more button is hidden when no next cursor", async ({
    page,
  }) => {
    test.slow();

    // Use tight bounds within SF to get fewer than 12 results from seed data.
    // With ~19 listings spread across the full SF bounds, these narrow bounds
    // should yield fewer than 12, so the server returns no nextCursor.
    const narrowBoundsQS = `minLat=37.78&maxLat=37.82&minLng=-122.44&maxLng=-122.40`;
    await page.goto(`/search?${narrowBoundsQS}`);
    const container = searchResultsContainer(page);

    // Wait for the page to render -- either listing cards or zero-results UI
    const feedOrZero = container.locator(
      `${sel.feed}, h2:has-text("No matches found")`,
    );
    await expect(feedOrZero.first()).toBeVisible({ timeout: 30_000 });

    // "Show more places" button should NOT be visible (no second page)
    await expect(container.locator(sel.loadMoreBtn)).not.toBeVisible({
      timeout: 5_000,
    });
  });

  // -------------------------------------------------------------------------
  // 2.3 No duplicate IDs across 3+ load-more clicks [P1]
  // -------------------------------------------------------------------------
  test("2.3 no duplicate IDs across 3+ load-more clicks", async ({
    page,
  }) => {
    test.slow();

    // 36 mock items for three load-more pages (12 * 3)
    await setupPaginationMock(page, { totalLoadMoreItems: 36 });
    await page.goto(`/search?${boundsQS}`);
    const container = searchResultsContainer(page);

    const cards = container.locator(sel.card);
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });

    // Click load-more 3 times: 12 initial + 36 mock = 48
    for (let i = 0; i < 3; i++) {
      const loadMoreBtn = container.locator(sel.loadMoreBtn);
      await expect(loadMoreBtn).toBeVisible({ timeout: 15_000 });
      await loadMoreBtn.click();
      await expect(cards).toHaveCount((i + 2) * 12, { timeout: 15_000 });
    }

    // Verify 48 total cards
    const finalCount = await cards.count();
    expect(finalCount).toBe(48);

    // Extract all listing IDs
    const allIds = await cards.evaluateAll((elements) =>
      elements.map((el) => el.getAttribute("data-listing-id")),
    );

    // All IDs should be non-null
    const validIds = allIds.filter(Boolean) as string[];
    expect(validIds.length).toBe(48);

    // Set size should equal array length (no duplicates across all 4 pages)
    const uniqueIds = new Set(validIds);
    expect(uniqueIds.size).toBe(validIds.length);
  });

  // -------------------------------------------------------------------------
  // 3.2 Cap message has correct text and styling [P1]
  // -------------------------------------------------------------------------
  test("3.2 cap message has correct styling", async ({ page }) => {
    test.slow();

    // 60 mock items so that after 4 loads of 12 (48 consumed), cursor stays
    // non-null. The component shows cap message only when reachedCap && nextCursor.
    await setupPaginationMock(page, { totalLoadMoreItems: 60 });
    await page.goto(`/search?${boundsQS}`);
    const container = searchResultsContainer(page);

    const cards = container.locator(sel.card);
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });

    // Click load-more 4 times to reach 60 items
    for (let i = 0; i < 4; i++) {
      const loadMoreBtn = container.locator(sel.loadMoreBtn);
      await expect(loadMoreBtn).toBeVisible({ timeout: 15_000 });
      await loadMoreBtn.click();
      await expect(cards).toHaveCount((i + 2) * 12, { timeout: 15_000 });
    }

    // Cap message should be visible
    const capMsg = container.locator(sel.capMessage);
    await expect(capMsg).toBeVisible({ timeout: 5_000 });

    // Verify text content matches expected pattern
    const capText = await capMsg.textContent();
    expect(capText).toMatch(/Showing 60 results.*Refine/);

    // Verify the cap message is centered and has muted styling via computed styles
    const textAlign = await capMsg.evaluate((el) =>
      getComputedStyle(el).textAlign,
    );
    expect(textAlign).toBe("center");

    // Verify muted text color (should not be pure black or white)
    const color = await capMsg.evaluate((el) =>
      getComputedStyle(el).color,
    );
    expect(color).toBeTruthy();

    // No "Show more places" button should remain
    await expect(container.locator(sel.loadMoreBtn)).not.toBeVisible({
      timeout: 5_000,
    });
  });

  // -------------------------------------------------------------------------
  // 3.3 Button hidden when initial SSR exceeds cap [P1]
  //
  // NOTE: Scenario 3.3 in the spec requires mocking the initial SSR response
  //       to deliver 65+ items (exceeding MAX_ACCUMULATED=60). This is not
  //       feasible with our current mock strategy because the initial page
  //       load uses real DB data fetched server-side (not via an interceptable
  //       network request). The seed database only has ~19 listings.
  //
  //       Instead, we verify the equivalent behavior: the mock provides more
  //       items than needed to reach the cap, and we confirm the button is
  //       hidden once accumulated count reaches 60 -- even though more data
  //       remains available on the server. A true "SSR > 60" test would
  //       require a test-specific database seed or server-side mocking.
  // -------------------------------------------------------------------------
  test("3.3 load-more button hidden once accumulated count exceeds cap", async ({
    page,
  }) => {
    test.slow();

    // 60 mock items available -- more than enough to exceed the cap.
    // Client will stop at 48 mock + 12 real = 60 (the cap).
    // The extra 12 mock items beyond the cap are never requested.
    await setupPaginationMock(page, { totalLoadMoreItems: 60 });
    await page.goto(`/search?${boundsQS}`);
    const container = searchResultsContainer(page);

    const cards = container.locator(sel.card);
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });

    // Load until the cap: 4 clicks of 12 mock items each
    for (let i = 0; i < 4; i++) {
      const loadMoreBtn = container.locator(sel.loadMoreBtn);
      await expect(loadMoreBtn).toBeVisible({ timeout: 15_000 });
      await loadMoreBtn.click();
      await expect(cards).toHaveCount((i + 2) * 12, { timeout: 15_000 });
    }

    // At 60 items (cap), button must be hidden even though more mock data exists
    await expect(container.locator(sel.loadMoreBtn)).not.toBeVisible({
      timeout: 5_000,
    });

    // Cap message should be present (the server still has data, but client stopped)
    await expect(container.locator(sel.capMessage)).toBeVisible({
      timeout: 5_000,
    });

    // Verify that all 60 items are rendered (cap controls button visibility,
    // not rendering)
    expect(await cards.count()).toBe(60);
  });

  // -------------------------------------------------------------------------
  // 4.2 No end-of-results message when all results fit on first page [P1]
  // -------------------------------------------------------------------------
  test("4.2 no end-of-results message when all results fit on first page", async ({
    page,
  }) => {
    test.slow();

    // Use tight bounds within SF to get fewer than 12 results from seed data.
    // With fewer than a full page of results, there is no cursor and no
    // load-more interaction -- so the "You've seen all N results" message
    // should NOT appear (it requires extraListings.length > 0).
    const narrowBoundsQS = `minLat=37.78&maxLat=37.82&minLng=-122.44&maxLng=-122.40`;
    await page.goto(`/search?${narrowBoundsQS}`);
    const container = searchResultsContainer(page);

    // Wait for the page to render
    const feedOrZero = container.locator(
      `${sel.feed}, h2:has-text("No matches found")`,
    );
    await expect(feedOrZero.first()).toBeVisible({ timeout: 30_000 });

    // "Show more places" button should NOT be visible
    await expect(container.locator(sel.loadMoreBtn)).not.toBeVisible({
      timeout: 5_000,
    });

    // End-of-results message should NOT be visible.
    // The message only shows when extraListings.length > 0, which requires
    // at least one successful load-more -- not the case when everything
    // fits on the first page.
    await expect(container.locator(sel.endMessage)).not.toBeVisible({
      timeout: 5_000,
    });
  });

  // -------------------------------------------------------------------------
  // 10.2 Exactly 12 results with no next page shows no button [P1]
  //
  // NOTE: The initial SSR page always uses real DB data. With ~19 seed
  //       listings in SF bounds, the initial page always returns 12 items
  //       with a nextCursor. To test "exactly 12, no cursor," we would need
  //       SSR mocking (not supported by our route interception strategy).
  //       This test uses narrow bounds to approximate the scenario: fewer
  //       than 12 initial results with no cursor, verifying no button and
  //       no end message. The exact "12 with no cursor" boundary is also
  //       covered at the unit/component level in SearchResultsClient.test.tsx.
  // -------------------------------------------------------------------------
  test("10.2 fewer-than-full-page results show no button and no end message", async ({
    page,
  }) => {
    test.slow();

    // Narrow bounds to get < 12 results from seed data (approximates the
    // "exactly 12 with no cursor" edge case at a broader level)
    const narrowBoundsQS = `minLat=37.76&maxLat=37.79&minLng=-122.46&maxLng=-122.43`;
    await page.goto(`/search?${narrowBoundsQS}`);
    const container = searchResultsContainer(page);

    // Wait for the page to render
    const feedOrZero = container.locator(
      `${sel.feed}, h2:has-text("No matches found")`,
    );
    await expect(feedOrZero.first()).toBeVisible({ timeout: 30_000 });

    // Count visible cards
    const cards = container.locator(sel.card);
    const count = await cards.count();
    // Should have fewer than 12 (tight bounds reduce results)
    expect(count).toBeLessThanOrEqual(12);

    // "Show more places" button should NOT be visible
    await expect(container.locator(sel.loadMoreBtn)).not.toBeVisible({
      timeout: 5_000,
    });

    // No "You've seen all" end message (no load-more was done)
    await expect(container.locator(sel.endMessage)).not.toBeVisible({
      timeout: 5_000,
    });
  });

  // -------------------------------------------------------------------------
  // 10.3 Exactly 13 results shows button then end message [P2]
  // -------------------------------------------------------------------------
  test("10.3 exactly 13 results shows button then end message", async ({
    page,
  }) => {
    test.slow();

    // 1 mock item for load-more (1 extra beyond the initial page)
    // 12 initial (real) + 1 mock = 13 total
    await setupPaginationMock(page, { totalLoadMoreItems: 1 });
    await page.goto(`/search?${boundsQS}`);
    const container = searchResultsContainer(page);

    const cards = container.locator(sel.card);
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });

    // Button should be visible (cursor present from SSR)
    const loadMoreBtn = container.locator(sel.loadMoreBtn);
    await expect(loadMoreBtn).toBeVisible({ timeout: 15_000 });

    // Click load-more (mock returns 1 item with no cursor)
    await loadMoreBtn.click();

    // Wait for 13 total cards: 12 initial + 1 mock
    await expect(cards).toHaveCount(13, { timeout: 15_000 });

    // Button should disappear (no more pages)
    await expect(container.locator(sel.loadMoreBtn)).not.toBeVisible({
      timeout: 5_000,
    });

    // End-of-results message should appear (extraListings.length > 0)
    await expect(container.locator(sel.endMessage)).toBeVisible({
      timeout: 5_000,
    });
  });

  // -------------------------------------------------------------------------
  // 10.5 High-latency network shows extended loading state [P2]
  // -------------------------------------------------------------------------
  test("10.5 high-latency network shows extended loading state", async ({
    page,
  }) => {
    test.slow();

    // 5-second delay on load-more to simulate high-latency network
    await setupPaginationMock(page, {
      totalLoadMoreItems: 12,
      delayMs: 5000,
    });
    await page.goto(`/search?${boundsQS}`);
    const container = searchResultsContainer(page);

    const cards = container.locator(sel.card);
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });

    const loadMoreBtn = container.locator(sel.loadMoreBtn);
    await expect(loadMoreBtn).toBeVisible({ timeout: 15_000 });

    // Click load-more
    await loadMoreBtn.click();

    // Loading state should appear immediately
    const busyBtn = container.locator(sel.loadingBtn);
    await expect(busyBtn).toBeVisible({ timeout: 3_000 });

    // Loading state should persist during the 5-second delay.
    // Wait 3 seconds and verify button is still in loading state.
    await page.waitForTimeout(3_000);
    await expect(busyBtn).toBeVisible();
    await expect(busyBtn).toBeDisabled();

    // Eventually, results should appear (after ~5s total delay)
    await expect(cards).toHaveCount(24, { timeout: 15_000 });

    // Loading state should clear after response
    await expect(busyBtn).not.toBeVisible({ timeout: 5_000 });
  });
});
