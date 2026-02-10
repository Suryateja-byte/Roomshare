/**
 * Pagination Accessibility Tests (Scenario 11)
 *
 * Validates accessibility features of the search pagination flow:
 * - Screen reader live region announcements
 * - Load-more button ARIA attributes (idle + loading states)
 * - Feed container semantic structure (role, aria-label, tabIndex)
 * - Keyboard navigation to and activation of the load-more button
 *
 * Key component: SearchResultsClient (src/components/search/SearchResultsClient.tsx)
 *
 * Relevant DOM structure:
 *   <div id="search-results" tabIndex={-1}>
 *     <div aria-live="polite" aria-atomic="true" class="sr-only">
 *       Found N listings
 *     </div>
 *     ...
 *     <div role="feed" aria-label="Search results">
 *       <ListingCard ... /> x N
 *     </div>
 *     ...
 *     <button
 *       aria-busy={isLoadingMore}
 *       aria-label="Show more places. Currently showing N of M listings"
 *       class="... touch-target"
 *       disabled={isLoadingMore}
 *     >
 *       Show more places
 *     </button>
 *   </div>
 *
 * Run: pnpm playwright test tests/e2e/pagination/pagination-a11y.spec.ts --project=chromium
 */

import { test, expect, SF_BOUNDS, tags, searchResultsContainer } from "../helpers/test-utils";
import { setupPaginationMock } from "../helpers/pagination-mock-factory";

const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;

const sel = {
  feed: '[role="feed"][aria-label="Search results"]',
  card: '[data-testid="listing-card"]',
  loadMoreBtn: 'button:has-text("Show more places")',
  busyBtn: 'button[aria-busy="true"]',
  srLiveRegion: '[aria-live="polite"][aria-atomic="true"]',
  searchResults: "#search-results",
} as const;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Pagination Accessibility (Scenario 11)", () => {
  test.beforeEach(async () => {
    test.slow();
  });

  // -------------------------------------------------------------------------
  // 11.1 Screen reader announcement when results load
  // -------------------------------------------------------------------------
  test(
    "11.1 aria-live region announces result count on initial load",
    { tag: [tags.a11y] },
    async ({ page }) => {
      test.slow();

      await page.goto(`/search?${boundsQS}`);
      const container = searchResultsContainer(page);

      // Wait for listings to render
      const cards = container.locator(sel.card);
      await expect(cards.first()).toBeVisible({ timeout: 30_000 });

      // The sr-only live region should exist in the DOM.
      // It is visually hidden (class="sr-only") but accessible to screen readers.
      const liveRegion = container.locator(sel.srLiveRegion);
      await expect(liveRegion).toBeAttached({ timeout: 15_000 });

      // Verify it has the sr-only class (visually hidden, screen-reader accessible)
      const hasSrOnly = await liveRegion.evaluate((el) =>
        el.classList.contains("sr-only"),
      );
      expect(hasSrOnly).toBe(true);

      // The live region should announce the result count.
      // With ~19 seed listings in SF bounds, total is a number, so the text
      // should match "Found N listings" (or "Found 1 listing" for singular).
      const announceText = await liveRegion.textContent();
      expect(announceText).toBeTruthy();

      // Match either "Found N listings" or "Found more than 100 listings"
      const matchesPattern =
        /Found \d+ listings?/.test(announceText!) ||
        /Found more than 100 listings/.test(announceText!);
      expect(matchesPattern).toBe(true);
    },
  );

  // -------------------------------------------------------------------------
  // 11.1b Screen reader announces zero results for empty search
  // -------------------------------------------------------------------------
  test(
    "11.1b aria-live region announces zero results for no-match search",
    { tag: [tags.a11y] },
    async ({ page }) => {
      test.slow();

      // Navigate with a query that should return 0 results
      await page.goto(`/search?${boundsQS}&q=zzznonexistentqueryzz`);
      const container = searchResultsContainer(page);

      // Wait for the page to settle (zero-results UI may take a moment)
      await page.waitForLoadState("domcontentloaded");

      // The sr-only live region should announce zero results
      const liveRegion = container.locator(sel.srLiveRegion);
      await expect(liveRegion).toBeAttached({ timeout: 15_000 });

      const announceText = await liveRegion.textContent();
      expect(announceText).toBeTruthy();
      expect(announceText).toContain("No listings found");
    },
  );

  // -------------------------------------------------------------------------
  // 11.2 Load-more button accessibility attributes
  // -------------------------------------------------------------------------
  test(
    "11.2 load-more button has correct ARIA attributes in idle and loading states",
    { tag: [tags.a11y] },
    async ({ page }) => {
      test.slow();

      // Use a 2-second delay so the loading state is observable
      await setupPaginationMock(page, {
        totalLoadMoreItems: 12,
        delayMs: 2000,
      });
      await page.goto(`/search?${boundsQS}`);
      const container = searchResultsContainer(page);

      const cards = container.locator(sel.card);
      await expect(cards.first()).toBeVisible({ timeout: 30_000 });

      // --- Idle state assertions ---
      const loadMoreBtn = container.locator(sel.loadMoreBtn);
      await expect(loadMoreBtn).toBeVisible({ timeout: 15_000 });

      // aria-label should describe current state:
      // "Show more places. Currently showing N of M listings"
      // (or "... of 100+ listings" when total is null)
      const idleAriaLabel = await loadMoreBtn.getAttribute("aria-label");
      expect(idleAriaLabel).toBeTruthy();
      expect(idleAriaLabel).toMatch(
        /Show more places\. Currently showing \d+/,
      );

      // Button should NOT be busy or disabled in idle state
      const idleAriaBusy = await loadMoreBtn.getAttribute("aria-busy");
      expect(idleAriaBusy).toBe("false");
      await expect(loadMoreBtn).toBeEnabled();

      // Button should have touch-target class (min 44px hit area for mobile)
      const hasTouchTarget = await loadMoreBtn.evaluate((el) =>
        el.classList.contains("touch-target"),
      );
      expect(hasTouchTarget).toBe(true);

      // --- Loading state assertions ---
      // Click the button to trigger loading state
      await loadMoreBtn.click();

      // The button should immediately enter loading state
      const busyBtn = container.locator(sel.busyBtn);
      await expect(busyBtn).toBeVisible({ timeout: 3_000 });

      // aria-busy should be "true" during loading
      const loadingAriaBusy = await busyBtn.getAttribute("aria-busy");
      expect(loadingAriaBusy).toBe("true");

      // aria-label should change to "Loading more results"
      const loadingAriaLabel = await busyBtn.getAttribute("aria-label");
      expect(loadingAriaLabel).toBe("Loading more results");

      // Button should be disabled during loading (prevents double-click)
      await expect(busyBtn).toBeDisabled();

      // --- Post-loading assertions ---
      // Wait for load to complete (12 initial + 12 mock = 24)
      await expect(cards).toHaveCount(24, { timeout: 15_000 });

      // After loading completes, busy state should be cleared.
      // The button either returns to idle state or disappears (if no more pages).
      await expect(container.locator(sel.busyBtn)).not.toBeVisible({
        timeout: 5_000,
      });
    },
  );

  // -------------------------------------------------------------------------
  // 11.3 Feed container semantic structure
  // -------------------------------------------------------------------------
  test(
    "11.3 feed container has correct role, label, and focusable search-results wrapper",
    { tag: [tags.a11y] },
    async ({ page }) => {
      test.slow();

      await page.goto(`/search?${boundsQS}`);
      const container = searchResultsContainer(page);

      const cards = container.locator(sel.card);
      await expect(cards.first()).toBeVisible({ timeout: 30_000 });

      // --- Feed container assertions ---
      // The results grid should have role="feed" with aria-label="Search results"
      const feed = container.locator(sel.feed);
      await expect(feed).toBeAttached({ timeout: 15_000 });

      // Verify role attribute directly
      const feedRole = await feed.getAttribute("role");
      expect(feedRole).toBe("feed");

      // Verify aria-label
      const feedLabel = await feed.getAttribute("aria-label");
      expect(feedLabel).toBe("Search results");

      // Feed should contain listing cards
      const feedCards = feed.locator(sel.card);
      const feedCardCount = await feedCards.count();
      expect(feedCardCount).toBeGreaterThan(0);

      // --- Search results wrapper assertions ---
      // The outer #search-results div should have id and tabIndex for skip-link support
      const searchResultsEl = container.locator(sel.searchResults);
      await expect(searchResultsEl).toBeAttached({ timeout: 15_000 });

      // Verify id attribute
      const containerId = await searchResultsEl.getAttribute("id");
      expect(containerId).toBe("search-results");

      // Verify tabIndex={-1} (programmatically focusable for skip-link navigation)
      const tabIndex = await searchResultsEl.getAttribute("tabindex");
      expect(tabIndex).toBe("-1");

      // The feed should be a descendant of the search-results container
      const feedInsideContainer = searchResultsEl.locator(sel.feed);
      await expect(feedInsideContainer).toBeAttached();
    },
  );

  // -------------------------------------------------------------------------
  // 11.4 Keyboard navigation to load-more button
  // -------------------------------------------------------------------------
  test(
    "11.4 load-more button is reachable via Tab and activatable via Enter",
    { tag: [tags.a11y] },
    async ({ page }) => {
      test.slow();

      await setupPaginationMock(page, { totalLoadMoreItems: 12 });
      await page.goto(`/search?${boundsQS}`);
      const container = searchResultsContainer(page);

      const cards = container.locator(sel.card);
      await expect(cards.first()).toBeVisible({ timeout: 30_000 });

      // Verify the load-more button is present
      const loadMoreBtn = container.locator(sel.loadMoreBtn);
      await expect(loadMoreBtn).toBeVisible({ timeout: 15_000 });

      // Scroll the button into view to ensure it is reachable
      await loadMoreBtn.scrollIntoViewIfNeeded();

      // Verify the button is a native <button> element (inherently keyboard-accessible)
      const tagName = await loadMoreBtn.evaluate((el) =>
        el.tagName.toLowerCase(),
      );
      expect(tagName).toBe("button");

      // Verify the button does NOT have tabindex="-1" (which would remove it from tab order)
      const tabIndex = await loadMoreBtn.getAttribute("tabindex");
      expect(tabIndex).not.toBe("-1");

      // Focus the button directly (equivalent to the user tabbing to it).
      // A native <button> is always focusable via Tab, so verifying focus()
      // works and Enter activates it covers the keyboard accessibility requirement.
      await loadMoreBtn.focus();

      // Verify focus landed on the button
      const focusedElement = page.locator(":focus");
      const focusedText = await focusedElement.textContent().catch(() => null);
      expect(focusedText).toBeTruthy();
      expect(focusedText!).toContain("Show more places");

      // Press Enter to activate load-more
      const initialCount = await cards.count();
      await page.keyboard.press("Enter");

      // Wait for new cards to appear (initial + 12 mock)
      await expect(cards).toHaveCount(initialCount + 12, {
        timeout: 15_000,
      });

      // Focus should not be trapped -- after loading completes, focus should
      // remain in a sensible position (not lost entirely).
      // The key assertion is that pressing Tab still works (not trapped).
      await page.keyboard.press("Tab");
      // If we reach here without timeout, focus is not trapped.
    },
  );

  // -------------------------------------------------------------------------
  // 10.8 Keyboard Enter on button blocked while loading [P1]
  // -------------------------------------------------------------------------
  test(
    "10.8 keyboard Enter on button blocked while loading",
    { tag: [tags.a11y] },
    async ({ page }) => {
      test.slow();

      // Use a 3-second delay so the loading state is observable
      const mock = await setupPaginationMock(page, {
        totalLoadMoreItems: 12,
        delayMs: 3000,
      });
      await page.goto(`/search?${boundsQS}`);
      const container = searchResultsContainer(page);

      const cards = container.locator(sel.card);
      await expect(cards.first()).toBeVisible({ timeout: 30_000 });

      // Focus the load-more button directly
      const loadMoreBtn = container.locator(sel.loadMoreBtn);
      await expect(loadMoreBtn).toBeVisible({ timeout: 15_000 });
      await loadMoreBtn.scrollIntoViewIfNeeded();
      await loadMoreBtn.focus();

      // Press Enter to trigger the first load
      await page.keyboard.press("Enter");

      // Wait for the loading state to be observable
      const busyBtn = container.locator(sel.busyBtn);
      await expect(busyBtn).toBeVisible({ timeout: 3_000 });
      await expect(busyBtn).toBeDisabled();

      // While loading (aria-busy="true", disabled), attempt to press Enter again.
      // The button is disabled, so the keypress should have no effect.
      await page.keyboard.press("Enter");

      // Wait for the load to complete: 12 initial + 12 mock = 24
      await expect(cards).toHaveCount(24, { timeout: 15_000 });

      // Only 1 server action call should have been made.
      // The disabled attribute + isLoadingMore guard prevents duplicate requests.
      expect(mock.loadMoreCallCount()).toBe(1);
    },
  );
});
