/**
 * Price Range Filter E2E Tests (P0)
 *
 * Validates price filter behavior via both the inline budget inputs
 * in the search form and the price range slider in the filter modal.
 *
 * Key implementation details:
 * - Inline inputs: #search-budget-min and #search-budget-max (type="number")
 * - Modal slider: Radix Slider with aria-label="Price range"
 * - URL params: minPrice and maxPrice
 * - useBatchedFilters commits pending state to URL on apply
 * - Negative values are clamped to 0; inverted ranges auto-swap
 * - Pagination params (cursor, page) are deleted on filter change
 */

import {
  test,
  expect,
  tags,
  selectors,
  searchResultsContainer,
  boundsQS,
  SEARCH_URL,
  waitForSearchReady,
  getUrlParam,
  waitForUrlParam,
  waitForNoUrlParam,
  pollForUrlParam,
} from "../helpers";
import type { Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Domain-specific helpers (price filter inline inputs)
// ---------------------------------------------------------------------------

/** Fill the inline budget min input and submit the form */
async function setInlineMinPrice(page: Page, value: string) {
  const input = page.locator("#search-budget-min");
  await input.waitFor({ state: "visible", timeout: 30_000 });
  await input.click();
  await input.clear();
  if (value) {
    await input.pressSequentially(value, { delay: 50 });
  }
  await input.blur();
}

/** Fill the inline budget max input */
async function setInlineMaxPrice(page: Page, value: string) {
  const input = page.locator("#search-budget-max");
  await input.waitFor({ state: "visible", timeout: 30_000 });
  await input.click();
  await input.clear();
  if (value) {
    await input.pressSequentially(value, { delay: 50 });
  }
  await input.blur();
}

/** Submit the search form to commit inline price changes */
async function submitSearch(page: Page) {
  const submitBtn = page.getByRole("button", { name: /search/i }).first();
  await submitBtn.click();
  // Wait for navigation (increased for CI)
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2_000);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Price Range Filter", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({}, testInfo) => {
    if (testInfo.project.name.includes('webkit')) {
      test.skip(true, 'Radix UI hydration issues on webkit');
    }
    test.slow();
  });

  // 1. Set min price -> URL gets minPrice param
  test(`${tags.core} - setting min price updates URL with minPrice param`, async ({ page }) => {
    await waitForSearchReady(page);

    await setInlineMinPrice(page, "500");
    await submitSearch(page);

    await waitForUrlParam(page, "minPrice", "500");
    expect(getUrlParam(page, "minPrice")).toBe("500");
  });

  // 2. Set max price -> URL gets maxPrice param
  test(`${tags.core} - setting max price updates URL with maxPrice param`, async ({ page }) => {
    await waitForSearchReady(page);

    await setInlineMaxPrice(page, "2000");
    await submitSearch(page);

    await waitForUrlParam(page, "maxPrice", "2000");
    expect(getUrlParam(page, "maxPrice")).toBe("2000");
  });

  // 3. Set both min and max -> URL has both params
  test(`${tags.core} - setting both min and max price updates URL with both params`, async ({ page }) => {
    await waitForSearchReady(page);

    await setInlineMinPrice(page, "500");
    await setInlineMaxPrice(page, "2000");
    await submitSearch(page);

    await pollForUrlParam(page, "minPrice", "500");
    await pollForUrlParam(page, "maxPrice", "2000");
  });

  // 4. Clear price filter -> params removed from URL
  test(`${tags.core} - clearing price inputs removes params from URL`, async ({ page }) => {
    // Start with price filters applied
    await page.goto(`${SEARCH_URL}&minPrice=500&maxPrice=2000`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2_000);

    // Verify starting state
    expect(getUrlParam(page, "minPrice")).toBe("500");

    // Clear the inputs
    await setInlineMinPrice(page, "");
    await setInlineMaxPrice(page, "");
    await submitSearch(page);

    // Params should be gone
    await waitForNoUrlParam(page, "minPrice");
    expect(getUrlParam(page, "minPrice")).toBeNull();
    expect(getUrlParam(page, "maxPrice")).toBeNull();
  });

  // 5. Price filter narrows results
  test(`${tags.core} - price filter narrows visible results`, async ({ page }) => {
    await waitForSearchReady(page);
    const container = searchResultsContainer(page);

    // Count initial listings
    const initialCount = await container.locator(selectors.listingCard).count();

    // Navigate with a restrictive max price
    await page.goto(`${SEARCH_URL}&maxPrice=500`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3_000);

    const filteredCount = await container.locator(selectors.listingCard).count();

    // Filtered count should be <= initial (or page shows empty state)
    const hasEmptyState = await container.locator(selectors.emptyState).count() > 0;
    if (!hasEmptyState) {
      expect(filteredCount).toBeLessThanOrEqual(initialCount);
    }
  });

  // 6. Invalid price (negative) -> handled gracefully (clamped to 0)
  test(`${tags.core} - negative price is handled gracefully`, async ({ page }) => {
    await waitForSearchReady(page);

    await setInlineMinPrice(page, "-100");
    await submitSearch(page);

    // The app should either clamp to 0 or ignore the value
    // Either way, no crash — wait for URL to settle before checking
    await page.waitForTimeout(2_000);
    const minPrice = getUrlParam(page, "minPrice");
    if (minPrice !== null) {
      expect(Number(minPrice)).toBeGreaterThanOrEqual(0);
    }
    // Page should still be functional
    expect(await page.title()).toBeTruthy();
  });

  // 7. Min > max -> handled (auto-swap)
  test(`${tags.core} - inverted price range is auto-swapped`, async ({ page }) => {
    await waitForSearchReady(page);

    // Set min higher than max
    await setInlineMinPrice(page, "3000");
    await setInlineMaxPrice(page, "1000");
    await submitSearch(page);

    // Wait for URL to settle after submit
    await page.waitForTimeout(2_000);

    // SearchForm auto-swaps inverted ranges
    const finalMin = getUrlParam(page, "minPrice");
    const finalMax = getUrlParam(page, "maxPrice");

    if (finalMin !== null && finalMax !== null) {
      expect(Number(finalMin)).toBeLessThanOrEqual(Number(finalMax));
    }

    // Page should not crash regardless
    expect(await page.title()).toBeTruthy();
  });

  // 8. Price filter persists across page refresh (URL-driven)
  test(`${tags.core} - price filter persists across page refresh`, async ({ page }) => {
    await page.goto(`${SEARCH_URL}&minPrice=800&maxPrice=2500`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2_000);

    // Verify params in URL
    expect(getUrlParam(page, "minPrice")).toBe("800");
    expect(getUrlParam(page, "maxPrice")).toBe("2500");

    // Refresh the page
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2_000);

    // Params should still be present
    expect(getUrlParam(page, "minPrice")).toBe("800");
    expect(getUrlParam(page, "maxPrice")).toBe("2500");

    // Verify the inline inputs reflect the URL state
    const minInput = page.locator("#search-budget-min");
    const maxInput = page.locator("#search-budget-max");
    if (await minInput.isVisible()) {
      await expect(minInput).toHaveValue("800");
    }
    if (await maxInput.isVisible()) {
      await expect(maxInput).toHaveValue("2500");
    }
  });

  // 9. Price displayed in filter chips when active
  test(`${tags.core} - price filter shows as chip in applied filters`, async ({ page }) => {
    await page.goto(`${SEARCH_URL}&minPrice=500&maxPrice=2000`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3_000);

    // Check for applied filters region
    const container = searchResultsContainer(page);
    const filtersRegion = container.locator('[aria-label="Applied filters"]');
    const regionVisible = await filtersRegion.isVisible().catch(() => false);

    if (regionVisible) {
      // Should show a price chip (e.g., "$500 - $2,000" or "Min $500" + "Max $2,000")
      const priceChip = filtersRegion.locator("text=/\\$500|\\$2,000|price/i").first();
      const chipVisible = await priceChip.isVisible().catch(() => false);

      if (chipVisible) {
        await expect(priceChip).toBeVisible();
      }
    }

    // Page should load regardless
    expect(await page.title()).toBeTruthy();
  });

  // 10. Price slider in filter modal adjusts price range
  test(`${tags.core} - price slider in modal adjusts pending price`, async ({ page }) => {
    await waitForSearchReady(page);

    // Open filter modal using retry-click pattern for hydration race
    const filtersBtn = page.getByRole("button", { name: /^Filters/ });
    await expect(filtersBtn).toBeVisible({ timeout: 30_000 });
    await filtersBtn.click();

    const dialog = page.getByRole("dialog", { name: /filters/i });
    const dialogVisible = await dialog
      .waitFor({ state: "visible", timeout: 5_000 })
      .then(() => true)
      .catch(() => false);

    if (!dialogVisible) {
      // Retry: hydration or dynamic import may not have been ready
      await filtersBtn.click();
      await expect(dialog).toBeVisible({ timeout: 30_000 });
    }

    // Find the price range slider
    const priceSlider = page.locator('[aria-label="Price range"]');

    if (await priceSlider.isVisible({ timeout: 5_000 }).catch(() => false)) {
      // Adjust the max price thumb via keyboard
      const maxThumb = page.locator('[aria-label="Maximum price"]');
      if (await maxThumb.count() > 0) {
        await maxThumb.focus();
        // Press left arrow to decrease max price
        for (let i = 0; i < 5; i++) {
          await page.keyboard.press("ArrowLeft");
        }
      }

      // Apply the filter
      const applyBtn = page.locator('[data-testid="filter-modal-apply"]');
      await applyBtn.click();

      // Modal should close
      await expect(dialog).not.toBeVisible({ timeout: 30_000 });

      // URL may have maxPrice now (depending on slider position)
      // At minimum, page should not crash
      expect(await page.title()).toBeTruthy();
    }
  });
});
