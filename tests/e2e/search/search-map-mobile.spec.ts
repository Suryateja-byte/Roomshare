import { test, expect } from "../fixtures/console-errors.fixture";
import type { Page } from "@playwright/test";
import { searchUrl } from "../fixtures/search-data.fixture";
import {
  getSheetSnapIndex,
  mobileSelectors,
  navigateToMobileSearch,
  setSheetSnap,
  waitForMobileSheet,
} from "../helpers/mobile-helpers";
import { MobileSearchOverlay } from "../pages/MobileSearchOverlay";
import { SearchPage } from "../pages/SearchPage";
import { expectSaneSearchUrl } from "../utils/urlAssertions";

async function mockValidManifest(page: Page) {
  await page.route("**/manifest.json", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/manifest+json",
      body: JSON.stringify({
        name: "RoomShare",
        short_name: "RoomShare",
        start_url: "/",
        display: "standalone",
      }),
    });
  });
}

async function clearRecentSearches(page: Page) {
  await page.addInitScript(() => {
    localStorage.removeItem("roomshare-recent-searches");
  });
}

async function seedRecentSearches(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      "roomshare-recent-searches",
      JSON.stringify([
        {
          id: "e2e-recent-irving",
          location: "Irving Street, San Francisco",
          timestamp: Date.now(),
          filters: {
            minPrice: "900",
            maxPrice: "1800",
            roomType: "Private Room",
          },
        },
      ])
    );
  });
}

test.describe("Group I - Mobile map/list and collapsed search overlay", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await mockValidManifest(page);
  });

  test("I1 @mobile-anonymous bottom sheet reaches map, peek, and list snap states", async ({
    page,
    assertNoUnhandledErrors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "mobile-anonymous",
      "I1 mobile snap coverage is owned by the anonymous mobile project"
    );

    await clearRecentSearches(page);
    const ready = await navigateToMobileSearch(page);
    test.skip(!ready, "Mobile bottom sheet is not visible in this environment");

    const snapContent = page.locator(mobileSelectors.snapContent).first();
    await expect(snapContent).toHaveAttribute("data-snap-current", "1");

    await setSheetSnap(page, 0);
    await expect(snapContent).toHaveAttribute("data-snap-current", "0");
    await expect(
      page.locator(mobileSelectors.mapContainer).first()
    ).toBeVisible({
      timeout: 15_000,
    });

    await setSheetSnap(page, 2);
    await expect(snapContent).toHaveAttribute("data-snap-current", "2");
    await expect(
      page.locator(mobileSelectors.mobileResults).first()
    ).toBeVisible();

    await setSheetSnap(page, 1);
    expect(await getSheetSnapIndex(page)).toBe(1);
    await assertNoUnhandledErrors();
  });

  test("I2 @mobile-anonymous collapsed overlay supports budget, filters, and back", async ({
    page,
    assertNoUnhandledErrors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "mobile-anonymous",
      "I2 mobile overlay coverage is owned by the anonymous mobile project"
    );

    await clearRecentSearches(page);
    const search = new SearchPage(page);
    await search.goto(searchUrl());
    await search.expectResultsOrBrowseState();
    expect(await waitForMobileSheet(page)).toBe(true);

    const overlay = new MobileSearchOverlay(page);
    await overlay.open();
    await expect(overlay.whereInput()).toBeFocused();

    await overlay.minBudgetInput().fill("900");
    await overlay.maxBudgetInput().fill("1800");
    await overlay.filtersButton().click();

    const filtersDialog = page.getByRole("dialog", { name: /filters/i });
    await expect(filtersDialog).toBeVisible({ timeout: 15_000 });
    await filtersDialog.getByRole("button", { name: /close/i }).first().click();
    await expect(filtersDialog).toBeHidden({ timeout: 15_000 });
    await expect(overlay.overlay()).toBeVisible();

    await overlay.searchButton().click();

    await expect(overlay.overlay()).toBeHidden({ timeout: 15_000 });
    await expect
      .poll(() => new URL(page.url()).searchParams.get("minPrice"))
      .toBe("900");
    await expect
      .poll(() => new URL(page.url()).searchParams.get("maxPrice"))
      .toBe("1800");
    await expectSaneSearchUrl(page);

    await overlay.open();
    const urlBeforeBack = page.url();
    await overlay.backButton().click();
    await expect(overlay.overlay()).toBeHidden({ timeout: 15_000 });
    expect(page.url()).toBe(urlBeforeBack);
    await assertNoUnhandledErrors();
  });

  test("I3 @mobile-anonymous recent searches render and can be removed", async ({
    page,
    assertNoUnhandledErrors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "mobile-anonymous",
      "I3 recent-search coverage is owned by the anonymous mobile project"
    );

    await seedRecentSearches(page);
    const search = new SearchPage(page);
    await search.goto(searchUrl());
    await search.expectResultsOrBrowseState();
    expect(await waitForMobileSheet(page)).toBe(true);

    const overlay = new MobileSearchOverlay(page);
    await overlay.open();
    await expect(
      overlay.overlay().getByRole("heading", { name: /recent searches/i })
    ).toBeVisible();
    await expect(
      overlay.recentSearch(/Irving Street, San Francisco/i)
    ).toBeVisible();

    await overlay
      .overlay()
      .getByRole("button", { name: /remove irving street, san francisco/i })
      .click();

    await expect(
      overlay.recentSearch(/Irving Street, San Francisco/i)
    ).toBeHidden();
    await expect(
      overlay.overlay().getByText(/your recent searches will appear here/i)
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => localStorage.getItem("roomshare-recent-searches"))
      )
      .toBeNull();
    await assertNoUnhandledErrors();
  });
});
