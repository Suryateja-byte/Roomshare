/**
 * Semantic Search Cursor Reset E2E Test
 *
 * Validates that changing search parameters after semantic search
 * resets accumulated results and pagination cursor.
 *
 * Scenario: SS-58
 * Run: pnpm playwright test tests/e2e/semantic-search/semantic-search-cursor-reset.anon.spec.ts
 */

import {
  test,
  expect,
  tags,
  SF_BOUNDS,
  searchResultsContainer,
} from "../helpers/test-utils";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SEMANTIC_ENABLED = process.env.ENABLE_SEMANTIC_SEARCH === "true";
const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;

async function waitForSearchOutcome(page: import("@playwright/test").Page) {
  const container = searchResultsContainer(page);
  const cards = container.locator('[data-testid="listing-card"]');
  const cardOrEmpty = cards
    .first()
    .or(container.getByText(/no (matches|results|listings)/i).first());
  await expect(cardOrEmpty).toBeVisible({ timeout: 30_000 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Semantic Search - Cursor Reset", () => {
  test.beforeEach(async () => {
    test.slow();
  });

  test(`${tags.core} SS-58: changing search params resets accumulated results`, async ({
    page,
  }) => {
    test.skip(!SEMANTIC_ENABLED, "Requires ENABLE_SEMANTIC_SEARCH=true");

    // Step 1: Search with semantic query
    await page.goto(`/search?q=room&${boundsQS}`);
    await waitForSearchOutcome(page);

    const container = searchResultsContainer(page);
    const cards = container.locator('[data-testid="listing-card"]');
    const initialCount = await cards.count();
    test.skip(
      initialCount < 12,
      "Fewer than 12 results — Load More unavailable"
    );

    // Step 2: Click Load More to accumulate >12 results
    const loadMoreBtn = container.locator(
      'button:has-text("Show more"), button:has-text("Load more")'
    );
    await expect(loadMoreBtn).toBeVisible({ timeout: 10_000 });
    await loadMoreBtn.click();

    await expect
      .poll(() => cards.count(), {
        timeout: 30_000,
        message: "Expected more cards after Load More",
      })
      .toBeGreaterThan(initialCount);

    const accumulatedCount = await cards.count();
    expect(accumulatedCount).toBeGreaterThan(initialCount);

    // Step 3: Change a filter — add price range via URL navigation
    // This simulates applying a filter which changes searchParamsString
    await page.goto(`/search?q=room&minPrice=500&maxPrice=2000&${boundsQS}`);
    await waitForSearchOutcome(page);

    // Step 4: Verify results reset — count should be <= initial page size (12)
    const resetCount = await cards.count();
    expect(resetCount).toBeLessThanOrEqual(12);

    // Verify no stale data: cursor should be null (no "cursor" in URL)
    const url = new URL(page.url(), "http://localhost");
    expect(url.searchParams.get("cursor")).toBeNull();
  });
});
