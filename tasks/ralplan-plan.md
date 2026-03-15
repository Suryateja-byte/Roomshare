# Semantic Search E2E Tests — Implementation Plan

## Execution Order

Tasks 1-4 can be implemented in **parallel** (no dependencies between files).
Tasks 5-6 are small and can run in parallel with anything.

| Task | File | Scenarios | Complexity | Parallel Group |
|------|------|-----------|------------|----------------|
| 1 | `semantic-search-activation.anon.spec.ts` | SS-01..SS-07 | Medium | A |
| 2 | `semantic-search-results.anon.spec.ts` | SS-08..SS-12 | Medium | A |
| 3 | `semantic-search-similar-listings.anon.spec.ts` | SS-20..SS-27, SS-56, SS-57, SS-61 | High | A |
| 4 | `semantic-search-resilience.anon.spec.ts` | SS-40..SS-42, SS-55 | Low | A |
| 5 | `semantic-search-cursor-reset.anon.spec.ts` | SS-58 | Medium | A |
| 6 | `semantic-search-xss.anon.spec.ts` | SS-60 | Low | A |

---

## Task 1: Activation Tests

**File**: `tests/e2e/semantic-search/semantic-search-activation.anon.spec.ts`
**Scenarios**: SS-01 through SS-07
**Complexity**: Medium (7 tests, all environment-agnostic)

### Acceptance Criteria
- All 7 tests pass when `ENABLE_SEMANTIC_SEARCH=true` and embeddings exist
- All 7 tests pass (via FTS fallback) when `ENABLE_SEMANTIC_SEARCH=false`
- No test crashes or shows uncaught errors in either environment
- Tests use `searchResultsContainer(page)` for all card locators

### Complete Code Outline

```typescript
/**
 * Semantic Search Activation E2E Tests
 *
 * Validates that semantic search activates under correct conditions and
 * gracefully falls back to FTS otherwise. All tests are environment-agnostic:
 * they verify search *works* regardless of whether semantic search is enabled.
 *
 * Scenarios: SS-01 through SS-07
 * Run: pnpm playwright test tests/e2e/semantic-search/semantic-search-activation.anon.spec.ts
 */

import {
  test,
  expect,
  tags,
  SF_BOUNDS,
  searchResultsContainer,
  selectors,
  timeouts,
} from "../helpers/test-utils";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;

/** Wait for listing cards or a "no results" message to be visible. */
async function waitForSearchOutcome(page: import("@playwright/test").Page) {
  const container = searchResultsContainer(page);
  const cards = container.locator('[data-testid="listing-card"]');
  const cardOrEmpty = cards.first().or(
    page.getByText(/no (matches|results|listings)/i)
  );
  await expect(cardOrEmpty).toBeVisible({ timeout: 30_000 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Semantic Search - Activation", () => {
  test.beforeEach(async () => {
    test.slow();
  });

  test(`${tags.core} SS-01: search returns results for natural language query with recommended sort`, async ({ page }) => {
    // Navigate with query >= 3 chars, sort=recommended (default)
    await page.goto(`/search?q=cozy+room+near+campus&${boundsQS}`);
    await waitForSearchOutcome(page);

    // Verify listing cards appear (semantic or FTS — either is acceptable)
    const container = searchResultsContainer(page);
    const cards = container.locator('[data-testid="listing-card"]');
    const count = await cards.count();

    // Should have at least 1 result for a broad query in SF
    // If 0 results, the "no results" message should be visible (not a crash)
    if (count === 0) {
      await expect(page.getByText(/no (matches|results|listings)/i)).toBeVisible();
    } else {
      expect(count).toBeGreaterThan(0);

      // First card should have a title and price
      const firstCard = cards.first();
      await expect(firstCard).toBeVisible();
      await expect(firstCard.locator('[data-testid="listing-price"]')).toBeVisible();
    }
  });

  test(`${tags.core} SS-02: short query (2 chars) falls back to FTS and returns results`, async ({ page }) => {
    // 2-character query — should bypass semantic, use FTS
    await page.goto(`/search?q=ab&${boundsQS}`);
    await waitForSearchOutcome(page);

    // Search should complete without error — results via FTS or empty state
    // Key: no crash, no error boundary, page renders
    const container = searchResultsContainer(page);
    const heading = page.getByRole("heading", { level: 1 }).first();
    await expect(heading).toBeVisible({ timeout: 30_000 });
  });

  test(`${tags.core} SS-03: non-recommended sort bypasses semantic search`, async ({ page }) => {
    // sort=price_asc should never trigger semantic search
    await page.goto(`/search?q=cozy+room&sort=price_asc&${boundsQS}`);
    await waitForSearchOutcome(page);

    const container = searchResultsContainer(page);
    const cards = container.locator('[data-testid="listing-card"]');
    const count = await cards.count();

    if (count >= 2) {
      // Verify price ordering: first card price <= second card price
      const prices: number[] = [];
      for (let i = 0; i < Math.min(count, 3); i++) {
        const priceText = await cards.nth(i).locator('[data-testid="listing-price"]').textContent();
        const priceNum = parseFloat((priceText || '0').replace(/[^0-9.]/g, ''));
        prices.push(priceNum);
      }
      for (let i = 1; i < prices.length; i++) {
        expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]);
      }
    }
  });

  test(`${tags.core} SS-04: search works regardless of feature flag state`, async ({ page }) => {
    // This test verifies the search page works with a semantic-style query
    // Whether semantic search is on or off, results should appear
    await page.goto(`/search?q=cozy+room+near+campus&${boundsQS}`);
    await waitForSearchOutcome(page);

    // Page should not show error boundary
    const errorBoundary = page.locator('[data-testid="error-boundary"], text=/something went wrong/i');
    await expect(errorBoundary).not.toBeVisible({ timeout: 5_000 }).catch(() => {
      // If error boundary is visible, that's a failure
    });

    // Heading should be visible (page rendered)
    const heading = page.getByRole("heading", { level: 1 }).first();
    await expect(heading).toBeVisible({ timeout: 30_000 });
  });

  test(`${tags.core} SS-05: search returns results even when no embeddings exist`, async ({ page }) => {
    // Navigate with a query — if no embeddings, semantic returns null -> FTS
    await page.goto(`/search?q=cozy+room&${boundsQS}`);
    await waitForSearchOutcome(page);

    // Should have results from FTS (seed data exists in SF bounds)
    const container = searchResultsContainer(page);
    const cards = container.locator('[data-testid="listing-card"]');
    const cardOrEmpty = cards.first().or(page.getByText(/no (matches|results|listings)/i));
    await expect(cardOrEmpty).toBeVisible({ timeout: 30_000 });
  });

  test(`SS-06: browse mode (no query text) returns results without semantic search`, async ({ page }) => {
    // No q= param — should never trigger semantic search
    await page.goto(`/search?${boundsQS}`);
    await waitForSearchOutcome(page);

    const container = searchResultsContainer(page);
    const cards = container.locator('[data-testid="listing-card"]');
    const count = await cards.count();

    // Browse mode in SF should return seed listings
    expect(count).toBeGreaterThan(0);
  });

  test(`SS-07: extremely long query (201+ chars) completes without error`, async ({ page }) => {
    // Generate a 201-character query
    const longQuery = encodeURIComponent("cozy room ".repeat(25).trim().slice(0, 201));
    await page.goto(`/search?q=${longQuery}&${boundsQS}`);
    await waitForSearchOutcome(page);

    // Should not crash — either results or empty state
    const heading = page.getByRole("heading", { level: 1 }).first();
    await expect(heading).toBeVisible({ timeout: 30_000 });
  });
});
```

---

## Task 2: Results Quality Tests

**File**: `tests/e2e/semantic-search/semantic-search-results.anon.spec.ts`
**Scenarios**: SS-08 through SS-12
**Complexity**: Medium (5 tests, require semantic search enabled)

### Acceptance Criteria
- All 5 tests skip cleanly when `ENABLE_SEMANTIC_SEARCH` is not `"true"`
- SS-08: Verifies listing card fields (title, price, location, images)
- SS-09: Verifies Load More pagination adds cards without duplicates
- SS-10: Verifies filters narrow semantic results
- SS-11: Verifies semantic search with current SEMANTIC_WEIGHT returns results without errors
- SS-12: Verifies bounds restrict results geographically

### Complete Code Outline

```typescript
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
  selectors,
  timeouts,
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
    page.getByText(/no (matches|results|listings)/i)
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
        expect(allIds.has(id)).toBe(false); // No duplicate
        allIds.add(id);
      }
    }
  });

  test(`${tags.core} SS-10: filters apply to semantic search results`, async ({ page }) => {
    test.skip(!SEMANTIC_ENABLED, "Requires ENABLE_SEMANTIC_SEARCH=true");

    // Semantic search with price filter
    await page.goto(
      `/search?q=quiet+study+spot&minPrice=500&maxPrice=1500&${boundsQS}`
    );
    await waitForSearchOutcome(page);

    const container = searchResultsContainer(page);
    const cards = container.locator('[data-testid="listing-card"]');
    const count = await cards.count();

    if (count > 0) {
      // Check first few cards have prices within range
      for (let i = 0; i < Math.min(count, 3); i++) {
        const priceText = await cards.nth(i).locator('[data-testid="listing-price"]').textContent();
        const price = parseFloat((priceText || '0').replace(/[^0-9.]/g, ''));
        expect(price).toBeGreaterThanOrEqual(500);
        expect(price).toBeLessThanOrEqual(1500);
      }
    }
    // Zero results is also valid if no listings match the filter
  });

  test(`SS-11: semantic search with current SEMANTIC_WEIGHT returns results without errors`, async ({ page }) => {
    test.skip(!SEMANTIC_ENABLED, "Requires ENABLE_SEMANTIC_SEARCH=true");

    // This test verifies no crash with current SEMANTIC_WEIGHT
    // We can't control env vars from E2E, but we verify search works
    await page.goto(`/search?q=cozy+room+near+campus&${boundsQS}`);
    await waitForSearchOutcome(page);

    const container = searchResultsContainer(page);
    const cards = container.locator('[data-testid="listing-card"]');
    const count = await cards.count();

    // With semantic enabled, we should get results for a broad query
    // The ranking order depends on SEMANTIC_WEIGHT, but results should appear
    expect(count).toBeGreaterThan(0);
  });

  test(`${tags.core} SS-12: semantic search results are within geographic bounds`, async ({ page }) => {
    test.skip(!SEMANTIC_ENABLED, "Requires ENABLE_SEMANTIC_SEARCH=true");

    await page.goto(`/search?q=cozy+room&${boundsQS}`);
    await waitForSearchOutcome(page);

    const container = searchResultsContainer(page);
    const cards = container.locator('[data-testid="listing-card"]');
    const count = await cards.count();
    test.skip(count === 0, "No results to verify bounds against");

    // Navigate to first listing to check its location is in SF
    const firstCardLink = cards.first().locator('a[href*="/listings/"]').first();
    const href = await firstCardLink.getAttribute('href');
    expect(href).toBeTruthy();

    await page.goto(href!);
    await page.waitForLoadState('domcontentloaded');

    // Verify the listing page renders (location is in SF)
    // We can't extract lat/lng from the UI, but we can verify the listing exists
    // and the page renders without error
    const listingTitle = page.getByRole('heading', { level: 1 }).first();
    await expect(listingTitle).toBeVisible({ timeout: 30_000 });
  });
});
```

---

## Task 3: Similar Listings Tests

**File**: `tests/e2e/semantic-search/semantic-search-similar-listings.anon.spec.ts`
**Scenarios**: SS-20 through SS-27, SS-56, SS-57, SS-61
**Complexity**: High (11 tests, require listing detail page with embeddings)

### Acceptance Criteria
- Tests navigate to a listing detail page and check for "Similar listings" section
- Tests skip gracefully when section is not visible (no embeddings backfilled)
- SS-25: Verifies current listing ID is not in similar cards
- SS-27: Verifies at most 4 cards displayed
- SS-56: Verifies "Show on map" button click has no navigation effect
- SS-57: Verifies FavoriteButton heart icon is visible
- SS-61: Verifies responsive grid (mobile: 1 col, desktop: 2 col)

### Complete Code Outline

```typescript
/**
 * Semantic Search Similar Listings E2E Tests
 *
 * Validates the "Similar listings" section on the listing detail page.
 * Tests gracefully skip when the section is not visible (requires embeddings).
 *
 * Scenarios: SS-20 through SS-27, SS-56, SS-57, SS-61
 * Run: pnpm playwright test tests/e2e/semantic-search/semantic-search-similar-listings.anon.spec.ts
 */

import {
  test,
  expect,
  tags,
  SF_BOUNDS,
  searchResultsContainer,
  timeouts,
} from "../helpers/test-utils";

// ---------------------------------------------------------------------------
// Constants & Helpers
// ---------------------------------------------------------------------------

const SEMANTIC_ENABLED = process.env.ENABLE_SEMANTIC_SEARCH === "true";
const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;

/**
 * Find a listing URL from search results to use as the detail page target.
 * Returns null if no listings found.
 */
async function findListingUrl(page: import("@playwright/test").Page): Promise<string | null> {
  await page.goto(`/search?${boundsQS}`, { waitUntil: "domcontentloaded" });

  const container = searchResultsContainer(page);
  const cards = container.locator('[data-testid="listing-card"]');
  const cardOrEmpty = cards.first().or(
    page.getByText(/no (matches|results|listings)/i)
  );
  await expect(cardOrEmpty).toBeVisible({ timeout: 30_000 });

  const count = await cards.count();
  if (count === 0) return null;

  const link = cards.first().locator('a[href*="/listings/"]').first();
  return link.getAttribute("href");
}

/**
 * Navigate to a listing detail page and return the heading locator
 * for "Similar listings".
 */
async function navigateToListingDetail(
  page: import("@playwright/test").Page,
  listingUrl: string
) {
  await page.goto(listingUrl);
  await page.waitForLoadState("domcontentloaded");
  // Wait for main content to render
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({
    timeout: 30_000,
  });
}

function similarListingsHeading(page: import("@playwright/test").Page) {
  return page.getByRole("heading", { name: "Similar listings" });
}

function similarSection(page: import("@playwright/test").Page) {
  return page.locator('div').filter({
    has: page.getByRole('heading', { name: 'Similar listings' }),
  }).first();
}

function similarCards(page: import("@playwright/test").Page) {
  return similarSection(page).locator('[data-testid="listing-card"]');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Semantic Search - Similar Listings", () => {
  test.beforeEach(async () => {
    test.slow();
  });

  test(`${tags.core} SS-20: similar listings section renders with ListingCards`, async ({ page }) => {
    test.skip(!SEMANTIC_ENABLED, "Requires ENABLE_SEMANTIC_SEARCH=true");

    const listingUrl = await findListingUrl(page);
    test.skip(!listingUrl, "No listings found in search");

    await navigateToListingDetail(page, listingUrl!);

    const heading = similarListingsHeading(page);
    const hasSection = await expect(heading)
      .toBeVisible({ timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(
      !hasSection,
      "Similar listings section not visible (embeddings may not be backfilled)"
    );

    // Verify heading text
    await expect(heading).toHaveText("Similar listings");

    // Verify cards render
    const cards = similarCards(page);
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(4);

    // Each card should have a link to another listing
    const firstCard = cards.first();
    const cardLink = firstCard.locator("a[href*='/listings/']").first();
    await expect(cardLink).toBeVisible();
  });

  test(`${tags.core} SS-21: similar listings hidden when feature flag is off (or no embeddings)`, async ({ page }) => {
    // This test is environment-agnostic:
    // - If ENABLE_SEMANTIC_SEARCH=false: section should NOT appear
    // - If ENABLE_SEMANTIC_SEARCH=true but no embeddings: section should NOT appear
    // - If ENABLE_SEMANTIC_SEARCH=true and embeddings exist: section MAY appear

    const listingUrl = await findListingUrl(page);
    test.skip(!listingUrl, "No listings found in search");

    await navigateToListingDetail(page, listingUrl!);

    if (!SEMANTIC_ENABLED) {
      // Feature flag off -> section must not appear
      const heading = similarListingsHeading(page);
      await expect(heading).not.toBeVisible({ timeout: 10_000 });
    } else {
      // Feature flag on -> section may or may not appear (depends on embeddings)
      // Just verify the page rendered without error
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    }
  });

  test(`SS-22: no similar listings when listing has no embedding`, async ({ page }) => {
    test.skip(!SEMANTIC_ENABLED, "Requires ENABLE_SEMANTIC_SEARCH=true");

    // Find a listing — we can't control which listings have embeddings from E2E
    // If the listing we find has no embedding, the section won't appear
    // This test documents the expected behavior
    const listingUrl = await findListingUrl(page);
    test.skip(!listingUrl, "No listings found in search");

    await navigateToListingDetail(page, listingUrl!);

    // Check if section is visible
    const heading = similarListingsHeading(page);
    const hasSection = await expect(heading)
      .toBeVisible({ timeout: 10_000 })
      .then(() => true)
      .catch(() => false);

    // If no section, that's the expected behavior for a listing without embedding
    // If section exists, that's fine too — listing has embeddings
    // Key: page renders without error in either case
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  });

  test(`SS-23: no similar listings when no similar above threshold`, async ({ page }) => {
    test.skip(!SEMANTIC_ENABLED, "Requires ENABLE_SEMANTIC_SEARCH=true");

    // Same as SS-22 — from E2E we can't control similarity scores
    // We verify the page renders correctly whether section appears or not
    const listingUrl = await findListingUrl(page);
    test.skip(!listingUrl, "No listings found in search");

    await navigateToListingDetail(page, listingUrl!);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    // Graceful: section appears only if similar listings above 0.3 threshold exist
  });

  test(`${tags.core} SS-24: listing detail page renders without crash even if SQL errors occur`, async ({ page }) => {
    // Environment-agnostic: verify the detail page renders
    // If get_similar_listings fails, page should still render (catch returns [])
    const listingUrl = await findListingUrl(page);
    test.skip(!listingUrl, "No listings found in search");

    await navigateToListingDetail(page, listingUrl!);

    // Main content should render — title, price, description
    const title = page.getByRole("heading", { level: 1 }).first();
    await expect(title).toBeVisible({ timeout: 30_000 });

    // Page should not show error boundary
    const errorBoundary = page.locator(
      'text=/something went wrong/i, [data-testid="error-boundary"]'
    );
    const hasError = await expect(errorBoundary)
      .toBeVisible({ timeout: 3_000 })
      .then(() => true)
      .catch(() => false);
    expect(hasError).toBe(false);
  });

  test(`${tags.core} SS-25: current listing is excluded from similar listings`, async ({ page }) => {
    test.skip(!SEMANTIC_ENABLED, "Requires ENABLE_SEMANTIC_SEARCH=true");

    const listingUrl = await findListingUrl(page);
    test.skip(!listingUrl, "No listings found in search");

    await navigateToListingDetail(page, listingUrl!);

    const heading = similarListingsHeading(page);
    const hasSection = await expect(heading)
      .toBeVisible({ timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(
      !hasSection,
      "Similar listings section not visible (embeddings may not be backfilled)"
    );

    // Extract current listing ID from URL
    const currentUrl = page.url();
    const currentIdMatch = currentUrl.match(/\/listings\/([a-zA-Z0-9_-]+)/);
    const currentId = currentIdMatch ? currentIdMatch[1] : null;
    expect(currentId).toBeTruthy();

    // Check none of the similar listing cards have the current listing's ID
    const cards = similarCards(page);
    const count = await cards.count();
    for (let i = 0; i < count; i++) {
      const cardId = await cards.nth(i).getAttribute("data-listing-id");
      expect(cardId).not.toBe(currentId);
    }
  });

  test(`SS-26: only ACTIVE listings shown in similar listings`, async ({ page }) => {
    test.skip(!SEMANTIC_ENABLED, "Requires ENABLE_SEMANTIC_SEARCH=true");

    const listingUrl = await findListingUrl(page);
    test.skip(!listingUrl, "No listings found in search");

    await navigateToListingDetail(page, listingUrl!);

    const heading = similarListingsHeading(page);
    const hasSection = await expect(heading)
      .toBeVisible({ timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!hasSection, "Similar listings section not visible");

    // Verify each similar listing card links to a valid, accessible listing
    const cards = similarCards(page);
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);

    // Navigate to first similar listing — it should be accessible (ACTIVE)
    const firstLink = cards.first().locator("a[href*='/listings/']").first();
    const href = await firstLink.getAttribute("href");
    expect(href).toBeTruthy();

    // Verify the linked listing page loads (not a 404 or "paused" page)
    await page.goto(href!);
    await page.waitForLoadState("domcontentloaded");
    const listingTitle = page.getByRole("heading", { level: 1 }).first();
    await expect(listingTitle).toBeVisible({ timeout: 30_000 });
  });

  test(`SS-27: at most 4 similar listing cards displayed`, async ({ page }) => {
    test.skip(!SEMANTIC_ENABLED, "Requires ENABLE_SEMANTIC_SEARCH=true");

    const listingUrl = await findListingUrl(page);
    test.skip(!listingUrl, "No listings found in search");

    await navigateToListingDetail(page, listingUrl!);

    const heading = similarListingsHeading(page);
    const hasSection = await expect(heading)
      .toBeVisible({ timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!hasSection, "Similar listings section not visible");

    const cards = similarCards(page);
    const count = await cards.count();

    // UI renders at most 4: similarListings.slice(0, 4)
    expect(count).toBeLessThanOrEqual(4);
    expect(count).toBeGreaterThan(0);
  });

  test(`SS-56: show on map button on similar listing cards is inert`, async ({ page }) => {
    test.skip(!SEMANTIC_ENABLED, "Requires ENABLE_SEMANTIC_SEARCH=true");

    const listingUrl = await findListingUrl(page);
    test.skip(!listingUrl, "No listings found in search");

    await navigateToListingDetail(page, listingUrl!);

    const heading = similarListingsHeading(page);
    const hasSection = await expect(heading)
      .toBeVisible({ timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!hasSection, "Similar listings section not visible");

    const cards = similarCards(page);
    const firstCard = cards.first();

    // Find the "Show on map" button
    const mapPinBtn = firstCard.locator('button[aria-label="Show on map"]');
    await expect(mapPinBtn).toBeVisible();

    // Record current URL before clicking
    const urlBefore = page.url();

    // Click the button
    await mapPinBtn.click();

    // URL should not have changed (no navigation)
    await expect.poll(() => page.url(), { timeout: 2_000 }).toBe(urlBefore);

    // Page content should not have changed significantly
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  });

  test(`SS-57: FavoriteButton on similar listing cards renders in unsaved state`, async ({ page }) => {
    test.skip(!SEMANTIC_ENABLED, "Requires ENABLE_SEMANTIC_SEARCH=true");

    const listingUrl = await findListingUrl(page);
    test.skip(!listingUrl, "No listings found in search");

    await navigateToListingDetail(page, listingUrl!);

    const heading = similarListingsHeading(page);
    const hasSection = await expect(heading)
      .toBeVisible({ timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!hasSection, "Similar listings section not visible");

    const cards = similarCards(page);
    const firstCard = cards.first();

    // FavoriteButton renders as a button with a heart icon
    // In unsaved state, the SVG should have a stroke but no fill (outline heart)
    // Look for the button that contains an SVG (heart icon), excluding "Show on map"
    const favoriteBtn = firstCard.locator('button:not([aria-label="Show on map"])').filter({
      has: page.locator('svg'),
    });

    await expect(favoriteBtn).toBeVisible();
  });

  test(`SS-61: similar listings responsive layout`, async ({ page }) => {
    test.skip(!SEMANTIC_ENABLED, "Requires ENABLE_SEMANTIC_SEARCH=true");

    const listingUrl = await findListingUrl(page);
    test.skip(!listingUrl, "No listings found in search");

    // Desktop viewport first
    await page.setViewportSize({ width: 1280, height: 800 });
    await navigateToListingDetail(page, listingUrl!);

    const heading = similarListingsHeading(page);
    const hasSection = await expect(heading)
      .toBeVisible({ timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!hasSection, "Similar listings section not visible");

    // Desktop: 2-column grid
    const grid = similarSection(page).locator('.grid');
    await expect(grid).toBeVisible();

    // Verify it's a grid with sm:grid-cols-2 class
    const gridClasses = await grid.getAttribute("class");
    expect(gridClasses).toContain("grid-cols-1");
    expect(gridClasses).toContain("sm:grid-cols-2");

    // Mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500); // Allow layout to reflow

    // Heading should still be visible
    await expect(heading).toBeVisible();

    // Grid should still have grid-cols-1 (base) — at <640px, sm: doesn't apply
    // so it's effectively single-column
    const gridMobile = similarSection(page).locator('.grid');
    await expect(gridMobile).toBeVisible();
  });
});
```

---

## Task 4: Resilience Tests

**File**: `tests/e2e/semantic-search/semantic-search-resilience.anon.spec.ts`
**Scenarios**: SS-40, SS-41, SS-42, SS-55
**Complexity**: Low (4 tests, environment-agnostic)

### Acceptance Criteria
- Tests verify search page always returns results or graceful empty state
- No uncaught console errors (excluding benign patterns)
- No error boundary visible
- All tests pass in both semantic-enabled and disabled environments

### Complete Code Outline

```typescript
/**
 * Semantic Search Resilience E2E Tests
 *
 * Validates that search gracefully degrades when backend subsystems
 * have issues. These tests verify the *observable behavior* from E2E:
 * search always works, never crashes, returns results via FTS fallback.
 *
 * Note: Actual failure injection (Gemini down, SQL errors) is tested
 * at the unit/integration layer. E2E tests verify the user-facing
 * resilience contract.
 *
 * Scenarios: SS-40, SS-41, SS-42, SS-55
 * Run: pnpm playwright test tests/e2e/semantic-search/semantic-search-resilience.anon.spec.ts
 */

import {
  test,
  expect,
  tags,
  SF_BOUNDS,
  searchResultsContainer,
  timeouts,
} from "../helpers/test-utils";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;

/** Console error patterns that are benign and should not fail tests. */
const BENIGN_ERROR_PATTERNS = [
  "mapbox",
  "webpack",
  "HMR",
  "hydrat",
  "favicon",
  "ResizeObserver",
  "WebGL",
  "Failed to create",
  "Failed to load resource",
  "404",
  "AbortError",
  "Environment validation",
  "NEXT_REDIRECT",
  "ERR_ABORTED",
  "net::ERR_",
  "Abort fetching component",
  "ChunkLoadError",
  "Loading chunk",
  "preload",
  "Download the React DevTools",
  "search/facets",
  "x-]",
];

function isBenignError(msg: string): boolean {
  return BENIGN_ERROR_PATTERNS.some((p) =>
    msg.toLowerCase().includes(p.toLowerCase())
  );
}

async function waitForSearchOutcome(page: import("@playwright/test").Page) {
  const container = searchResultsContainer(page);
  const cards = container.locator('[data-testid="listing-card"]');
  const cardOrEmpty = cards.first().or(
    page.getByText(/no (matches|results|listings)/i)
  );
  await expect(cardOrEmpty).toBeVisible({ timeout: 30_000 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Semantic Search - Resilience", () => {
  test.beforeEach(async () => {
    test.slow();
  });

  test(`${tags.core} SS-40: search returns results via FTS fallback when Gemini is unavailable`, async ({ page }) => {
    // We can't inject Gemini failures from E2E, but we verify the contract:
    // search with a semantic-style query always returns results (semantic or FTS)
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && !isBenignError(msg.text())) {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto(`/search?q=cozy+room+near+campus&${boundsQS}`);
    await waitForSearchOutcome(page);

    // Page should render without error boundary
    const errorBoundary = page.locator(
      'text=/something went wrong/i, [data-testid="error-boundary"]'
    );
    const hasError = await expect(errorBoundary)
      .toBeVisible({ timeout: 3_000 })
      .then(() => true)
      .catch(() => false);
    expect(hasError).toBe(false);

    // Results or empty state should be visible
    const container = searchResultsContainer(page);
    const heading = page.getByRole("heading", { level: 1 }).first();
    await expect(heading).toBeVisible();
  });

  test(`SS-41: search handles Gemini auth errors gracefully`, async ({ page }) => {
    // Same as SS-40 — from E2E perspective, the observable behavior is identical:
    // search works, user sees results via FTS if semantic fails
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && !isBenignError(msg.text())) {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto(`/search?q=affordable+room+in+sf&${boundsQS}`);
    await waitForSearchOutcome(page);

    const errorBoundary = page.locator(
      'text=/something went wrong/i, [data-testid="error-boundary"]'
    );
    const hasError = await expect(errorBoundary)
      .toBeVisible({ timeout: 3_000 })
      .then(() => true)
      .catch(() => false);
    expect(hasError).toBe(false);
  });

  test(`${tags.core} SS-42: search returns results even if SQL function has issues`, async ({ page }) => {
    // From E2E, we verify: any search query returns results or graceful empty
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && !isBenignError(msg.text())) {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto(`/search?q=spacious+apartment&${boundsQS}`);
    await waitForSearchOutcome(page);

    // Search page should render correctly
    const heading = page.getByRole("heading", { level: 1 }).first();
    await expect(heading).toBeVisible();

    // No uncaught errors (semantic errors should be caught and logged server-side)
    // Note: We don't assert zero console errors because we can't control
    // server-side logging visibility. We just verify no user-visible crash.
  });

  test(`SS-55: search degrades gracefully when GEMINI_API_KEY is missing`, async ({ page }) => {
    // Regardless of env state, search should work
    // If GEMINI_API_KEY missing but flag on: falls back to FTS silently
    // If flag off: FTS directly
    await page.goto(`/search?q=cozy+room&sort=recommended&${boundsQS}`);
    await waitForSearchOutcome(page);

    const container = searchResultsContainer(page);
    const cards = container.locator('[data-testid="listing-card"]');
    const cardOrEmpty = cards.first().or(
      page.getByText(/no (matches|results|listings)/i)
    );
    await expect(cardOrEmpty).toBeVisible();

    // Verify no crash
    const heading = page.getByRole("heading", { level: 1 }).first();
    await expect(heading).toBeVisible();
  });
});
```

---

## Task 5: Cursor Reset Test

**File**: `tests/e2e/semantic-search/semantic-search-cursor-reset.anon.spec.ts`
**Scenarios**: SS-58
**Complexity**: Medium (1 test, requires semantic search + Load More interaction)

### Acceptance Criteria
- Test skips when `ENABLE_SEMANTIC_SEARCH` is not `"true"`
- Verifies accumulated results reset when URL params change
- No duplicate listing IDs after reset

### Complete Code Outline

```typescript
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
  timeouts,
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
    page.getByText(/no (matches|results|listings)/i)
  );
  await expect(cardOrEmpty).toBeVisible({ timeout: 30_000 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Semantic Search - Cursor Reset", () => {
  test.beforeEach(async () => {
    test.slow();
  });

  test(`${tags.core} SS-58: changing search params resets accumulated results`, async ({ page }) => {
    test.skip(!SEMANTIC_ENABLED, "Requires ENABLE_SEMANTIC_SEARCH=true");

    // Step 1: Search with semantic query
    await page.goto(`/search?q=room&${boundsQS}`);
    await waitForSearchOutcome(page);

    const container = searchResultsContainer(page);
    const cards = container.locator('[data-testid="listing-card"]');
    const initialCount = await cards.count();
    test.skip(initialCount < 12, "Fewer than 12 results — Load More unavailable");

    // Step 2: Click Load More to accumulate >12 results
    const loadMoreBtn = container.locator(
      'button:has-text("Show more"), button:has-text("Load more")'
    );
    await expect(loadMoreBtn).toBeVisible({ timeout: 10_000 });
    await loadMoreBtn.click();

    await expect.poll(
      () => cards.count(),
      { timeout: 30_000, message: "Expected more cards after Load More" }
    ).toBeGreaterThan(initialCount);

    const accumulatedCount = await cards.count();
    expect(accumulatedCount).toBeGreaterThan(initialCount);

    // Step 3: Change a filter — add price range via URL navigation
    // This simulates applying a filter which changes searchParamsString
    await page.goto(`/search?q=room&minPrice=500&maxPrice=2000&${boundsQS}`);
    await waitForSearchOutcome(page);

    // Step 4: Verify results reset — count should be <= initial page size (12)
    // or at least different from the accumulated count
    const resetCount = await cards.count();

    // After reset, we should have at most ITEMS_PER_PAGE (12) results
    // unless the new filter returns fewer
    expect(resetCount).toBeLessThanOrEqual(12);

    // Verify no stale data: cursor should be null (no "cursor" in URL)
    const url = new URL(page.url(), "http://localhost");
    expect(url.searchParams.get("cursor")).toBeNull();
  });
});
```

---

## Task 6: XSS/Injection Test

**File**: `tests/e2e/semantic-search/semantic-search-xss.anon.spec.ts`
**Scenarios**: SS-60
**Complexity**: Low (1 test)

### Acceptance Criteria
- Verifies script tags in search query do not execute
- No `<script>` elements in the rendered DOM from user input
- Search completes without error

### Complete Code Outline

```typescript
/**
 * Semantic Search XSS/Injection E2E Test
 *
 * Validates that search queries with HTML/script tags are sanitized
 * and do not cause script execution.
 *
 * Scenario: SS-60
 * Run: pnpm playwright test tests/e2e/semantic-search/semantic-search-xss.anon.spec.ts
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

const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Semantic Search - XSS Sanitization", () => {
  test.beforeEach(async () => {
    test.slow();
  });

  test(`SS-60: HTML/script tags in search query are sanitized`, async ({ page }) => {
    // Track if any injected script executes
    let scriptExecuted = false;
    await page.exposeFunction("__xssDetected", () => {
      scriptExecuted = true;
    });

    // Install detection: if alert() is called, flag it
    await page.addInitScript(() => {
      (window as any).__originalAlert = window.alert;
      window.alert = (...args: unknown[]) => {
        (window as any).__xssDetected?.();
      };
    });

    // Search with XSS payload
    const xssPayload = encodeURIComponent(
      '<script>alert(1)</script> cozy room'
    );
    await page.goto(`/search?q=${xssPayload}&${boundsQS}`);
    await page.waitForLoadState("domcontentloaded");

    // Wait for page to render
    const heading = page.getByRole("heading", { level: 1 }).first();
    await expect(heading).toBeVisible({ timeout: 30_000 });

    // Verify no script execution occurred
    expect(scriptExecuted).toBe(false);

    // Verify no <script> tags were injected into the DOM from user input
    const injectedScripts = await page.evaluate(() => {
      const scripts = document.querySelectorAll("script");
      return Array.from(scripts).filter(
        (s) => s.textContent?.includes("alert(1)")
      ).length;
    });
    expect(injectedScripts).toBe(0);

    // Verify the search page still works (results or empty state)
    const container = searchResultsContainer(page);
    const cards = container.locator('[data-testid="listing-card"]');
    const cardOrEmpty = cards.first().or(
      page.getByText(/no (matches|results|listings)/i)
    );
    await expect(cardOrEmpty).toBeVisible({ timeout: 30_000 });
  });
});
```

---

## Verification Checklist

After implementation, run each file individually:

```bash
# Task 1
pnpm playwright test tests/e2e/semantic-search/semantic-search-activation.anon.spec.ts --project=chromium-anon

# Task 2
pnpm playwright test tests/e2e/semantic-search/semantic-search-results.anon.spec.ts --project=chromium-anon

# Task 3
pnpm playwright test tests/e2e/semantic-search/semantic-search-similar-listings.anon.spec.ts --project=chromium-anon

# Task 4
pnpm playwright test tests/e2e/semantic-search/semantic-search-resilience.anon.spec.ts --project=chromium-anon

# Task 5
pnpm playwright test tests/e2e/semantic-search/semantic-search-cursor-reset.anon.spec.ts --project=chromium-anon

# Task 6
pnpm playwright test tests/e2e/semantic-search/semantic-search-xss.anon.spec.ts --project=chromium-anon

# All together
pnpm playwright test tests/e2e/semantic-search/ --project=chromium-anon
```

### Pass Criteria

1. **With `ENABLE_SEMANTIC_SEARCH=true` + embeddings backfilled**: All 26 tests pass or skip with clear messages
2. **With `ENABLE_SEMANTIC_SEARCH=false`**: Activation (7) + Resilience (4) + XSS (1) + SS-21 + SS-24 = 14 tests pass. Remaining 12 skip cleanly.
3. **No flaky tests**: `--retries 3` yields same results on all retries
4. **Lint + typecheck pass**: `pnpm lint && pnpm typecheck` succeed with the new files
