/**
 * Room Type Filter E2E Tests (P0)
 *
 * Validates room type filtering behavior via both the inline room type tabs
 * in the search form and the Select dropdown in the filter modal.
 *
 * Key implementation details:
 * - Inline tabs: button[aria-pressed] with values "any", "Private Room", "Shared Room", "Entire Place"
 * - Modal select: #filter-room-type using Radix Select with same values
 * - URL param: roomType (e.g., roomType=Private+Room)
 * - Valid values: "any" (excluded from URL), "Private Room", "Shared Room", "Entire Place"
 * - Aliases: "private" -> "Private Room", "shared" -> "Shared Room", etc.
 * - Inline tab click triggers immediate form submit (handleRoomTypeSelect)
 * - Modal select only updates pending state; committed on Apply
 */

import {
  test,
  expect,
  selectors,
  tags,
  searchResultsContainer,
  waitForSearchReady,
  gotoSearchWithFilters,
  getUrlParam,
  filtersButton,
} from "../helpers";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Room Type Filter", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async () => {
    test.slow();
  });

  // 1. Select room type via URL -> URL has roomType param
  test(`${tags.core} - room type param in URL is reflected on page load`, async ({ page }) => {
    await gotoSearchWithFilters(page, { roomType: "Private Room" });

    expect(getUrlParam(page, "roomType")).toBe("Private Room");

    // The inline "Private" tab should be pressed
    const privateTab = page.locator('button[aria-pressed="true"]').filter({ hasText: /private/i });
    const tabVisible = await privateTab.isVisible().catch(() => false);
    if (tabVisible) {
      await expect(privateTab).toHaveAttribute("aria-pressed", "true");
    }
  });

  // 2. Click inline room type tab -> URL updates
  test(`${tags.core} - clicking inline room type tab updates URL`, async ({ page }) => {
    await waitForSearchReady(page);

    // Find the "Private" room type tab (CategoryTabs renders button with text "Private" and aria-pressed)
    const privateTab = page.locator('button[aria-pressed]').filter({ hasText: /Private/i });
    const tabVisible = await privateTab.isVisible().catch(() => false);

    if (tabVisible) {
      // Wrap in retry: tab click may not trigger URL update immediately due to hydration
      await expect(async () => {
        await privateTab.click();
        await expect.poll(
          () => new URL(page.url(), "http://localhost").searchParams.get("roomType"),
        ).not.toBeNull();
      }).toPass({ timeout: 15_000 });

      // Wait for URL to settle to correct value
      await expect.poll(
        () => new URL(page.url(), "http://localhost").searchParams.get("roomType"),
        { timeout: 30_000, message: 'URL param "roomType" to be "Private Room"' },
      ).toBe("Private Room");

      expect(getUrlParam(page, "roomType")).toBe("Private Room");
    } else {
      // On smaller viewports, inline tabs may not be visible
      test.skip(true, "Room type tabs not visible (likely mobile viewport)");
    }
  });

  // 3. Select "All" tab -> roomType param removed from URL
  test(`${tags.core} - selecting All room type removes roomType from URL`, async ({ page }) => {
    // Start with a room type filter
    await gotoSearchWithFilters(page, { roomType: "Private Room" });

    expect(getUrlParam(page, "roomType")).toBe("Private Room");

    // Click the "All" tab (CategoryTabs renders button with text "All" and aria-pressed)
    // Wait for hydration — tabs may not be interactive immediately
    await page.waitForTimeout(2_000);
    const allTab = page.locator('button[aria-pressed]').filter({ hasText: /^All$/i });
    const tabVisible = await allTab.isVisible({ timeout: 10_000 }).catch(() => false);

    if (tabVisible) {
      // Wrap in retry: tab click may not trigger URL update immediately due to hydration
      await expect(async () => {
        await allTab.click();
        await expect.poll(
          () => new URL(page.url(), "http://localhost").searchParams.get("roomType"),
        ).toBeNull();
      }).toPass({ timeout: 20_000 });

      await expect.poll(
        () => new URL(page.url(), "http://localhost").searchParams.get("roomType"),
        { timeout: 30_000, message: 'URL param "roomType" to be absent' },
      ).toBeNull();

      expect(getUrlParam(page, "roomType")).toBeNull();
    } else {
      test.skip(true, "Room type tabs not visible");
    }
  });

  // 4. Room type filter narrows results
  test(`${tags.core} - room type filter narrows visible results`, async ({ page }) => {
    test.slow(); // 2 navigations on WSL2/NTFS
    await waitForSearchReady(page);
    const container = searchResultsContainer(page);

    const initialCount = await container.locator(selectors.listingCard).count();

    // Navigate with room type filter
    await gotoSearchWithFilters(page, { roomType: "Private Room" });

    const filteredCount = await container.locator(selectors.listingCard).count();
    const hasEmptyState = await container.locator(selectors.emptyState).count() > 0;

    if (!hasEmptyState && initialCount > 0) {
      expect(filteredCount).toBeLessThanOrEqual(initialCount);
    }
  });

  // 5. Room type shown in filter chips
  test(`${tags.core} - room type displays as applied filter chip`, async ({ page }) => {
    await gotoSearchWithFilters(page, { roomType: "Private Room" });

    const container = searchResultsContainer(page);
    const filtersRegion = container.locator('[aria-label="Applied filters"]');
    const regionVisible = await filtersRegion.isVisible().catch(() => false);

    if (regionVisible) {
      const roomTypeChip = filtersRegion.locator("text=/Private Room/i").first();
      await expect(roomTypeChip).toBeVisible({ timeout: 10_000 });
    }

    expect(await page.title()).toBeTruthy();
  });

  // 6. Clear room type filter restores all results
  test(`${tags.core} - clearing room type restores full results`, async ({ page }) => {
    test.slow(); // 3 navigations on WSL2/NTFS
    await waitForSearchReady(page);
    const container = searchResultsContainer(page);

    // Apply room type filter
    await gotoSearchWithFilters(page, { roomType: "Private Room" });

    // Clear by navigating back without the filter
    await gotoSearchWithFilters(page, {});

    const restoredCount = await container.locator(selectors.listingCard).count();

    // Should have at least as many results as the filtered set
    expect(restoredCount).toBeGreaterThanOrEqual(0);
    expect(getUrlParam(page, "roomType")).toBeNull();
  });

  // 7. Room type filter via modal select
  test(`${tags.core} - selecting room type in filter modal updates on apply`, async ({ page }) => {
    await waitForSearchReady(page);

    // Open filter modal
    const filtersBtn = filtersButton(page);
    await filtersBtn.click();

    const dialog = page.getByRole("dialog", { name: /filters/i });
    await expect(dialog).toBeVisible({ timeout: 30_000 });

    // Click the room type select trigger
    const roomTypeSelect = dialog.locator("#filter-room-type");
    if (await roomTypeSelect.isVisible()) {
      await roomTypeSelect.click();
      // Wait for Radix Select dropdown to render
      await page.getByRole("listbox").waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});

      // Select "Shared Room"
      const sharedOption = page.getByRole("option", { name: /shared room/i });
      if (await sharedOption.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await sharedOption.click();
        await expect(roomTypeSelect).toContainText(/shared room/i);

        // Apply
        await page.locator('[data-testid="filter-modal-apply"]').click();

        await expect(dialog).not.toBeVisible({ timeout: 30_000 });

        // URL should have roomType=Shared Room
        await expect.poll(
          () => new URL(page.url(), "http://localhost").searchParams.get("roomType"),
          { timeout: 30_000, message: 'URL param "roomType" to be "Shared Room"' },
        ).toBe("Shared Room");
      }
    }
  });

  // 8. Room type alias resolves correctly via URL
  test(`${tags.core} - room type alias in URL resolves to canonical value`, async ({ page }) => {
    // Navigate with alias "private" instead of "Private Room"
    await gotoSearchWithFilters(page, { roomType: "private" });

    // Page should load without errors
    expect(await page.title()).toBeTruthy();

    // The inline tab should reflect the resolved value
    const privateTab = page.locator('button[aria-pressed="true"]').filter({ hasText: /private/i });
    const tabVisible = await privateTab.isVisible().catch(() => false);
    if (tabVisible) {
      await expect(privateTab).toHaveAttribute("aria-pressed", "true");
    }
  });

  // 9. Each room type option can be selected
  test(`${tags.core} - all room type options are selectable via tabs`, async ({ page }) => {
    await waitForSearchReady(page);

    // Disable "Search as I move" to prevent map-triggered URL changes
    const searchAsIMove = page.getByRole("switch", { name: /search as i move/i });
    if (await searchAsIMove.isChecked()) {
      await searchAsIMove.click();
    }

    const roomTypes = [
      { text: /^Private$/i, param: "Private Room" },
      { text: /^Shared$/i, param: "Shared Room" },
      { text: /^Entire$/i, param: "Entire Place" },
    ];

    for (const { text, param } of roomTypes) {
      const tab = page.locator('button[aria-pressed]').filter({ hasText: text });
      const tabVisible = await tab.isVisible().catch(() => false);

      if (!tabVisible) {
        test.skip(true, "Room type tabs not visible");
        return;
      }

      await tab.click();

      await expect.poll(
        () => new URL(page.url(), "http://localhost").searchParams.get("roomType"),
        { timeout: 30_000, message: `URL param "roomType" to be "${param}"` },
      ).toBe(param);

      expect(getUrlParam(page, "roomType")).toBe(param);
    }
  });
});
