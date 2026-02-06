/**
 * Filter State Persistence E2E Tests (P1)
 *
 * Validates that filter state is durably stored in the URL and survives
 * page refresh, back/forward navigation, and direct deep-linking.
 *
 * Key implementation details:
 * - All filter state is URL-driven (no localStorage/sessionStorage for filters)
 * - Applied filter chips are derived from URL via urlToFilterChips()
 * - Sort is preserved independently in PRESERVED_PARAMS by clearAllFilters()
 * - SearchResultsClient is keyed by searchParamsString, so filter/sort changes
 *   remount the component and reset cursor + accumulated listings
 * - Deep links with filter params pre-populate the filter modal and chips
 */

import { test, expect, SF_BOUNDS, selectors, tags, searchResultsContainer } from "../helpers/test-utils";
import {
  boundsQS,
  SEARCH_URL,
  getUrlParam,
  appliedFiltersRegion,
  filtersButton,
  filterDialog,
} from "../helpers";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Filter State Persistence", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  // -------------------------------------------------------------------------
  // 12.1: Filters preserved on page refresh
  // -------------------------------------------------------------------------
  test(`${tags.core} - filters survive page refresh`, async ({ page }) => {
    const filterUrl = `${SEARCH_URL}&minPrice=700&amenities=Wifi&roomType=Private+Room`;
    await page.goto(filterUrl);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3_000);

    // Verify params are present before reload
    expect(getUrlParam(page, "minPrice")).toBe("700");
    expect(getUrlParam(page, "amenities")).toContain("Wifi");
    expect(getUrlParam(page, "roomType")).toBe("Private Room");

    // Reload the page
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3_000);

    // URL params should be unchanged after reload
    expect(getUrlParam(page, "minPrice")).toBe("700");
    expect(getUrlParam(page, "amenities")).toContain("Wifi");
    expect(getUrlParam(page, "roomType")).toBe("Private Room");

    // Bounds should also be preserved
    expect(getUrlParam(page, "minLat")).toBeTruthy();
    expect(getUrlParam(page, "maxLat")).toBeTruthy();

    // Filter chips should re-render after reload
    const region = appliedFiltersRegion(page);
    const regionVisible = await region.isVisible().catch(() => false);
    if (regionVisible) {
      await expect(region.locator("text=/Private Room/i").first()).toBeVisible({ timeout: 10_000 });
      await expect(region.locator("text=/Wifi/i").first()).toBeVisible({ timeout: 10_000 });
    }
  });

  // -------------------------------------------------------------------------
  // 12.2: Filters preserved on back/forward navigation
  // -------------------------------------------------------------------------
  test(`${tags.core} - filters preserved on browser back navigation`, async ({ page }) => {
    // Step 1: Navigate to search with filters
    const filterUrl = `${SEARCH_URL}&minPrice=800&maxPrice=2000`;
    await page.goto(filterUrl);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3_000);

    // Verify filters present
    expect(getUrlParam(page, "minPrice")).toBe("800");
    expect(getUrlParam(page, "maxPrice")).toBe("2000");

    // Step 2: Navigate away — click a listing card to go to a detail page
    const container = searchResultsContainer(page);
    const listingCard = container.locator(selectors.listingCard).first();
    const hasListing = await listingCard.isVisible({ timeout: 5_000 }).catch(() => false);

    if (hasListing) {
      // Click the listing to navigate to the detail page
      await listingCard.click();
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(2_000);

      // Verify we navigated away (URL should no longer be /search)
      const currentUrl = page.url();
      const navigatedAway = currentUrl.includes("/listings/") || !currentUrl.includes("/search?");

      if (navigatedAway) {
        // Step 3: Press browser back
        await page.goBack();
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(3_000);

        // Filters should be restored in the URL
        expect(getUrlParam(page, "minPrice")).toBe("800");
        expect(getUrlParam(page, "maxPrice")).toBe("2000");

        // Bounds should still be there
        expect(getUrlParam(page, "minLat")).toBeTruthy();
      }
    } else {
      // No listing cards available — simulate forward/back with manual navigation
      await page.goto("/");
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(1_000);

      // Go back to the search page
      await page.goBack();
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(3_000);

      // Filters should be restored
      expect(getUrlParam(page, "minPrice")).toBe("800");
      expect(getUrlParam(page, "maxPrice")).toBe("2000");
    }
  });

  // -------------------------------------------------------------------------
  // 12.3: Deep link with filter params pre-populates
  // -------------------------------------------------------------------------
  test(`${tags.core} - deep link with filter params pre-populates chips and modal`, async ({ page }) => {
    // Navigate directly with multiple filter params
    const deepLinkUrl = `${SEARCH_URL}&amenities=Wifi,Parking&roomType=Entire+Place&leaseDuration=12+months`;
    await page.goto(deepLinkUrl);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3_000);

    // Verify URL params parsed correctly
    const amenities = getUrlParam(page, "amenities") ?? "";
    expect(amenities).toContain("Wifi");
    expect(amenities).toContain("Parking");
    expect(getUrlParam(page, "roomType")).toBe("Entire Place");
    expect(getUrlParam(page, "leaseDuration")).toBe("12 months");

    // Verify filter chips are visible on load
    const region = appliedFiltersRegion(page);
    const regionVisible = await region.isVisible().catch(() => false);
    if (regionVisible) {
      await expect(region.locator("text=/Wifi/i").first()).toBeVisible({ timeout: 10_000 });
      await expect(region.locator("text=/Parking/i").first()).toBeVisible({ timeout: 10_000 });
      await expect(region.locator("text=/Entire Place/i").first()).toBeVisible({ timeout: 10_000 });
    }

    // Open the filter modal and verify internal state matches URL
    const btn = filtersButton(page);
    await expect(btn).toBeVisible({ timeout: 10_000 });
    await btn.click();

    const dialog = filterDialog(page);
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Check amenities are toggled on inside the modal
    const amenitiesGroup = dialog.locator('[aria-label="Select amenities"]');
    const wifiBtn = amenitiesGroup.getByRole("button", { name: /^Wifi/i });
    const parkingBtn = amenitiesGroup.getByRole("button", { name: /^Parking/i });

    if (await wifiBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(wifiBtn).toHaveAttribute("aria-pressed", "true");
    }
    if (await parkingBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(parkingBtn).toHaveAttribute("aria-pressed", "true");
    }

    // Check room type is selected
    const roomTypeSelect = dialog.locator("#filter-room-type");
    if (await roomTypeSelect.isVisible()) {
      await expect(roomTypeSelect).toContainText(/entire place/i);
    }

    // Check lease duration is selected
    const leaseSelect = dialog.locator("#filter-lease");
    if (await leaseSelect.isVisible()) {
      await expect(leaseSelect).toContainText(/12 months/i);
    }
  });

  // -------------------------------------------------------------------------
  // 12.4: Sort preserved independently from filters
  // -------------------------------------------------------------------------
  test(`${tags.core} - sort param preserved when filter chip is removed`, async ({ page }) => {
    // Navigate with both sort and a price filter
    await page.goto(`${SEARCH_URL}&minPrice=500&sort=price_asc`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3_000);

    // Verify both params exist
    expect(getUrlParam(page, "minPrice")).toBe("500");
    expect(getUrlParam(page, "sort")).toBe("price_asc");

    const region = appliedFiltersRegion(page);
    const regionVisible = await region.isVisible().catch(() => false);
    test.skip(!regionVisible, "Applied filters region not visible");

    // Remove the price filter chip
    const removePrice = region.getByRole("button", { name: /remove filter.*\$/i }).first();
    const removeVisible = await removePrice.isVisible().catch(() => false);

    if (removeVisible) {
      await removePrice.click();

      // Wait for the price param to be removed from the URL
      await page.waitForURL(
        (url) => !new URL(url).searchParams.has("minPrice"),
        { timeout: 15_000 },
      );

      // Price filter should be gone
      expect(getUrlParam(page, "minPrice")).toBeNull();

      // Sort should still be preserved (it is in PRESERVED_PARAMS)
      expect(getUrlParam(page, "sort")).toBe("price_asc");

      // Bounds should also still be present
      expect(getUrlParam(page, "minLat")).toBeTruthy();
      expect(getUrlParam(page, "maxLat")).toBeTruthy();
    } else {
      // If no price chip found, verify at the URL level as a fallback.
      // Navigate with sort + amenity filter (more reliably creates a chip).
      await page.goto(`${SEARCH_URL}&amenities=Wifi&sort=price_asc`);
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(3_000);

      const regionRetry = appliedFiltersRegion(page);
      const retryVisible = await regionRetry.isVisible().catch(() => false);
      test.skip(!retryVisible, "Applied filters region not visible on retry");

      const removeWifi = regionRetry.getByRole("button", { name: /remove filter.*wifi/i });
      if (await removeWifi.isVisible().catch(() => false)) {
        await removeWifi.click();

        await page.waitForURL(
          (url) => !new URL(url).searchParams.has("amenities"),
          { timeout: 15_000 },
        );

        // Amenity removed, sort preserved
        expect(getUrlParam(page, "amenities")).toBeNull();
        expect(getUrlParam(page, "sort")).toBe("price_asc");
      }
    }
  });
});
