/**
 * Filter Race Condition E2E Tests (P0)
 *
 * Validates that rapid interactions, concurrent state changes, and timing-sensitive
 * scenarios are handled correctly by useBatchedFilters, SearchResultsClient, and
 * the navigation pipeline.
 */

import {
  test,
  expect,
  tags,
  searchResultsContainer,
  scopedCards,
  SEARCH_URL,
  waitForSearchReady,
  openFilterModal,
  applyButton,
  filterDialog,
  buildSearchUrl,
  waitForUrlStable,
  rapidClick,
  captureNavigationCount,
} from "../helpers";
import { setupPaginationMock } from "../helpers/pagination-mock-factory";

test.describe("Filter Race Conditions", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test(`${tags.filter} Rapid checkbox toggling in modal (5 clicks, P0)`, async ({
    page,
  }) => {
    await waitForSearchReady(page);

    // Open filter modal
    await openFilterModal(page);

    // Get the Wifi amenity toggle button
    const amenitiesGroup = page.locator('[aria-label="Select amenities"]');
    const wifiToggle = amenitiesGroup.getByRole("button", { name: /^Wifi/i });

    // Rapid click 5 times (odd number = should end up pressed)
    await rapidClick(wifiToggle, 5, 80);

    // After settling, check aria-pressed attribute
    await expect(wifiToggle).toHaveAttribute("aria-pressed", "true");

    // Apply filters
    await applyButton(page).click();

    // Wait for modal to close and URL to update
    await expect(filterDialog(page)).not.toBeVisible();
    await page.waitForURL(/amenities=Wifi/);

    // Verify URL contains amenities=Wifi
    expect(page.url()).toContain("amenities=Wifi");
  });

  test(`${tags.filter} Type search + immediately apply filter (P1)`, async ({
    page,
  }) => {
    await waitForSearchReady(page);

    // Type search query
    const searchInput = page
      .locator('input[name="q"], input[placeholder*="Search"]')
      .first();
    await searchInput.fill("San Francisco");

    // IMMEDIATELY open filter modal and toggle Wifi
    await openFilterModal(page);

    const amenitiesGroup = page.locator('[aria-label="Select amenities"]');
    const wifiToggle = amenitiesGroup.getByRole("button", { name: /^Wifi/i });
    await wifiToggle.click();

    // Apply filters
    await applyButton(page).click();

    // Wait for URL to stabilize
    await waitForUrlStable(page);

    // Verify amenities parameter is present
    expect(page.url()).toContain("amenities=Wifi");
  });

  test(`${tags.filter} Load more during in-flight filter change (P0)`, async ({
    page,
  }) => {
    // Setup pagination mock (side effect: intercepts routes)
    await setupPaginationMock(page, {
      totalLoadMoreItems: 24,
      delayMs: 500,
    });

    await waitForSearchReady(page);

    // Click "Show more places" to start loading
    const loadMoreButton = page.getByRole("button", {
      name: /Show more places/i,
    });
    await expect(loadMoreButton).toBeVisible();
    await loadMoreButton.click();

    // Wait for loading state to start
    await expect(loadMoreButton).toHaveAttribute("aria-busy", "true");

    // While loading, navigate to new URL with filter
    await page.goto(buildSearchUrl({ amenities: "Parking" }));

    // Wait for navigation to settle
    await page.waitForURL(/amenities=Parking/);
    await waitForUrlStable(page);

    // Component should remount with clean state
    const container = searchResultsContainer(page);
    await expect(container).toBeVisible();

    // Verify URL has the new filter
    expect(page.url()).toContain("amenities=Parking");

    // No errors on page
    const errorMessage = page.getByText(/error|failed/i);
    await expect(errorMessage).not.toBeVisible();
  });

  test(`${tags.filter} Filter change during in-flight initial fetch (P0)`, async ({
    page,
  }) => {
    // Navigate to search page
    await page.goto(SEARCH_URL);

    // Before waiting for full load, immediately navigate with filter
    await page.goto(buildSearchUrl({ roomType: "Private Room" }));

    // Wait for page to settle
    await page.waitForURL(/roomType=Private/);
    await waitForUrlStable(page);

    // Verify URL has the filter
    expect(page.url()).toContain("roomType=Private+Room");

    // Page should show results or empty state (not error)
    const container = searchResultsContainer(page);
    await expect(container).toBeVisible();

    const errorMessage = page.getByText(/error|failed/i);
    await expect(errorMessage).not.toBeVisible();
  });

  test(`${tags.filter} Double-click on Apply button (P0)`, async ({ page }) => {
    await waitForSearchReady(page);

    // Capture navigation count before interaction
    const getNavCount = captureNavigationCount(page);

    // Open filter modal
    await openFilterModal(page);

    // Toggle Wifi amenity
    const amenitiesGroup = page.locator('[aria-label="Select amenities"]');
    const wifiToggle = amenitiesGroup.getByRole("button", { name: /^Wifi/i });
    await wifiToggle.click();

    // Double-click Apply button rapidly
    await rapidClick(applyButton(page), 2, 50);

    // Wait for modal to close
    await expect(filterDialog(page)).not.toBeVisible();

    // Wait for URL to update
    await page.waitForURL(/amenities=Wifi/);

    // Verify URL contains amenities=Wifi
    expect(page.url()).toContain("amenities=Wifi");

    // No error on page
    const errorMessage = page.getByText(/error|failed/i);
    await expect(errorMessage).not.toBeVisible();

    // Navigation count should be reasonable (not doubled from double-click)
    expect(getNavCount()).toBeLessThanOrEqual(4);
  });

  test(`${tags.filter} Double-click on Load More button (P0)`, async ({
    page,
  }) => {
    // Setup pagination mock
    const mock = await setupPaginationMock(page, {
      totalLoadMoreItems: 24,
      delayMs: 300,
    });

    await waitForSearchReady(page);

    // Wait for "Show more places" button to be visible
    const loadMoreButton = page.getByRole("button", {
      name: /Show more places/i,
    });
    await expect(loadMoreButton).toBeVisible();

    // Count initial cards
    const initialCards = await scopedCards(page).count();

    // Double-click Load More rapidly
    await rapidClick(loadMoreButton, 2, 50);

    // Wait for loading to complete
    await expect(loadMoreButton).not.toHaveAttribute("aria-busy", "true");

    // Verify loadMoreCallCount is exactly 1 (isLoadingMore guard)
    expect(mock.loadMoreCallCount()).toBe(1);

    // Count final cards - should have increased by exactly one page (~12 items)
    const finalCards = await scopedCards(page).count();
    const cardsAdded = finalCards - initialCards;

    // Should be approximately 12 (one page), not 24 (two pages)
    expect(cardsAdded).toBeGreaterThanOrEqual(10);
    expect(cardsAdded).toBeLessThanOrEqual(14);
  });

  test(`${tags.filter} Map pan + filter change simultaneously (P1)`, async ({
    page,
  }) => {
    await waitForSearchReady(page);

    // Open filter modal and toggle amenity
    await openFilterModal(page);

    const amenitiesGroup = page.locator('[aria-label="Select amenities"]');
    const wifiToggle = amenitiesGroup.getByRole("button", { name: /^Wifi/i });
    await wifiToggle.click();

    // Apply filters
    await applyButton(page).click();
    await expect(filterDialog(page)).not.toBeVisible();
    await page.waitForURL(/amenities=Wifi/);

    // Immediately navigate with new bounds (simulating map pan)
    await page.goto(
      buildSearchUrl({
        amenities: "Wifi",
        minLat: "37.72",
        maxLat: "37.83",
        minLng: "-122.50",
        maxLng: "-122.37",
      })
    );

    // Wait for URL to stabilize
    await waitForUrlStable(page);

    const finalUrl = page.url();

    // Verify URL has BOTH amenities and bounds
    expect(finalUrl).toContain("amenities=Wifi");
    expect(finalUrl).toContain("minLat=37.72");
    expect(finalUrl).toContain("maxLat=37.83");
    expect(finalUrl).toContain("minLng=-122.50");
    expect(finalUrl).toContain("maxLng=-122.37");

    // No errors on page
    const errorMessage = page.getByText(/error|failed/i);
    await expect(errorMessage).not.toBeVisible();
  });
});
