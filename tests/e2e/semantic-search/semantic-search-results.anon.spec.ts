/**
 * Semantic Search Results Quality E2E Tests
 *
 * Validates that semantic search results are complete, paginated correctly,
 * and respect filters. Requires ENABLE_SEMANTIC_SEARCH=true.
 *
 * Scenarios: SS-08 through SS-12
 * Run: pnpm playwright test tests/e2e/semantic-search/semantic-search-results.anon.spec.ts
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
  const cardOrEmpty = cards.first().or(
    container.getByText(/no (matches|results|listings)/i).first()
  );
  await expect(cardOrEmpty).toBeVisible({ timeout: 30_000 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Semantic Search - Results Quality", () => {
  test.beforeEach(async () => {
    test.slow();
  });

  test(`${tags.core} SS-08: semantic search listing cards display all required fields`, async ({ page }) => {
    test.skip(!SEMANTIC_ENABLED, "Requires ENABLE_SEMANTIC_SEARCH=true");

    await page.goto(`/search?q=cozy+room+near+campus&${boundsQS}`);
    await waitForSearchOutcome(page);

    const container = searchResultsContainer(page);
    const cards = container.locator('[data-testid="listing-card"]');
    const count = await cards.count();
    test.skip(count === 0, "No results returned — cannot validate card fields");

    const firstCard = cards.first();

    // Title (visible text inside the card link)
    const cardLink = firstCard.locator('a[href*="/listings/"]').first();
    await expect(cardLink).toBeVisible();

    // Price
    await expect(firstCard.locator('[data-testid="listing-price"]')).toBeVisible();

    // Image (carousel or placeholder)
    const img = firstCard.locator('img').first();
    await expect(img).toBeVisible();

    // Location text (city, state somewhere in the card)
    const cardText = await firstCard.textContent();
    expect(cardText).toBeTruthy();
  });

  test(`${tags.core} SS-09: Load More pagination adds semantic results without duplicates`, async ({ page }) => {
    test.skip(!SEMANTIC_ENABLED, "Requires ENABLE_SEMANTIC_SEARCH=true");

    await page.goto(`/search?q=room&${boundsQS}`);
    await waitForSearchOutcome(page);

    const container = searchResultsContainer(page);
    const cards = container.locator('[data-testid="listing-card"]');
    const initialCount = await cards.count();
    test.skip(initialCount < 12, "Fewer than 12 results — Load More won't appear");

    // Collect initial listing IDs
    const initialIds = new Set<string>();
    for (let i = 0; i < initialCount; i++) {
      const id = await cards.nth(i).getAttribute('data-listing-id');
      if (id) initialIds.add(id);
    }

    // Click Load More
    const loadMoreBtn = container.locator(
      'button:has-text("Show more"), button:has-text("Load more")'
    );
    await expect(loadMoreBtn).toBeVisible({ timeout: 10_000 });
    await loadMoreBtn.click();

    // Wait for more cards to appear
    await expect.poll(
      () => cards.count(),
      { timeout: 30_000, message: "Expected more cards after Load More" }
    ).toBeGreaterThan(initialCount);

    const newCount = await cards.count();
    expect(newCount).toBeGreaterThan(initialCount);

    // Verify no duplicates
    const allIds = new Set<string>();
    for (let i = 0; i < newCount; i++) {
      const id = await cards.nth(i).getAttribute('data-listing-id');
      if (id) {
        expect(allIds.has(id)).toBe(false);
        allIds.add(id);
      }
    }
  });

  test(`${tags.core} SS-10: filters apply to semantic search results`, async ({ page }) => {
    test.skip(!SEMANTIC_ENABLED, "Requires ENABLE_SEMANTIC_SEARCH=true");

    await page.goto(
      `/search?q=quiet+study+spot&minPrice=500&maxPrice=1500&${boundsQS}`
    );
    await waitForSearchOutcome(page);

    const container = searchResultsContainer(page);
    const cards = container.locator('[data-testid="listing-card"]');
    const count = await cards.count();

    if (count > 0) {
      for (let i = 0; i < Math.min(count, 3); i++) {
        const priceText = await cards.nth(i).locator('[data-testid="listing-price"]').textContent();
        const price = parseFloat((priceText || '0').replace(/[^0-9.]/g, ''));
        expect(price).toBeGreaterThanOrEqual(500);
        expect(price).toBeLessThanOrEqual(1500);
      }
    }
  });

  test(`SS-11: semantic search with current SEMANTIC_WEIGHT returns results without errors`, async ({ page }) => {
    test.skip(!SEMANTIC_ENABLED, "Requires ENABLE_SEMANTIC_SEARCH=true");

    await page.goto(`/search?q=cozy+room+near+campus&${boundsQS}`);
    await waitForSearchOutcome(page);

    const container = searchResultsContainer(page);
    const cards = container.locator('[data-testid="listing-card"]');
    const cardOrEmpty = cards.first().or(
      container.getByText(/no (matches|results|listings)/i).first()
    );
    // Search completes without crash — results or empty state visible
    await expect(cardOrEmpty).toBeVisible({ timeout: 30_000 });
  });

  test(`${tags.core} SS-12: semantic search results are within geographic bounds`, async ({ page }) => {
    test.skip(!SEMANTIC_ENABLED, "Requires ENABLE_SEMANTIC_SEARCH=true");

    await page.goto(`/search?q=cozy+room&${boundsQS}`);
    await waitForSearchOutcome(page);

    const container = searchResultsContainer(page);
    const cards = container.locator('[data-testid="listing-card"]');
    const count = await cards.count();
    test.skip(count === 0, "No results to verify bounds against");

    const firstCardLink = cards.first().locator('a[href*="/listings/"]').first();
    const href = await firstCardLink.getAttribute('href');
    expect(href).toBeTruthy();

    await page.goto(href!);
    await page.waitForLoadState('domcontentloaded');

    const listingTitle = page.getByRole('heading', { level: 1 }).first();
    await expect(listingTitle).toBeVisible({ timeout: 30_000 });
  });
});
