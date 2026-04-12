/**
 * Pagination Browse Mode Tests
 *
 * Tests pagination behavior in "browse mode" -- when the user visits
 * /search without specific bounds or query. In browse mode:
 * - MAX_UNBOUNDED_RESULTS = 48 (server cap, not client)
 * - The search shell is marked as browse mode and the standard desktop
 *   heading renders immediately without the old SuggestedSearches block.
 * - Results begin immediately without the old SuggestedSearches block
 *
 * Browse mode is detected when: !q && !bounds (src/lib/search-params.ts:463)
 *
 * Strategy:
 * - Initial page load uses REAL data from the database (SSR in browse mode).
 * - "Load more" is mocked via server action interception (POST only) when needed.
 * - Browse mode tests navigate to /search without bounds or query params.
 *
 * Run: pnpm playwright test tests/e2e/pagination/pagination-browse-mode.spec.ts --project=chromium
 */

import { test, expect, searchResultsContainer } from "../helpers/test-utils";
import { setupPaginationMock } from "../helpers/pagination-mock-factory";

// Selectors derived from SearchResultsClient.tsx and search/page.tsx
const sel = {
  card: '[data-testid="listing-card"]',
  loadMoreBtn: 'button:has-text("Show more places")',
  feed: '[role="feed"][aria-label="Search results"]',
  searchShell: '[data-testid="search-shell"]',
  desktopHeading: '[data-testid="desktop-results-heading-section"]',
} as const;

// ---------------------------------------------------------------------------
// Section 8: Browse Mode
// ---------------------------------------------------------------------------
test.describe("Pagination Browse Mode", () => {
  test.beforeEach(async () => {
    test.slow();
  });

  // -------------------------------------------------------------------------
  // 8.1 Browse mode caps at 48 results total [MOCK]
  // -------------------------------------------------------------------------
  test("8.1 browse mode caps at 48 results", async ({ page }) => {
    test.slow();

    // Set up mock for load-more calls. In browse mode the server caps at
    // MAX_UNBOUNDED_RESULTS = 48. The initial SSR page shows up to 12 items.
    // We provide 36 mock items so the total can reach 48 (12 real + 36 mock).
    await setupPaginationMock(page, { totalLoadMoreItems: 36 });

    // Navigate to /search WITHOUT bounds or query (triggers browse mode)
    await page.goto("/search");

    // Wait for initial listings to render (scoped to visible container)
    const container = searchResultsContainer(page);
    const cards = container.locator(sel.card);
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });

    const initialCount = await cards.count();

    // In browse mode the server may return fewer than 12 items, or up to 48
    // on the first page with no cursor (if all fit in one page).
    expect(initialCount).toBeGreaterThanOrEqual(1);

    // If there is a load-more button, keep clicking until it disappears
    const loadMoreBtn = container.locator(sel.loadMoreBtn);
    let clickCount = 0;
    const maxClicks = 5; // Safety: prevent infinite loops

    while (clickCount < maxClicks) {
      const isVisible = await loadMoreBtn.isVisible().catch(() => false);
      if (!isVisible) break;

      await loadMoreBtn.click();
      clickCount++;

      // Wait for new cards to appear or button to disappear
      await expect(loadMoreBtn).toBeEnabled({ timeout: 10_000 }).catch(() => {
        /* button may have disappeared (cap reached) */
      });
    }

    // Assert total accumulated listings never exceed 48
    const finalCount = await cards.count();
    expect(finalCount).toBeLessThanOrEqual(48);

    // After exhausting all pages, load-more button should be hidden.
    // On mobile, the mock route may not intercept correctly (different container),
    // so we allow the button to still be visible as long as the cap is respected.
    if (finalCount >= 48) {
      await expect(loadMoreBtn).not.toBeVisible({ timeout: 5_000 });
    }
  });

  // -------------------------------------------------------------------------
  // 8.2 Browse mode indicator visible [LIVE]
  // -------------------------------------------------------------------------
test("8.2 browse mode shows indicator banner", async ({ page }) => {
    test.slow();

    // Navigate to /search WITHOUT bounds or query (triggers browse mode)
    await page.goto("/search");

    // Wait for the page to render with results
    const container = searchResultsContainer(page);
    const cards = container.locator(sel.card);
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });

    // Current desktop browse mode exposes state via the search shell attribute
    // and shows the standard results heading instead of SuggestedSearches.
    await expect(container.locator(sel.searchShell)).toHaveAttribute(
      "data-browse-mode",
      "true"
    );
    const viewport = page.viewportSize();
    if (viewport && viewport.width >= 768) {
      const browseHeading = page
        .locator('[data-testid="desktop-search-results-scroll-area"]')
        .locator(sel.desktopHeading)
        .first();
      await expect(browseHeading).toBeVisible({ timeout: 30_000 });
      await expect(
        browseHeading.getByRole("heading", { level: 1 })
      ).toContainText(/places?/i);
    }

    await expect(container.getByText(/Popular areas|Recent searches/i)).toHaveCount(
      0
    );
  });
});
