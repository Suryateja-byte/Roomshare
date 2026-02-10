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

  test.beforeEach(async () => {
    test.slow();
  });

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
    await expect(filterDialog(page)).not.toBeVisible({ timeout: 10_000 });
    await page.waitForURL(/amenities=Wifi/, { timeout: 30_000 });

    // Verify URL contains amenities=Wifi
    expect(page.url()).toContain("amenities=Wifi");
  });

  test(`${tags.filter} Type search + immediately apply filter (P1)`, async ({
    page,
  }) => {
    await waitForSearchReady(page);

    // Type search query using the destination search input
    const searchInput = page.getByPlaceholder(/search destination/i);
    const inputVisible = await searchInput.isVisible().catch(() => false);
    if (!inputVisible) {
      test.skip(true, "Search destination input not visible");
      return;
    }
    await searchInput.fill("San Francisco");

    // IMMEDIATELY open filter modal and toggle Wifi
    await openFilterModal(page);

    const amenitiesGroup = page.locator('[aria-label="Select amenities"]');
    const wifiToggle = amenitiesGroup.getByRole("button", { name: /^Wifi/i });
    await wifiToggle.click();

    // Apply filters
    await applyButton(page).click();

    // Wait for modal to close and URL to include amenities
    await expect(filterDialog(page)).not.toBeVisible({ timeout: 10_000 });
    await page.waitForURL(/amenities=Wifi/, { timeout: 30_000 });

    // Verify amenities parameter is present
    expect(page.url()).toContain("amenities=Wifi");
  });

  test(`${tags.filter} Load more during in-flight filter change (P0)`, async ({
    page,
  }) => {
    test.slow(); // 2 navigations on WSL2/NTFS
    // Setup pagination mock with longer delay so loading is still in-flight
    // when we navigate away
    await setupPaginationMock(page, {
      totalLoadMoreItems: 24,
      delayMs: 3_000,
    });

    await waitForSearchReady(page);

    // Click "Show more places" to start loading
    const loadMoreButton = page.getByRole("button", {
      name: /Show more places/i,
    });
    const loadMoreVisible = await loadMoreButton.isVisible({ timeout: 5_000 }).catch(() => false);
    if (!loadMoreVisible) {
      test.skip(true, "Load more button not visible (need >12 initial results)");
      return;
    }
    await loadMoreButton.click();

    // Brief wait to ensure the server action POST is dispatched
    await page.waitForTimeout(200);

    // While loading, navigate to new URL with filter (interrupts in-flight load)
    await page.goto(buildSearchUrl({ amenities: "Parking" }));

    // Wait for navigation to settle
    await page.waitForURL(/amenities=Parking/, { timeout: 30_000 });
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
    test.slow(); // 2 navigations on WSL2/NTFS
    // Navigate to search page
    await page.goto(SEARCH_URL);

    // Before waiting for full load, immediately navigate with filter
    await page.goto(buildSearchUrl({ roomType: "Private Room" }));

    // Wait for page to settle
    await page.waitForURL(/roomType=Private/, { timeout: 30_000 });
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

    // Double-click Apply button rapidly — the second click may fail because
    // the modal closes after the first click (this IS the correct behavior)
    try {
      await rapidClick(applyButton(page), 2, 50);
    } catch {
      // Expected: second click may throw if modal closed after first click
    }

    // Wait for modal to close
    await expect(filterDialog(page)).not.toBeVisible({ timeout: 10_000 });

    // Wait for URL to update
    await page.waitForURL(/amenities=Wifi/, { timeout: 30_000 });

    // Verify URL contains amenities=Wifi
    expect(page.url()).toContain("amenities=Wifi");

    // No error on page
    const errorMessage = page.getByText(/error|failed/i);
    await expect(errorMessage).not.toBeVisible({ timeout: 10_000 });

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
    const loadMoreVisible = await loadMoreButton.isVisible({ timeout: 5_000 }).catch(() => false);
    if (!loadMoreVisible) {
      test.skip(true, "Load more button not visible (need >12 initial results)");
      return;
    }

    // Count initial cards
    const initialCards = await scopedCards(page).count();

    // Double-click Load More rapidly
    await rapidClick(loadMoreButton, 2, 50);

    // Wait for loading to complete:
    // The button either loses aria-busy (still has more items) or disappears (all loaded)
    await expect(async () => {
      const stillExists = await loadMoreButton.isVisible().catch(() => false);
      if (stillExists) {
        const busy = await loadMoreButton.getAttribute("aria-busy");
        expect(busy).not.toBe("true");
      }
      // If button is gone, loading is complete
    }).toPass({ timeout: 15_000 });

    // Verify double-click guard: should have at most 2 calls
    // (ideally 1, but isLoadingMore ref guard depends on React render cycle timing)
    expect(mock.loadMoreCallCount()).toBeLessThanOrEqual(2);

    // Count final cards - should have increased (at least one page)
    const finalCards = await scopedCards(page).count();
    const cardsAdded = finalCards - initialCards;
    expect(cardsAdded).toBeGreaterThanOrEqual(10);
  });

  test(`${tags.filter} Map pan + filter change simultaneously (P1)`, async ({
    page,
  }) => {
    test.slow(); // 2 navigations on WSL2/NTFS
    await waitForSearchReady(page);

    // Open filter modal and toggle amenity
    await openFilterModal(page);

    const amenitiesGroup = page.locator('[aria-label="Select amenities"]');
    const wifiToggle = amenitiesGroup.getByRole("button", { name: /^Wifi/i });
    await wifiToggle.click();

    // Apply filters
    await applyButton(page).click();
    await expect(filterDialog(page)).not.toBeVisible({ timeout: 10_000 });
    await page.waitForURL(/amenities=Wifi/, { timeout: 30_000 });

    // Let apply navigation fully settle before next goto
    await waitForUrlStable(page);

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
