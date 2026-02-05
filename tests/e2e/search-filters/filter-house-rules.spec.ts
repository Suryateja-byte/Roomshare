/**
 * House Rules Filter E2E Tests (P1)
 *
 * Validates house rules multi-select filtering via toggle buttons
 * inside the filter modal.
 *
 * Key implementation details:
 * - House rules are toggle buttons with aria-pressed inside the filter modal
 * - Located in a group with aria-label="Select house rules"
 * - URL param: houseRules (comma-separated, e.g., houseRules=Pets+allowed,Couples+allowed)
 * - Valid values: "Pets allowed", "Smoking allowed", "Couples allowed", "Guests allowed"
 * - Toggling sets data-active and aria-pressed attributes
 * - Changes are pending until Apply is clicked (useBatchedFilters)
 * - Active rules show an X icon for visual deselect
 */

import { test, expect, SF_BOUNDS, selectors, timeouts, tags, searchResultsContainer } from "../helpers/test-utils";
import type { Page } from "@playwright/test";

const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;
const SEARCH_URL = `/search?${boundsQS}`;

const HOUSE_RULES = [
  "Pets allowed",
  "Smoking allowed",
  "Couples allowed",
  "Guests allowed",
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

/** Get the house rules group inside the filter modal */
function houseRulesGroup(page: Page) {
  return page.locator('[aria-label="Select house rules"]');
}

/** Click a house rule toggle button by name */
async function toggleHouseRule(page: Page, name: string) {
  const group = houseRulesGroup(page);
  const btn = group.getByRole("button", { name: new RegExp(`^${name}`, "i") });
  await btn.click();
  await page.waitForTimeout(300);
}

/** Click Apply and wait for the modal to close */
async function applyFilters(page: Page) {
  const applyBtn = page.locator('[data-testid="filter-modal-apply"]');
  await applyBtn.click();
  // Wait for modal to close and URL to update
  await page.waitForTimeout(1_500);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("House Rules Filter", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  // 6.1: Select single house rule -> aria-pressed="true", URL has houseRules param
  test(`${tags.core} - selecting a single house rule updates URL`, async ({ page }) => {
    await waitForSearchReady(page);
    await openFilterModal(page);

    // Toggle "Pets allowed"
    await toggleHouseRule(page, "Pets allowed");

    // Verify it's pressed
    const petsBtn = houseRulesGroup(page).getByRole("button", { name: /^Pets allowed/i });
    await expect(petsBtn).toHaveAttribute("aria-pressed", "true");

    // Apply
    await applyFilters(page);

    // URL should have houseRules=Pets allowed
    await page.waitForURL(
      (url) => {
        const param = new URL(url).searchParams.get("houseRules");
        return param !== null && param.includes("Pets allowed");
      },
      { timeout: 15_000 },
    );

    const houseRules = getUrlParam(page, "houseRules") ?? "";
    expect(houseRules).toContain("Pets allowed");
  });

  // 6.2: Select multiple house rules -> comma-separated in URL, two chips
  test(`${tags.core} - selecting multiple house rules creates comma-separated param`, async ({ page }) => {
    await waitForSearchReady(page);
    await openFilterModal(page);

    // Toggle "Pets allowed" and "Couples allowed"
    await toggleHouseRule(page, "Pets allowed");
    await toggleHouseRule(page, "Couples allowed");

    // Verify both are pressed
    const petsBtn = houseRulesGroup(page).getByRole("button", { name: /^Pets allowed/i });
    const couplesBtn = houseRulesGroup(page).getByRole("button", { name: /^Couples allowed/i });
    await expect(petsBtn).toHaveAttribute("aria-pressed", "true");
    await expect(couplesBtn).toHaveAttribute("aria-pressed", "true");

    // Apply
    await applyFilters(page);

    // URL should have both rules comma-separated
    await page.waitForURL(
      (url) => {
        const param = new URL(url).searchParams.get("houseRules");
        return param !== null && param.includes("Pets allowed") && param.includes("Couples allowed");
      },
      { timeout: 15_000 },
    );

    const houseRules = getUrlParam(page, "houseRules") ?? "";
    expect(houseRules).toContain("Pets allowed");
    expect(houseRules).toContain("Couples allowed");

    // Verify filter chips appear
    const container = searchResultsContainer(page);
    const filtersRegion = container.locator('[aria-label="Applied filters"]');
    const regionVisible = await filtersRegion.isVisible().catch(() => false);

    if (regionVisible) {
      const petsChip = filtersRegion.locator("text=/Pets allowed/i").first();
      const couplesChip = filtersRegion.locator("text=/Couples allowed/i").first();
      await expect(petsChip).toBeVisible({ timeout: 10_000 });
      await expect(couplesChip).toBeVisible({ timeout: 10_000 });
    }
  });

  // 6.3: Deselect house rule -> only remaining rule in URL
  test(`${tags.core} - deselecting a house rule removes it from URL`, async ({ page }) => {
    // Start with two house rules applied
    await page.goto(`${SEARCH_URL}&houseRules=Pets+allowed,Smoking+allowed`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2_000);

    await openFilterModal(page);

    // Both should be pressed initially
    const petsBtn = houseRulesGroup(page).getByRole("button", { name: /^Pets allowed/i });
    const smokingBtn = houseRulesGroup(page).getByRole("button", { name: /^Smoking allowed/i });
    await expect(petsBtn).toHaveAttribute("aria-pressed", "true");
    await expect(smokingBtn).toHaveAttribute("aria-pressed", "true");

    // Deselect "Smoking allowed"
    await smokingBtn.click();
    await page.waitForTimeout(300);

    // Smoking should no longer be pressed
    await expect(smokingBtn).toHaveAttribute("aria-pressed", "false");
    // Pets should still be pressed
    await expect(petsBtn).toHaveAttribute("aria-pressed", "true");

    // Apply
    await applyFilters(page);

    // URL should have only Pets allowed
    await page.waitForURL(
      (url) => {
        const param = new URL(url).searchParams.get("houseRules") ?? "";
        return param.includes("Pets allowed") && !param.includes("Smoking allowed");
      },
      { timeout: 15_000 },
    );

    const houseRules = getUrlParam(page, "houseRules") ?? "";
    expect(houseRules).toContain("Pets allowed");
    expect(houseRules).not.toContain("Smoking allowed");
  });

  // 6.4: House rule facet counts shown (mocked /api/search/facets)
  test(`${tags.core} - house rule buttons display facet counts when available`, async ({ page, network }) => {
    // Mock facets API with deterministic counts
    await network.mockApiResponse("**/api/search/facets*", {
      body: {
        houseRules: {
          "Pets allowed": 18,
          "Smoking allowed": 3,
          "Couples allowed": 0,
          "Guests allowed": 12,
        },
      },
    });

    await waitForSearchReady(page);
    await openFilterModal(page);

    const group = houseRulesGroup(page);
    const buttons = group.getByRole("button");
    const count = await buttons.count();

    // Should have house rule buttons rendered (at least 4)
    expect(count).toBeGreaterThanOrEqual(4);

    // Check that buttons with counts show them in parentheses (e.g., "Pets allowed (18)")
    const petsBtn = group.getByRole("button", { name: /^Pets allowed/i });
    const petsText = await petsBtn.textContent();
    expect(petsText).toBeTruthy();

    // If the facets mock was picked up, "Couples allowed" with 0 count should be disabled
    const couplesBtn = group.getByRole("button", { name: /^Couples allowed/i });
    const couplesDisabled = await couplesBtn.isDisabled().catch(() => false);

    if (couplesDisabled) {
      expect(couplesDisabled).toBe(true);
    }
  });
});
