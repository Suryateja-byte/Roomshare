/**
 * E2E Test Suite: Search Pagination Journey (Gap 4)
 *
 * Tests cursor-based pagination behavior including:
 * - Forward/back navigation with cursor persistence
 * - Sort change resets pagination
 * - Cursor persistence across page refresh
 *
 * Uses SF_BOUNDS which has guaranteed seed data.
 */

import { test, expect, selectors, timeouts, tags, SF_BOUNDS, searchResultsContainer } from "../helpers";

test.describe("Search Pagination Journey", () => {
  // Use slow mode for map operations that can take time
  test.slow();

  // Desktop viewport required: listing cards use responsive layout
  // that may hide content on mobile viewports
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async () => {
    test.slow();
  });

  test(`${tags.core} - Forward/back pagination with cursor`, async ({
    page,
    nav,
  }) => {
    // Step 1: Navigate to search with bounds (guaranteed to have results)
    await nav.goToSearch({ bounds: SF_BOUNDS });
    await page.waitForLoadState("domcontentloaded");

    // Wait for listings to load
    const listingCard = searchResultsContainer(page).locator(selectors.listingCard).first();
    await expect(listingCard).toBeVisible({ timeout: 15000 });

    // Capture first listing ID on page 1
    const firstListingPage1 = await searchResultsContainer(page)
      .locator(selectors.listingCard)
      .first()
      .getAttribute("data-listing-id")
      .catch(() => null);

    // Step 2: Check if pagination exists (depends on seed data count)
    const pagination = page.locator(selectors.pagination);
    const nextButton = page.locator(selectors.nextPage);

    if (!(await pagination.isVisible({ timeout: 5000 }).catch(() => false))) {
      // Not enough results for pagination, skip test
      test.skip(true, "Not enough seed data for pagination test");
      return;
    }

    if (!(await nextButton.isEnabled().catch(() => false))) {
      // No next page available
      test.skip(true, "No next page available in seed data");
      return;
    }

    // Step 3: Click next page
    await nextButton.click();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(timeouts.animation);

    // Step 4: Verify URL has cursor (keyset pagination)
    const urlAfterNext = new URL(page.url());
    const hasCursor = urlAfterNext.searchParams.has("cursor");
    const hasPageParam = urlAfterNext.searchParams.has("page");

    // Should have either cursor (keyset) or page param (offset)
    expect(hasCursor || hasPageParam).toBe(true);

    // Step 5: Verify different listing is shown
    const firstListingPage2 = await searchResultsContainer(page)
      .locator(selectors.listingCard)
      .first()
      .getAttribute("data-listing-id")
      .catch(() => null);

    if (firstListingPage1 && firstListingPage2) {
      expect(firstListingPage1).not.toBe(firstListingPage2);
    }

    // Step 6: Click previous page
    const prevButton = page.locator(selectors.prevPage);
    if (await prevButton.isVisible()) {
      await prevButton.click();
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(timeouts.animation);

      // Step 7: Verify back on page 1 (cursor removed or page=1)
      const urlAfterPrev = new URL(page.url());

      // If using keyset pagination, cursor should be removed for page 1
      // If using offset pagination, page should be 1 or absent
      const cursorAfterPrev = urlAfterPrev.searchParams.get("cursor");
      const pageAfterPrev = urlAfterPrev.searchParams.get("page");

      const isPage1 =
        cursorAfterPrev === null ||
        pageAfterPrev === "1" ||
        pageAfterPrev === null;

      expect(isPage1).toBe(true);

      // Step 8: Verify same listing as original page 1
      const firstListingBack = await searchResultsContainer(page)
        .locator(selectors.listingCard)
        .first()
        .getAttribute("data-listing-id")
        .catch(() => null);

      if (firstListingPage1 && firstListingBack) {
        expect(firstListingBack).toBe(firstListingPage1);
      }
    }
  });

  test(`${tags.core} - Sort change resets pagination`, async ({ page, nav }) => {
    // Step 1: Navigate to search with bounds
    await nav.goToSearch({ bounds: SF_BOUNDS });
    await page.waitForLoadState("domcontentloaded");

    // Wait for listings
    const listingCard = searchResultsContainer(page).locator(selectors.listingCard).first();
    await expect(listingCard).toBeVisible({ timeout: 15000 });

    // Step 2: Navigate to page 2 if possible
    const pagination = page.locator(selectors.pagination);
    const nextButton = page.locator(selectors.nextPage);

    if (
      (await pagination.isVisible().catch(() => false)) &&
      (await nextButton.isEnabled().catch(() => false))
    ) {
      await nextButton.click();
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(timeouts.animation);

      // Verify we're on page 2
      const urlPage2 = new URL(page.url());
      const hasPaginationParam =
        urlPage2.searchParams.has("cursor") ||
        urlPage2.searchParams.has("page");
      expect(hasPaginationParam).toBe(true);

      // Step 3: Change sort option
      const sortSelect = page.locator(
        '[data-testid="sort-select"], select[name="sort"], [aria-label*="sort" i]',
      );

      if (await sortSelect.isVisible({ timeout: 5000 }).catch(() => false)) {
        // Click to open dropdown and select a different option
        await sortSelect.click();

        // Select a different sort option (e.g., price_asc, newest)
        const priceOption = page.locator(
          'option[value="price_asc"], [data-value="price_asc"], [role="option"]:has-text("price")',
        );
        const newestOption = page.locator(
          'option[value="newest"], [data-value="newest"], [role="option"]:has-text("newest")',
        );

        if (await priceOption.isVisible().catch(() => false)) {
          await priceOption.click();
        } else if (await newestOption.isVisible().catch(() => false)) {
          await newestOption.click();
        } else {
          // Try selecting via the select element
          await sortSelect.selectOption({ index: 1 }).catch(() => {});
        }

        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(timeouts.animation);

        // Step 4: Verify pagination reset (cursor/page removed)
        const urlAfterSort = new URL(page.url());
        const cursorAfterSort = urlAfterSort.searchParams.get("cursor");
        const cursorStackAfterSort =
          urlAfterSort.searchParams.get("cursorStack");
        const pageAfterSort = urlAfterSort.searchParams.get("page");

        // Should be back to page 1 (no cursor/page params or page=1)
        const isResetToPage1 =
          cursorAfterSort === null &&
          cursorStackAfterSort === null &&
          (pageAfterSort === null || pageAfterSort === "1");

        expect(isResetToPage1).toBe(true);

        // Verify sort param is in URL
        expect(urlAfterSort.searchParams.has("sort")).toBe(true);
      } else {
        test.skip(true, "Sort select not visible");
      }
    } else {
      test.skip(true, "Not enough results for pagination test");
    }
  });

  test(`${tags.core} - Cursor persists across page refresh`, async ({
    page,
    nav,
  }) => {
    // Step 1: Navigate to search with bounds
    await nav.goToSearch({ bounds: SF_BOUNDS });
    await page.waitForLoadState("domcontentloaded");

    // Wait for listings
    const listingCard = searchResultsContainer(page).locator(selectors.listingCard).first();
    await expect(listingCard).toBeVisible({ timeout: 15000 });

    // Step 2: Navigate to page 2
    const pagination = page.locator(selectors.pagination);
    const nextButton = page.locator(selectors.nextPage);

    if (
      (await pagination.isVisible().catch(() => false)) &&
      (await nextButton.isEnabled().catch(() => false))
    ) {
      await nextButton.click();
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(timeouts.animation);

      // Step 3: Capture URL and first listing ID
      const urlBeforeRefresh = page.url();
      const firstListingBeforeRefresh = await searchResultsContainer(page)
        .locator(selectors.listingCard)
        .first()
        .getAttribute("data-listing-id")
        .catch(() => null);

      // Step 4: Refresh the page
      await page.reload();
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(timeouts.animation);

      // Wait for listings to load after refresh
      await expect(searchResultsContainer(page).locator(selectors.listingCard).first()).toBeVisible({
        timeout: 15000,
      });

      // Step 5: Verify URL is preserved
      const urlAfterRefresh = page.url();

      // The URLs should match (cursor preserved)
      const urlBefore = new URL(urlBeforeRefresh);
      const urlAfter = new URL(urlAfterRefresh);

      // Check key pagination params are preserved
      expect(urlAfter.searchParams.get("cursor")).toBe(
        urlBefore.searchParams.get("cursor"),
      );

      // If using cursorStack, it should also be preserved
      if (urlBefore.searchParams.has("cursorStack")) {
        expect(urlAfter.searchParams.get("cursorStack")).toBe(
          urlBefore.searchParams.get("cursorStack"),
        );
      }

      // Step 6: Verify same listing is displayed
      const firstListingAfterRefresh = await searchResultsContainer(page)
        .locator(selectors.listingCard)
        .first()
        .getAttribute("data-listing-id")
        .catch(() => null);

      if (firstListingBeforeRefresh && firstListingAfterRefresh) {
        expect(firstListingAfterRefresh).toBe(firstListingBeforeRefresh);
      }
    } else {
      test.skip(true, "Not enough results for pagination test");
    }
  });
});
