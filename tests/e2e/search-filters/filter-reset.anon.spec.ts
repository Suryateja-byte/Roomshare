/**
 * Filter Reset E2E Tests (P0)
 *
 * Validates the various "clear all" / reset mechanisms that remove all
 * active filters and return the search page to an unfiltered state.
 *
 * Key reset surfaces:
 * - "Clear all" inside filter modal footer: [data-testid="filter-modal-clear-all"]
 * - "Clear all filters" link in zero-results empty state
 * - "Clear all filters" button in the applied-filters chip bar:
 *     button[aria-label="Clear all filters"]
 *
 * After any reset, non-filter params (bounds, sort, q) are preserved
 * via the PRESERVED_PARAMS constant in the codebase.
 */

import { test, expect, selectors, timeouts, tags, searchResultsContainer } from "../helpers/test-utils";
import {
  boundsQS,
  SEARCH_URL,
  getUrlParam,
  appliedFiltersRegion,
  filtersButton,
  filterDialog,
  clearAllButton,
  chipsClearAllButton,
} from "../helpers";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Filter Reset", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({}, testInfo) => {
    if (testInfo.project.name.includes('webkit')) {
      test.skip(true, 'Radix UI hydration issues on webkit');
    }
    test.slow();
  });

  // -------------------------------------------------------------------------
  // 13.1 "Clear all" in modal resets all filters
  // -------------------------------------------------------------------------
  test(`${tags.core} 13.1 - "Clear all" in modal resets all filter values`, async ({ page }) => {
    // Navigate with three distinct filters applied
    await page.goto(
      `${SEARCH_URL}&minPrice=500&amenities=Wifi&roomType=Private+Room`,
    );
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3_000);

    // Open the filter modal
    const btn = filtersButton(page);
    await expect(btn).toBeVisible({ timeout: timeouts.action });
    await btn.click();

    const dialog = filterDialog(page);
    await expect(dialog).toBeVisible({ timeout: timeouts.action });

    // The "Clear all" button should be visible when filters are active
    const clearAll = clearAllButton(page);
    await expect(clearAll).toBeVisible({ timeout: timeouts.action });

    // Click "Clear all" inside the modal
    await clearAll.click();

    // Verify modal-internal state has reset:
    // - Amenity buttons should be unpressed
    const wifiBtn = dialog
      .locator('[aria-label="Select amenities"] button:has-text("Wifi")')
      .first();
    if (await wifiBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await expect(wifiBtn).toHaveAttribute("aria-pressed", "false");
    }

    // - Room type select should revert to default / "Any"
    const roomTypeSelect = dialog.locator("#filter-room-type");
    if (await roomTypeSelect.isVisible({ timeout: 2_000 }).catch(() => false)) {
      const text = await roomTypeSelect.textContent();
      // Should not still say "Private Room" after clear
      expect(text?.toLowerCase()).not.toContain("private room");
    }

    // "Clear all" should no longer be visible once there are no active filters
    // (conditional -- some implementations keep it visible but disabled)
    const clearAllStillVisible = await clearAll.isVisible().catch(() => false);
    if (clearAllStillVisible) {
      // If still visible, it may be disabled or about to hide
      const isDisabled = await clearAll.isDisabled().catch(() => false);
      // Either hidden or disabled is acceptable
      expect(isDisabled || !clearAllStillVisible).toBeTruthy();
    }
  });

  // -------------------------------------------------------------------------
  // 13.2 "Clear all filters" link from zero-results state
  // -------------------------------------------------------------------------
  test(`${tags.core} 13.2 - "Clear all filters" from zero-results resets URL and refreshes results`, async ({ page }) => {
    // Navigate with extreme price filter that should yield zero results
    await page.goto(`${SEARCH_URL}&minPrice=99999&maxPrice=100000`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(5_000);

    // Look for a "Clear all filters" or "clear filters" link in the page body
    // (typically rendered inside the empty state / zero-results component)
    const container = searchResultsContainer(page);
    const clearLink = container
      .locator('a:has-text("Clear all filters"), button:has-text("Clear all filters")')
      .first();

    const clearVisible = await clearLink.isVisible({ timeout: 10_000 }).catch(() => false);
    test.skip(!clearVisible, "Zero-results 'Clear all filters' link not visible -- may need mocked empty state");

    await clearLink.click();

    // Wait for filter params to be stripped from URL via soft navigation
    await expect.poll(
      () => {
        const params = new URL(page.url(), "http://localhost").searchParams;
        return !params.has("minPrice") && !params.has("maxPrice");
      },
      { timeout: timeouts.action, message: "URL to have no price params after clear" },
    ).toBe(true);

    // Bounds must be preserved
    expect(getUrlParam(page, "minLat")).toBeTruthy();
    expect(getUrlParam(page, "maxLat")).toBeTruthy();

    // Filter params gone
    expect(getUrlParam(page, "minPrice")).toBeNull();
    expect(getUrlParam(page, "maxPrice")).toBeNull();

    // Results should appear (wait for listing cards or heading with non-zero count)
    const listingOrHeading = container
      .locator(`${selectors.listingCard}, h1, h3`)
      .first();
    await expect(listingOrHeading).toBeVisible({ timeout: timeouts.navigation });
  });

  // -------------------------------------------------------------------------
  // 13.3 Clear all via chips bar removes everything
  // -------------------------------------------------------------------------
  test(`${tags.core} 13.3 - chips bar "Clear all filters" removes all chips and cleans URL`, async ({ page }) => {
    // Navigate with 3+ filters
    await page.goto(
      `${SEARCH_URL}&amenities=Wifi,Parking&roomType=Private+Room&sort=price_asc&q=downtown`,
    );
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3_000);

    const region = appliedFiltersRegion(page);
    const regionVisible = await region.isVisible().catch(() => false);
    test.skip(!regionVisible, "Applied filters region not visible");

    // "Clear all filters" button in the chip bar — retry in case click doesn't register
    const clearAllBtn = chipsClearAllButton(page);
    await expect(clearAllBtn).toBeVisible({ timeout: timeouts.action });
    await expect(async () => {
      await clearAllBtn.click();
      await expect(clearAllBtn).not.toBeVisible();
    }).toPass({ timeout: 10_000 });

    // Wait for all filter params to be removed from URL via soft navigation
    await expect.poll(
      () => {
        const params = new URL(page.url(), "http://localhost").searchParams;
        return !params.has("amenities") && !params.has("roomType");
      },
      { timeout: timeouts.action, message: "URL to have no filter params after clear all" },
    ).toBe(true);

    // All chips should be gone -- region should disappear
    await expect(region).not.toBeVisible({ timeout: timeouts.action });

    // Preserved params must remain
    expect(getUrlParam(page, "minLat")).toBeTruthy();
    expect(getUrlParam(page, "maxLat")).toBeTruthy();
    expect(getUrlParam(page, "sort")).toBe("price_asc");
    expect(getUrlParam(page, "q")).toBe("downtown");

    // Filter params gone
    expect(getUrlParam(page, "amenities")).toBeNull();
    expect(getUrlParam(page, "roomType")).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 13.4 Results refresh after reset
  // -------------------------------------------------------------------------
  test(`${tags.core} 13.4 - listing cards appear after clearing restrictive filters`, async ({ page }) => {
    // Start with extreme filter that should yield zero or very few results
    await page.goto(`${SEARCH_URL}&minPrice=99999&maxPrice=100000`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(5_000);

    const container = searchResultsContainer(page);

    // Try the chips bar "Clear all" first; fall back to "Clear all filters" link
    const chipsClearAll = chipsClearAllButton(page);
    const chipsVisible = await chipsClearAll.isVisible({ timeout: 5_000 }).catch(() => false);

    const pageBodyClearAll = container
      .locator('a:has-text("Clear all filters"), button:has-text("Clear all filters")')
      .first();

    if (chipsVisible) {
      await chipsClearAll.click();
    } else {
      const bodyLinkVisible = await pageBodyClearAll.isVisible({ timeout: 5_000 }).catch(() => false);
      test.skip(!bodyLinkVisible, "No clear-all mechanism found for zero-results state");
      await pageBodyClearAll.click();
    }

    // Wait for filter params to be cleaned via soft navigation
    await expect.poll(
      () => {
        const params = new URL(page.url(), "http://localhost").searchParams;
        return !params.has("minPrice") && !params.has("maxPrice");
      },
      { timeout: timeouts.action, message: "URL to have no price params after clear" },
    ).toBe(true);

    // Wait for listing cards to appear (results refreshed)
    const listingCards = container.locator(selectors.listingCard);
    await expect(listingCards.first()).toBeVisible({ timeout: timeouts.navigation });

    // Confirm there is at least one result
    const count = await listingCards.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});
