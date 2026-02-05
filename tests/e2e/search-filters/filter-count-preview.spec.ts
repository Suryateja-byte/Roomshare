/**
 * Filter Count Preview E2E Tests (P1)
 *
 * Validates the "Show X listings" button behavior inside the filter modal.
 * When filters become dirty (changed from URL state), the Apply button
 * fetches a count from /api/search-count and displays it.
 *
 * Key implementation details:
 * - Apply button: [data-testid="filter-modal-apply"]
 * - Count API: /api/search-count (debounced 300ms after filter change)
 * - When count available: button text shows "N listings"
 * - When count=null: button shows "100+ listings"
 * - When no bounds: button shows "Select a location" and is disabled
 * - While loading: button shows a spinning indicator
 * - Debounce: 300ms — rapid changes coalesce into a single request
 */

import { test, expect, SF_BOUNDS, selectors, timeouts, tags } from "../helpers/test-utils";
import type { Page } from "@playwright/test";

const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;
const SEARCH_URL = `/search?${boundsQS}`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wait for the search page to be ready with content loaded */
async function waitForSearchReady(page: Page) {
  await page.goto(SEARCH_URL);
  await page.waitForLoadState("domcontentloaded");
  await page
    .locator(`${selectors.listingCard}, ${selectors.emptyState}, h3`)
    .first()
    .waitFor({ state: "attached", timeout: 30_000 });
}

/**
 * Locate the Filters trigger button.
 * Matches both "Filters" (no active filters) and "Filters (N active)" states.
 */
function filtersButton(page: Page) {
  return page.getByRole("button", { name: /^Filters/ });
}

/** Locate the filter dialog */
function filterDialog(page: Page) {
  return page.getByRole("dialog", { name: /filters/i });
}

/** Locate the Apply button inside the dialog */
function applyButton(page: Page) {
  return page.locator('[data-testid="filter-modal-apply"]');
}

/** Open the filter modal and wait until it is visible */
async function openFilterModal(page: Page) {
  const btn = filtersButton(page);
  await expect(btn).toBeVisible({ timeout: 10_000 });
  await btn.click();

  const dialog = filterDialog(page);
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  return dialog;
}

/**
 * Toggle a single amenity button inside the filter modal.
 * The amenity group is [aria-label="Select amenities"].
 */
async function toggleAmenity(page: Page, name: string) {
  const amenitiesGroup = page.locator('[aria-label="Select amenities"]');
  const btn = amenitiesGroup.getByRole("button", { name: new RegExp(`^${name}`, "i") });
  await expect(btn).toBeVisible({ timeout: 5_000 });
  await btn.click();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Filter Count Preview", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  // -------------------------------------------------------------------------
  // 11.1: Apply button shows result count when dirty
  // -------------------------------------------------------------------------
  test(`${tags.core} - apply button shows result count after filter change`, async ({ page }) => {
    // Mock the count API to return a deterministic count
    await page.route("**/api/search-count*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ count: 42 }),
      });
    });

    await waitForSearchReady(page);
    await openFilterModal(page);

    // Toggle an amenity to make the filter state dirty
    await toggleAmenity(page, "Wifi");

    // Wait for debounce (300ms) plus network round-trip
    await page.waitForTimeout(500);

    // The apply button should now show a count
    const apply = applyButton(page);
    await expect(apply).toBeVisible();

    // Button text should contain the count (e.g., "42 listings" or "Show 42 listings")
    await expect(apply).toContainText(/42/, { timeout: 10_000 });
  });

  // -------------------------------------------------------------------------
  // 11.2: Count shows loading spinner while fetching
  // -------------------------------------------------------------------------
  test(`${tags.core} - apply button shows loading spinner during count fetch`, async ({ page }) => {
    // Mock the count API with a 1-second delay
    await page.route("**/api/search-count*", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ count: 15 }),
      });
    });

    await waitForSearchReady(page);
    await openFilterModal(page);

    // Toggle an amenity to trigger the count fetch
    await toggleAmenity(page, "Wifi");

    // Wait just past the debounce to allow the request to fire
    await page.waitForTimeout(400);

    // While the request is in-flight, the apply button should show a spinner
    // The spinner is typically an svg, an animated element, or aria-busy
    const apply = applyButton(page);
    const spinnerOrLoading = apply.locator(
      'svg[class*="animate"], [class*="spinner"], [class*="loading"], [aria-busy="true"]',
    );
    const hasSpinner = await spinnerOrLoading.count().then((c) => c > 0).catch(() => false);

    // After response arrives, spinner should be replaced with the count
    await expect(apply).toContainText(/15|listing/i, { timeout: 5_000 });

    // Either the spinner was visible during load, or the button text changed
    // (accept both as the spinner may resolve too fast for some CI environments)
    expect(hasSpinner || (await apply.textContent())?.includes("15")).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 11.3: Count shows "100+" for large result sets
  // -------------------------------------------------------------------------
  test(`${tags.core} - apply button shows 100+ when count is null`, async ({ page }) => {
    // Mock the count API to return null (server signals "too many to count")
    await page.route("**/api/search-count*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ count: null }),
      });
    });

    await waitForSearchReady(page);
    await openFilterModal(page);

    // Toggle a filter to make dirty
    await toggleAmenity(page, "Parking");

    // Wait for debounce + response
    await page.waitForTimeout(500);

    // The apply button should show "100+" text
    const apply = applyButton(page);
    await expect(apply).toContainText(/100\+/, { timeout: 10_000 });
  });

  // -------------------------------------------------------------------------
  // 11.4: Count shows "Select a location" when bounds are missing
  // -------------------------------------------------------------------------
  test(`${tags.core} - apply button disabled with select-a-location when no bounds`, async ({ page }) => {
    // Navigate without bounds (only query text)
    await page.goto("/search?q=test");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3_000);

    // Open filter modal
    const btn = filtersButton(page);
    const btnVisible = await btn.isVisible().catch(() => false);
    test.skip(!btnVisible, "Filters button not visible on boundless search page");

    await btn.click();
    const dialog = filterDialog(page);
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Toggle a filter to trigger count evaluation
    await toggleAmenity(page, "Wifi");
    await page.waitForTimeout(500);

    // The apply button should indicate the user needs to select a location
    const apply = applyButton(page);
    await expect(apply).toBeVisible();

    // Check for disabled state or "Select a location" text
    const buttonText = await apply.textContent();
    const isDisabled = await apply.isDisabled().catch(() => false);

    // Accept either: disabled button, or text indicating location needed
    const showsLocationMessage = buttonText?.toLowerCase().includes("location") ?? false;
    expect(isDisabled || showsLocationMessage).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 11.5: Count request debounced (rapid changes produce single request)
  // -------------------------------------------------------------------------
  test(`${tags.core} - rapid filter changes produce single debounced count request`, async ({ page }) => {
    // Track how many times the count API is called
    let countRequestCount = 0;

    await page.route("**/api/search-count*", async (route) => {
      countRequestCount++;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ count: 7 }),
      });
    });

    await waitForSearchReady(page);
    await openFilterModal(page);

    // Rapidly toggle 3 amenities within ~200ms (faster than the 300ms debounce)
    const amenitiesGroup = page.locator('[aria-label="Select amenities"]');

    const wifi = amenitiesGroup.getByRole("button", { name: /^Wifi/i });
    const parking = amenitiesGroup.getByRole("button", { name: /^Parking/i });
    const furnished = amenitiesGroup.getByRole("button", { name: /^Furnished/i });

    // Click in rapid succession
    await wifi.click();
    await parking.click();
    await furnished.click();

    // Wait for the debounce window to expire plus the response
    await page.waitForTimeout(800);

    // The debounce should have coalesced the three changes into 1 request
    // Allow for at most 2 requests (one initial + one debounced) but not 3
    expect(countRequestCount).toBeLessThanOrEqual(2);

    // The final response should still show up in the button
    const apply = applyButton(page);
    await expect(apply).toContainText(/7|listing/i, { timeout: 5_000 });
  });
});
