import { test, expect } from "../fixtures/console-errors.fixture";
import {
  mockLocalAutocomplete,
  SEARCH_LOCATION_FIXTURES,
} from "../fixtures/mapbox.fixture";
import { searchUrl } from "../fixtures/search-data.fixture";
import { SearchPage } from "../pages/SearchPage";
import { seededSfSearchUrl } from "../utils/seedSearchData";
import {
  expectSaneSearchUrl,
  expectSearchParamAbsentEventually,
  expectSearchParamMatchingEventually,
  expectSearchParamValueEventually,
} from "../utils/urlAssertions";

test.describe("Group B - Location, query, and header search", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await mockLocalAutocomplete(page, [
      SEARCH_LOCATION_FIXTURES.irvingStreet,
      SEARCH_LOCATION_FIXTURES.sanFrancisco,
    ]);
  });

  test("B1 @desktop-anonymous selected autocomplete location creates canonical URL state", async ({
    page,
    assertNoUnhandledErrors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-anonymous",
      "B1 is owned by the anonymous desktop project"
    );

    const search = new SearchPage(page);
    await search.goto(seededSfSearchUrl());
    await search.expectResultsOrBrowseState();

    await search.selectDesktopHeaderLocation("Irving Street", /Irving Street/i);
    await expect(search.desktopHeaderLocationInput()).toHaveValue(
      "Irving Street, San Francisco, California, United States"
    );
    await search.submitDesktopHeaderSearch();

    await expectSearchParamValueEventually(
      page,
      "locationLabel",
      "Irving Street, San Francisco, California, United States"
    );
    await expectSearchParamValueEventually(page, "lat", "37.7635");
    await expectSearchParamValueEventually(page, "lng", "-122.4662");
    await expectSearchParamMatchingEventually(page, "minLat", /^37\./);
    await expectSearchParamMatchingEventually(page, "minLng", /^-122\./);

    await search.expectResultsOrBrowseState();
    await search.expectNoCrashBoundary();
    await search.expectSaneUrl();

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(search.desktopHeaderLocationInput()).toHaveValue(
      "Irving Street, San Francisco, California, United States"
    );
    await search.expectResultsOrBrowseState();
    await assertNoUnhandledErrors();
  });

  test("B2 @desktop-anonymous typed location without selecting suggestion shows required warning", async ({
    page,
    assertNoUnhandledErrors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-anonymous",
      "B2 is owned by the anonymous desktop project"
    );

    const search = new SearchPage(page);
    await search.goto(seededSfSearchUrl());
    await search.expectResultsOrBrowseState();
    await search.waitForDesktopHeaderHydrated();

    await search.desktopHeaderLocationInput().click();
    await search.desktopHeaderLocationInput().fill("San Francisco");
    await expect(search.desktopHeaderLocationInput()).toHaveValue(
      "San Francisco"
    );
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    );
    await search.desktopHeaderSearchButton().click();

    await expect(
      page.getByText("Select a location from the dropdown suggestions.").first()
    ).toBeVisible({ timeout: 15_000 });
    await expect(search.desktopHeaderLocationInput()).toBeFocused();
    await expect(search.desktopHeaderLocationInput()).toHaveValue(
      "San Francisco"
    );
    await expectSearchParamAbsentEventually(page, "locationLabel");
    await expectSearchParamAbsentEventually(page, "lat");
    await expectSaneSearchUrl(page);
    await assertNoUnhandledErrors();
  });

  test("B3 @desktop-anonymous semantic vibe query submits through canonical what param", async ({
    page,
    assertNoUnhandledErrors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-anonymous",
      "B3 is owned by the anonymous desktop project"
    );

    const search = new SearchPage(page);
    await search.goto(seededSfSearchUrl());
    await search.expectResultsOrBrowseState();
    await search.waitForDesktopHeaderHydrated();

    await expect(search.desktopHeaderVibeInput()).toBeVisible();
    await search.desktopHeaderVibeInput().fill("quiet roommates");
    await expect(search.desktopHeaderVibeInput()).toHaveValue(
      "quiet roommates"
    );
    await search.submitDesktopHeaderSearch();

    await expectSearchParamValueEventually(page, "what", "quiet roommates");
    await expectSearchParamAbsentEventually(page, "locationLabel");
    await search.expectResultsOrBrowseState();
    await search.expectNoCrashBoundary();
    await search.expectSaneUrl();
    await assertNoUnhandledErrors();
  });

  test("B4 @desktop-anonymous desktop header search remains usable after results scroll", async ({
    page,
    assertNoUnhandledErrors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-anonymous",
      "B4 is owned by the anonymous desktop project"
    );

    const search = new SearchPage(page);
    await search.goto(seededSfSearchUrl());
    await search.expectResultsOrBrowseState();
    await search.waitForDesktopHeaderHydrated();

    await page.mouse.wheel(0, 700);
    await expect(search.desktopHeaderForm()).toBeVisible();
    await expect(search.desktopHeaderLocationInput()).toBeVisible();

    await search.desktopHeaderVibeInput().fill("sunny studio");
    await expect(search.desktopHeaderVibeInput()).toHaveValue("sunny studio");
    await search.submitDesktopHeaderSearch();

    await expectSearchParamValueEventually(page, "what", "sunny studio");
    await search.expectResultsOrBrowseState();
    await search.expectNoCrashBoundary();
    await search.expectSaneUrl();
    await assertNoUnhandledErrors();
  });
});
