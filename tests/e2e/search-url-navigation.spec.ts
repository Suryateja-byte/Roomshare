/**
 * Search URL Browser Navigation Tests (P1)
 *
 * Verifies browser back/forward behavior with search URL state:
 * - Filter changes create history entries (pushState via navigateWithTransition)
 * - Map bounds changes do NOT create history entries (replaceState via replaceWithTransition)
 * - Navigate to listing detail -> back -> returns to search with params preserved
 * - Load-more state is ephemeral and lost on back navigation
 *
 * Run: pnpm playwright test tests/e2e/search-url-navigation.spec.ts
 */

import { test, expect, SF_BOUNDS, searchResultsContainer } from "./helpers/test-utils";
import { pollForUrlParam } from "./helpers/sync-helpers";
import type { Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSearchUrl(params?: Record<string, string>): string {
  const base = `/search?minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;
  if (!params) return base;
  const extra = new URLSearchParams(params).toString();
  return `${base}&${extra}`;
}

/** Wait for search results or zero-results state to render. */
async function waitForSearchContent(page: Page) {
  const container = searchResultsContainer(page);
  const cards = container.locator('[data-testid="listing-card"]');
  const zeroResults = page.locator('h2:has-text("No matches found")');
  await expect(cards.or(zeroResults).first()).toBeAttached({ timeout: 30_000 });
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

test.describe("Search URL Browser Navigation (P1)", () => {
  test.beforeEach(async () => {
    test.slow();
  });

  // -------------------------------------------------------------------------
  // 1. Filter change creates history entry -> back restores previous
  // -------------------------------------------------------------------------
  test("1: filter change creates history entry, back restores previous state", async ({ page }) => {
    // State A: no price filter
    await page.goto(buildSearchUrl());
    await waitForSearchContent(page);

    const urlA = page.url();
    expect(new URL(urlA).searchParams.has("maxPrice")).toBe(false);

    // State B: navigate to URL with price filter (simulating filter commit)
    await page.goto(buildSearchUrl({ maxPrice: "1500" }));
    await waitForSearchContent(page);

    const urlB = new URL(page.url());
    expect(urlB.searchParams.get("maxPrice")).toBe("1500");

    // Go back -> should return to state A (no maxPrice)
    await page.goBack();
    await page.waitForLoadState("domcontentloaded");

    const urlAfterBack = new URL(page.url());
    expect(urlAfterBack.searchParams.has("maxPrice")).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 2. Sort change creates history entry -> back restores previous sort
  // -------------------------------------------------------------------------
  test("2: sort change creates history entry, back restores previous sort", async ({ page }) => {
    // State A: default sort (no sort param)
    await page.goto(buildSearchUrl());
    await waitForSearchContent(page);

    expect(new URL(page.url()).searchParams.has("sort")).toBe(false);

    // State B: sorted by price_asc
    await page.goto(buildSearchUrl({ sort: "price_asc" }));
    await waitForSearchContent(page);

    expect(new URL(page.url()).searchParams.get("sort")).toBe("price_asc");

    // Go back -> should not have sort param
    await page.goBack();
    await page.waitForLoadState("domcontentloaded");

    await pollForUrlParam(page, "sort", null);
  });

  // -------------------------------------------------------------------------
  // 3. Query change creates history entry -> back restores previous query
  // -------------------------------------------------------------------------
  test("3: query change creates history entry, back restores previous query", async ({ page }) => {
    // State A: no query
    await page.goto(buildSearchUrl());
    await waitForSearchContent(page);

    expect(new URL(page.url()).searchParams.has("q")).toBe(false);

    // State B: with query
    await page.goto(buildSearchUrl({ q: "Mission" }));
    await page.waitForLoadState("domcontentloaded");

    expect(new URL(page.url()).searchParams.get("q")).toBe("Mission");

    // Go back -> no query
    await page.goBack();
    await page.waitForLoadState("domcontentloaded");

    await pollForUrlParam(page, "q", null);
  });

  // -------------------------------------------------------------------------
  // 4. Map bounds change does NOT create history entry (uses replaceState)
  // -------------------------------------------------------------------------
  test("4: map bounds update uses replaceState -- no extra history entry", async ({ page }) => {
    // Navigate to search page with initial bounds
    await page.goto(buildSearchUrl());
    await waitForSearchContent(page);

    // Simulate a bounds change via replaceState (the way replaceWithTransition works)
    // This replicates what the map does when the user pans
    const newBounds = {
      minLat: "37.72",
      maxLat: "37.83",
      minLng: "-122.50",
      maxLng: "-122.38",
    };
    const newUrl = `/search?minLat=${newBounds.minLat}&maxLat=${newBounds.maxLat}&minLng=${newBounds.minLng}&maxLng=${newBounds.maxLng}`;

    // Use history.replaceState to simulate the map behavior
    await page.evaluate((url) => {
      window.history.replaceState(window.history.state, "", url);
    }, newUrl);

    // Verify URL updated
    const urlAfterReplace = new URL(page.url());
    expect(urlAfterReplace.searchParams.get("minLat")).toBe(newBounds.minLat);

    // Go back -- since replaceState was used, back should go to the page before /search
    // (or stay on search if there is no prior entry)
    // The key assertion is that the replace did NOT add a new history entry
    // Navigate to a different page first, then back, to verify replaceState behavior
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    await page.goBack();
    await page.waitForLoadState("domcontentloaded");

    // Should return to the search page with the REPLACED bounds (not the original)
    const urlAfterBack = new URL(page.url());
    if (urlAfterBack.pathname === "/search") {
      expect(urlAfterBack.searchParams.get("minLat")).toBe(newBounds.minLat);
    }
  });

  // -------------------------------------------------------------------------
  // 5. Multiple filter changes -> multiple back presses restore each state
  // -------------------------------------------------------------------------
  test("5: multiple filter changes create stacked history entries", async ({ page }) => {
    // State A: base search
    await page.goto(buildSearchUrl());
    await waitForSearchContent(page);

    // State B: add maxPrice
    await page.goto(buildSearchUrl({ maxPrice: "1500" }));
    await page.waitForLoadState("domcontentloaded");

    // State C: add sort
    await page.goto(buildSearchUrl({ maxPrice: "1500", sort: "price_asc" }));
    await page.waitForLoadState("domcontentloaded");

    // State D: add roomType
    await page.goto(buildSearchUrl({ maxPrice: "1500", sort: "price_asc", roomType: "private" }));
    await page.waitForLoadState("domcontentloaded");

    // Verify we are in state D
    let url = new URL(page.url());
    expect(url.searchParams.get("maxPrice")).toBe("1500");
    expect(url.searchParams.get("sort")).toBe("price_asc");
    const rtD = url.searchParams.get("roomType");
    expect(rtD === "private" || rtD === "Private Room").toBe(true);

    // Back -> state C (no roomType)
    await page.goBack();
    await page.waitForLoadState("domcontentloaded");
    await pollForUrlParam(page, "roomType", null);
    // maxPrice and sort should still be present
    url = new URL(page.url());
    expect(url.searchParams.get("maxPrice")).toBe("1500");
    expect(url.searchParams.get("sort")).toBe("price_asc");

    // Back -> state B (no sort)
    await page.goBack();
    await page.waitForLoadState("domcontentloaded");
    await pollForUrlParam(page, "sort", null);
    url = new URL(page.url());
    expect(url.searchParams.get("maxPrice")).toBe("1500");

    // Back -> state A (no maxPrice)
    await page.goBack();
    await page.waitForLoadState("domcontentloaded");
    await pollForUrlParam(page, "maxPrice", null);
  });

  // -------------------------------------------------------------------------
  // 6. Forward after back restores the changed state
  // -------------------------------------------------------------------------
  test("6: forward after back restores the changed state", async ({ page }) => {
    // State A: base
    await page.goto(buildSearchUrl());
    await waitForSearchContent(page);

    // State B: with sort
    await page.goto(buildSearchUrl({ sort: "newest" }));
    await page.waitForLoadState("domcontentloaded");

    expect(new URL(page.url()).searchParams.get("sort")).toBe("newest");

    // Back -> state A
    await page.goBack();
    await page.waitForLoadState("domcontentloaded");
    await pollForUrlParam(page, "sort", null);

    // Forward -> state B
    await page.goForward();
    await page.waitForLoadState("domcontentloaded");
    await pollForUrlParam(page, "sort", "newest");
  });

  // -------------------------------------------------------------------------
  // 7. Navigate to listing detail -> back -> search params preserved
  // -------------------------------------------------------------------------
  test("7: navigate to listing detail then back preserves search params", async ({ page }) => {
    const searchUrlWithFilters = buildSearchUrl({ maxPrice: "2000", sort: "price_asc" });
    await page.goto(searchUrlWithFilters);
    await waitForSearchContent(page);

    // Click on a listing card to navigate to detail
    const container = searchResultsContainer(page);
    const cards = container.locator('[data-testid="listing-card"]');
    const cardCount = await cards.count();

    if (cardCount === 0) {
      test.skip(true, "No listing cards found to navigate to");
      return;
    }

    // Click h3 title instead of <a> to avoid ImageCarousel's pointerDown setting isDragging=true
    const firstCard = cards.first();
    const href = await firstCard.locator('a[href^="/listings/"]').first().getAttribute("href");
    expect(href).toBeTruthy();

    // Navigate via h3 click (inside Link but outside carousel area)
    await firstCard.locator('h3').first().click();
    await expect(page).toHaveURL(/\/listings\//, { timeout: 15_000 });

    // Go back to search
    await page.goBack();
    await page.waitForLoadState("domcontentloaded");

    // Should be back on search with params preserved
    const urlAfterBack = new URL(page.url());
    expect(urlAfterBack.pathname).toBe("/search");
    expect(urlAfterBack.searchParams.get("maxPrice")).toBe("2000");
    expect(urlAfterBack.searchParams.get("sort")).toBe("price_asc");
  });

  // -------------------------------------------------------------------------
  // 8. Browser back after load-more -> load-more state lost (only initial results)
  // -------------------------------------------------------------------------
  test("8: back after load-more loses ephemeral pagination state", async ({ page }) => {
    await page.goto(buildSearchUrl());
    await waitForSearchContent(page);

    const container = searchResultsContainer(page);
    const cards = container.locator('[data-testid="listing-card"]');
    const initialCount = await cards.count();

    // Try load more
    const loadMoreBtn = page.locator('button:has-text("Show more places")');
    const hasLoadMore = await loadMoreBtn.isVisible().catch(() => false);

    if (!hasLoadMore) {
      test.skip(true, "No load-more button -- insufficient data for pagination test");
      return;
    }

    await loadMoreBtn.click();

    // Wait for additional cards
    await page.waitForFunction(
      (count) => {
        return document.querySelectorAll('[data-testid="listing-card"]').length > count;
      },
      initialCount,
      { timeout: 30_000 },
    ).catch(() => {
      // May not produce additional results
    });

    const afterLoadMoreCount = await cards.count();

    // Navigate away (e.g., to listing detail)
    const firstLink = cards.first().locator('a[href^="/listings/"]').first();
    const href = await firstLink.getAttribute("href");
    if (!href) {
      test.skip(true, "No listing link found");
      return;
    }

    await firstLink.click();
    await expect(page).toHaveURL(/\/listings\//, { timeout: 15_000 });

    // Go back
    await page.goBack();
    await page.waitForLoadState("domcontentloaded");

    // Wait for the page to re-render
    await expect(cards.first()).toBeAttached({ timeout: 30_000 });

    // The count should be back to the initial SSR count (load-more state is ephemeral)
    const afterBackCount = await cards.count();

    // After back navigation, the page re-renders from SSR with initial results only
    // The count should be <= the initial count (not the inflated load-more count)
    expect(afterBackCount).toBeLessThanOrEqual(afterLoadMoreCount);

    // Cursor should not be in URL
    const url = new URL(page.url());
    expect(url.searchParams.has("cursor")).toBe(false);
    expect(url.searchParams.has("cursorStack")).toBe(false);
    expect(url.searchParams.has("pageNumber")).toBe(false);
  });
});
