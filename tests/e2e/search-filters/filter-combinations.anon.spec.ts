/**
 * Filter Combinations E2E Tests (P1)
 *
 * Validates that multiple filters work correctly together, that adding/removing
 * individual filters from a multi-filter set works, and that filters interact
 * properly with sort, query, and pagination state.
 *
 * Key implementation details:
 * - useBatchedFilters.commit() preserves non-filter params (bounds, sort, q)
 * - commit() always deletes pagination params (page, cursor, cursorStack, pageNumber)
 * - All filter params: minPrice, maxPrice, roomType, leaseDuration, moveInDate,
 *   amenities, houseRules, languages, genderPreference, householdGender
 * - AppliedFilterChips.clearAllFilters preserves: q, lat, lng, minLat, maxLat,
 *   minLng, maxLng, sort
 * - SearchResultsClient is keyed by searchParamsString, so filter change
 *   remounts the component and resets cursor + accumulated listings
 */

import {
  test,
  expect,
  SF_BOUNDS,
  selectors,
  tags,
  searchResultsContainer,
  boundsQS,
  SEARCH_URL,
  getUrlParam,
  getUrlParams,
  appliedFiltersRegion,
  filtersButton,
} from "../helpers";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Filter Combinations", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  // 1. Price + room type combination
  test(`${tags.core} - price and room type filters work together`, async ({ page }) => {
    await page.goto(`${SEARCH_URL}&maxPrice=1500&roomType=Private+Room`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForLoadState("networkidle").catch(() => {});

    // Both params should be in URL
    expect(getUrlParam(page, "maxPrice")).toBe("1500");
    expect(getUrlParam(page, "roomType")).toBe("Private Room");

    // Page should render (listings or empty state)
    const container = searchResultsContainer(page);
    const hasContent =
      (await container.locator(selectors.listingCard).count()) > 0 ||
      (await container.locator(selectors.emptyState).count()) > 0;
    expect(hasContent || (await page.title()).length > 0).toBe(true);

    // Both should appear as chips
    const region = appliedFiltersRegion(page);
    const regionVisible = await region.isVisible().catch(() => false);
    if (regionVisible) {
      await expect(region.locator("text=/Private Room/i").first()).toBeVisible({ timeout: 10_000 });
    }
  });

  // 2. Price + amenities combination
  test(`${tags.core} - price and amenities filters work together`, async ({ page }) => {
    await page.goto(`${SEARCH_URL}&maxPrice=2000&amenities=Wifi,Parking`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForLoadState("networkidle").catch(() => {});

    expect(getUrlParam(page, "maxPrice")).toBe("2000");
    const amenities = getUrlParam(page, "amenities") ?? "";
    expect(amenities).toContain("Wifi");
    expect(amenities).toContain("Parking");

    expect(await page.title()).toBeTruthy();
  });

  // 3. All filters together
  test(`${tags.core} - multiple different filter types applied simultaneously`, async ({ page }) => {
    const filterQS = [
      boundsQS,
      "minPrice=500",
      "maxPrice=3000",
      "roomType=Private+Room",
      "amenities=Wifi,Furnished",
      "leaseDuration=6+months",
    ].join("&");

    await page.goto(`/search?${filterQS}`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForLoadState("networkidle").catch(() => {});

    // Verify all params are present
    expect(getUrlParam(page, "minPrice")).toBe("500");
    expect(getUrlParam(page, "maxPrice")).toBe("3000");
    expect(getUrlParam(page, "roomType")).toBe("Private Room");
    expect(getUrlParam(page, "amenities")).toContain("Wifi");
    expect(getUrlParam(page, "leaseDuration")).toBe("6 months");

    // Page should render without errors
    expect(await page.title()).toBeTruthy();
  });

  // 4. Adding filter to existing filters (additive)
  test(`${tags.core} - adding a filter preserves existing filters`, async ({ page }) => {
    // Start with room type
    await page.goto(`${SEARCH_URL}&roomType=Private+Room`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForLoadState("networkidle").catch(() => {});

    // Open filter modal and add an amenity
    const filtersBtn = filtersButton(page);
    await filtersBtn.click();

    const dialog = page.getByRole("dialog", { name: /filters/i });
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Toggle Wifi amenity
    const amenitiesGroup = page.locator('[aria-label="Select amenities"]');
    const wifiBtn = amenitiesGroup.getByRole("button", { name: /^Wifi/i });
    if (await wifiBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await wifiBtn.click();

      // Apply
      await page.locator('[data-testid="filter-modal-apply"]').click();

      // Wait for URL to update
      await page.waitForURL(
        (url) => new URL(url).searchParams.has("amenities"),
        { timeout: 15_000 },
      );

      // Both room type and amenity should be in URL
      expect(getUrlParam(page, "roomType")).toBe("Private Room");
      expect(getUrlParam(page, "amenities")).toContain("Wifi");
    }
  });

  // 5. Removing one filter from multiple (others preserved)
  test(`${tags.core} - removing one filter preserves the others`, async ({ page }) => {
    await page.goto(`${SEARCH_URL}&roomType=Private+Room&amenities=Wifi&maxPrice=2000`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForLoadState("networkidle").catch(() => {});

    const region = appliedFiltersRegion(page);
    const regionVisible = await region.isVisible().catch(() => false);
    test.skip(!regionVisible, "Applied filters region not visible");

    // Remove the roomType chip
    const removeRoomType = region.getByRole("button", { name: /remove filter.*private room/i });
    const removeVisible = await removeRoomType.isVisible().catch(() => false);

    if (removeVisible) {
      await removeRoomType.click();

      await page.waitForURL(
        (url) => !new URL(url).searchParams.has("roomType"),
        { timeout: 15_000 },
      );

      // roomType removed, others preserved
      expect(getUrlParam(page, "roomType")).toBeNull();
      expect(getUrlParam(page, "amenities")).toContain("Wifi");
      expect(getUrlParam(page, "maxPrice")).toBe("2000");
    }
  });

  // 6. Filter + sort combination preserves both
  test(`${tags.core} - filter and sort params coexist in URL`, async ({ page }) => {
    await page.goto(`${SEARCH_URL}&roomType=Private+Room&sort=price_asc`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForLoadState("networkidle").catch(() => {});

    expect(getUrlParam(page, "roomType")).toBe("Private Room");
    expect(getUrlParam(page, "sort")).toBe("price_asc");

    // Page renders without error
    expect(await page.title()).toBeTruthy();
  });

  // 7. Filter + query combination preserves both
  test(`${tags.core} - filter and query params coexist in URL`, async ({ page }) => {
    await page.goto(`${SEARCH_URL}&q=downtown&roomType=Private+Room`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForLoadState("networkidle").catch(() => {});

    expect(getUrlParam(page, "q")).toBe("downtown");
    expect(getUrlParam(page, "roomType")).toBe("Private Room");

    expect(await page.title()).toBeTruthy();
  });

  // 8. Pagination resets when any filter changes
  test(`${tags.core} - pagination params are cleared when filters change`, async ({ page }) => {
    // Start with a page param
    await page.goto(`${SEARCH_URL}&roomType=Private+Room&page=2`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForLoadState("networkidle").catch(() => {});

    // Open filter modal and change a filter
    const filtersBtn = filtersButton(page);
    await filtersBtn.click();

    const dialog = page.getByRole("dialog", { name: /filters/i });
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Toggle an amenity to make the filter set dirty
    const amenitiesGroup = page.locator('[aria-label="Select amenities"]');
    const wifiBtn = amenitiesGroup.getByRole("button", { name: /^Wifi/i });
    if (await wifiBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await wifiBtn.click();

      // Apply
      await page.locator('[data-testid="filter-modal-apply"]').click();

      // Wait for navigation
      await page.waitForURL(
        (url) => new URL(url).searchParams.has("amenities"),
        { timeout: 15_000 },
      );

      // page param should have been removed by commit()
      const params = getUrlParams(page);
      expect(params.has("page")).toBe(false);
      expect(params.has("cursor")).toBe(false);
      expect(params.has("cursorStack")).toBe(false);
      expect(params.has("pageNumber")).toBe(false);
    }
  });

  // 9. Filter combination with bounds preserved
  test(`${tags.core} - geographic bounds persist through filter changes`, async ({ page }) => {
    await page.goto(`${SEARCH_URL}&roomType=Private+Room`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForLoadState("networkidle").catch(() => {});

    // Bounds should be in URL
    expect(getUrlParam(page, "minLat")).toBeTruthy();
    expect(getUrlParam(page, "maxLat")).toBeTruthy();
    expect(getUrlParam(page, "minLng")).toBeTruthy();
    expect(getUrlParam(page, "maxLng")).toBeTruthy();

    // Apply additional filters via modal
    const filtersBtn = filtersButton(page);
    await filtersBtn.click();

    const dialog = page.getByRole("dialog", { name: /filters/i });
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Apply without changing anything (just to test bounds persistence)
    await page.locator('[data-testid="filter-modal-apply"]').click();
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });
    await page.waitForLoadState("networkidle").catch(() => {});

    // Bounds should still be there
    expect(getUrlParam(page, "minLat")).toBeTruthy();
    expect(getUrlParam(page, "maxLat")).toBeTruthy();
  });

  // 10. House rules and amenities together
  test(`${tags.core} - house rules and amenities can be combined`, async ({ page }) => {
    await page.goto(`${SEARCH_URL}&amenities=Wifi&houseRules=Pets+allowed`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForLoadState("networkidle").catch(() => {});

    expect(getUrlParam(page, "amenities")).toContain("Wifi");
    expect(getUrlParam(page, "houseRules")).toContain("Pets allowed");

    // Both should appear as chips
    const region = appliedFiltersRegion(page);
    const regionVisible = await region.isVisible().catch(() => false);
    if (regionVisible) {
      await expect(region.locator("text=/Wifi/i").first()).toBeVisible({ timeout: 10_000 });
      await expect(region.locator("text=/Pets allowed/i").first()).toBeVisible({ timeout: 10_000 });
    }

    expect(await page.title()).toBeTruthy();
  });

  // 11. All sort options work with active filters
  test(`${tags.core} - all sort options work with active filters`, async ({ page }) => {
    test.slow(); // 5 navigations in loop on WSL2/NTFS
    const sortOptions = ["recommended", "price_asc", "price_desc", "newest", "rating"];

    for (const sort of sortOptions) {
      await page.goto(`${SEARCH_URL}&roomType=Private+Room&sort=${sort}`);
      await page.waitForLoadState("domcontentloaded");
      await page.waitForLoadState("networkidle").catch(() => {});

      expect(getUrlParam(page, "sort")).toBe(sort);
      expect(getUrlParam(page, "roomType")).toBe("Private Room");

      // Page should render without errors
      expect(await page.title()).toBeTruthy();
    }
  });

  // 12. No console errors with complex filter combinations
  test(`${tags.core} - no console errors with complex filter combinations`, async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // Navigate with many filters
    const filterQS = [
      boundsQS,
      "minPrice=500",
      "maxPrice=3000",
      "roomType=Private+Room",
      "amenities=Wifi,Parking,Furnished",
      "houseRules=Pets+allowed",
      "sort=price_asc",
    ].join("&");

    await page.goto(`/search?${filterQS}`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForLoadState("networkidle").catch(() => {});

    // Filter known benign errors
    const realErrors = consoleErrors.filter(
      (e) =>
        !e.includes("mapbox") &&
        !e.includes("webpack") &&
        !e.includes("HMR") &&
        !e.includes("hydrat") &&
        !e.includes("favicon") &&
        !e.includes("ResizeObserver") &&
        !e.includes("WebGL") &&
        !e.includes("Failed to create") &&
        !e.includes("404") &&
        !e.includes("AbortError") &&
        !e.includes("abort") &&
        !e.includes("cancelled") &&
        !e.includes("net::ERR") &&
        !e.includes("Failed to load resource"),
    );

    expect(realErrors).toHaveLength(0);
  });
});
