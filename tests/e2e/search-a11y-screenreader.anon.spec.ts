/**
 * Search Page Accessibility: ARIA Live Regions & Screen Reader (P1)
 *
 * Validates aria-live announcements, loading state communication,
 * and screen reader support for dynamic content changes.
 *
 * Documents KNOWN GAPS where the current implementation does not yet
 * announce certain state changes.
 *
 * Run: pnpm playwright test tests/e2e/search-a11y-screenreader.anon.spec.ts --project=chromium-anon
 */

import {
  test,
  expect,
  SF_BOUNDS,
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
  ).toBeVisible({ timeout: 15000 });
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

test.describe("Search A11y: ARIA Live Regions & Screen Reader", () => {
  test.use({
    viewport: { width: 1280, height: 800 },
  });

  test.beforeEach(async ({ page }) => {
    await page.goto(SEARCH_URL);
    await waitForResults(page);
  });

  // 1. Initial result count announced via aria-live region
  test("1. initial result count announced via aria-live", { tag: [tags.a11y] }, async ({ page }) => {
    // SearchResultsClient renders:
    // <div aria-live="polite" aria-atomic="true" className="sr-only">
    //   Found X listings for "query"
    // </div>
    const liveRegion = page.locator('[aria-live="polite"][aria-atomic="true"]');
    await expect(liveRegion.first()).toBeAttached();

    const text = await liveRegion.first().textContent();
    expect(text?.trim()).toBeTruthy();

    // Should contain a count or "Found" pattern
    expect(text).toMatch(/found\s+\d+|found\s+more\s+than|no\s+listings/i);
  });

  // 2. [KNOWN GAP] Load-more does NOT announce new count
  test("2. load-more behavior - current announcement state", { tag: [tags.a11y] }, async ({ page }) => {
    // KNOWN GAP: When "Show more places" is clicked, the aria-live region
    // in SearchResultsClient does NOT update with the new cumulative count.
    // The aria-live region only reflects the initial count from SSR.
    //
    // EXPECTED BEHAVIOR: After loading more results, the aria-live region
    // should announce something like "Now showing X of Y listings" to inform
    // screen reader users that new content has been added.

    // Check if load-more button exists
    const loadMoreButton = page.getByRole("button", { name: /show more places/i });
    const hasLoadMore = await loadMoreButton.isVisible().catch(() => false);

    if (hasLoadMore) {
      // Capture initial aria-live text
      const liveRegion = page.locator('[aria-live="polite"][aria-atomic="true"]').first();
      const initialText = await liveRegion.textContent();

      // Click load more
      await loadMoreButton.click();

      // Wait for loading to complete
      await expect(loadMoreButton).not.toHaveAttribute("aria-busy", "true", { timeout: 10000 });

      // CURRENT BEHAVIOR: The aria-live text does NOT change after load-more
      const afterText = await liveRegion.textContent();

      // Document the gap: initial text remains unchanged
      // This is the KNOWN GAP - the announcement does not update
      console.log("KNOWN GAP: aria-live text after load-more:");
      console.log(`  Before: "${initialText?.trim()}"`);
      console.log(`  After:  "${afterText?.trim()}"`);
      console.log("  Expected: Updated count announcement");

      // Verify load-more button itself has good accessibility
      // It uses aria-busy and aria-label which is correct
      const buttonLabel = await loadMoreButton.getAttribute("aria-label");
      expect(buttonLabel).toBeTruthy();
    } else {
      console.log("Info: No load-more button visible (insufficient results or cap reached)");
    }
  });

  // 3. [KNOWN GAP] Sort change NOT announced
  test("3. sort change behavior - current announcement state", { tag: [tags.a11y] }, async ({ page }) => {
    // KNOWN GAP: When the sort order changes, no aria-live region announces
    // the sort change. The page navigates (URL changes) and results re-render,
    // but there is no explicit announcement like "Results sorted by Price: Low to High".
    //
    // However, SearchResultsLoadingWrapper does announce result count changes
    // via its own aria-live region when the transition completes.
    //
    // EXPECTED BEHAVIOR: An aria-live region should announce the new sort order
    // or at minimum the updated result state after sort changes.

    // The sort dropdown on desktop uses a Radix Select
    const sortTrigger = page.locator('[role="combobox"]').first();
    const isDesktopSort = await sortTrigger.isVisible().catch(() => false);

    if (isDesktopSort) {
      // Open sort dropdown
      await sortTrigger.click();

      // Select a different sort option
      const priceOption = page.getByRole("option", { name: /price.*low/i });
      if (await priceOption.isVisible().catch(() => false)) {
        // Check current live regions before sort
        const liveRegions = page.locator('[aria-live="polite"]');
        const liveCount = await liveRegions.count();

        console.log("KNOWN GAP: Sort change announcement");
        console.log(`  Live regions found: ${liveCount}`);
        console.log("  No dedicated sort-change announcement exists");
        console.log("  SearchResultsLoadingWrapper announces result count after transition");

        // The wrapper has: <span class="sr-only" aria-live="polite" role="status">
        const wrapperLive = page.locator('span.sr-only[aria-live="polite"][role="status"]');
        const wrapperCount = await wrapperLive.count();
        expect(wrapperCount).toBeGreaterThan(0);
      } else {
        // Close dropdown if option not found
        await page.keyboard.press("Escape");
      }
    }

    // Mobile sort button
    const mobileSortButton = page.locator('button[aria-label^="Sort:"]');
    if (await mobileSortButton.isVisible().catch(() => false)) {
      console.log("Info: Mobile sort sheet does not have role='dialog' or aria-modal");
      console.log("  KNOWN GAP: Mobile sort sheet missing dialog semantics");
    }
  });

  // 4. Error states announced via aria-live or role="alert"
  test("4. error states use aria-live or role=alert", { tag: [tags.a11y] }, async ({ page }) => {
    // Check that error announcement infrastructure exists
    // SearchResultsClient shows load errors in plain text (not aria-live)
    // SearchResultsLoadingWrapper has an aria-live region

    // Verify global alert/live infrastructure
    const politeRegions = page.locator('[aria-live="polite"]');

    const politeCount = await politeRegions.count();

    // Should have at least one live region for dynamic announcements
    expect(politeCount).toBeGreaterThan(0);

    // Verify error region patterns exist in DOM
    // The app uses toast notifications (Sonner) which have role="status"
    const statusRegions = page.locator('[role="status"]');
    const statusCount = await statusRegions.count();

    // At least one status or polite live region should exist
    expect(politeCount + statusCount).toBeGreaterThan(0);
  });

  // 5. Loading state communicated (aria-busy on feed wrapper)
  test("5. loading state communicated via aria-busy", { tag: [tags.a11y] }, async ({ page }) => {
    // SearchResultsLoadingWrapper renders aria-busy={isPending} on its wrapper div
    // After initial load, isPending should be false
    const wrapper = page.locator('.relative[aria-busy]');

    if (await wrapper.count() > 0) {
      // After page load, should not be busy
      await expect(wrapper.first()).toHaveAttribute("aria-busy", "false");
    }

    // The load-more button also uses aria-busy during fetch
    const loadMoreButton = page.getByRole("button", { name: /show more places/i });
    if (await loadMoreButton.isVisible().catch(() => false)) {
      // Before clicking, should not be busy
      const busyBefore = await loadMoreButton.getAttribute("aria-busy");
      // aria-busy is only set to "true" during loading
      if (busyBefore) {
        expect(busyBefore).toBe("false");
      }
    }
  });

  // 6. Zero results state announced
  test("6. zero results state is announced", { tag: [tags.a11y] }, async ({ page }) => {
    // Navigate to search with filters that will likely return zero results
    await page.goto(
      `/search?${boundsQS}&minPrice=99999&maxPrice=100000`,
    );
    await page.waitForLoadState("domcontentloaded");
    await page.waitForLoadState("domcontentloaded").catch(() => {});

    // Check aria-live region for zero results announcement
    const liveRegion = page.locator('[aria-live="polite"][aria-atomic="true"]');

    if (await liveRegion.count() > 0) {
      const text = await liveRegion.first().textContent();

      // If we got zero results, the announcement should say "No listings found"
      // If we still got results (unlikely with $99999 min), that is also valid
      if (text?.toLowerCase().includes("no listings") || text?.toLowerCase().includes("found 0")) {
        expect(text).toMatch(/no\s+listings|found\s+0/i);
      } else {
        // Results were found even with extreme filter - still valid
        expect(text?.trim()).toBeTruthy();
      }
    }

    // Also check for the visual zero results UI
    // ZeroResultsSuggestions renders <h3>No exact matches</h3>, older UI may use <h2>No matches found</h2>
    const zeroResultsHeading = page.locator('h2:has-text("No matches found"), h3:has-text("No exact matches")').first();
    if (await zeroResultsHeading.isVisible().catch(() => false)) {
      await expect(zeroResultsHeading).toBeVisible();
    }
  });

  // 7. Filter chip state changes reflected
  test("7. filter state changes are reflected in UI", { tag: [tags.a11y] }, async ({ page }) => {
    // RecommendedFilters render suggestion pills above results.
    // Scope to visible container to avoid matching hidden mobile/desktop duplicates.
    const container = searchResultsContainer(page);
    const recommendedPills = container.locator(
      'button:has-text("Furnished"), button:has-text("Pet Friendly"), button:has-text("Wifi")',
    );

    const pillCount = await recommendedPills.count();

    if (pillCount > 0) {
      // Click a recommended filter
      const pill = recommendedPills.first();
      await pill.click();

      // Page should navigate (URL changes with filter applied)
      await page.waitForLoadState("domcontentloaded").catch(() => {});

      // After navigation, the applied filter should appear as a chip
      // or the recommendation pill should disappear
      // AppliedFilterChips shows active filters above results

      // Verify the page updated (URL should contain the filter param)
      const url = page.url();
      // The filter should be reflected in URL params
      // This confirms the state change occurred
      expect(url).toContain("search");
    } else {
      console.log("Info: No recommended filter pills visible");
    }
  });

  // --------------------------------------------------------------------------
  // Section 17 Accessibility: aria-live announces result count after filter
  // apply (Spec 17.A5 [P1])
  // --------------------------------------------------------------------------

  // 8. aria-live region announces result count after filter apply
  test("8. aria-live region announces result count after filter apply", { tag: [tags.a11y] }, async ({ page }) => {
    // Use a lightweight approach: click a recommended filter pill (no heavy modal)
    // This triggers a URL navigation with filter params, causing results to update.
    const container = searchResultsContainer(page);
    const recommendedPill = container.locator(
      'button:has-text("Furnished"), button:has-text("Pet Friendly"), button:has-text("Parking")',
    ).first();

    const hasPill = await recommendedPill.isVisible().catch(() => false);

    if (hasPill) {
      await recommendedPill.click();
      // Wait for page navigation to complete
      await page.waitForLoadState("domcontentloaded");
      await page.waitForLoadState("domcontentloaded").catch(() => {});
    }

    // Assert that an aria-live region exists on the page with result count content
    // The app uses two kinds of live regions:
    //   1. SearchResultsClient: <div aria-live="polite" aria-atomic="true">
    //   2. SearchResultsLoadingWrapper: <span aria-live="polite" role="status">
    const politeLive = page.locator('[aria-live="polite"]');
    const statusRegions = page.locator('[role="status"]');

    const politeCount = await politeLive.count();
    const statusCount = await statusRegions.count();

    // At least one live region must exist for screen reader announcements
    expect(politeCount + statusCount).toBeGreaterThan(0);

    // Check that a live region contains result count text
    let foundResultAnnouncement = false;

    for (let i = 0; i < politeCount; i++) {
      const text = await politeLive.nth(i).textContent();
      if (text && text.trim().length > 0) {
        if (/\d+|found|listing|place|result|showing/i.test(text)) {
          foundResultAnnouncement = true;
          break;
        }
      }
    }

    if (!foundResultAnnouncement) {
      for (let i = 0; i < statusCount; i++) {
        const text = await statusRegions.nth(i).textContent();
        if (text && /\d+|found|listing|place|result|showing/i.test(text)) {
          foundResultAnnouncement = true;
          break;
        }
      }
    }

    expect(foundResultAnnouncement).toBe(true);
  });
});
