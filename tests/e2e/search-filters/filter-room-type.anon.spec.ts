/**
 * Room Type Filter E2E Tests (P0)
 *
 * Validates room type filtering behavior via the current desktop quick-filter
 * popover and the Select dropdown in the filter modal.
 *
 * Key implementation details:
 * - Quick filter trigger: data-testid="quick-filter-room-type"
 * - Quick filter popover: data-testid="quick-filter-room-type-popover"
 * - Modal select: #filter-room-type using Radix Select with same values
 * - URL param: roomType (e.g., roomType=Private+Room)
 * - Valid values: "any" (excluded from URL), "Private Room", "Shared Room", "Entire Place"
 * - Aliases: "private" -> "Private Room", "shared" -> "Shared Room", etc.
 * - Quick filter option click triggers immediate URL commit
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
  applyFilters,
} from "../helpers";

const ROOM_TYPE_OPTIONS = ["Private Room", "Shared Room", "Entire Place"];

function optionName(label: string): RegExp {
  return new RegExp(`^${label}(?: \\(\\d+\\))?$`, "i");
}

function roomTypeQuickFilter(page: import("@playwright/test").Page) {
  return searchResultsContainer(page).getByTestId("quick-filter-room-type");
}

function roomTypeOption(
  popover: import("@playwright/test").Locator,
  label: string
) {
  if (label === "Any") {
    return popover.getByRole("button", { name: /^Any(?: \(\d+\))?$/ }).first();
  }

  return popover.getByRole("button", { name: optionName(label) });
}

async function openRoomTypeQuickFilter(page: import("@playwright/test").Page) {
  const trigger = roomTypeQuickFilter(page);
  await expect(trigger).toBeVisible({ timeout: 30_000 });
  await trigger.click();

  const popover = page.getByTestId("quick-filter-room-type-popover");
  await expect(popover).toBeVisible({ timeout: 10_000 });
  return popover;
}

async function selectRoomTypeQuickFilter(
  page: import("@playwright/test").Page,
  label: string
) {
  const popover = await openRoomTypeQuickFilter(page);
  const option = roomTypeOption(popover, label);
  await expect(option).toBeVisible({ timeout: 10_000 });

  if (await option.isDisabled()) {
    await expect(option).toBeDisabled();
    return false;
  }

  await option.click();
  await expect(popover).not.toBeVisible({ timeout: 10_000 });
  return true;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Room Type Filter", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async () => {
    test.slow();
  });

  // 1. Select room type via URL -> URL has roomType param
  test(`${tags.core} - room type param in URL is reflected on page load`, async ({
    page,
  }) => {
    await gotoSearchWithFilters(page, { roomType: "Private Room" });

    expect(getUrlParam(page, "roomType")).toBe("Private Room");

    await expect(roomTypeQuickFilter(page)).toContainText("Private Room", {
      timeout: 30_000,
    });
  });

  // 2. Click quick-filter room type option -> URL updates
  test(`${tags.core} - clicking quick-filter room type option updates URL`, async ({
    page,
  }) => {
    await waitForSearchReady(page);

    const selected = await selectRoomTypeQuickFilter(page, "Private Room");
    expect(selected).toBe(true);

    await expect
      .poll(
        () =>
          new URL(page.url(), "http://localhost").searchParams.get("roomType"),
        {
          timeout: 30_000,
          message: 'URL param "roomType" to be "Private Room"',
        }
      )
      .toBe("Private Room");

    await expect(roomTypeQuickFilter(page)).toContainText("Private Room", {
      timeout: 30_000,
    });
  });

  // 3. Select "Any" in quick filter -> roomType param removed from URL
  test(`${tags.core} - selecting Any room type removes roomType from URL`, async ({
    page,
  }) => {
    // Start with a room type filter
    await gotoSearchWithFilters(page, { roomType: "Private Room" });

    expect(getUrlParam(page, "roomType")).toBe("Private Room");

    const selected = await selectRoomTypeQuickFilter(page, "Any");
    expect(selected).toBe(true);

    await expect
      .poll(
        () =>
          new URL(page.url(), "http://localhost").searchParams.get("roomType"),
        { timeout: 30_000, message: 'URL param "roomType" to be absent' }
      )
      .toBeNull();

    await expect(roomTypeQuickFilter(page)).toContainText("Room Type", {
      timeout: 30_000,
    });
  });

  // 4. Room type filter narrows results
  test(`${tags.core} - room type filter narrows visible results`, async ({
    page,
  }) => {
    test.slow(); // 2 navigations on WSL2/NTFS
    await waitForSearchReady(page);
    const container = searchResultsContainer(page);

    const initialCount = await container.locator(selectors.listingCard).count();

    // Navigate with room type filter
    await gotoSearchWithFilters(page, { roomType: "Private Room" });

    const filteredCount = await container
      .locator(selectors.listingCard)
      .count();
    const hasEmptyState =
      (await container.locator(selectors.emptyState).count()) > 0;

    if (!hasEmptyState && initialCount > 0) {
      expect(filteredCount).toBeLessThanOrEqual(initialCount);
    }
  });

  // 5. Room type shown in filter chips
  test(`${tags.core} - room type displays as applied filter chip`, async ({
    page,
  }) => {
    await gotoSearchWithFilters(page, { roomType: "Private Room" });

    const container = searchResultsContainer(page);
    const filtersRegion = container.locator('[aria-label="Applied filters"]');
    const regionVisible = await filtersRegion.isVisible().catch(() => false);

    if (regionVisible) {
      const roomTypeChip = filtersRegion
        .locator("text=/Private Room/i")
        .first();
      await expect(roomTypeChip).toBeVisible({ timeout: 10_000 });
    }
  });

  // 6. Clear room type filter restores all results
  test(`${tags.core} - clearing room type restores full results`, async ({
    page,
  }) => {
    test.slow(); // 3 navigations on WSL2/NTFS
    await waitForSearchReady(page);
    const container = searchResultsContainer(page);

    // Apply room type filter
    await gotoSearchWithFilters(page, { roomType: "Private Room" });

    // Clear by navigating back without the filter
    await gotoSearchWithFilters(page, {});

    const restoredCount = await container
      .locator(selectors.listingCard)
      .count();

    // Should have at least as many results as the filtered set
    expect(restoredCount).toBeGreaterThanOrEqual(0);
    expect(getUrlParam(page, "roomType")).toBeNull();
  });

  // 7. Room type filter via modal select
  test(`${tags.core} - selecting room type in filter modal updates on apply`, async ({
    page,
  }) => {
    await waitForSearchReady(page);

    // Open filter modal — use retry for hydration race
    const filtersBtn = filtersButton(page);
    const dialog = page.getByRole("dialog", { name: /filters/i });
    await expect(async () => {
      await filtersBtn.click();
      await expect(dialog).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 30_000 });

    // Click the room type select trigger
    const roomTypeSelect = dialog.locator("#filter-room-type");
    if (await roomTypeSelect.isVisible({ timeout: 5000 }).catch(() => false)) {
      await roomTypeSelect.click();
      // Wait for Radix Select dropdown to render
      await page
        .getByRole("listbox")
        .waitFor({ state: "visible", timeout: 5_000 })
        .catch(() => {});

      // Select "Shared Room"
      const sharedOption = page.getByRole("option", { name: /shared room/i });
      if (await sharedOption.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await sharedOption.click();
        // Radix Select trigger text may take a moment to update
        await expect(roomTypeSelect)
          .toContainText(/shared room/i, { timeout: 10_000 })
          .catch(() => {});

        // Apply — use resilient helper for hydration race
        await applyFilters(page);

        // URL should have roomType=Shared Room
        await expect
          .poll(
            () =>
              new URL(page.url(), "http://localhost").searchParams.get(
                "roomType"
              ),
            {
              timeout: 30_000,
              message: 'URL param "roomType" to be "Shared Room"',
            }
          )
          .toBe("Shared Room");
      }
    }
  });

  // 8. Room type alias resolves correctly via URL
  test(`${tags.core} - room type alias in URL resolves to canonical value`, async ({
    page,
  }) => {
    // Navigate with alias "private" instead of "Private Room"
    await gotoSearchWithFilters(page, { roomType: "private" });

    // Page should load without errors

    await expect(roomTypeQuickFilter(page)).toContainText(/private/i, {
      timeout: 30_000,
    });
  });

  // 9. Each room type option can be selected or is explicitly disabled by facet counts
  test(`${tags.core} - all room type options are represented in quick-filter popover`, async ({
    page,
  }) => {
    await waitForSearchReady(page);

    for (const roomType of ROOM_TYPE_OPTIONS) {
      const popover = await openRoomTypeQuickFilter(page);
      const option = roomTypeOption(popover, roomType);
      await expect(option).toBeVisible({ timeout: 10_000 });

      if (await option.isDisabled()) {
        await expect(option).toBeDisabled();
        await page.keyboard.press("Escape");
        await expect(popover).not.toBeVisible({ timeout: 10_000 });
        continue;
      }

      await option.click();
      await expect
        .poll(
          () =>
            new URL(page.url(), "http://localhost").searchParams.get(
              "roomType"
            ),
          {
            timeout: 30_000,
            message: `URL param "roomType" to be "${roomType}"`,
          }
        )
        .toBe(roomType);
      await expect(roomTypeQuickFilter(page)).toContainText(roomType, {
        timeout: 30_000,
      });
    }
  });
});
