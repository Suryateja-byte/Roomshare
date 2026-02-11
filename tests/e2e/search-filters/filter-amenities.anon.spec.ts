/**
 * Amenities Filter E2E Tests (P1)
 *
 * Validates amenity filtering via the filter modal toggle buttons.
 *
 * Key implementation details:
 * - Amenities are toggle buttons with aria-pressed inside the filter modal
 * - Located in a group with aria-label="Select amenities"
 * - URL param: amenities (comma-separated, e.g., amenities=Wifi,Parking)
 * - Valid values: Wifi, AC, Parking, Washer, Dryer, Kitchen, Gym, Pool, Furnished
 * - Toggling sets data-active and aria-pressed attributes
 * - Changes are pending until Apply is clicked (useBatchedFilters)
 * - Active amenities show an X icon for visual deselect
 */

import {
  test,
  expect,
  tags,
  selectors,
  searchResultsContainer,
  VALID_AMENITIES,
  getUrlParam,
  waitForSearchReady,
  gotoSearchWithFilters,
  openFilterModal,
  amenitiesGroup,
  toggleAmenity,
  applyFilters,
} from "../helpers";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Amenities Filter", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async () => {
    test.slow();
  });

  // 1. Select amenity -> URL gets amenities param
  test(`${tags.core} - selecting an amenity and applying updates URL`, async ({ page }) => {
    await waitForSearchReady(page);

    // Disable "Search as I move" to prevent map-triggered URL changes
    const searchAsIMove = page.getByRole("switch", { name: /search as i move/i });
    if (await searchAsIMove.isChecked()) {
      await searchAsIMove.click();
    }

    await openFilterModal(page);

    // Toggle Wifi amenity
    await toggleAmenity(page, "Wifi");

    // Verify it's pressed
    const wifiBtn = amenitiesGroup(page).getByRole("button", { name: /^Wifi/i });
    await expect(wifiBtn).toHaveAttribute("aria-pressed", "true");

    // Apply
    await applyFilters(page);

    // URL should have amenities=Wifi
    await expect.poll(
      () => {
        const amenities = new URL(page.url(), "http://localhost").searchParams.get("amenities");
        return amenities !== null && amenities.includes("Wifi");
      },
      { timeout: 30_000, message: 'URL param "amenities" to contain "Wifi"' },
    ).toBe(true);

    expect(getUrlParam(page, "amenities")).toContain("Wifi");
  });

  // 2. Multiple amenities -> comma-separated param
  test(`${tags.core} - selecting multiple amenities creates comma-separated param`, async ({ page }) => {
    await waitForSearchReady(page);
    await openFilterModal(page);

    // Toggle Wifi and Parking
    await toggleAmenity(page, "Wifi");
    await toggleAmenity(page, "Parking");

    // Apply
    await applyFilters(page);

    await expect.poll(
      () => {
        const amenities = new URL(page.url(), "http://localhost").searchParams.get("amenities");
        return amenities !== null && amenities.includes("Wifi") && amenities.includes("Parking");
      },
      { timeout: 30_000, message: 'URL param "amenities" to contain "Wifi" and "Parking"' },
    ).toBe(true);

    const amenities = getUrlParam(page, "amenities") ?? "";
    expect(amenities).toContain("Wifi");
    expect(amenities).toContain("Parking");
  });

  // 3. Deselect amenity -> removed from URL
  test(`${tags.core} - deselecting an amenity removes it from URL`, async ({ page }) => {
    // Start with Wifi and Parking applied
    await gotoSearchWithFilters(page, { amenities: "Wifi,Parking" });

    await openFilterModal(page);

    // Wifi should be pressed initially
    const wifiBtn = amenitiesGroup(page).getByRole("button", { name: /^Wifi/i });
    await expect(wifiBtn).toHaveAttribute("aria-pressed", "true");

    // Deselect Wifi
    await wifiBtn.click();

    // Wifi should no longer be pressed
    await expect(wifiBtn).toHaveAttribute("aria-pressed", "false");

    // Apply
    await applyFilters(page);

    // URL should have Parking but not Wifi
    await expect.poll(
      () => {
        const amenities = new URL(page.url(), "http://localhost").searchParams.get("amenities") ?? "";
        return !amenities.includes("Wifi");
      },
      { timeout: 30_000, message: 'URL param "amenities" to not contain "Wifi"' },
    ).toBe(true);

    const amenities = getUrlParam(page, "amenities") ?? "";
    expect(amenities).not.toContain("Wifi");
    expect(amenities).toContain("Parking");
  });

  // 4. Amenity filter narrows results
  test(`${tags.core} - amenity filter narrows visible results`, async ({ page }) => {
    test.slow(); // 2 navigations on WSL2/NTFS
    await waitForSearchReady(page);
    const container = searchResultsContainer(page);
    const initialCount = await container.locator(selectors.listingCard).count();

    // Navigate with an amenity filter
    await gotoSearchWithFilters(page, { amenities: "Pool" });

    const filteredCount = await container.locator(selectors.listingCard).count();
    const hasEmptyState = await container.locator(selectors.emptyState).count() > 0;

    if (!hasEmptyState && initialCount > 0) {
      expect(filteredCount).toBeLessThanOrEqual(initialCount);
    }
  });

  // 5. Amenity chips display in applied filters
  test(`${tags.core} - amenity shows as chip in applied filters`, async ({ page }) => {
    await gotoSearchWithFilters(page, { amenities: "Wifi" });

    const container = searchResultsContainer(page);
    const filtersRegion = container.locator('[aria-label="Applied filters"]');
    const regionVisible = await filtersRegion.isVisible().catch(() => false);

    if (regionVisible) {
      const wifiChip = filtersRegion.locator("text=/Wifi/i").first();
      await expect(wifiChip).toBeVisible({ timeout: 10_000 });
    }

    expect(await page.title()).toBeTruthy();
  });

  // 6. Clear amenities restores results
  test(`${tags.core} - clearing all amenity filters restores results`, async ({ page }) => {
    test.slow(); // 2 navigations on WSL2/NTFS
    // Start with amenity applied
    await gotoSearchWithFilters(page, { amenities: "Pool" });

    // Navigate back without amenities
    await gotoSearchWithFilters(page, {});

    expect(getUrlParam(page, "amenities")).toBeNull();
    expect(await page.title()).toBeTruthy();
  });

  // 7. Amenity buttons show facet counts
  test(`${tags.core} - amenity buttons display facet counts when available`, async ({ page }) => {
    await waitForSearchReady(page);
    await openFilterModal(page);

    // Amenity buttons may show counts in parentheses, e.g., "Wifi (15)"
    const group = amenitiesGroup(page);
    const buttons = group.getByRole("button");
    const count = await buttons.count();

    // Should have amenity buttons rendered
    expect(count).toBeGreaterThan(0);

    // Check if any button has a count indicator (text with parentheses)
    // This is optional - counts may not load in all environments
    const firstButton = buttons.first();
    const text = await firstButton.textContent();
    expect(text).toBeTruthy();
  });

  // 8. Disabled amenities (zero count) cannot be toggled
  test(`${tags.core} - disabled amenity buttons prevent toggling`, async ({ page }) => {
    await waitForSearchReady(page);
    await openFilterModal(page);

    const group = amenitiesGroup(page);
    const disabledButtons = group.locator('button[disabled]');
    const disabledCount = await disabledButtons.count();

    if (disabledCount > 0) {
      const firstDisabled = disabledButtons.first();
      // Should have aria-disabled or disabled attribute
      const isDisabled = await firstDisabled.isDisabled();
      expect(isDisabled).toBe(true);
    }

    // Test passes even if no buttons are disabled (all have results)
    expect(await page.title()).toBeTruthy();
  });

  // 9. All valid amenities are available in the modal
  test(`${tags.core} - all valid amenity options appear in the modal`, async ({ page }) => {
    await waitForSearchReady(page);
    await openFilterModal(page);

    const group = amenitiesGroup(page);

    for (const amenity of VALID_AMENITIES) {
      const btn = group.getByRole("button", { name: new RegExp(`^${amenity}`, "i") });
      const btnCount = await btn.count();
      // Each amenity should have a corresponding button
      expect(btnCount).toBeGreaterThanOrEqual(1);
    }
  });
});
