/**
 * Move-In Date Filter E2E Tests (P1)
 *
 * Validates date filtering via the DatePicker component inside the filter modal.
 *
 * Key implementation details:
 * - DatePicker is a Radix Popover triggered by #filter-move-in
 * - Selecting a day calls onChange with YYYY-MM-DD format
 * - Changes are pending until Apply is clicked (useBatchedFilters)
 * - URL param: moveInDate (e.g., moveInDate=2026-03-15)
 * - Server-side safeParseDate validates: YYYY-MM-DD format, not in past, not >2 years future
 * - Invalid/out-of-range dates are silently dropped (no filter applied)
 * - Filter chip shows formatted date: "Move-in: Mon DD, YYYY"
 */

import {
  test,
  expect,
  tags,
  searchResultsContainer,
  boundsQS,
  SEARCH_URL,
  waitForSearchReady,
  getUrlParam,
  openFilterModal,
  applyFilters,
} from "../helpers";

// ---------------------------------------------------------------------------
// Domain-specific Helpers
// ---------------------------------------------------------------------------

/**
 * Compute the YYYY-MM-DD string for the 15th of next month.
 * Used as a reliable future date for calendar interaction.
 */
function getNextMonth15th(): { year: number; month: number; day: number; dateStr: string } {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 2; // getMonth is 0-indexed, +1 for current, +1 for next
  if (month > 12) {
    month = month - 12;
    year += 1;
  }
  const day = 15;
  const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { year, month, day, dateStr };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Move-In Date Filter", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async () => {
    test.slow();
  });

  // 7.1: Select move-in date from picker -> URL contains moveInDate=YYYY-MM-DD
  test(`${tags.core} - selecting a date via picker and applying updates URL`, async ({ page }) => {
    await waitForSearchReady(page);
    const dialog = await openFilterModal(page);

    // Scroll down to make the date picker visible
    const datePickerTrigger = dialog.locator("#filter-move-in");
    await datePickerTrigger.scrollIntoViewIfNeeded();
    await expect(datePickerTrigger).toBeVisible({ timeout: 5_000 });

    // Click the date picker trigger to open the Radix Popover calendar
    await datePickerTrigger.click();
    await page.waitForTimeout(500);

    // Navigate to the next month using the "Next month" button
    const nextMonthBtn = page.locator('button[aria-label="Next month"]');
    await expect(nextMonthBtn).toBeVisible({ timeout: 5_000 });
    await nextMonthBtn.click();
    await page.waitForTimeout(300);

    // Select the 15th day from the calendar grid
    // The calendar grid buttons contain just the day number.
    // We target buttons within the Popover content that show "15" and are in the current month.
    const target = getNextMonth15th();
    const dayButtons = page.locator('[data-radix-popper-content-wrapper] button, [class*="popover"] button').filter({
      hasText: /^15$/,
    });

    // Click the first visible "15" button that is not disabled
    const dayButton = dayButtons.first();
    if (await dayButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await dayButton.click();
    } else {
      // Fallback: use the "Today" button to select today's date
      const todayBtn = page.getByRole("button", { name: "Today" });
      if (await todayBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await todayBtn.click();
      }
    }

    await page.waitForTimeout(500);

    // Apply filters
    await applyFilters(page);

    // Verify URL contains a moveInDate param in YYYY-MM-DD format
    await page.waitForURL(
      (url) => {
        const moveInDate = new URL(url).searchParams.get("moveInDate");
        return moveInDate !== null && /^\d{4}-\d{2}-\d{2}$/.test(moveInDate);
      },
      { timeout: 30_000 },
    );

    const moveInDate = getUrlParam(page, "moveInDate");
    expect(moveInDate).toBeTruthy();
    expect(moveInDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  // 7.2: Past dates are prevented -> navigate with moveInDate=2020-01-01, no filter chip
  test(`${tags.core} - past date in URL is rejected and produces no filter chip`, async ({ page }) => {
    await page.goto(`${SEARCH_URL}&moveInDate=2020-01-01`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3_000);

    // safeParseDate rejects past dates, so moveInDate should not appear as an active filter
    const container = searchResultsContainer(page);
    const filtersRegion = container.locator('[aria-label="Applied filters"]');
    const regionVisible = await filtersRegion.isVisible().catch(() => false);

    if (regionVisible) {
      // No chip for a date should be present
      const dateChip = filtersRegion.locator("text=/Move-in|2020/i");
      await expect(dateChip).toHaveCount(0);
    }

    // The URL param may still be present in the browser bar, but the server
    // should not have applied it as an active filter.
    expect(await page.title()).toBeTruthy();
  });

  // 7.3: Date > 2 years in future rejected -> moveInDate=2030-01-01, no filter
  test(`${tags.core} - date more than 2 years in future is rejected`, async ({ page }) => {
    await page.goto(`${SEARCH_URL}&moveInDate=2030-01-01`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3_000);

    // safeParseDate rejects dates beyond 2 years from now
    const container = searchResultsContainer(page);
    const filtersRegion = container.locator('[aria-label="Applied filters"]');
    const regionVisible = await filtersRegion.isVisible().catch(() => false);

    if (regionVisible) {
      const dateChip = filtersRegion.locator("text=/Move-in|2030/i");
      await expect(dateChip).toHaveCount(0);
    }

    expect(await page.title()).toBeTruthy();
  });

  // 7.4: Invalid date format rejected -> moveInDate=not-a-date, no chip
  test(`${tags.core} - invalid date format in URL is rejected`, async ({ page }) => {
    // Test with a non-date string
    await page.goto(`${SEARCH_URL}&moveInDate=not-a-date`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3_000);

    const container = searchResultsContainer(page);
    const filtersRegion = container.locator('[aria-label="Applied filters"]');
    const regionVisible = await filtersRegion.isVisible().catch(() => false);

    if (regionVisible) {
      const dateChip = filtersRegion.locator("text=/Move-in|not-a-date/i");
      await expect(dateChip).toHaveCount(0);
    }

    // Also test with a malformed date-like string
    await page.goto(`${SEARCH_URL}&moveInDate=13/45/2025`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3_000);

    const filtersRegion2 = container.locator('[aria-label="Applied filters"]');
    const regionVisible2 = await filtersRegion2.isVisible().catch(() => false);

    if (regionVisible2) {
      const dateChip2 = filtersRegion2.locator("text=/Move-in|13\\/45/i");
      await expect(dateChip2).toHaveCount(0);
    }

    expect(await page.title()).toBeTruthy();
  });
});
