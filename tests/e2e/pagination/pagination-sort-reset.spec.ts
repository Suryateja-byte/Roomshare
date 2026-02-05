/**
 * Pagination Sort Reset Tests (Scenarios 5 & 6)
 *
 * Scenario 5: Cursor Reset on Filter/Sort Change
 *   Verifies that accumulated pagination state (extra listings, cursor, seenIdsRef)
 *   resets when the user changes sort, filters, or map bounds. This is guaranteed
 *   by the React key-based remount:
 *     <SearchResultsClient key={searchParamsString} ... />
 *
 * Scenario 6: Sort + Pagination Order Preservation
 *   Verifies that load-more respects the active sort order:
 *   - price_asc: all prices non-decreasing across pages
 *   - price_desc: all prices non-increasing across pages
 *   - newest / rating: items render in server-returned order
 *   - Switch sort mid-pagination resets to page 1
 *
 * Strategy:
 * - Initial page uses REAL DB data (~12 items from ~19 seed listings in SF bounds).
 * - "Load more" is mocked via server action interception (POST with Next-Action header).
 * - For price order tests (6.1, 6.2), mock listings use custom prices to ensure
 *   correct cross-page ordering relative to real seed data.
 *
 * Run: pnpm playwright test tests/e2e/pagination/pagination-sort-reset.spec.ts --project=chromium
 */

import { test, expect, SF_BOUNDS, searchResultsContainer } from "../helpers/test-utils";
import {
  setupPaginationMock,
  createMockListing,
} from "../helpers/pagination-mock-factory";
import type { Page, Locator } from "@playwright/test";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;
const SEARCH_URL = `/search?${boundsQS}`;

const sel = {
  card: '[data-testid="listing-card"]',
  loadMoreBtn: 'button:has-text("Show more places")',
  price: ".font-bold.text-xl",
} as const;

// ---------------------------------------------------------------------------
// Sort dropdown helpers (Radix Select, desktop viewport)
// ---------------------------------------------------------------------------

/** Locate the desktop Radix Select sort trigger button. */
function getDesktopSortTrigger(page: Page): Locator {
  return searchResultsContainer(page).locator('button[role="combobox"]');
}

/** Open the desktop sort dropdown and wait for the listbox to appear. */
async function openDesktopSort(page: Page): Promise<Locator> {
  const trigger = getDesktopSortTrigger(page);
  await expect(trigger).toBeVisible({ timeout: 10_000 });
  await trigger.click();
  const listbox = page.locator('[role="listbox"]');
  await expect(listbox).toBeVisible({ timeout: 5_000 });
  return listbox;
}

/**
 * Open the desktop sort dropdown, pick an option by visible label,
 * and wait for the URL to reflect the new sort param.
 */
async function selectDesktopSort(
  page: Page,
  label: string,
  expectedUrlParam: string,
) {
  await openDesktopSort(page);
  const option = page.locator('[role="option"]').filter({ hasText: label });
  await expect(option).toBeVisible({ timeout: 5_000 });
  await option.click();
  await expect(page).toHaveURL(new RegExp(`sort=${expectedUrlParam}`), {
    timeout: 15_000,
  });
}

// ---------------------------------------------------------------------------
// Price extraction helper
// ---------------------------------------------------------------------------

/**
 * Extract numeric prices from visible listing cards in the desktop container.
 * Parses rendered text like "$1,200/mo" or "$10,000" into plain integers.
 */
async function extractPrices(page: Page): Promise<number[]> {
  const priceTexts = await searchResultsContainer(page)
    .locator(sel.card)
    .locator(sel.price)
    .allTextContents();
  return priceTexts
    .map((t) => parseInt(t.replace(/[^0-9]/g, ""), 10))
    .filter((n) => !isNaN(n));
}

// ---------------------------------------------------------------------------
// Common helpers
// ---------------------------------------------------------------------------

/**
 * Wait for initial listings to render, then click "Show more places" once.
 * Returns the cards locator and the initial card count for further assertions.
 */
async function loadTwoPages(page: Page) {
  const container = searchResultsContainer(page);
  const cards = container.locator(sel.card);
  await expect(cards.first()).toBeVisible({ timeout: 30_000 });

  const initialCount = await cards.count();
  expect(initialCount).toBeLessThanOrEqual(12);
  expect(initialCount).toBeGreaterThanOrEqual(1);

  const loadMoreBtn = container.locator(sel.loadMoreBtn);
  await expect(loadMoreBtn).toBeVisible({ timeout: 15_000 });
  await loadMoreBtn.click();
  await expect(cards).toHaveCount(initialCount + 12, { timeout: 15_000 });

  return { cards, initialCount };
}

// ===========================================================================
// Scenario 5: Cursor Reset on Filter/Sort Change
// ===========================================================================

test.describe("5. Cursor Reset on Filter/Sort Change", () => {
  test.describe.configure({ mode: "serial" });

  // -------------------------------------------------------------------------
  // 5.1: Changing sort resets accumulated results
  // -------------------------------------------------------------------------
  test("5.1 changing sort via dropdown resets accumulated results", async ({
    page,
  }) => {
    test.slow();

    await setupPaginationMock(page, { totalLoadMoreItems: 24 });
    await page.goto(SEARCH_URL);

    // Accumulate 2 pages (12 real + 12 mock = 24 items visible)
    await loadTwoPages(page);

    // Change sort via the desktop Radix Select dropdown.
    // This updates the URL with sort=price_asc, which changes the
    // searchParamsString key and triggers a full React remount of
    // SearchResultsClient.
    await selectDesktopSort(page, "Price: Low to High", "price_asc");

    // After remount: only new first-page results are visible
    const container = searchResultsContainer(page);
    const cards = container.locator(sel.card);
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });

    const resetCount = await cards.count();
    expect(resetCount).toBeLessThanOrEqual(12);
    expect(resetCount).toBeGreaterThanOrEqual(1);

    // URL has sort param but no cursor (cursor is ephemeral client state)
    const url = new URL(page.url());
    expect(url.searchParams.get("sort")).toBe("price_asc");
    expect(url.searchParams.has("cursor")).toBe(false);
    expect(url.searchParams.has("page")).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 5.2: Changing a filter resets cursor
  // -------------------------------------------------------------------------
  test("5.2 applying a price filter resets accumulated results", async ({
    page,
  }) => {
    test.slow();

    await setupPaginationMock(page, { totalLoadMoreItems: 24 });
    await page.goto(SEARCH_URL);

    // Accumulate 2 pages
    await loadTwoPages(page);

    // Apply a price filter by navigating to a new URL with minPrice.
    // This simulates what happens when a user adjusts the price slider:
    // the searchParamsString key changes and SearchResultsClient remounts.
    await page.goto(`${SEARCH_URL}&minPrice=500`);

    const container = searchResultsContainer(page);
    const cards = container.locator(sel.card);
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });

    // Component remounted: only fresh first page visible
    const resetCount = await cards.count();
    expect(resetCount).toBeLessThanOrEqual(12);
    expect(resetCount).toBeGreaterThanOrEqual(1);

    // Confirm filter param is in URL, no cursor leaked
    const url = new URL(page.url());
    expect(url.searchParams.get("minPrice")).toBe("500");
    expect(url.searchParams.has("cursor")).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 5.3: Changing location/bounds resets cursor
  // -------------------------------------------------------------------------
  test("5.3 changing map bounds resets accumulated results", async ({
    page,
  }) => {
    test.slow();

    await setupPaginationMock(page, { totalLoadMoreItems: 24 });
    await page.goto(SEARCH_URL);

    // Accumulate 2 pages
    await loadTwoPages(page);

    // Shift bounds slightly to simulate a map pan.
    // All four bound params change, triggering a new searchParamsString key.
    const shiftedBounds = `minLat=37.72&maxLat=37.83&minLng=-122.50&maxLng=-122.37`;
    await page.goto(`/search?${shiftedBounds}`);

    const container = searchResultsContainer(page);
    const cards = container.locator(sel.card);
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });

    // Fresh first page shown, accumulated extras cleared
    const resetCount = await cards.count();
    expect(resetCount).toBeLessThanOrEqual(12);
    expect(resetCount).toBeGreaterThanOrEqual(1);

    // Verify URL has new bounds, no cursor
    const url = new URL(page.url());
    expect(url.searchParams.get("minLat")).toBe("37.72");
    expect(url.searchParams.has("cursor")).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 5.4: seenIdsRef cleared on remount
  // -------------------------------------------------------------------------
  test("5.4 seenIdsRef reinitializes after remount so same IDs render again", async ({
    page,
  }) => {
    test.slow();

    // 12 mock items available for load-more after the remount
    await setupPaginationMock(page, { totalLoadMoreItems: 12 });
    await page.goto(SEARCH_URL);
    const container = searchResultsContainer(page);

    const cards = container.locator(sel.card);
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });

    // Collect real listing IDs from the initial page
    const initialIds = await cards.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-listing-id")).filter(Boolean),
    );
    expect(initialIds.length).toBeGreaterThanOrEqual(1);

    // Change sort to trigger component remount.
    // The real DB returns the same listings (same SF bounds) in a new order.
    await page.goto(`${SEARCH_URL}&sort=newest`);
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });

    // After remount: same real listing IDs should appear again.
    // If seenIdsRef was stale from the previous mount, these IDs would be
    // filtered out by the dedup logic. Their presence proves the ref was reset.
    const remountedIds = await cards.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-listing-id")).filter(Boolean),
    );
    expect(remountedIds.length).toBeGreaterThanOrEqual(1);
    expect(remountedIds.length).toBeLessThanOrEqual(12);

    // Confirm overlap between initial and remounted IDs
    if (initialIds.length > 0 && remountedIds.length > 0) {
      const overlap = remountedIds.filter((id) => initialIds.includes(id));
      expect(overlap.length).toBeGreaterThan(0);
    }

    // Load more should work: mock items must not be blocked by stale seenIdsRef
    const loadMoreBtn = container.locator(sel.loadMoreBtn);
    await expect(loadMoreBtn).toBeVisible({ timeout: 15_000 });
    await loadMoreBtn.click();

    // Mock items should appear (they have IDs starting with "mock-listing-")
    const afterLoadMore = await cards.count();
    expect(afterLoadMore).toBeGreaterThan(remountedIds.length);

    const allIds = await cards.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-listing-id")).filter(Boolean),
    );
    const mockIds = allIds.filter((id) =>
      (id as string).startsWith("mock-listing-"),
    );
    expect(mockIds.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Scenario 6: Sort + Pagination Order Preservation
// ===========================================================================

test.describe("6. Sort + Pagination Order Preservation", () => {
  test.describe.configure({ mode: "serial" });

  // -------------------------------------------------------------------------
  // 6.1: price_asc maintains ascending price order across pages
  // -------------------------------------------------------------------------
  test("6.1 load more with price_asc maintains ascending price order", async ({
    page,
  }) => {
    test.slow();

    // Set up mock with custom ascending prices well above all seed data.
    // Seed data max is ~$2,200; mock starts at $10,000 to guarantee the
    // cross-page boundary (last real price <= first mock price) holds.
    const mock = await setupPaginationMock(page, { totalLoadMoreItems: 12 });
    for (let i = 0; i < mock.allMockListings.length; i++) {
      mock.allMockListings[i] = createMockListing(i, {
        price: 10_000 + i * 100, // 10000, 10100, ..., 11100
      });
    }

    await page.goto(`/search?sort=price_asc&${boundsQS}`);
    const container = searchResultsContainer(page);

    const cards = container.locator(sel.card);
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });
    const initialCount = await cards.count();

    // Extract page-1 prices (real DB data sorted ascending by server)
    const pricesPage1 = await extractPrices(page);
    expect(pricesPage1.length).toBeGreaterThanOrEqual(1);

    // Verify page 1 is non-decreasing
    for (let i = 1; i < pricesPage1.length; i++) {
      expect(pricesPage1[i]).toBeGreaterThanOrEqual(pricesPage1[i - 1]);
    }

    // Load more
    const loadMoreBtn = container.locator(sel.loadMoreBtn);
    await expect(loadMoreBtn).toBeVisible({ timeout: 15_000 });
    await loadMoreBtn.click();
    await expect(cards).toHaveCount(initialCount + 12, { timeout: 15_000 });

    // Extract all prices after load-more
    const allPrices = await extractPrices(page);
    expect(allPrices.length).toBe(initialCount + 12);

    // ALL prices should be non-decreasing across both pages
    for (let i = 1; i < allPrices.length; i++) {
      expect(allPrices[i]).toBeGreaterThanOrEqual(allPrices[i - 1]);
    }

    // Cross-page boundary: last page-1 price <= first page-2 price
    const lastPage1Price = allPrices[pricesPage1.length - 1];
    const firstPage2Price = allPrices[pricesPage1.length];
    expect(firstPage2Price).toBeGreaterThanOrEqual(lastPage1Price);
  });

  // -------------------------------------------------------------------------
  // 6.2: price_desc maintains descending price order across pages
  // -------------------------------------------------------------------------
  test("6.2 load more with price_desc maintains descending price order", async ({
    page,
  }) => {
    test.slow();

    // Mock prices descending, all below seed min (~$800).
    // This ensures cross-page boundary (last real price >= first mock price).
    const mock = await setupPaginationMock(page, { totalLoadMoreItems: 12 });
    for (let i = 0; i < mock.allMockListings.length; i++) {
      mock.allMockListings[i] = createMockListing(i, {
        price: 200 - i * 10, // 200, 190, 180, ..., 90
      });
    }

    await page.goto(`/search?sort=price_desc&${boundsQS}`);
    const container = searchResultsContainer(page);

    const cards = container.locator(sel.card);
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });
    const initialCount = await cards.count();

    // Extract page-1 prices (real DB data sorted descending by server)
    const pricesPage1 = await extractPrices(page);
    expect(pricesPage1.length).toBeGreaterThanOrEqual(1);

    // Verify page 1 is non-increasing
    for (let i = 1; i < pricesPage1.length; i++) {
      expect(pricesPage1[i]).toBeLessThanOrEqual(pricesPage1[i - 1]);
    }

    // Load more
    const loadMoreBtn = container.locator(sel.loadMoreBtn);
    await expect(loadMoreBtn).toBeVisible({ timeout: 15_000 });
    await loadMoreBtn.click();
    await expect(cards).toHaveCount(initialCount + 12, { timeout: 15_000 });

    // Extract all prices after load-more
    const allPrices = await extractPrices(page);
    expect(allPrices.length).toBe(initialCount + 12);

    // ALL prices should be non-increasing across both pages
    for (let i = 1; i < allPrices.length; i++) {
      expect(allPrices[i]).toBeLessThanOrEqual(allPrices[i - 1]);
    }

    // Cross-page boundary: last page-1 price >= first page-2 price
    const lastPage1Price = allPrices[pricesPage1.length - 1];
    const firstPage2Price = allPrices[pricesPage1.length];
    expect(lastPage1Price).toBeGreaterThanOrEqual(firstPage2Price);
  });

  // -------------------------------------------------------------------------
  // 6.3: newest maintains date order (verified by DOM ordering of mock IDs)
  // -------------------------------------------------------------------------
  test("6.3 load more with newest maintains result order", async ({
    page,
  }) => {
    test.slow();

    await setupPaginationMock(page, { totalLoadMoreItems: 12 });
    await page.goto(`/search?sort=newest&${boundsQS}`);
    const container = searchResultsContainer(page);

    const cards = container.locator(sel.card);
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });
    const initialCount = await cards.count();

    // Load more
    const loadMoreBtn = container.locator(sel.loadMoreBtn);
    await expect(loadMoreBtn).toBeVisible({ timeout: 15_000 });
    await loadMoreBtn.click();
    await expect(cards).toHaveCount(initialCount + 12, { timeout: 15_000 });

    // Verify URL maintains sort=newest with no cursor leakage
    expect(page.url()).toContain("sort=newest");
    expect(page.url()).not.toContain("cursor");

    // Verify mock items rendered in the exact order returned by the server.
    // Mock IDs are sequential: mock-listing-000, mock-listing-001, ...
    // If the component reordered them, the sequence would break.
    const allIds = await cards.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-listing-id")).filter(Boolean),
    );
    const mockIds = allIds.filter((id) =>
      (id as string).startsWith("mock-listing-"),
    );
    expect(mockIds.length).toBe(12);

    // Sequential order check: each mock ID index > previous
    for (let i = 1; i < mockIds.length; i++) {
      const prev = parseInt((mockIds[i - 1] as string).split("-").pop()!, 10);
      const curr = parseInt((mockIds[i] as string).split("-").pop()!, 10);
      expect(curr).toBeGreaterThan(prev);
    }
  });

  // -------------------------------------------------------------------------
  // 6.4: rating maintains rating order (verified by DOM ordering of mock IDs)
  // -------------------------------------------------------------------------
  test("6.4 load more with rating maintains result order", async ({
    page,
  }) => {
    test.slow();

    await setupPaginationMock(page, { totalLoadMoreItems: 12 });
    await page.goto(`/search?sort=rating&${boundsQS}`);
    const container = searchResultsContainer(page);

    const cards = container.locator(sel.card);
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });
    const initialCount = await cards.count();

    // Load more
    const loadMoreBtn = container.locator(sel.loadMoreBtn);
    await expect(loadMoreBtn).toBeVisible({ timeout: 15_000 });
    await loadMoreBtn.click();
    await expect(cards).toHaveCount(initialCount + 12, { timeout: 15_000 });

    // Verify URL maintains sort=rating with no cursor leakage
    expect(page.url()).toContain("sort=rating");
    expect(page.url()).not.toContain("cursor");

    // Verify mock items rendered in server-returned order (not reordered)
    const allIds = await cards.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-listing-id")).filter(Boolean),
    );
    const mockIds = allIds.filter((id) =>
      (id as string).startsWith("mock-listing-"),
    );
    expect(mockIds.length).toBe(12);

    // Sequential order check
    for (let i = 1; i < mockIds.length; i++) {
      const prev = parseInt((mockIds[i - 1] as string).split("-").pop()!, 10);
      const curr = parseInt((mockIds[i] as string).split("-").pop()!, 10);
      expect(curr).toBeGreaterThan(prev);
    }
  });

  // -------------------------------------------------------------------------
  // 6.5: Switch sort mid-pagination resets to page 1
  // -------------------------------------------------------------------------
  test("6.5 switching sort mid-pagination resets to page 1 with new order", async ({
    page,
  }) => {
    test.slow();

    await setupPaginationMock(page, { totalLoadMoreItems: 24 });
    await page.goto(`/search?sort=newest&${boundsQS}`);

    // Accumulate 2 pages with sort=newest
    await loadTwoPages(page);

    // Switch sort to price_asc via the desktop dropdown.
    // This changes searchParamsString, which remounts SearchResultsClient,
    // discarding all accumulated extra listings and the cursor.
    await selectDesktopSort(page, "Price: Low to High", "price_asc");

    // After remount: only fresh first-page results visible
    const container = searchResultsContainer(page);
    const cards = container.locator(sel.card);
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });

    const resetCount = await cards.count();
    expect(resetCount).toBeLessThanOrEqual(12);
    expect(resetCount).toBeGreaterThanOrEqual(1);

    // URL reflects new sort, no cursor
    const url = new URL(page.url());
    expect(url.searchParams.get("sort")).toBe("price_asc");
    expect(url.searchParams.has("cursor")).toBe(false);

    // Results should now be price-ordered (ascending, from real DB data)
    const prices = await extractPrices(page);
    if (prices.length > 1) {
      for (let i = 1; i < prices.length; i++) {
        expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]);
      }
    }

    // Previous mock listings from the sort=newest load-more should be gone
    const allIds = await cards.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-listing-id")).filter(Boolean),
    );
    const mockIds = allIds.filter((id) =>
      (id as string).startsWith("mock-listing-"),
    );
    expect(mockIds.length).toBe(0);
  });
});
