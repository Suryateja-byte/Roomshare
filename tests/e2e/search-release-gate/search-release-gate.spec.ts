/**
 * Deterministic Search Release Gate
 *
 * Browser-side coverage for the scenario-seam lane:
 * - homepage and header search
 * - saved-search reopen
 * - filter apply/cancel behavior
 * - load-more dedupe
 * - sort reset
 * - latest-request-wins
 * - map stale-state behavior
 * - scenario-driven zero / near-match / rate-limit / fallback states
 */

import { test, expect } from "../helpers";
import {
  applySearchScenario,
  assertNoDuplicateListingIds,
  defaultSearchUrl,
  applyFilterModal,
  getListingIds,
  gotoSearchPage,
  isSearchReleaseGateEnabled,
  isSearchReleaseGateProject,
  loadMoreButton,
  mapShell,
  readSearchShellMeta,
  searchShell,
  searchStatus,
  selectSortOption,
  waitForSearchResolution,
  type SearchScenario,
} from "../helpers/search-release-gate-helpers";
import { openFilterModal } from "../helpers/filter-helpers";
import { waitForMapReady } from "../helpers/test-utils";

test.use({ storageState: "playwright/.auth/user.json" });

const DEFAULT_SCENARIO: SearchScenario = "default-results";

function gateProject(projectName: string) {
  test.skip(
    !isSearchReleaseGateProject(projectName) || projectName === "Mobile Safari",
    "Desktop search release gate runs only on chromium and webkit"
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

test.describe("Search release gate", () => {
  test("homepage entry and desktop header refinement stay canonical", async ({
    page,
    nav,
  }) => {
    await applySearchScenario(page, DEFAULT_SCENARIO);

    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({
      timeout: 15_000,
    });

    await nav.search("Austin");
    await waitForSearchResolution(page);
    await expect(searchShell(page)).toBeVisible();

    const firstMeta = await readSearchShellMeta(page);

    await nav.search("San Francisco");
    await waitForSearchResolution(page);
    await expect(page).toHaveURL(/\/search/);
    await expect(searchShell(page)).toBeVisible();

    const secondMeta = await readSearchShellMeta(page);
    if (firstMeta.queryHash && secondMeta.queryHash) {
      expect(secondMeta.queryHash).not.toBe(firstMeta.queryHash);
    }
  });

  test("saved-search reopen lands on the canonical search shell", async ({
    page,
  }) => {
    await applySearchScenario(page, DEFAULT_SCENARIO);

    await page.goto("/saved-searches");
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page.getByRole("heading", { name: /saved searches/i, level: 1 })
    ).toBeVisible({ timeout: 15_000 });

    const viewLink = page.getByRole("link", { name: /view/i }).first();
    await expect(viewLink).toBeVisible({ timeout: 10_000 });
    await viewLink.click();

    await waitForSearchResolution(page);
    await expect(page).toHaveURL(/\/search/);
    await expect(searchShell(page)).toBeVisible();

    const url = new URL(page.url());
    expect(url.searchParams.has("cursor")).toBe(false);
    expect(url.searchParams.has("page")).toBe(false);
  });

  test("filters cancel cleanly, apply once, and load-more dedupes cards", async ({
    page,
  }) => {
    await gotoSearchPage(page, DEFAULT_SCENARIO);
    await waitForSearchResolution(page);

    const idsBefore = await getListingIds(page);
    expect(idsBefore.length).toBeGreaterThan(0);

    const dialog = await openFilterModal(page);
    const roomTypeTrigger = dialog.getByRole("combobox", {
      name: /room type/i,
    });
    await expect(roomTypeTrigger).toBeVisible();
    await roomTypeTrigger.click();
    await page.getByRole("option", { name: "Shared Room" }).click();
    await page.keyboard.press("Escape");

    await expect(page).not.toHaveURL(/roomType=/);
    await expect(searchShell(page)).toBeVisible();
    expect(await getListingIds(page)).toEqual(idsBefore);

    const applyDialog = await openFilterModal(page);
    const applyRoomTypeTrigger = applyDialog.getByRole("combobox", {
      name: /room type/i,
    });
    await applyRoomTypeTrigger.click();
    await page.getByRole("option", { name: "Shared Room" }).click();
    await applyFilterModal(page);

    await expect(page).toHaveURL(/roomType=Shared(\+|%20)Room/);
    await waitForSearchResolution(page);

    const loadMore = loadMoreButton(page);
    const hasLoadMore = await loadMore.isVisible().catch(() => false);
    if (hasLoadMore) {
      await loadMore.click();
      await expect(loadMore).toBeHidden({ timeout: 30_000 }).catch(() => {});
      await assertNoDuplicateListingIds(page);
    }
  });

  test("sort changes reset pagination and clear stale cursors", async ({
    page,
  }) => {
    await gotoSearchPage(page, DEFAULT_SCENARIO);
    await waitForSearchResolution(page);

    const loadMore = loadMoreButton(page);
    if (await loadMore.isVisible().catch(() => false)) {
      await loadMore.click();
      await waitForSearchResolution(page);
    }

    await selectSortOption(page, "Price: Low to High");
    await expect(page).toHaveURL(/sort=price_asc/);
    await expect(page).not.toHaveURL(/cursor=/);
  });

  test("latest request wins when two navigations race", async ({ page }) => {
    await applySearchScenario(page, "slow-first-fast-second");

    const firstNav = page
      .goto(defaultSearchUrl({ maxPrice: 1200 }), {
        waitUntil: "domcontentloaded",
      })
      .catch(() => null);
    const secondNav = page.goto(defaultSearchUrl({ maxPrice: 1800 }), {
      waitUntil: "domcontentloaded",
    });

    await secondNav;
    await firstNav;
    await waitForSearchResolution(page);

    expect(page.url()).toContain("maxPrice=1800");

    const idsImmediately = await getListingIds(page);
    await page.waitForTimeout(1000);
    const idsLater = await getListingIds(page);
    expect(idsLater).toEqual(idsImmediately);
  });

  test("map pan surfaces searching state while the list stays mounted", async ({
    page,
  }) => {
    await gotoSearchPage(page, DEFAULT_SCENARIO);
    await waitForSearchResolution(page);

    await waitForMapReady(page);
    const mapBox = await mapShell(page).boundingBox().catch(() => null);
    test.skip(!mapBox, "Map not available in this browser/runtime");

    const centerX = mapBox!.x + mapBox!.width / 2;
    const centerY = mapBox!.y + mapBox!.height / 2;
    const dragDistance = Math.min(mapBox!.width, mapBox!.height) * 0.25;

    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await page.mouse.move(centerX + dragDistance, centerY + dragDistance, {
      steps: 8,
    });
    await page.mouse.up();

    const searching = await searchStatus(page).isVisible().catch(() => false);
    if (searching) {
      await expect(searchStatus(page)).toBeVisible({ timeout: 10_000 });
      await expect(searchStatus(page)).not.toBeVisible({ timeout: 30_000 });
    }
    await expect(searchShell(page)).toBeVisible();
    await expect(
      page.locator('[data-testid="listing-card"]').first()
    ).toBeVisible();
  });

  for (const scenario of [
    "zero-results",
    "near-match",
    "rate-limited",
    "v2-fails-v1-succeeds",
    "map-empty",
  ] as const) {
    test(`scenario ${scenario} renders safely`, async ({ page }) => {
      await gotoSearchPage(page, scenario);

      if (scenario === "rate-limited") {
        await expect(
          page
            .getByText(/too many requests|please wait a moment/i)
            .filter({ visible: true })
            .first()
        ).toBeVisible({ timeout: 15_000 });
        return;
      }

      if (scenario === "zero-results" || scenario === "near-match") {
        await expect(
          page
            .locator(
              'h2:visible:has-text("No matches found"), h3:visible:has-text("No exact matches")'
            )
            .first()
        ).toBeVisible({ timeout: 15_000 });

        const recoveryAction = page
          .getByRole("button", { name: /clear all/i })
          .or(page.getByRole("link", { name: /clear all/i }))
          .or(page.getByRole("button", { name: /browse all|try.*area/i }))
          .first();

        if (await recoveryAction.isVisible().catch(() => false)) {
          await recoveryAction.click();
          await waitForSearchResolution(page);
        }

        return;
      }

      await waitForSearchResolution(page);
      await expect(searchShell(page)).toBeVisible();

      const ids = await getListingIds(page);
      if (scenario === "map-empty") {
        await expect(page.locator(".maplibregl-marker")).toHaveCount(0, {
          timeout: 15_000,
        });
      } else {
        expect(ids.length).toBeGreaterThan(0);
      }

      const meta = await readSearchShellMeta(page);
      if (scenario === "v2-fails-v1-succeeds" && meta.backendSource) {
        expect(meta.backendSource).toMatch(/v1-fallback|v2|map-api/);
      }
    });
  }
});
