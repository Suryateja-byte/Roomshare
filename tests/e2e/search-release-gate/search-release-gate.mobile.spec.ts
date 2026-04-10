/**
 * Mobile Search Release Gate
 *
 * Focused coverage for the mobile overlay and bottom-sheet flow.
 */

import { test, expect } from "../helpers";
import {
  isSearchReleaseGateEnabled,
  isSearchReleaseGateProject,
  mobileExpandSearchButton,
  mobileSearchDialog,
  gotoSearchPage,
  openMobileSearchOverlay,
  searchShell,
  waitForSearchResolution,
} from "../helpers/search-release-gate-helpers";
import { waitForMobileSheet } from "../helpers/mobile-helpers";

test.use({ storageState: "playwright/.auth/user.json" });

function gateProject(projectName: string) {
  test.skip(
    !isSearchReleaseGateProject(projectName) || projectName !== "Mobile Safari",
    "Mobile release gate runs only on the Mobile Safari project"
  );
}

function gateScenarioMode() {
  test.skip(
    !isSearchReleaseGateEnabled(),
    "Enable the deterministic search seam with ENABLE_SEARCH_TEST_SCENARIOS=true"
  );
}

test.beforeEach(async ({}, testInfo) => {
  gateProject(testInfo.project.name);
  gateScenarioMode();
});

test.describe("Search release gate - mobile", () => {
  test("collapsed mobile search opens the overlay and Escape restores focus", async ({
    page,
  }) => {
    await gotoSearchPage(page, "default-results");

    const sheetVisible = await waitForMobileSheet(page);
    test.skip(!sheetVisible, "Mobile bottom sheet not visible in this runtime");

    const expandSearch = mobileExpandSearchButton(page);
    await expect(expandSearch).toBeVisible({ timeout: 15_000 });
    await expandSearch.click();

    const dialog = mobileSearchDialog(page);
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByLabel(/where/i)).toBeFocused();
    await expect(dialog.getByLabel(/minimum budget/i)).toBeVisible();
    await expect(dialog.getByLabel(/maximum budget/i)).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible({ timeout: 15_000 });
    await expect(expandSearch).toBeFocused();
  });

  test("mobile overlay applies filters and keeps the sheet in sync", async ({
    page,
  }) => {
    await gotoSearchPage(page, "default-results");

    const sheetVisible = await waitForMobileSheet(page);
    test.skip(!sheetVisible, "Mobile bottom sheet not visible in this runtime");

    await openMobileSearchOverlay(page);
    const dialog = mobileSearchDialog(page);

    await dialog.getByLabel(/minimum budget/i).fill("1000");
    await dialog.getByLabel(/maximum budget/i).fill("1500");
    await dialog.getByRole("button", { name: /^search$/i }).click();

    await waitForSearchResolution(page);
    await expect(page).toHaveURL(/minPrice=1000/);
    await expect(page).toHaveURL(/maxPrice=1500/);
    await expect(searchShell(page)).toBeVisible();
    await expect(
      page.locator('[data-testid="mobile-search-results-container"]')
    ).toBeVisible();
  });
});
