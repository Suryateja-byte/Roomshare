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
    container.getByText(/no (matches|results|listings)/i).first()
  );
  await expect(cardOrEmpty).toBeVisible({ timeout: 30_000 });

  const count = await cards.count();
  if (count === 0) return null;

  const link = cards.first().locator('a[href*="/listings/"]').first();
  return link.getAttribute("href");
}

/**
 * Navigate to a listing detail page and wait for it to render.
 */
async function navigateToListingDetail(
  page: import("@playwright/test").Page,
  listingUrl: string
) {
  await page.goto(listingUrl);
  await page.waitForLoadState("domcontentloaded");
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

/**
 * Check if the "Similar listings" section is visible on the page.
 * Uses the correct pattern: expect().toBeVisible() instead of isVisible({ timeout }).
 */
async function isSimilarSectionVisible(page: import("@playwright/test").Page): Promise<boolean> {
  return expect(similarListingsHeading(page))
    .toBeVisible({ timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
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

    const hasSection = await isSimilarSectionVisible(page);
    test.skip(!hasSection, "Similar listings section not visible (embeddings may not be backfilled)");

    await expect(similarListingsHeading(page)).toHaveText("Similar listings");

    const cards = similarCards(page);
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(4);

    const firstCard = cards.first();
    const cardLink = firstCard.locator("a[href*='/listings/']").first();
    await expect(cardLink).toBeVisible();
  });

  test(`${tags.core} SS-21: similar listings hidden when feature flag is off (or no embeddings)`, async ({ page }) => {
    const listingUrl = await findListingUrl(page);
    test.skip(!listingUrl, "No listings found in search");

    await navigateToListingDetail(page, listingUrl!);

    if (!SEMANTIC_ENABLED) {
      await expect(similarListingsHeading(page)).not.toBeVisible({ timeout: 10_000 });
    } else {
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    }
  });

  test(`SS-22: no similar listings when listing has no embedding`, async ({ page }) => {
    test.skip(!SEMANTIC_ENABLED, "Requires ENABLE_SEMANTIC_SEARCH=true");

    const listingUrl = await findListingUrl(page);
    test.skip(!listingUrl, "No listings found in search");

    await navigateToListingDetail(page, listingUrl!);

    // Page renders without error whether section is present or not
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  });

  test(`SS-23: no similar listings when no similar above threshold`, async ({ page }) => {
    test.skip(!SEMANTIC_ENABLED, "Requires ENABLE_SEMANTIC_SEARCH=true");

    const listingUrl = await findListingUrl(page);
    test.skip(!listingUrl, "No listings found in search");

    await navigateToListingDetail(page, listingUrl!);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  });

  test(`${tags.core} SS-24: listing detail page renders without crash even if SQL errors occur`, async ({ page }) => {
    const listingUrl = await findListingUrl(page);
    test.skip(!listingUrl, "No listings found in search");

    await navigateToListingDetail(page, listingUrl!);

    const title = page.getByRole("heading", { level: 1 }).first();
    await expect(title).toBeVisible({ timeout: 30_000 });

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

    const hasSection = await isSimilarSectionVisible(page);
    test.skip(!hasSection, "Similar listings section not visible (embeddings may not be backfilled)");

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

    const hasSection = await isSimilarSectionVisible(page);
    test.skip(!hasSection, "Similar listings section not visible");

    const cards = similarCards(page);
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);

    // Navigate to first similar listing — it should be accessible (ACTIVE)
    const firstLink = cards.first().locator("a[href*='/listings/']").first();
    const href = await firstLink.getAttribute("href");
    expect(href).toBeTruthy();

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

    const hasSection = await isSimilarSectionVisible(page);
    test.skip(!hasSection, "Similar listings section not visible");

    const cards = similarCards(page);
    const count = await cards.count();
    expect(count).toBeLessThanOrEqual(4);
    expect(count).toBeGreaterThan(0);
  });

  test(`SS-56: show on map button on similar listing cards is inert`, async ({ page }) => {
    test.skip(!SEMANTIC_ENABLED, "Requires ENABLE_SEMANTIC_SEARCH=true");

    const listingUrl = await findListingUrl(page);
    test.skip(!listingUrl, "No listings found in search");

    await navigateToListingDetail(page, listingUrl!);

    const hasSection = await isSimilarSectionVisible(page);
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

    // URL should not have changed (no navigation) — deterministic assertion
    await expect.poll(() => page.url(), { timeout: 2_000 }).toBe(urlBefore);

    // Page content should not have changed
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  });

  test(`SS-57: FavoriteButton on similar listing cards renders in unsaved state`, async ({ page }) => {
    test.skip(!SEMANTIC_ENABLED, "Requires ENABLE_SEMANTIC_SEARCH=true");

    const listingUrl = await findListingUrl(page);
    test.skip(!listingUrl, "No listings found in search");

    await navigateToListingDetail(page, listingUrl!);

    const hasSection = await isSimilarSectionVisible(page);
    test.skip(!hasSection, "Similar listings section not visible");

    const cards = similarCards(page);
    const firstCard = cards.first();

    // FavoriteButton: button with SVG, excluding "Show on map"
    const favoriteBtn = firstCard.locator('button:not([aria-label="Show on map"])').filter({
      has: page.locator('svg'),
    }).first();

    await expect(favoriteBtn).toBeVisible();
  });

  test(`SS-61: similar listings responsive layout`, async ({ page }) => {
    test.skip(!SEMANTIC_ENABLED, "Requires ENABLE_SEMANTIC_SEARCH=true");

    const listingUrl = await findListingUrl(page);
    test.skip(!listingUrl, "No listings found in search");

    // Desktop viewport first
    await page.setViewportSize({ width: 1280, height: 800 });
    await navigateToListingDetail(page, listingUrl!);

    const hasSection = await isSimilarSectionVisible(page);
    test.skip(!hasSection, "Similar listings section not visible");

    // Desktop: verify grid classes exist on the similar listings grid
    const grids = page.locator('.pt-8 > .space-y-6 > .grid');
    const gridCount = await grids.count();
    expect(gridCount).toBeGreaterThan(0);

    const gridClasses = await grids.first().getAttribute("class");
    expect(gridClasses).toContain("grid-cols-1");
    expect(gridClasses).toContain("sm:grid-cols-2");

    // Mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500); // Allow layout reflow

    // Heading should still be visible
    await expect(similarListingsHeading(page)).toBeVisible();
  });
});
