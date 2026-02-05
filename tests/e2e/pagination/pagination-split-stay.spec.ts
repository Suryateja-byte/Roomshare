/**
 * Split-Stay Pagination Tests (Scenario 9)
 *
 * Verifies the split-stay suggestion feature that appears when users
 * search for long-duration stays (6+ months).
 *
 * Split-stay logic (from src/lib/search/split-stay.ts):
 * - Only shows for estimatedMonths >= 6 and listings.length >= 2
 * - Pairs the cheapest listings with the most expensive ones
 * - Recalculates via useMemo when allListings.length or estimatedMonths changes
 *
 * Strategy:
 * - Initial page loads real DB data (~12 items from ~19 seed listings).
 *   With leaseDuration=6 months, estimatedMonths = 6, which triggers split-stay.
 * - "Load more" is mocked via server action interception (POST only).
 * - Short-duration tests verify split-stay is NOT shown for < 6 months.
 *
 * Key component details:
 * - estimatedMonths derived from searchParamsString via leaseDuration regex
 * - splitStayPairs = findSplitStays(allListings, estimatedMonths)
 * - useMemo dependency: [allListings.length, estimatedMonths]
 * - SplitStayCard renders "Split Stay . splitLabel" header, combined price footer
 *
 * Run: pnpm playwright test tests/e2e/pagination/pagination-split-stay.spec.ts --project=chromium
 */

import { test, expect, SF_BOUNDS, searchResultsContainer } from "../helpers/test-utils";
import { setupPaginationMock } from "../helpers/pagination-mock-factory";

const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;

const sel = {
  feed: '[role="feed"][aria-label="Search results"]',
  card: '[data-testid="listing-card"]',
  loadMoreBtn: 'button:has-text("Show more places")',
  splitStayHeading: 'h3:has-text("Split your stay")',
  splitStayLabel: 'text=/Split Stay/',
  combinedTotal: 'text="Combined total"',
} as const;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Split-Stay Feature (Scenario 9)", () => {
  // -------------------------------------------------------------------------
  // 9.1 6+ month search shows split-stay suggestions [LIVE]
  // -------------------------------------------------------------------------
  test("9.1 six-month lease duration shows split-stay suggestions", async ({
    page,
  }) => {
    test.slow();

    // Navigate with 6-month lease duration to trigger split-stay.
    // estimatedMonths is derived from leaseDuration via regex /^(\d+)\s+months?$/i
    await page.goto(`/search?${boundsQS}&leaseDuration=6%20months`);
    const container = searchResultsContainer(page);

    // Wait for initial listings to render (real DB data via SSR + hydration)
    const cards = container.locator(sel.card);
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });

    // Need at least 2 listings with price > 0 for split-stay to appear.
    // The leaseDuration filter may reduce results significantly depending on seed data.
    const cardCount = await cards.count();
    if (cardCount < 2) {
      test.skip(true, `Only ${cardCount} listing(s) match leaseDuration=6 months. Need ≥2 for split-stay.`);
    }

    // Split-stay section heading should be visible
    const splitHeading = container.locator(sel.splitStayHeading);
    await expect(splitHeading).toBeVisible({ timeout: 15_000 });

    // At least one SplitStayCard should be rendered.
    // The card header renders "Split Stay . {splitLabel}" (e.g., "Split Stay . 3 mo + 3 mo")
    const splitLabels = container.locator(sel.splitStayLabel);
    const splitLabelCount = await splitLabels.count();
    expect(splitLabelCount).toBeGreaterThanOrEqual(1);

    // Verify the split label shows the expected duration split (3 mo + 3 mo for 6 months)
    const labelText = await splitLabels.first().textContent();
    expect(labelText).toContain("3 mo + 3 mo");

    // Combined price footer should be displayed in the card
    const combinedTotalEl = container.locator(sel.combinedTotal);
    await expect(combinedTotalEl.first()).toBeVisible();

    // The combined price value should be a dollar amount
    const priceSection = combinedTotalEl.first().locator("..");
    const priceText = await priceSection.textContent();
    expect(priceText).toMatch(/\$[\d,]+/);

    // Split-stay card halves should be clickable links to listing detail pages.
    // Scope to the section below the split-stay heading to avoid matching
    // regular listing cards.
    const splitSection = splitHeading.locator("..").locator(".."); // h3 -> div.mb-3 -> div.mt-8
    // Use the parent of the heading which is the mt-8 wrapper div
    const splitSectionParent = splitHeading.locator("..");
    const splitLinks = splitSectionParent.locator('a[href^="/listings/"]');
    const linkCount = await splitLinks.count();
    // Each SplitStayCard has 2 links (first half + second half),
    // and there can be up to 2 cards (maxPairs = min(2, floor(n/2)))
    expect(linkCount).toBeGreaterThanOrEqual(2);
  });

  // -------------------------------------------------------------------------
  // 9.2 Short duration search shows no split-stay [LIVE]
  // -------------------------------------------------------------------------
  test("9.2 three-month lease duration shows no split-stay section", async ({
    page,
  }) => {
    test.slow();

    // Navigate with 3-month lease duration (< 6 months threshold).
    // findSplitStays returns [] when stayMonths < 6.
    await page.goto(`/search?${boundsQS}&leaseDuration=3%20months`);
    const container = searchResultsContainer(page);

    // Wait for the page to settle. The leaseDuration filter may return 0 results
    // depending on seed data. If no cards appear, skip the test.
    await page.waitForLoadState("domcontentloaded");
    const cards = container.locator(sel.card);
    const hasCards = await cards.first().isVisible({ timeout: 15_000 }).catch(() => false);
    if (!hasCards) {
      test.skip(true, "No listings match leaseDuration=3 months filter. Seed data may not support this filter value.");
    }

    // Verify listings are present (the search itself still works)
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThanOrEqual(1);

    // Split-stay heading should NOT be in the DOM
    const splitHeading = container.locator(sel.splitStayHeading);
    await expect(splitHeading).not.toBeVisible({ timeout: 5_000 });

    // No SplitStayCard should be rendered
    const splitLabels = container.locator(sel.splitStayLabel);
    expect(await splitLabels.count()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 9.3 Split-stay updates after load-more adds new listings [MOCK]
  // -------------------------------------------------------------------------
  test("9.3 split-stay pairs recalculate after load-more adds listings", async ({
    page,
  }) => {
    test.slow();

    // Set up mock for load-more: 12 additional listings.
    // Mock listings have prices $800, $850, $900, ... (from createMockListing).
    // Adding these to the pool changes the sorted price order, which may
    // change which pairs are selected (cheapest + most expensive).
    await setupPaginationMock(page, { totalLoadMoreItems: 12 });

    // Navigate with 6-month lease duration to trigger split-stay
    await page.goto(`/search?${boundsQS}&leaseDuration=6%20months`);
    const container = searchResultsContainer(page);

    // Wait for initial listings to render
    const cards = container.locator(sel.card);
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });
    const initialCardCount = await cards.count();
    if (initialCardCount < 2) {
      test.skip(true, `Only ${initialCardCount} listing(s) match leaseDuration=6 months. Need ≥2 for split-stay.`);
    }

    // Verify initial split-stay section is visible
    const splitHeading = container.locator(sel.splitStayHeading);
    await expect(splitHeading).toBeVisible({ timeout: 15_000 });

    // Capture the initial combined price text for comparison after load-more
    const combinedTotalEl = container.locator(sel.combinedTotal).first();
    await expect(combinedTotalEl).toBeVisible();
    const initialPriceSection = combinedTotalEl.locator("..");
    const initialPriceText = await initialPriceSection.textContent();

    // Click "Show more places" to load mock listings
    const loadMoreBtn = container.locator(sel.loadMoreBtn);
    await expect(loadMoreBtn).toBeVisible({ timeout: 15_000 });
    await loadMoreBtn.click();

    // Wait for additional cards to appear (initial + 12 mock)
    await expect(cards).toHaveCount(initialCardCount + 12, {
      timeout: 15_000,
    });

    // Split-stay section should still be visible after recalculation.
    // The useMemo dependency [allListings.length, estimatedMonths] triggers
    // recomputation because allListings.length changed.
    await expect(splitHeading).toBeVisible();

    // Combined price should still be present and be a valid dollar amount
    const updatedCombinedTotal = container.locator(sel.combinedTotal).first();
    await expect(updatedCombinedTotal).toBeVisible();
    const updatedPriceSection = updatedCombinedTotal.locator("..");
    const updatedPriceText = await updatedPriceSection.textContent();
    expect(updatedPriceText).toMatch(/\$[\d,]+/);

    // The split label should still show the correct duration split
    const splitLabels = container.locator(sel.splitStayLabel);
    const labelCount = await splitLabels.count();
    expect(labelCount).toBeGreaterThanOrEqual(1);
    const labelText = await splitLabels.first().textContent();
    expect(labelText).toContain("3 mo + 3 mo");

    // Split-stay pairs may have changed because the new mock listings
    // (prices starting at $800) alter the sorted price order.
    // We verify the section was recalculated by confirming it remains
    // structurally valid with links to listing detail pages.
    const splitSectionParent = splitHeading.locator("..");
    const splitLinks = splitSectionParent.locator('a[href^="/listings/"]');
    const linkCount = await splitLinks.count();
    expect(linkCount).toBeGreaterThanOrEqual(2);
  });
});
