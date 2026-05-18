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

import {
  test,
  expect,
  selectors,
  timeouts,
  tags,
  searchResultsContainer,
} from "../helpers/test-utils";
import type { Locator, Page } from "@playwright/test";
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

async function visibleClearAllFiltersControl(
  container: Locator
): Promise<Locator | null> {
  const clearLink = container
    .getByRole("link", { name: /^Clear all filters$/ })
    .first();
  const linkVisible = await clearLink
    .waitFor({ state: "visible", timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  if (linkVisible) return clearLink;

  const clearButton = container
    .getByRole("button", { name: /^Clear all filters$/ })
    .first();
  const buttonVisible = await clearButton
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  return buttonVisible ? clearButton : null;
}

async function clickVisibleClearAllFiltersControl(
  page: Page,
  container: Locator
): Promise<boolean> {
  const initialControl = await visibleClearAllFiltersControl(container);
  if (!initialControl) return false;

  let clicked = false;
  await expect(async () => {
    const params = new URL(page.url(), "http://localhost").searchParams;
    if (!params.has("minPrice") && !params.has("maxPrice")) return;

    const control = await visibleClearAllFiltersControl(container);
    if (control) {
      await control!.click();
      clicked = true;
    }
    expect(clicked).toBe(true);

    await expect
      .poll(
        () => {
          const params = new URL(page.url(), "http://localhost").searchParams;
          return !params.has("minPrice") && !params.has("maxPrice");
        },
        {
          timeout: 3_000,
          message: "clear-all click to remove price params",
        }
      )
      .toBe(true);
  }).toPass({ timeout: 30_000 });

  return true;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Filter Reset", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({}, testInfo) => {
    if (testInfo.project.name.includes("webkit")) {
      test.skip(true, "Radix UI hydration issues on webkit");
    }
    test.slow();
  });

  // -------------------------------------------------------------------------
  // 13.1 "Clear all" in modal resets all filters
  // -------------------------------------------------------------------------
  test(`${tags.core} 13.1 - "Clear all" in modal resets all filter values`, async ({
    page,
  }) => {
    // Navigate with three distinct filters applied
    await page.goto(
      `${SEARCH_URL}&minPrice=500&amenities=Wifi&roomType=Private+Room`
    );
    await page.waitForLoadState("domcontentloaded");
    await expect(searchResultsContainer(page)).toBeVisible({ timeout: 30_000 });

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
  test(`${tags.core} 13.2 - "Clear all filters" from zero-results resets URL and refreshes results`, async ({
    page,
  }) => {
    // Navigate with extreme price filter that should yield zero results
    await page.goto(`${SEARCH_URL}&minPrice=99999&maxPrice=100000`);
    await page.waitForLoadState("domcontentloaded");
    await expect(searchResultsContainer(page)).toBeVisible({ timeout: 30_000 });

    // Look for a "Clear all filters" or "clear filters" link in the page body
    // (typically rendered inside the empty state / zero-results component)
    const container = searchResultsContainer(page);
    const clearLink = await visibleClearAllFiltersControl(container);
    if (!clearLink) {
      test.skip(
        true,
        "Zero-results 'Clear all filters' link not visible -- may need mocked empty state"
      );
      return;
    }

    await clickVisibleClearAllFiltersControl(page, container);

    // Bounds must be preserved
    expect(getUrlParam(page, "minLat")).toBeTruthy();
    expect(getUrlParam(page, "maxLat")).toBeTruthy();

    // Filter params gone
    expect(getUrlParam(page, "minPrice")).toBeNull();
    expect(getUrlParam(page, "maxPrice")).toBeNull();

    // Results should appear (wait for listing cards or heading with non-zero count)
    await expect(async () => {
      const cardVisible = await container
        .locator(selectors.listingCard)
        .first()
        .isVisible()
        .catch(() => false);
      const headingVisible = await container
        .locator("h1, h2, h3")
        .filter({ visible: true })
        .first()
        .isVisible()
        .catch(() => false);
      expect(cardVisible || headingVisible).toBe(true);
    }).toPass({ timeout: timeouts.navigation, intervals: [500, 1_000, 2_000] });
  });

  // -------------------------------------------------------------------------
  // 13.3 Clear all via chips bar removes everything
  // -------------------------------------------------------------------------
  test(`${tags.core} 13.3 - chips bar "Clear all filters" removes all chips and cleans URL`, async ({
    page,
  }) => {
    // Navigate with 3+ filters
    await page.goto(
      `${SEARCH_URL}&amenities=Wifi,Parking&roomType=Private+Room&sort=price_asc&q=downtown`
    );
    await page.waitForLoadState("domcontentloaded");

    // Wait for hydration — applied filters region must be stable and interactive
    const region = appliedFiltersRegion(page);
    await expect(region).toBeVisible({ timeout: 15_000 });

    // "Clear all filters" button in the chip bar
    const clearAllBtn = chipsClearAllButton(page);
    await expect(clearAllBtn).toBeVisible({ timeout: 15_000 });

    await expect(async () => {
      const params = new URL(page.url(), "http://localhost").searchParams;
      if (!params.has("amenities") && !params.has("roomType")) return;

      const retryClearAllBtn = chipsClearAllButton(page);
      await expect(retryClearAllBtn).toBeVisible({ timeout: 5_000 });
      await expect(retryClearAllBtn).toBeEnabled({ timeout: 5_000 });
      await retryClearAllBtn.click();

      await expect
        .poll(
          () => {
            const params = new URL(page.url(), "http://localhost").searchParams;
            return !params.has("amenities") && !params.has("roomType");
          },
          {
            timeout: 5_000,
            message: "chip clear-all click to remove filter params",
          }
        )
        .toBe(true);
    }).toPass({ timeout: 30_000 });

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
  test(`${tags.core} 13.4 - listing cards appear after clearing restrictive filters`, async ({
    page,
  }) => {
    // Start with extreme filter that should yield zero or very few results
    await page.goto(`${SEARCH_URL}&minPrice=99999&maxPrice=100000`);
    await page.waitForLoadState("domcontentloaded");
    await expect(searchResultsContainer(page)).toBeVisible({ timeout: 30_000 });

    const container = searchResultsContainer(page);

    // Try the chips bar "Clear all" first; fall back to "Clear all filters" link
    const chipsClearAll = chipsClearAllButton(page);
    const chipsVisible = await chipsClearAll
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    const pageBodyClearAll = await visibleClearAllFiltersControl(container);

    if (chipsVisible) {
      await chipsClearAll.click();
    } else {
      if (!pageBodyClearAll) {
        test.skip(true, "No clear-all mechanism found for zero-results state");
        return;
      }
      const clicked = await clickVisibleClearAllFiltersControl(page, container);
      expect(clicked).toBeTruthy();
    }

    // Wait for filter params to be cleaned via soft navigation
    await expect
      .poll(
        () => {
          const params = new URL(page.url(), "http://localhost").searchParams;
          return !params.has("minPrice") && !params.has("maxPrice");
        },
        {
          timeout: timeouts.action,
          message: "URL to have no price params after clear",
        }
      )
      .toBe(true);

    // Wait for listing cards to appear (results refreshed)
    await expect(async () => {
      const listingCards = container.locator(selectors.listingCard);
      const cardCount = await listingCards.count();
      const fallbackHeadingVisible = await container
        .locator("h1, h2, h3")
        .filter({ visible: true })
        .first()
        .isVisible()
        .catch(() => false);
      expect(cardCount > 0 || fallbackHeadingVisible).toBe(true);
    }).toPass({ timeout: timeouts.navigation, intervals: [500, 1_000, 2_000] });
  });
});
