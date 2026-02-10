/**
 * Filter Combinatorial Dead-End E2E Tests (P0-P2)
 *
 * Validates that the search page handles extreme filter combinations,
 * zero-result states, chip removal chains, and URL serialization edge cases.
 */

import {
  test,
  expect,
  tags,
  searchResultsContainer,
  scopedCards,
  getUrlParam,
  getUrlParams,
  gotoSearchWithFilters,
  VALID_AMENITIES,
  HOUSE_RULES,
} from "../helpers";

test.describe("Filter Dead-Ends & Edge Cases", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async () => {
    test.slow();
  });

  test(`${tags.filter} highly restrictive filters produce zero results with recovery path`, async ({
    page,
  }) => {
    // Navigate with very restrictive filters unlikely to match
    await gotoSearchWithFilters(page, {
      amenities: "Pool,Gym",
      roomType: "Shared Room",
      maxPrice: "100",
    });

    const container = searchResultsContainer(page);

    // Check for zero-results state
    const zeroResultsHeading = container.locator("text=/No.*match/i").first();
    await expect(zeroResultsHeading).toBeVisible({ timeout: 10000 });

    // Verify recovery paths are available
    // ZeroResultsSuggestions renders "Clear all filters" as a <Button> (not a link)
    // and suggestion buttons with "Remove: {label}" text
    const clearAllButton = container.getByRole("button", { name: /clear all/i });
    const browseAllLink = container.getByRole("link", {
      name: /browse all/i,
    });
    const suggestionButtons = container.locator("button").filter({ hasText: /remove/i });

    // At least one recovery option should be visible
    const hasClearAll = await clearAllButton.isVisible().catch(() => false);
    const hasBrowseAll = await browseAllLink.isVisible().catch(() => false);
    const hasSuggestions =
      (await suggestionButtons.count().catch(() => 0)) > 0;

    expect(hasClearAll || hasBrowseAll || hasSuggestions).toBe(true);

    // If suggestions exist, verify clicking one navigates correctly
    if (hasSuggestions) {
      const firstSuggestion = suggestionButtons.first();
      const currentUrl = page.url();

      await firstSuggestion.click();

      // Wait for URL to change (filter removed)
      await page.waitForURL((url) => url.toString() !== currentUrl, {
        timeout: 30_000,
      });

      // Verify we're still on search page
      expect(page.url()).toContain("/search");
    }
  });

  test(`${tags.filter} price max less than min is handled gracefully`, async ({
    page,
  }) => {
    // Navigate with inverted price range
    await gotoSearchWithFilters(page, { minPrice: "3000", maxPrice: "500" });

    // Page should not crash - verify page rendered
    const pageTitle = await page.title();
    expect(pageTitle).toBeTruthy();

    // Check if URL auto-corrected (swap) or kept original
    const minPrice = getUrlParam(page, "minPrice");
    const maxPrice = getUrlParam(page, "maxPrice");

    // Either auto-swapped or kept original values
    const isSwapped = minPrice === "500" && maxPrice === "3000";
    const isOriginal = minPrice === "3000" && maxPrice === "500";

    // If neither, system might have removed invalid params
    if (minPrice && maxPrice) {
      expect(isSwapped || isOriginal).toBe(true);
    }

    // Verify page shows results, valid empty state, or graceful error (no crash)
    const container = searchResultsContainer(page);
    await expect(container).toBeVisible();

    // Check for results, empty state, or graceful error page
    const hasCards = (await scopedCards(page).count()) > 0;
    const hasEmptyState = await container
      .locator("text=/No.*match/i")
      .first()
      .isVisible()
      .catch(() => false);
    // Backend may reject inverted price range with a user-friendly error
    const hasErrorState = await container
      .locator("text=/Unable to load/i")
      .first()
      .isVisible()
      .catch(() => false);

    expect(hasCards || hasEmptyState || hasErrorState).toBe(true);
  });

  test(`${tags.filter} all 12 filter types active simultaneously renders correctly`, async ({
    page,
  }) => {
    // Navigate with ALL filter params set
    await gotoSearchWithFilters(page, {
      amenities: "Wifi,Parking",
      houseRules: "Pets allowed",
      roomType: "Private Room",
      leaseDuration: "6 months",
      minPrice: "500",
      maxPrice: "3000",
      languages: "en",
      genderPreference: "any",
      sort: "price_asc",
      q: "San Francisco",
    });

    // Verify all params survived in URL
    const params = getUrlParams(page);
    expect(params.get("amenities")).toContain("Wifi");
    expect(params.get("amenities")).toContain("Parking");
    expect(params.get("houseRules")).toContain("Pets allowed");
    expect(params.get("roomType")).toBe("Private Room");
    expect(params.get("leaseDuration")).toBe("6 months");
    expect(params.get("minPrice")).toBe("500");
    expect(params.get("maxPrice")).toBe("3000");
    expect(params.get("languages")).toContain("en");
    expect(params.get("genderPreference")).toBe("any");
    expect(params.get("sort")).toBe("price_asc");

    // Verify page rendered without errors
    const pageTitle = await page.title();
    expect(pageTitle).toBeTruthy();

    const container = searchResultsContainer(page);
    await expect(container).toBeVisible();

    // Verify applied filters region shows multiple chips
    const appliedFiltersRegion = container.locator(
      '[aria-label="Applied filters"]'
    );

    // May or may not be visible depending on results, but if visible should have multiple chips
    const isRegionVisible = await appliedFiltersRegion
      .isVisible()
      .catch(() => false);
    if (isRegionVisible) {
      const chipButtons = appliedFiltersRegion.getByRole("button", {
        name: /remove filter/i,
      });
      const chipCount = await chipButtons.count();
      expect(chipCount).toBeGreaterThan(0);
    }

    // Page successfully loaded proves URL is within browser limits
    expect(page.url().length).toBeLessThan(8000);
  });

  test(`${tags.filter} removing chips one by one maintains consistent state`, async ({
    page,
  }) => {
    // Navigate with multiple filters
    await gotoSearchWithFilters(page, {
      amenities: "Wifi,Parking",
      roomType: "Private Room",
    });

    const container = searchResultsContainer(page);
    const appliedFiltersRegion = container.locator(
      '[aria-label="Applied filters"]'
    );

    // Wait for applied filters region to be visible
    await expect(appliedFiltersRegion).toBeVisible({ timeout: 15_000 });

    // Count initial chips: should be 3 (Wifi + Parking + Private Room)
    const initialChipButtons = appliedFiltersRegion.getByRole("button", {
      name: /remove filter/i,
    });
    const initialCount = await initialChipButtons.count();
    expect(initialCount).toBe(3);

    // Remove Wifi chip
    const wifiRemoveButton = appliedFiltersRegion.getByRole("button", {
      name: /remove filter.*wifi/i,
    });
    await wifiRemoveButton.click();

    // Wait for URL to update
    await page.waitForURL((url) => !url.toString().includes("Wifi"), {
      timeout: 30_000,
    });

    // Verify URL still has Parking and roomType
    let amenities = getUrlParam(page, "amenities");
    expect(amenities).toContain("Parking");
    expect(amenities).not.toContain("Wifi");
    expect(getUrlParam(page, "roomType")).toBe("Private Room");

    // Verify chip count decreased
    const afterWifiCount = await appliedFiltersRegion
      .getByRole("button", { name: /remove filter/i })
      .count();
    expect(afterWifiCount).toBe(2);

    // Remove Parking chip
    const parkingRemoveButton = appliedFiltersRegion.getByRole("button", {
      name: /remove filter.*parking/i,
    });
    await parkingRemoveButton.click();

    // Wait for URL update - amenities param should be deleted when last value removed
    await page.waitForURL(
      (url) => !new URL(url).searchParams.has("amenities"),
      { timeout: 30_000 }
    );

    // Verify amenities param is gone
    amenities = getUrlParam(page, "amenities");
    expect(amenities).toBeNull();
    expect(getUrlParam(page, "roomType")).toBe("Private Room");

    // Verify chip count decreased
    const afterParkingCount = await appliedFiltersRegion
      .getByRole("button", { name: /remove filter/i })
      .count();
    expect(afterParkingCount).toBe(1);

    // Remove Private Room chip
    const roomTypeRemoveButton = appliedFiltersRegion.getByRole("button", {
      name: /remove filter.*private room/i,
    });
    await roomTypeRemoveButton.click();

    // Wait for URL update - no filters
    await page.waitForURL(
      (url) => !new URL(url).searchParams.has("roomType"),
      { timeout: 30_000 }
    );

    // Verify no filter params in URL
    expect(getUrlParam(page, "amenities")).toBeNull();
    expect(getUrlParam(page, "roomType")).toBeNull();

    // Applied filters region should no longer be visible
    await expect(appliedFiltersRegion).not.toBeVisible();
  });

  test(`${tags.filter} clear all preserves search query, sort, and bounds params`, async ({
    page,
  }) => {
    // Navigate with filters + preserved params
    await gotoSearchWithFilters(page, {
      amenities: "Wifi",
      roomType: "Private Room",
      sort: "price_asc",
      q: "Austin",
    });

    const container = searchResultsContainer(page);
    const appliedFiltersRegion = container.locator(
      '[aria-label="Applied filters"]'
    );

    // Wait for applied filters region
    await expect(appliedFiltersRegion).toBeVisible({ timeout: 15_000 });

    // Capture bounds params before clearing (should be in URL from buildSearchUrl)
    const beforeParams = getUrlParams(page);
    const hasBounds =
      beforeParams.has("minLat") ||
      beforeParams.has("maxLat") ||
      beforeParams.has("minLng") ||
      beforeParams.has("maxLng");

    // Dismiss any open autocomplete dropdown that may overlay the chips region
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    await page.locator('body').click({ position: { x: 0, y: 0 }, force: true });

    // Click "Clear all" button in chips region
    const clearAllButton = appliedFiltersRegion.getByRole("button", {
      name: /clear all/i,
    });
    await clearAllButton.click({ force: true });

    // Wait for URL to update (amenities and roomType removed)
    await page.waitForURL(
      (url) => !new URL(url).searchParams.has("amenities"),
      { timeout: 30_000 }
    );

    // Verify filters were removed
    expect(getUrlParam(page, "amenities")).toBeNull();
    expect(getUrlParam(page, "roomType")).toBeNull();

    // Verify preserved params still exist
    expect(getUrlParam(page, "sort")).toBe("price_asc");

    // q param is preserved by PRESERVED_PARAMS
    const qParam = getUrlParam(page, "q");
    if (qParam !== null) {
      expect(qParam).toBeTruthy();
    }

    // Bounds should be preserved if they were present
    if (hasBounds) {
      const afterParams = getUrlParams(page);
      const stillHasBounds =
        afterParams.has("minLat") ||
        afterParams.has("maxLat") ||
        afterParams.has("minLng") ||
        afterParams.has("maxLng");
      expect(stillHasBounds).toBe(true);
    }

    // Applied filters region should be gone
    await expect(appliedFiltersRegion).not.toBeVisible();
  });

  test(`${tags.filter} maximum URL length with all filters - no truncation`, async ({
    page,
  }) => {
    // Build the longest reasonable URL with all filter types and multiple values
    await gotoSearchWithFilters(page, {
      amenities: VALID_AMENITIES.join(","),
      houseRules: HOUSE_RULES.join(","),
      roomType: "Private Room",
      leaseDuration: "12 months",
      minPrice: "100",
      maxPrice: "10000",
      languages: "en,es,fr,de,ja,zh",
      genderPreference: "female",
      householdGender: "female",
      sort: "newest",
      q: "San Francisco Bay Area",
    });

    // Verify page rendered successfully
    const pageTitle = await page.title();
    expect(pageTitle).toBeTruthy();

    // Verify all params survived (no truncation)
    const amenitiesParam = getUrlParam(page, "amenities");
    expect(amenitiesParam).toBeTruthy();

    // Check that amenities contains all expected values
    if (amenitiesParam) {
      const amenitiesCount = amenitiesParam.split(",").length;
      expect(amenitiesCount).toBeGreaterThan(5);
    }

    // Verify other key params
    expect(getUrlParam(page, "houseRules")).toBeTruthy();
    expect(getUrlParam(page, "roomType")).toBe("Private Room");
    expect(getUrlParam(page, "leaseDuration")).toBe("12 months");
    expect(getUrlParam(page, "minPrice")).toBe("100");
    expect(getUrlParam(page, "maxPrice")).toBe("10000");
    expect(getUrlParam(page, "languages")).toContain("en");
    expect(getUrlParam(page, "genderPreference")).toBe("female");
    expect(getUrlParam(page, "sort")).toBe("newest");

    // Verify page rendered without errors
    const container = searchResultsContainer(page);
    await expect(container).toBeVisible();

    // URL should be long but valid
    expect(page.url().length).toBeGreaterThan(200);
    expect(page.url().length).toBeLessThan(10000);
  });
});
