/**
 * Filter + Pagination Interaction E2E Tests (P0)
 *
 * Validates that filter/sort changes properly reset pagination cursor,
 * seenIdsRef, and accumulated listings via SearchResultsClient's key-based remount.
 */

import {
  test,
  expect,
  tags,
  searchResultsContainer,
  buildSearchUrl,
  waitForSearchReady,
  scopedCards,
  rapidClick,
} from "../helpers";
import { setupPaginationMock } from "../helpers/pagination-mock-factory";

test.describe("Filter + Pagination Interactions", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test(`${tags.filter} Filter change resets cursor and accumulated listings`, async ({
    page,
  }) => {
    // Setup pagination mock with 24 additional items
    const mock = await setupPaginationMock(page, { totalLoadMoreItems: 24 });

    // Navigate to search page
    await page.goto(buildSearchUrl({}));
    await waitForSearchReady(page);

    // Get initial card count (should be ~12-19 from seed data)
    const initialCardCount = await scopedCards(page).count();
    expect(initialCardCount).toBeGreaterThan(0);

    // Click "Show more places" once to load more items
    const loadMoreButton = page.getByRole("button", {
      name: /Show more places/i,
    });
    await expect(loadMoreButton).toBeVisible();
    await loadMoreButton.click();

    // Wait for cards to increase
    await expect(scopedCards(page)).toHaveCount(initialCardCount + 12, {
      timeout: 10000,
    });
    const afterLoadMoreCount = await scopedCards(page).count();
    expect(afterLoadMoreCount).toBeGreaterThan(initialCardCount);
    expect(mock.loadMoreCallCount()).toBe(1);

    // Apply a filter (amenities=Wifi) - this should reset the cursor
    await page.goto(buildSearchUrl({ amenities: "Wifi" }));
    await waitForSearchReady(page);

    // After navigation with filter, component remounts with new key
    // The extra mock listings from before should be gone
    const afterFilterCount = await scopedCards(page).count();
    // Should be back to DB-level results (no accumulated mock data)
    expect(afterFilterCount).toBeLessThan(afterLoadMoreCount);

    // URL should have the filter but no cursor/page params
    const url = new URL(page.url());
    expect(url.searchParams.get("amenities")).toBe("Wifi");
    expect(url.searchParams.has("cursor")).toBe(false);
    expect(url.searchParams.has("page")).toBe(false);

    // "Show more places" button should be available again (fresh cursor)
    await expect(loadMoreButton).toBeVisible();
  });

  test(`${tags.filter} Sort change resets cursor and accumulated listings`, async ({
    page,
  }) => {
    // Setup pagination mock with 24 additional items
    await setupPaginationMock(page, { totalLoadMoreItems: 24 });

    // Navigate to search page
    await page.goto(buildSearchUrl({}));
    await waitForSearchReady(page);

    // Get initial card count
    const initialCardCount = await scopedCards(page).count();
    expect(initialCardCount).toBeGreaterThan(0);

    // Click "Show more places" once to load more items
    const loadMoreButton = page.getByRole("button", {
      name: /Show more places/i,
    });
    await expect(loadMoreButton).toBeVisible();
    await loadMoreButton.click();

    // Wait for cards to increase
    await expect(scopedCards(page)).toHaveCount(initialCardCount + 12, {
      timeout: 10000,
    });
    const afterLoadMoreCount = await scopedCards(page).count();
    expect(afterLoadMoreCount).toBeGreaterThan(initialCardCount);

    // Navigate with sort parameter - this should reset the cursor
    await page.goto(buildSearchUrl({ sort: "price_asc" }));
    await waitForSearchReady(page);

    // After navigation with sort, component remounts
    // Card count should be back to initial level (12 or fewer from DB)
    const afterSortCount = await scopedCards(page).count();
    expect(afterSortCount).toBeLessThan(afterLoadMoreCount);

    // URL should have sort param but no cursor/page params
    const url = new URL(page.url());
    expect(url.searchParams.get("sort")).toBe("price_asc");
    expect(url.searchParams.has("cursor")).toBe(false);
    expect(url.searchParams.has("page")).toBe(false);

    // "Show more places" button should be available again
    await expect(loadMoreButton).toBeVisible();
  });

  test(`${tags.filter} Load more → filter change → load more uses fresh cursor`, async ({
    page,
  }) => {
    // Setup pagination mock with 48 additional items
    await setupPaginationMock(page, { totalLoadMoreItems: 48 });

    // Navigate to search page
    await page.goto(buildSearchUrl({}));
    await waitForSearchReady(page);

    const initialCardCount = await scopedCards(page).count();

    // Click "Show more places" once
    const loadMoreButton = page.getByRole("button", {
      name: /Show more places/i,
    });
    await expect(loadMoreButton).toBeVisible();
    await loadMoreButton.click();

    // Wait for cards to increase
    await expect(scopedCards(page)).toHaveCount(initialCardCount + 12, {
      timeout: 10000,
    });
    const afterFirstLoadCount = await scopedCards(page).count();

    // Navigate with filter change (amenities=Parking)
    await page.goto(buildSearchUrl({ amenities: "Parking" }));
    await waitForSearchReady(page);

    // After remount, page reloads with fresh SSR data
    const afterFilterCount = await scopedCards(page).count();
    expect(afterFilterCount).toBeLessThan(afterFirstLoadCount);

    // Click "Show more places" again - should use fresh cursor
    await expect(loadMoreButton).toBeVisible();
    await loadMoreButton.click();

    // Wait for cards to increase from the fresh base
    await expect(scopedCards(page)).toHaveCount(afterFilterCount + 12, {
      timeout: 10000,
    });
    const finalCardCount = await scopedCards(page).count();
    expect(finalCardCount).toBeGreaterThan(afterFilterCount);

    // Verify no duplicate IDs (seenIdsRef was reset on remount)
    // Get all listing IDs from cards
    const cards = scopedCards(page);
    const cardCount = await cards.count();
    const listingIds = new Set<string>();

    for (let i = 0; i < cardCount; i++) {
      const card = cards.nth(i);
      const href = await card.locator("a").first().getAttribute("href");
      if (href) {
        const listingId = href.split("/listing/")[1]?.split("?")[0];
        if (listingId) {
          listingIds.add(listingId);
        }
      }
    }

    // Number of unique IDs should equal total cards (no duplicates)
    expect(listingIds.size).toBe(cardCount);
  });

  test(`${tags.filter} Rapid Load More clicks prevented by isLoadingMore guard`, async ({
    page,
  }) => {
    // Setup pagination mock with delay to simulate slow response
    const mock = await setupPaginationMock(page, {
      totalLoadMoreItems: 24,
      delayMs: 500,
    });

    // Navigate to search page
    await page.goto(buildSearchUrl({}));
    await waitForSearchReady(page);

    const initialCardCount = await scopedCards(page).count();

    // Wait for "Show more places" button
    const loadMoreButton = page.getByRole("button", {
      name: /Show more places/i,
    });
    await expect(loadMoreButton).toBeVisible();

    // Use rapidClick to click it 3 times quickly (50ms interval)
    await rapidClick(loadMoreButton, 3, 50);

    // Wait for loading to complete (button re-enabled)
    await expect(loadMoreButton).toBeEnabled({ timeout: 10000 });

    // Check that loadMoreCallCount is exactly 1 (isLoadingMore guard prevented concurrent calls)
    expect(mock.loadMoreCallCount()).toBe(1);

    // Card count should have increased by exactly one page worth (~12)
    const finalCardCount = await scopedCards(page).count();
    expect(finalCardCount).toBe(initialCardCount + 12);
  });

  test(`${tags.filter} Hit MAX_ACCUMULATED cap → filter change → cap resets`, async ({
    page,
  }) => {
    // Setup pagination mock with 60 items (enough to reach cap)
    await setupPaginationMock(page, { totalLoadMoreItems: 60 });

    // Navigate to search page
    await page.goto(buildSearchUrl({}));
    await waitForSearchReady(page);

    const loadMoreButton = page.getByRole("button", {
      name: /Show more places/i,
    });

    // Click "Show more places" 4 times sequentially to reach cap
    // Each click should load ~12 items: initial ~15 + 4*12 = ~63 (exceeds MAX_ACCUMULATED=60)
    for (let i = 0; i < 4; i++) {
      await expect(loadMoreButton).toBeVisible();
      await loadMoreButton.click();
      // Wait for button to be enabled again (loading complete)
      await expect(loadMoreButton).toBeEnabled({ timeout: 10000 });
      await page.waitForTimeout(300); // Small delay between clicks for stability
    }

    // After reaching cap, verify cap message is visible
    const capMessage = searchResultsContainer(page).locator(
      "text=/Showing.*results.*Refine/i"
    );
    await expect(capMessage).toBeVisible({ timeout: 5000 });

    // "Show more places" button should NOT be visible
    await expect(loadMoreButton).not.toBeVisible();

    // Navigate with filter change (amenities=Wifi)
    await page.goto(buildSearchUrl({ amenities: "Wifi" }));
    await waitForSearchReady(page);

    // After remount, cap message should be gone
    await expect(capMessage).not.toBeVisible();

    // Card count should be back to initial level (fresh SSR data)
    const afterFilterCount = await scopedCards(page).count();
    expect(afterFilterCount).toBeLessThan(60); // Well below cap
    expect(afterFilterCount).toBeGreaterThan(0); // But has some results

    // "Show more places" button should be visible again
    await expect(loadMoreButton).toBeVisible();
  });
});
