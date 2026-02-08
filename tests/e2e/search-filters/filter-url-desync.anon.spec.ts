/**
 * Filter URL-UI Desync E2E Tests (P0)
 *
 * Validates that URL state and UI state remain synchronized through
 * browser navigation (back/forward), manual URL edits, rapid interactions,
 * and page refreshes. Tests the useBatchedFilters hook's sync mechanism.
 */

import {
  test,
  expect,
  tags,
  selectors,
  searchResultsContainer,
  waitForSearchReady,
  openFilterModal,
  applyFilters,
  closeFilterModal,
  appliedFiltersRegion,
  buildSearchUrl,
  waitForUrlParam,
  waitForUrlStable,
  rapidClick,
} from "../helpers";

test.describe("Filter URL-UI Desync", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test(`${tags.filter} Browser Back after applying filter via modal reverts URL and UI state`, async ({
    page,
  }) => {
    test.slow(); // multiple navigations on WSL2/NTFS
    // Navigate and wait for search to be ready
    await waitForSearchReady(page);

    // Open filter modal and toggle Wifi amenity
    await openFilterModal(page);
    const amenitiesGroup = page.locator('[aria-label="Select amenities"]');
    const wifiButton = amenitiesGroup.getByRole("button", { name: /^Wifi/i });
    await wifiButton.click();
    await applyFilters(page);

    // Wait for URL to contain amenities=Wifi
    await waitForUrlParam(page, "amenities", "Wifi");

    // Verify Wifi chip is visible in applied filters region
    const filtersRegion = appliedFiltersRegion(page);
    await expect(filtersRegion.getByRole("button", { name: /Wifi/i })).toBeVisible();

    // Click browser Back
    await page.goBack();

    // Wait for URL to NOT contain amenities param
    await page.waitForURL(
      (url) => !new URL(url).searchParams.has("amenities"),
      { timeout: 15_000 }
    );

    // Verify URL no longer has amenities param
    const currentUrl = new URL(page.url());
    expect(currentUrl.searchParams.has("amenities")).toBe(false);

    // Verify applied filters region is either not visible or has no chips
    // Use auto-retry since DOM may still be updating after goBack
    await expect(async () => {
      const isRegionVisible = await filtersRegion.isVisible();
      if (isRegionVisible) {
        const chipCount = await filtersRegion.getByRole("button").count();
        expect(chipCount).toBe(0);
      }
    }).toPass({ timeout: 10_000 });

    // Verify if we reopen the filter modal, Wifi should NOT be pressed
    await openFilterModal(page);
    const amenitiesGroupAfter = page.locator('[aria-label="Select amenities"]');
    const wifiButtonAfter = amenitiesGroupAfter.getByRole("button", { name: /^Wifi/i });
    await expect(wifiButtonAfter).toHaveAttribute("aria-pressed", "false");
    await closeFilterModal(page);
  });

  test(`${tags.filter} Browser Forward after Back restores URL and UI state`, async ({
    page,
  }) => {
    test.slow(); // multiple navigations on WSL2/NTFS
    // Navigate and wait for search to be ready
    await waitForSearchReady(page);

    // Apply Wifi filter via modal
    await openFilterModal(page);
    const amenitiesGroup = page.locator('[aria-label="Select amenities"]');
    const wifiButton = amenitiesGroup.getByRole("button", { name: /^Wifi/i });
    await wifiButton.click();
    await applyFilters(page);

    // Wait for amenities=Wifi in URL
    await waitForUrlParam(page, "amenities", "Wifi");

    // Go back - wait for amenities gone
    await page.goBack();
    await page.waitForURL(
      (url) => !new URL(url).searchParams.has("amenities"),
      { timeout: 15_000 }
    );

    // Wait for page to fully settle after goBack before going forward.
    // Without this, Next.js router re-render may clear forward history.
    await page.waitForLoadState("networkidle").catch(() => {});
    await waitForUrlStable(page);

    // Go forward - wait for amenities=Wifi to return
    await page.goForward();
    await waitForUrlParam(page, "amenities", "Wifi", 30_000);

    // Verify URL has amenities=Wifi
    const currentUrl = new URL(page.url());
    expect(currentUrl.searchParams.get("amenities")).toContain("Wifi");

    // Verify Wifi chip is visible in applied filters
    const filtersRegion = appliedFiltersRegion(page);
    await expect(filtersRegion.getByRole("button", { name: /Wifi/i })).toBeVisible({ timeout: 15_000 });
  });

  test(`${tags.filter} Manual URL edit with filter params syncs UI state`, async ({
    page,
  }) => {
    // Navigate directly to URL with multiple filter params
    const urlWithFilters = buildSearchUrl({
      amenities: "Wifi,Parking",
      roomType: "Private Room",
    });
    await page.goto(urlWithFilters);

    // Wait for page ready
    await page
      .locator(`${selectors.listingCard}, ${selectors.emptyState}, h3`)
      .first()
      .waitFor({ state: "attached", timeout: 30_000 });

    // Verify applied filters region shows chips for all three filters
    const filtersRegion = appliedFiltersRegion(page);
    await expect(filtersRegion.getByRole("button", { name: /Wifi/i })).toBeVisible();
    await expect(filtersRegion.getByRole("button", { name: /Parking/i })).toBeVisible();
    await expect(
      filtersRegion.getByRole("button", { name: /Private Room/i })
    ).toBeVisible();

    // Open filter modal and verify pressed states
    await openFilterModal(page);

    // Verify Wifi and Parking buttons have aria-pressed="true"
    const amenitiesGroup = page.locator('[aria-label="Select amenities"]');
    const wifiButton = amenitiesGroup.getByRole("button", { name: /^Wifi/i });
    const parkingButton = amenitiesGroup.getByRole("button", { name: /^Parking/i });
    await expect(wifiButton).toHaveAttribute("aria-pressed", "true");
    await expect(parkingButton).toHaveAttribute("aria-pressed", "true");

    // Close modal without applying
    await closeFilterModal(page);
  });

  test(`${tags.filter} Rapid category bar toggling maintains URL consistency`, async ({
    page,
  }) => {
    // Navigate and wait for search to be ready
    await waitForSearchReady(page);

    // Locate category bar buttons
    const categoryBarLinks = page.locator(
      '[data-testid="category-bar"] a, [role="tablist"] a'
    );
    const firstCategory = categoryBarLinks.first();

    // Check if category bar is visible
    const isVisible = await firstCategory.isVisible().catch(() => false);

    if (!isVisible) {
      test.skip(true, "Category bar not visible");
      return;
    }

    // Rapid click the first category link 3 times
    await rapidClick(firstCategory, 3, 100);

    // Wait for URL to stabilize
    await waitForUrlStable(page);

    // Verify page displays results or empty state (no error)
    const hasResults = await searchResultsContainer(page)
      .locator(selectors.listingCard)
      .first()
      .isVisible()
      .catch(() => false);
    const hasEmptyState = await page
      .locator(selectors.emptyState)
      .isVisible()
      .catch(() => false);

    expect(hasResults || hasEmptyState).toBe(true);

    // Verify no error state
    const hasError = await page
      .locator('text=/error|something went wrong/i')
      .isVisible()
      .catch(() => false);
    expect(hasError).toBe(false);
  });

  test(`${tags.filter} Page refresh mid-filter-change preserves committed state only`, async ({
    page,
  }) => {
    test.slow(); // page.goto + page.reload on WSL2/NTFS
    // Navigate to URL with Wifi amenity
    const urlWithWifi = buildSearchUrl({ amenities: "Wifi" });
    await page.goto(urlWithWifi);

    // Wait for page ready
    await page
      .locator(`${selectors.listingCard}, ${selectors.emptyState}, h3`)
      .first()
      .waitFor({ state: "attached", timeout: 30_000 });

    // Open filter modal
    await openFilterModal(page);

    // Toggle Parking amenity (this is PENDING state, not committed)
    const amenitiesGroup = page.locator('[aria-label="Select amenities"]');
    const parkingButton = amenitiesGroup.getByRole("button", { name: /^Parking/i });
    await parkingButton.click();

    // Do NOT click Apply - instead refresh the page
    await page.reload();

    // Wait for page ready
    await page
      .locator(`${selectors.listingCard}, ${selectors.emptyState}, h3`)
      .first()
      .waitFor({ state: "attached", timeout: 30_000 });
    await page.waitForLoadState("networkidle").catch(() => {});

    // Verify URL still has amenities=Wifi (committed state preserved)
    const currentUrl = new URL(page.url());
    expect(currentUrl.searchParams.get("amenities")).toBe("Wifi");

    // Verify URL does NOT have Parking (pending was discarded)
    expect(currentUrl.searchParams.get("amenities")).not.toContain("Parking");

    // Open filter modal again
    await openFilterModal(page);

    // Verify Wifi should be pressed, Parking should NOT be pressed
    const amenitiesGroupAfter = page.locator('[aria-label="Select amenities"]');
    const wifiButtonAfter = amenitiesGroupAfter.getByRole("button", { name: /^Wifi/i });
    const parkingButtonAfter = amenitiesGroupAfter.getByRole("button", {
      name: /^Parking/i,
    });

    await expect(wifiButtonAfter).toHaveAttribute("aria-pressed", "true");
    await expect(parkingButtonAfter).toHaveAttribute("aria-pressed", "false");

    await closeFilterModal(page);
  });

  test(`${tags.filter} Multiple filter changes push correct history entries`, async ({
    page,
  }) => {
    test.slow(); // 3+ navigations on WSL2/NTFS
    // Navigate and wait for search to be ready
    await waitForSearchReady(page);

    // Apply filter 1: navigate to URL with Wifi
    const urlWithWifi = buildSearchUrl({ amenities: "Wifi" });
    await page.goto(urlWithWifi);
    await waitForUrlParam(page, "amenities", "Wifi");

    // Apply filter 2: navigate to URL with Wifi + Private Room
    const urlWithBoth = buildSearchUrl({
      amenities: "Wifi",
      roomType: "Private Room",
    });
    await page.goto(urlWithBoth);
    await waitForUrlParam(page, "roomType", "Private Room");

    // Go back once - should return to amenities=Wifi only
    await page.goBack();
    await page.waitForURL(
      (url) => {
        const params = new URL(url).searchParams;
        return params.has("amenities") && !params.has("roomType");
      },
      { timeout: 15_000 }
    );

    // Verify URL has amenities=Wifi but no roomType
    let currentUrl = new URL(page.url());
    expect(currentUrl.searchParams.get("amenities")).toContain("Wifi");
    expect(currentUrl.searchParams.has("roomType")).toBe(false);

    // Go back again - should return to no filters
    await page.goBack();
    await page.waitForURL(
      (url) => {
        const params = new URL(url).searchParams;
        return !params.has("amenities") && !params.has("roomType");
      },
      { timeout: 15_000 }
    );

    // Verify URL has neither amenities nor roomType
    currentUrl = new URL(page.url());
    expect(currentUrl.searchParams.has("amenities")).toBe(false);
    expect(currentUrl.searchParams.has("roomType")).toBe(false);
  });
});
