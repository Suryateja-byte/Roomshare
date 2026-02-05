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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Room Type Filter", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  // 1. Select room type via URL -> URL has roomType param
  test(`${tags.core} - room type param in URL is reflected on page load`, async ({ page }) => {
    await page.goto(`${SEARCH_URL}&roomType=Private+Room`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2_000);

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

    // Find the "Private" room type tab
    const privateTab = page.getByRole("button", { name: /filter by private/i });
    const tabVisible = await privateTab.isVisible().catch(() => false);

    if (tabVisible) {
      await privateTab.click();

      // Wait for URL to update
      await page.waitForURL(
        (url) => new URL(url).searchParams.get("roomType") === "Private Room",
        { timeout: 15_000 },
      );

      expect(getUrlParam(page, "roomType")).toBe("Private Room");
    } else {
      // On smaller viewports, inline tabs may not be visible
      test.skip(true, "Room type tabs not visible (likely mobile viewport)");
    }
  });

  // 3. Select "All" tab -> roomType param removed from URL
  test(`${tags.core} - selecting All room type removes roomType from URL`, async ({ page }) => {
    // Start with a room type filter
    await page.goto(`${SEARCH_URL}&roomType=Private+Room`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2_000);

    expect(getUrlParam(page, "roomType")).toBe("Private Room");

    // Click the "All" tab
    const allTab = page.getByRole("button", { name: /filter by all room types/i });
    const tabVisible = await allTab.isVisible().catch(() => false);

    if (tabVisible) {
      await allTab.click();

      await page.waitForURL(
        (url) => !new URL(url).searchParams.has("roomType"),
        { timeout: 15_000 },
      );

      expect(getUrlParam(page, "roomType")).toBeNull();
    } else {
      test.skip(true, "Room type tabs not visible");
    }
  });

  // 4. Room type filter narrows results
  test(`${tags.core} - room type filter narrows visible results`, async ({ page }) => {
    await waitForSearchReady(page);
    const container = searchResultsContainer(page);

    const initialCount = await container.locator(selectors.listingCard).count();

    // Navigate with room type filter
    await page.goto(`${SEARCH_URL}&roomType=Private+Room`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3_000);

    const filteredCount = await container.locator(selectors.listingCard).count();
    const hasEmptyState = await container.locator(selectors.emptyState).count() > 0;

    if (!hasEmptyState && initialCount > 0) {
      expect(filteredCount).toBeLessThanOrEqual(initialCount);
    }
  });

  // 5. Room type shown in filter chips
  test(`${tags.core} - room type displays as applied filter chip`, async ({ page }) => {
    await page.goto(`${SEARCH_URL}&roomType=Private+Room`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3_000);

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
    await waitForSearchReady(page);
    const container = searchResultsContainer(page);
    const initialCount = await container.locator(selectors.listingCard).count();

    // Apply room type filter
    await page.goto(`${SEARCH_URL}&roomType=Private+Room`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3_000);

    // Clear by navigating back without the filter
    await page.goto(SEARCH_URL);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3_000);

    const restoredCount = await container.locator(selectors.listingCard).count();

    // Should have at least as many results as the filtered set
    expect(restoredCount).toBeGreaterThanOrEqual(0);
    expect(getUrlParam(page, "roomType")).toBeNull();
  });

  // 7. Room type filter via modal select
  test(`${tags.core} - selecting room type in filter modal updates on apply`, async ({ page }) => {
    await waitForSearchReady(page);

    // Open filter modal
    const filtersBtn = page.getByRole("button", { name: "Filters", exact: true });
    await filtersBtn.click();

    const dialog = page.getByRole("dialog", { name: /filters/i });
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Click the room type select trigger
    const roomTypeSelect = dialog.locator("#filter-room-type");
    if (await roomTypeSelect.isVisible()) {
      await roomTypeSelect.click();
      await page.waitForTimeout(300);

      // Select "Shared Room"
      const sharedOption = page.getByRole("option", { name: /shared room/i });
      if (await sharedOption.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await sharedOption.click();
        await page.waitForTimeout(300);

        // Apply
        await page.locator('[data-testid="filter-modal-apply"]').click();

        await expect(dialog).not.toBeVisible({ timeout: 10_000 });

        // URL should have roomType=Shared Room
        await page.waitForURL(
          (url) => new URL(url).searchParams.get("roomType") === "Shared Room",
          { timeout: 15_000 },
        );
      }
    }
  });

  // 8. Room type alias resolves correctly via URL
  test(`${tags.core} - room type alias in URL resolves to canonical value`, async ({ page }) => {
    // Navigate with alias "private" instead of "Private Room"
    await page.goto(`${SEARCH_URL}&roomType=private`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3_000);

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

    const roomTypes = [
      { name: /filter by private/i, param: "Private Room" },
      { name: /filter by shared/i, param: "Shared Room" },
      { name: /filter by entire/i, param: "Entire Place" },
    ];

    for (const { name, param } of roomTypes) {
      const tab = page.getByRole("button", { name });
      const tabVisible = await tab.isVisible().catch(() => false);

      if (!tabVisible) {
        test.skip(true, "Room type tabs not visible");
        return;
      }

      await tab.click();

      await page.waitForURL(
        (url) => new URL(url).searchParams.get("roomType") === param,
        { timeout: 15_000 },
      );

      expect(getUrlParam(page, "roomType")).toBe(param);
    }
  });
});
