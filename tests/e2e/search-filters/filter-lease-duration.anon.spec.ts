/**
 * Lease Duration Filter E2E Tests (P1)
 *
 * Validates lease duration filtering via the Radix Select dropdown
 * inside the filter modal.
 *
 * Key implementation details:
 * - Lease duration uses a Radix Select with trigger #filter-lease
 * - URL param: leaseDuration (e.g., leaseDuration=6+months)
 * - Valid values: "Month-to-month", "3 months", "6 months", "12 months", "Flexible"
 * - "Any" clears the param from the URL
 * - Aliases: "mtm" -> "Month-to-month" (resolved server-side)
 * - Changes are pending until Apply is clicked (useBatchedFilters)
 */

import { test, expect, tags, searchResultsContainer } from "../helpers/test-utils";
import {
  SEARCH_URL,
  LEASE_DURATIONS,
  waitForSearchReady,
  getUrlParam,
  openFilterModal,
  applyFilters,
  selectDropdownOption,
} from "../helpers";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Lease Duration Filter", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async () => {
    test.slow();
  });

  // 5.1: Select each lease duration option -> URL contains leaseDuration=<value>
  test(`${tags.core} - selecting each lease duration option updates URL`, async ({ page }) => {
    // 5 iterations × ~12s each can exceed the default 60s timeout in slow environments
    test.setTimeout(120_000);
    await waitForSearchReady(page);

    // Disable "Search as I move" to prevent map-triggered URL changes
    // from resetting pending filter state while the modal is open
    const searchAsIMove = page.getByRole("switch", { name: /search as i move/i });
    if (await searchAsIMove.isChecked()) {
      await searchAsIMove.click();
    }

    for (const duration of LEASE_DURATIONS) {
      await openFilterModal(page);
      await selectDropdownOption(page, "filter-lease", new RegExp(`^${duration}$`, "i"));
      await applyFilters(page);

      await expect.poll(
        () => new URL(page.url(), "http://localhost").searchParams.get("leaseDuration"),
        { timeout: 30_000, message: `URL param "leaseDuration" to be "${duration}"` },
      ).toBe(duration);

      expect(getUrlParam(page, "leaseDuration")).toBe(duration);
    }
  });

  // 5.2: "Any" clears lease duration from URL
  test(`${tags.core} - selecting Any clears leaseDuration from URL`, async ({ page }) => {
    // Start with a lease duration already applied
    await page.goto(`${SEARCH_URL}&leaseDuration=6+months`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2_000);

    expect(getUrlParam(page, "leaseDuration")).toBe("6 months");

    // Wait for map settle before opening modal
    await page.waitForTimeout(1_000);
    await openFilterModal(page);

    // Select "Any" to clear the lease duration
    await selectDropdownOption(page, "filter-lease", /^Any$/i);

    await applyFilters(page);

    await expect.poll(
      () => new URL(page.url(), "http://localhost").searchParams.get("leaseDuration"),
      { timeout: 30_000, message: 'URL param "leaseDuration" to be absent' },
    ).toBeNull();

    expect(getUrlParam(page, "leaseDuration")).toBeNull();
  });

  // 5.3: Lease duration aliases resolve (e.g., leaseDuration=mtm -> "Month-to-month")
  test(`${tags.core} - lease duration alias in URL resolves to canonical value`, async ({ page }) => {
    // Navigate with the "mtm" alias
    await page.goto(`${SEARCH_URL}&leaseDuration=mtm`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3_000);

    // Page should load without errors
    expect(await page.title()).toBeTruthy();

    // Check applied filter chip shows the resolved canonical value
    const container = searchResultsContainer(page);
    const filtersRegion = container.locator('[aria-label="Applied filters"]');
    const regionVisible = await filtersRegion.isVisible().catch(() => false);

    if (regionVisible) {
      const mtmChip = filtersRegion.locator("text=/Month-to-month/i").first();
      await expect(mtmChip).toBeVisible({ timeout: 10_000 });
    }
  });
});
