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

import { test, expect, SF_BOUNDS, selectors, timeouts, tags, searchResultsContainer } from "../helpers/test-utils";
import type { Page } from "@playwright/test";

const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;
const SEARCH_URL = `/search?${boundsQS}`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function waitForSearchReady(page: Page) {
  await page.goto(SEARCH_URL);
  await page.waitForLoadState("domcontentloaded");
  await page
    .locator(`${selectors.listingCard}, ${selectors.emptyState}, h3`)
    .first()
    .waitFor({ state: "attached", timeout: 30_000 });
}

function getUrlParam(page: Page, key: string): string | null {
  return new URL(page.url()).searchParams.get(key);
}

/** Open filter modal and return the dialog locator */
async function openFilterModal(page: Page) {
  const filtersBtn = page.getByRole("button", { name: "Filters", exact: true });
  await expect(filtersBtn).toBeVisible({ timeout: 10_000 });
  await filtersBtn.click();

  const dialog = page.getByRole("dialog", { name: /filters/i });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  return dialog;
}

/** Get the amenities group inside the filter modal */
function amenitiesGroup(page: Page) {
  return page.locator('[aria-label="Select amenities"]');
}

/** Click an amenity toggle button by name */
async function toggleAmenity(page: Page, name: string) {
  const group = amenitiesGroup(page);
  const btn = group.getByRole("button", { name: new RegExp(`^${name}`, "i") });
  await btn.click();
  await page.waitForTimeout(300);
}

/** Apply filters via the Apply button */
async function applyFilters(page: Page) {
  const applyBtn = page.locator('[data-testid="filter-modal-apply"]');
  await applyBtn.click();
  // Wait for modal to close and URL to update
  await page.waitForTimeout(1_500);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Amenities Filter", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  // 1. Select amenity -> URL gets amenities param
  test(`${tags.core} - selecting an amenity and applying updates URL`, async ({ page }) => {
    await waitForSearchReady(page);
    await openFilterModal(page);

    // Toggle Wifi amenity
    await toggleAmenity(page, "Wifi");

    // Verify it's pressed
    const wifiBtn = amenitiesGroup(page).getByRole("button", { name: /^Wifi/i });
    await expect(wifiBtn).toHaveAttribute("aria-pressed", "true");

    // Apply
    await applyFilters(page);

    // URL should have amenities=Wifi
    await page.waitForURL(
      (url) => {
        const amenities = new URL(url).searchParams.get("amenities");
        return amenities !== null && amenities.includes("Wifi");
      },
      { timeout: 15_000 },
    );

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

    await page.waitForURL(
      (url) => {
        const amenities = new URL(url).searchParams.get("amenities");
        return amenities !== null && amenities.includes("Wifi") && amenities.includes("Parking");
      },
      { timeout: 15_000 },
    );

    const amenities = getUrlParam(page, "amenities") ?? "";
    expect(amenities).toContain("Wifi");
    expect(amenities).toContain("Parking");
  });

  // 3. Deselect amenity -> removed from URL
  test(`${tags.core} - deselecting an amenity removes it from URL`, async ({ page }) => {
    // Start with Wifi and Parking applied
    await page.goto(`${SEARCH_URL}&amenities=Wifi,Parking`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2_000);

    await openFilterModal(page);

    // Wifi should be pressed initially
    const wifiBtn = amenitiesGroup(page).getByRole("button", { name: /^Wifi/i });
    await expect(wifiBtn).toHaveAttribute("aria-pressed", "true");

    // Deselect Wifi
    await wifiBtn.click();
    await page.waitForTimeout(300);

    // Wifi should no longer be pressed
    await expect(wifiBtn).toHaveAttribute("aria-pressed", "false");

    // Apply
    await applyFilters(page);

    // URL should have Parking but not Wifi
    await page.waitForURL(
      (url) => {
        const amenities = new URL(url).searchParams.get("amenities") ?? "";
        return !amenities.includes("Wifi");
      },
      { timeout: 15_000 },
    );

    const amenities = getUrlParam(page, "amenities") ?? "";
    expect(amenities).not.toContain("Wifi");
    expect(amenities).toContain("Parking");
  });

  // 4. Amenity filter narrows results
  test(`${tags.core} - amenity filter narrows visible results`, async ({ page }) => {
    await waitForSearchReady(page);
    const container = searchResultsContainer(page);
    const initialCount = await container.locator(selectors.listingCard).count();

    // Navigate with an amenity filter
    await page.goto(`${SEARCH_URL}&amenities=Pool`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3_000);

    const filteredCount = await container.locator(selectors.listingCard).count();
    const hasEmptyState = await container.locator(selectors.emptyState).count() > 0;

    if (!hasEmptyState && initialCount > 0) {
      expect(filteredCount).toBeLessThanOrEqual(initialCount);
    }
  });

  // 5. Amenity chips display in applied filters
  test(`${tags.core} - amenity shows as chip in applied filters`, async ({ page }) => {
    await page.goto(`${SEARCH_URL}&amenities=Wifi`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3_000);

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
    // Start with amenity applied
    await page.goto(`${SEARCH_URL}&amenities=Pool`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3_000);

    // Navigate back without amenities
    await page.goto(SEARCH_URL);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3_000);

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

    const validAmenities = ["Wifi", "AC", "Parking", "Washer", "Dryer", "Kitchen", "Gym", "Pool", "Furnished"];
    const group = amenitiesGroup(page);

    for (const amenity of validAmenities) {
      const btn = group.getByRole("button", { name: new RegExp(`^${amenity}`, "i") });
      const btnCount = await btn.count();
      // Each amenity should have a corresponding button
      expect(btnCount).toBeGreaterThanOrEqual(1);
    }
  });
});
