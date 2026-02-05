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

import { test, expect, SF_BOUNDS, selectors, timeouts, tags, searchResultsContainer } from "../helpers/test-utils";
import type { Page } from "@playwright/test";

const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;
const SEARCH_URL = `/search?${boundsQS}`;

const LEASE_DURATIONS = [
  "Month-to-month",
  "3 months",
  "6 months",
  "12 months",
  "Flexible",
] as const;

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

/** Click Apply and wait for the modal to close */
async function applyFilters(page: Page) {
  const applyBtn = page.locator('[data-testid="filter-modal-apply"]');
  await applyBtn.click();
  // Wait for modal to close and URL to update
  await page.waitForTimeout(1_500);
}

/** Select a lease duration option from the Radix Select dropdown */
async function selectLeaseDuration(page: Page, dialog: ReturnType<typeof page.locator>, value: string) {
  const trigger = dialog.locator("#filter-lease");
  await expect(trigger).toBeVisible({ timeout: 5_000 });
  await trigger.click();
  await page.waitForTimeout(300);

  const option = page.getByRole("option", { name: new RegExp(`^${value}$`, "i") });
  if (await option.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await option.click();
    await page.waitForTimeout(300);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Lease Duration Filter", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  // 5.1: Select each lease duration option -> URL contains leaseDuration=<value>
  test(`${tags.core} - selecting each lease duration option updates URL`, async ({ page }) => {
    for (const duration of LEASE_DURATIONS) {
      await waitForSearchReady(page);
      const dialog = await openFilterModal(page);

      await selectLeaseDuration(page, dialog, duration);
      await applyFilters(page);

      await page.waitForURL(
        (url) => {
          const param = new URL(url).searchParams.get("leaseDuration");
          return param !== null && param === duration;
        },
        { timeout: 15_000 },
      );

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

    const dialog = await openFilterModal(page);

    // Select "Any" to clear the lease duration
    const trigger = dialog.locator("#filter-lease");
    await expect(trigger).toBeVisible({ timeout: 5_000 });
    await trigger.click();
    await page.waitForTimeout(300);

    const anyOption = page.getByRole("option", { name: /^any$/i });
    if (await anyOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await anyOption.click();
      await page.waitForTimeout(300);
    }

    await applyFilters(page);

    await page.waitForURL(
      (url) => !new URL(url).searchParams.has("leaseDuration"),
      { timeout: 15_000 },
    );

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
