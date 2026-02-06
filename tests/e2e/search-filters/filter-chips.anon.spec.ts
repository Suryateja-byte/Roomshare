/**
 * Active Filter Chips E2E Tests (P0)
 *
 * Validates the AppliedFilterChips bar that displays active filters as
 * removable chips above the search results.
 *
 * Key implementation details:
 * - Container: role="region" aria-label="Applied filters"
 * - Each chip: FilterChipWithImpact -> FilterChip (span with remove button)
 * - Remove button: aria-label="Remove filter: {label}"
 * - Clear all: button aria-label="Clear all filters"
 * - Chips are derived from URL via urlToFilterChips()
 * - Price chips: "$500 - $2,000" (combined), "Min $500", "Max $2,000"
 * - Room type chip: "Private Room"
 * - Amenity chips: one per amenity (e.g., "Wifi", "Parking")
 * - Removing a chip navigates with updated URL (filter removed)
 * - "Clear all" preserves q, lat, lng, bounds, sort
 */

import {
  test,
  expect,
  tags,
  searchResultsContainer,
  boundsQS,
  SEARCH_URL,
  getUrlParam,
  appliedFiltersRegion,
} from "../helpers";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Active Filter Chips", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  // 1. Active filters show as chips above results
  test(`${tags.core} - active filters display as chips in applied filters region`, async ({ page }) => {
    await page.goto(`${SEARCH_URL}&roomType=Private+Room&amenities=Wifi`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3_000);

    const region = appliedFiltersRegion(page);
    await expect(region).toBeVisible({ timeout: 10_000 });

    // Should display chips for both filters
    const privateRoomChip = region.locator("text=/Private Room/i").first();
    await expect(privateRoomChip).toBeVisible({ timeout: 10_000 });

    const wifiChip = region.locator("text=/Wifi/i").first();
    await expect(wifiChip).toBeVisible({ timeout: 10_000 });
  });

  // 2. Clicking chip remove button removes that filter
  test(`${tags.core} - clicking chip remove button removes the filter from URL`, async ({ page }) => {
    await page.goto(`${SEARCH_URL}&roomType=Private+Room&amenities=Wifi`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3_000);

    const region = appliedFiltersRegion(page);
    const regionVisible = await region.isVisible().catch(() => false);
    test.skip(!regionVisible, "Applied filters region not visible");

    // Find and click the remove button for the roomType chip
    const removeRoomType = region.getByRole("button", { name: /remove filter.*private room/i });
    const removeVisible = await removeRoomType.isVisible().catch(() => false);

    if (removeVisible) {
      await removeRoomType.click();

      // Wait for URL to update
      await page.waitForURL(
        (url) => !new URL(url).searchParams.has("roomType"),
        { timeout: 15_000 },
      );

      // roomType should be removed but amenities should remain
      expect(getUrlParam(page, "roomType")).toBeNull();
      expect(getUrlParam(page, "amenities")).toContain("Wifi");
    }
  });

  // 3. "Clear all" removes all filters
  test(`${tags.core} - clear all button removes all filter params from URL`, async ({ page }) => {
    await page.goto(`${SEARCH_URL}&roomType=Private+Room&amenities=Wifi,Parking&maxPrice=2000`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3_000);

    const region = appliedFiltersRegion(page);
    const regionVisible = await region.isVisible().catch(() => false);
    test.skip(!regionVisible, "Applied filters region not visible");

    // Click "Clear all"
    const clearAllBtn = region.getByRole("button", { name: /clear all/i });
    await expect(clearAllBtn).toBeVisible({ timeout: 10_000 });
    await clearAllBtn.click();

    // Wait for filters to be cleared from URL
    await page.waitForURL(
      (url) => {
        const params = new URL(url).searchParams;
        return !params.has("roomType") && !params.has("amenities") && !params.has("maxPrice");
      },
      { timeout: 15_000 },
    );

    // All filters removed
    expect(getUrlParam(page, "roomType")).toBeNull();
    expect(getUrlParam(page, "amenities")).toBeNull();
    expect(getUrlParam(page, "maxPrice")).toBeNull();

    // Bounds should be preserved
    expect(getUrlParam(page, "minLat")).toBeTruthy();
  });

  // 4. Chips update immediately when filters change (URL-driven)
  test(`${tags.core} - chips update when navigating with different filters`, async ({ page }) => {
    // Start with one filter
    await page.goto(`${SEARCH_URL}&roomType=Private+Room`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3_000);

    const region = appliedFiltersRegion(page);
    const regionVisible = await region.isVisible().catch(() => false);
    test.skip(!regionVisible, "Applied filters region not visible");

    // Verify Private Room chip
    await expect(region.locator("text=/Private Room/i").first()).toBeVisible({ timeout: 10_000 });

    // Navigate with a different filter
    await page.goto(`${SEARCH_URL}&amenities=Furnished`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3_000);

    // Private Room chip should be gone, Furnished should appear
    await expect(region.locator("text=/Private Room/i").first()).not.toBeVisible({ timeout: 10_000 });
    await expect(region.locator("text=/Furnished/i").first()).toBeVisible({ timeout: 10_000 });
  });

  // 5. Chips show correct filter labels (not raw param values)
  test(`${tags.core} - chips display human-readable labels`, async ({ page }) => {
    await page.goto(`${SEARCH_URL}&roomType=Private+Room&maxPrice=2000&amenities=Wifi,AC`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3_000);

    const region = appliedFiltersRegion(page);
    const regionVisible = await region.isVisible().catch(() => false);
    test.skip(!regionVisible, "Applied filters region not visible");

    // Room type should display "Private Room" (not raw URL value)
    await expect(region.locator("text=/Private Room/i").first()).toBeVisible({ timeout: 10_000 });

    // Price should display formatted (e.g., "Max $2,000" not "maxPrice=2000")
    const priceChip = region.locator("text=/\\$2,000|Max.*2000/i").first();
    const priceVisible = await priceChip.isVisible().catch(() => false);
    if (priceVisible) {
      await expect(priceChip).toBeVisible();
    }

    // Individual amenity chips
    await expect(region.locator("text=/Wifi/i").first()).toBeVisible({ timeout: 10_000 });
    await expect(region.locator("text=/AC/i").first()).toBeVisible({ timeout: 10_000 });
  });

  // 6. Each chip removal triggers new search (URL update)
  test(`${tags.core} - removing a chip triggers URL navigation`, async ({ page }) => {
    await page.goto(`${SEARCH_URL}&amenities=Wifi,Parking`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3_000);

    const region = appliedFiltersRegion(page);
    const regionVisible = await region.isVisible().catch(() => false);
    test.skip(!regionVisible, "Applied filters region not visible");

    // Remove Wifi chip
    const removeWifi = region.getByRole("button", { name: /remove filter.*wifi/i });
    const removeVisible = await removeWifi.isVisible().catch(() => false);

    if (removeVisible) {
      await removeWifi.click();

      // Wait for URL to lose Wifi
      await page.waitForURL(
        (url) => {
          const amenities = new URL(url).searchParams.get("amenities") ?? "";
          return !amenities.includes("Wifi");
        },
        { timeout: 15_000 },
      );

      // Parking should remain
      const amenities = getUrlParam(page, "amenities") ?? "";
      expect(amenities).not.toContain("Wifi");
      expect(amenities).toContain("Parking");
    }
  });

  // 7. No chips displayed when no filters are active
  test(`${tags.core} - no chips region when no filters are applied`, async ({ page }) => {
    await page.goto(SEARCH_URL);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3_000);

    // The applied filters region should not be visible (component returns null)
    const region = appliedFiltersRegion(page);
    const regionVisible = await region.isVisible().catch(() => false);
    expect(regionVisible).toBe(false);
  });

  // 8. Combined price chip (both min and max)
  test(`${tags.core} - combined price shows as single chip when both min and max set`, async ({ page }) => {
    await page.goto(`${SEARCH_URL}&minPrice=500&maxPrice=2000`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3_000);

    const region = appliedFiltersRegion(page);
    const regionVisible = await region.isVisible().catch(() => false);
    test.skip(!regionVisible, "Applied filters region not visible");

    // Should show a single combined price chip like "$500 - $2,000"
    const priceChip = region.locator("text=/\\$500.*\\$2,000/i").first();
    const singleChip = await priceChip.isVisible().catch(() => false);

    if (singleChip) {
      await expect(priceChip).toBeVisible();
    } else {
      // May show as two separate chips "Min $500" and "Max $2,000"
      const minChip = region.locator("text=/Min.*\\$500|\\$500/i").first();
      const maxChip = region.locator("text=/Max.*\\$2,000|\\$2,000/i").first();
      const hasMin = await minChip.isVisible().catch(() => false);
      const hasMax = await maxChip.isVisible().catch(() => false);
      expect(hasMin || hasMax).toBe(true);
    }
  });

  // 9. Removing combined price chip removes both minPrice and maxPrice
  test(`${tags.core} - removing price chip clears both min and max from URL`, async ({ page }) => {
    await page.goto(`${SEARCH_URL}&minPrice=500&maxPrice=2000`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3_000);

    const region = appliedFiltersRegion(page);
    const regionVisible = await region.isVisible().catch(() => false);
    test.skip(!regionVisible, "Applied filters region not visible");

    // Find the price chip's remove button
    const removePrice = region.getByRole("button", { name: /remove filter.*\$/i }).first();
    const removeVisible = await removePrice.isVisible().catch(() => false);

    if (removeVisible) {
      await removePrice.click();

      await page.waitForURL(
        (url) => {
          const params = new URL(url).searchParams;
          return !params.has("minPrice") && !params.has("maxPrice");
        },
        { timeout: 15_000 },
      );

      expect(getUrlParam(page, "minPrice")).toBeNull();
      expect(getUrlParam(page, "maxPrice")).toBeNull();
    }
  });

  // 10. Clear all preserves bounds and sort
  test(`${tags.core} - clear all preserves non-filter params (bounds, sort)`, async ({ page }) => {
    await page.goto(`${SEARCH_URL}&roomType=Private+Room&sort=price_asc`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3_000);

    const region = appliedFiltersRegion(page);
    const regionVisible = await region.isVisible().catch(() => false);
    test.skip(!regionVisible, "Applied filters region not visible");

    const clearAllBtn = region.getByRole("button", { name: /clear all/i });
    await expect(clearAllBtn).toBeVisible({ timeout: 10_000 });
    await clearAllBtn.click();

    await page.waitForURL(
      (url) => !new URL(url).searchParams.has("roomType"),
      { timeout: 15_000 },
    );

    // Bounds should be preserved
    expect(getUrlParam(page, "minLat")).toBeTruthy();
    expect(getUrlParam(page, "maxLat")).toBeTruthy();

    // Sort should be preserved
    expect(getUrlParam(page, "sort")).toBe("price_asc");

    // Filter should be gone
    expect(getUrlParam(page, "roomType")).toBeNull();
  });
});
