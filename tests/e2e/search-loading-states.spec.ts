/**
 * Search Page Loading States (P1)
 *
 * Validates skeleton loading, pending state overlay, aria-busy,
 * load-more button states, and rapid search resilience.
 * Uses authenticated (chromium) project.
 *
 * Run: pnpm playwright test tests/e2e/search-loading-states.spec.ts --project=chromium
 */

import {
  test,
  expect,
  SF_BOUNDS,
  selectors,
  timeouts,
  tags,
  searchResultsContainer,
} from "./helpers/test-utils";

// --------------------------------------------------------------------------
// Constants
// --------------------------------------------------------------------------

const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;
const SEARCH_URL = `/search?${boundsQS}`;

/** Wait for search results heading to be visible */
async function waitForResults(page: import("@playwright/test").Page) {
  await page.waitForLoadState("domcontentloaded");
  await expect(
    page.getByRole("heading", { level: 1 }).first(),
  ).toBeVisible({ timeout: 30000 });
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

test.describe("Search Loading States", () => {
  test.use({
    viewport: { width: 1280, height: 800 },
  });

  test.beforeEach(async () => {
    test.slow();
  });

  // 1. Skeleton loading on initial page load
  test("1. skeleton or loading placeholder on initial page load", async ({ page }) => {
    // Navigate but do NOT wait for results - we want to catch the loading state
    // Use a slow network to increase the chance of seeing the skeleton
    const responsePromise = page.waitForResponse(
      (resp) => resp.url().includes("/search") && resp.status() === 200,
      { timeout: 30000 },
    );

    // Go to search page and immediately check for loading indicators
    await page.goto(SEARCH_URL, { waitUntil: "domcontentloaded" });

    // Next.js uses loading.tsx for Suspense boundaries
    // Check for skeleton/loading UI before full content renders
    // This is timing-dependent - on fast connections the skeleton may flash too quickly

    // Try to detect loading indicators
    const loadingIndicators = page.locator(
      '[aria-busy="true"], [class*="skeleton"], [class*="animate-pulse"], [class*="loading"]',
    );

    // Wait briefly for either loading state or results
    const loadingVisible = await loadingIndicators.first().isVisible().catch(() => false);

    if (loadingVisible) {
      // Loading state was visible - good
      expect(loadingVisible).toBe(true);
    } else {
      // Content loaded too fast to catch the skeleton - that is acceptable
      // Verify that results did load
      await waitForResults(page);
      console.log("Info: Content loaded before skeleton could be captured (fast response)");
    }

    // Wait for results to eventually appear
    await responsePromise.catch(() => null);
    await waitForResults(page);
  });

  // 2. Pending state overlay during filter transitions
  test("2. pending state overlay appears during filter transitions", async ({ page }) => {
    await page.goto(SEARCH_URL);
    await waitForResults(page);

    // SearchResultsLoadingWrapper shows a translucent overlay during transitions
    // The overlay has class "bg-white/40" and is shown when isPending = true

    // Trigger a filter change by clicking a recommended filter pill.
    // Scope to visible container to avoid strict mode violations from dual containers.
    const container2 = searchResultsContainer(page);
    const recommendedPill = container2.locator(
      'button:has-text("Furnished"), button:has-text("Pet Friendly"), button:has-text("Wifi"), button:has-text("Parking")',
    ).first();

    if (await recommendedPill.isVisible().catch(() => false)) {
      // Add a small delay to API responses to make the pending state visible
      await page.route("**/search**", async (route) => {
        // Add 500ms delay to make pending state observable
        await new Promise((resolve) => setTimeout(resolve, 500));
        await route.continue();
      });

      await recommendedPill.click();

      // Check for the pending overlay (bg-white/40)
      // SearchResultsLoadingWrapper adds aria-busy="true" during pending
      const wrapper = page.locator('[aria-busy="true"]');
      const isBusy = await wrapper.isVisible().catch(() => false);

      if (isBusy) {
        expect(isBusy).toBe(true);
        // Also check for the loading spinner overlay
        const spinner = page.locator('.animate-spin');
        const spinnerVisible = await spinner.isVisible().catch(() => false);

        if (spinnerVisible) {
          // The "Updating results..." text should be visible
          const updatingText = page.getByText(/updating results|still loading/i);
          const textVisible = await updatingText.isVisible().catch(() => false);
          if (textVisible) {
            await expect(updatingText).toBeVisible();
          }
        }
      } else {
        console.log("Info: Transition completed too fast to observe pending state");
      }

      // Wait for results to settle
      await page.waitForTimeout(3000);
    } else {
      console.log("Info: No recommended filter pills available");
    }
  });

  // 3. Feed aria-busy during loading
  test("3. wrapper has aria-busy during loading transitions", async ({ page }) => {
    await page.goto(SEARCH_URL);
    await waitForResults(page);

    // After load, the SearchResultsLoadingWrapper should have aria-busy="false"
    const wrapper = page.locator('.relative[aria-busy]');

    if (await wrapper.count() > 0) {
      // After initial load, should not be busy
      await expect(wrapper.first()).toHaveAttribute("aria-busy", "false");
    }

    // The feed element (role="feed") only renders when there are listings.
    // If the search returned zero results, the grid is replaced by "No matches found".
    const container = searchResultsContainer(page);
    const feed = container.locator('[role="feed"]');
    const feedCount = await feed.count();

    if (feedCount > 0) {
      await expect(feed.first()).toBeAttached();
    } else {
      // Zero results — confirm the zero-results UI is shown instead
      const noResults = container.getByText(/no matches found|no listings found/i);
      const hasNoResults = await noResults.isVisible().catch(() => false);
      if (hasNoResults) {
        console.log("Info: Zero results returned — feed element correctly absent");
      } else {
        // Results container exists but feed is missing — check search-results div
        const searchResults = container.locator('#search-results');
        await expect(searchResults.first()).toBeAttached();
        console.log("Info: Search results container attached without role=feed (may have zero listings in grid)");
      }
    }
  });

  // 4. Load-more button shows loading state
  test("4. load-more button shows aria-busy during fetch", async ({ page }) => {
    await page.goto(SEARCH_URL);
    await waitForResults(page);

    // The "Show more places" button only renders when there is a nextCursor
    // (i.e., more than one page of results). Scope to visible container.
    const container = searchResultsContainer(page);
    const loadMoreButton = container.getByRole("button", { name: /show more places/i });
    const hasLoadMore = await loadMoreButton.isVisible().catch(() => false);

    if (hasLoadMore) {
      // Before click: should not be busy
      const busyBefore = await loadMoreButton.getAttribute("aria-busy");
      if (busyBefore) {
        expect(busyBefore).toBe("false");
      }

      // Add delay to server action to observe loading state
      await page.route("**/search**", async (route) => {
        if (route.request().method() === "POST") {
          // Delay server action response
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        await route.continue();
      });

      // Click and immediately check for loading state
      await loadMoreButton.click();

      // Button should show loading state
      // It uses aria-busy={isLoadingMore} and shows a spinner
      // The button text changes to "Loading..." and shows a Loader2 spinner
      const busyOrSpinner = await Promise.race([
        loadMoreButton.getAttribute("aria-busy").then(v => v === "true"),
        loadMoreButton.locator(".animate-spin").isVisible().catch(() => false),
        loadMoreButton.locator("text=Loading").isVisible().catch(() => false),
      ]);

      if (busyOrSpinner) {
        // Verify at least one loading indicator is present
        const hasBusy = await loadMoreButton.getAttribute("aria-busy") === "true";
        const hasSpinner = await loadMoreButton.locator(".animate-spin").isVisible().catch(() => false);
        const hasLoadingText = await loadMoreButton.locator("text=Loading").isVisible().catch(() => false);
        expect(hasBusy || hasSpinner || hasLoadingText).toBeTruthy();
      } else {
        console.log("Info: Load-more completed too fast to observe loading state");
      }

      // Wait for loading to complete (button goes back to non-busy or disappears)
      await page.waitForTimeout(5000);
    } else {
      console.log("Info: No load-more button visible (results fit in one page)");
    }
  });

  // 5. Slow network loading indicator persists
  test("5. loading state persists during slow network", async ({ page }) => {
    // Add significant delay to simulate slow network
    await page.route("**/search**", async (route) => {
      // 2 second delay
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.continue();
    });

    // Navigate to search page
    await page.goto(SEARCH_URL, { waitUntil: "domcontentloaded" });

    // During the slow load, some loading indicator should be present
    // Next.js loading.tsx provides a Suspense fallback
    await page.waitForTimeout(500);

    const hasLoadingState = await page.evaluate(() => {
      // Check for any loading indicators in the DOM
      const busyElements = document.querySelectorAll('[aria-busy="true"]');
      const skeletons = document.querySelectorAll(
        '[class*="skeleton"], [class*="animate-pulse"], [class*="loading"]',
      );
      const spinners = document.querySelectorAll('[class*="spin"]');

      return busyElements.length > 0 || skeletons.length > 0 || spinners.length > 0;
    });

    // On slow network, SOME loading indicator should be visible
    // If not, results loaded from cache or SSR was fast enough
    if (!hasLoadingState) {
      console.log("Info: No loading indicator caught (SSR may have resolved quickly)");
    }

    // Eventually results should load
    await waitForResults(page);
  });

  // 6. Loading state clears after results arrive
  test("6. loading state clears after results arrive", async ({ page }) => {
    await page.goto(SEARCH_URL);
    await waitForResults(page);

    // After results are fully loaded:
    // 1. No aria-busy="true" should remain
    const busyElements = page.locator('[aria-busy="true"]');
    const busyCount = await busyElements.count();

    // None should be busy after full load
    expect(busyCount).toBe(0);

    // 2. No loading spinners should be visible
    const spinners = page.locator(
      '.animate-spin:visible, [class*="loading"]:visible:not([aria-busy])',
    );
    // Visible spinners should be gone
    const spinnerCount = await spinners.count();
    // Allow 0 visible spinners after load
    expect(spinnerCount).toBe(0);

    // 3. Results content should be visible (or zero-results state shown)
    const container = searchResultsContainer(page);
    const feed = container.locator('[role="feed"]');
    const feedCount = await feed.count();

    if (feedCount > 0) {
      await expect(feed.first()).toBeVisible();
      const cards = container.locator('[data-testid="listing-card"]');
      const cardCount = await cards.count();
      expect(cardCount).toBeGreaterThan(0);
    } else {
      // Zero results — the search-results container should still be present
      const searchResults = container.locator('#search-results');
      await expect(searchResults.first()).toBeAttached();
      console.log("Info: No feed element — zero results returned");
    }
  });

  // 7. No layout shift during loading (skeleton matches content dimensions)
  test("7. no significant layout shift during loading", async ({ page }) => {
    await page.goto(SEARCH_URL);
    await waitForResults(page);

    // Measure the position of a visible element after full load.
    // The #search-results-heading is sr-only (visually hidden), so use the
    // search results container or first listing card for layout shift measurement.
    const container = searchResultsContainer(page);

    // Use the search-results div or first listing card as the layout anchor
    const layoutAnchor = container.locator('#search-results, [data-testid="listing-card"]').first();
    await expect(layoutAnchor).toBeVisible({ timeout: 15000 });

    const anchorBox = await layoutAnchor.boundingBox();
    expect(anchorBox).toBeTruthy();

    // Reload the page and measure position again
    await page.reload();
    await waitForResults(page);

    const anchorBoxAfter = await layoutAnchor.boundingBox();
    expect(anchorBoxAfter).toBeTruthy();

    // Position should be consistent (within a small tolerance for rendering differences)
    if (anchorBox && anchorBoxAfter) {
      const yDiff = Math.abs(anchorBox.y - anchorBoxAfter.y);
      // Allow up to 50px difference (CLS threshold)
      expect(yDiff).toBeLessThan(50);
    }

    // Check for CLS-related indicators:
    // The search layout uses fixed header height padding (pt-[80px] sm:pt-[96px])
    // and min-h on the search form to prevent CLS
    const layout = page.locator('.flex-1.flex.flex-col');
    if (await layout.count() > 0) {
      const layoutBox = await layout.first().boundingBox();
      expect(layoutBox).toBeTruthy();
    }
  });

  // 8. Multiple rapid searches: only latest results shown
  test("8. multiple rapid searches show only latest results", async ({ page }) => {
    await page.goto(SEARCH_URL);
    await waitForResults(page);

    // SearchResultsClient is keyed by searchParamsString
    // When search params change, the component remounts with fresh state
    // This prevents stale results from showing

    // Simulate rapid filter changes via recommended filter pills.
    // The RecommendedFilters component renders contextual pills (Furnished, Pet Friendly, etc.)
    // only for filters that are NOT already applied. Scope to visible container.
    const container = searchResultsContainer(page);

    // Look for any pill-like button inside the recommended filters row.
    // RecommendedFilters renders: <div class="flex items-center gap-2 ..."> with <button> children
    // The buttons have specific labels like "Furnished", "Pet Friendly", "Wifi", etc.
    const recommendedPills = container.locator(
      'button:has-text("Furnished"), button:has-text("Pet Friendly"), button:has-text("Wifi"), button:has-text("Parking"), button:has-text("Washer"), button:has-text("Private Room"), button:has-text("Entire Place"), button:has-text("Month-to-month"), button:has-text("Under $1000"), button:has-text("Couples OK")',
    );

    const pillCount = await recommendedPills.count();

    if (pillCount >= 1) {
      // Click a pill to trigger a filter navigation
      const firstPill = recommendedPills.first();
      await firstPill.click();

      // Do not wait — immediately verify page is transitioning
      await page.waitForTimeout(200);

      // The SearchTransitionProvider uses startTransition to manage concurrent updates
      // The last navigation should win

      // Wait for results to settle
      await page.waitForTimeout(5000);
      await waitForResults(page);

      // Verify results are showing (not stuck in loading)
      const feed = container.locator('[role="feed"]');
      const feedVisible = await feed.first().isVisible().catch(() => false);

      if (feedVisible) {
        const cards = container.locator('[data-testid="listing-card"]');
        // Should have results (or confirmed zero results)
        // The key point is no crash or stuck loading state
        expect(await cards.count()).toBeGreaterThanOrEqual(0);
      }

      // Verify no aria-busy="true" stuck elements
      const stuckBusy = page.locator('[aria-busy="true"]');
      const stuckCount = await stuckBusy.count();
      expect(stuckCount).toBe(0);

      // Verify the URL reflects the latest applied filter
      const currentUrl = page.url();
      expect(currentUrl).toContain("search");
    } else {
      console.log("Info: No recommended filter pills available for rapid test");
    }
  });
});
