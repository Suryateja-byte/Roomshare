import { test, expect } from "../fixtures/console-errors.fixture";
import { searchUrl } from "../fixtures/search-data.fixture";
import { FilterModal } from "../pages/FilterModal";
import { SearchPage } from "../pages/SearchPage";
import { seededSfSearchUrl } from "../utils/seedSearchData";
import {
  expectSaneSearchUrl,
  expectSearchParamAbsentEventually,
  expectSearchParamValueEventually,
} from "../utils/urlAssertions";

async function mockPositiveFilterFacets(page: import("@playwright/test").Page) {
  await page.route("**/api/search/facets**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        amenities: {
          Wifi: 12,
          AC: 8,
          Parking: 7,
          Washer: 9,
          Dryer: 9,
          Kitchen: 11,
          Gym: 4,
          Pool: 3,
          Furnished: 6,
        },
        houseRules: {
          "Pets allowed": 5,
          "Smoking allowed": 2,
          "Couples allowed": 4,
          "Guests allowed": 5,
        },
        roomTypes: {
          "Private Room": 9,
          "Shared Room": 4,
          "Entire Place": 3,
        },
        priceRanges: {
          min: 500,
          max: 4000,
          median: 1800,
        },
        priceHistogram: {
          bucketWidth: 500,
          buckets: [
            { min: 500, max: 1000, count: 4 },
            { min: 1000, max: 1500, count: 7 },
            { min: 1500, max: 2000, count: 8 },
            { min: 2000, max: 2500, count: 5 },
            { min: 2500, max: 4000, count: 3 },
          ],
        },
      }),
    });
  });
}

function nextMonthDate(day: number): string {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth() + 1, day);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

async function expectSearchParamContains(
  page: import("@playwright/test").Page,
  param: string,
  expected: string
) {
  await expect
    .poll(
      () =>
        new URL(page.url()).searchParams
          .getAll(param)
          .flatMap((value) => value.split(","))
          .filter(Boolean),
      { message: `${param} search param to contain ${expected}` }
    )
    .toContain(expected);
}

test.describe("Group C - Filters", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await mockPositiveFilterFacets(page);
  });

  test("C2 @desktop-anonymous modal applies every primary filter family and preserves location", async ({
    page,
    assertNoUnhandledErrors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-anonymous",
      "C2 is owned by the anonymous desktop project"
    );

    const search = new SearchPage(page);
    const filters = new FilterModal(page);
    const moveInDate = nextMonthDate(15);
    const endDate = nextMonthDate(20);

    await search.goto(
      searchUrl({
        locationLabel: "San Francisco, California, United States",
        lat: 37.7749,
        lng: -122.4194,
      })
    );
    await search.expectResultsOrBrowseState();

    await filters.open();
    await filters.reduceMaximumPrice(4);
    await filters.selectNextMonthDay("filter-move-in", 15);
    await filters.selectNextMonthDay("filter-end-date", 20);
    await filters.selectLeaseDuration(/6 months/i);
    await filters.selectRoomType(/private room/i);
    await filters.increaseMinimumOpenSpots();
    await filters.toggleAmenity("Wifi");
    await filters.toggleHouseRule("Pets allowed");
    await filters.selectLanguage("Span", /spanish/i);
    await filters.selectGenderPreference(/female identifying only/i);
    await filters.selectHouseholdGender(/mixed/i);
    await filters.apply();

    await expectSearchParamValueEventually(
      page,
      "locationLabel",
      "San Francisco, California, United States"
    );
    await expectSearchParamValueEventually(page, "moveInDate", moveInDate);
    await expectSearchParamValueEventually(page, "endDate", endDate);
    await expectSearchParamValueEventually(page, "leaseDuration", "6 months");
    await expectSearchParamValueEventually(page, "roomType", "Private Room");
    await expectSearchParamValueEventually(page, "minSlots", "2");
    await expectSearchParamContains(page, "amenities", "Wifi");
    await expectSearchParamContains(page, "houseRules", "Pets allowed");
    await expectSearchParamContains(page, "languages", "es");
    await expectSearchParamValueEventually(
      page,
      "genderPreference",
      "FEMALE_ONLY"
    );
    await expectSearchParamValueEventually(page, "householdGender", "MIXED");
    await expect
      .poll(() => new URL(page.url()).searchParams.has("maxPrice"), {
        message: "modal price slider to create a price param",
      })
      .toBe(true);

    await expect(search.appliedFiltersRegion()).toContainText(
      /Private Room|Wifi|6 months|Spanish/i,
      { timeout: 15_000 }
    );
    await search.expectResultsOrBrowseState();
    await search.expectNoCrashBoundary();
    await expectSaneSearchUrl(page);
    await assertNoUnhandledErrors();
  });

  test("C3 @desktop-anonymous chips and modal clear filters while keeping canonical URL", async ({
    page,
    assertNoUnhandledErrors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-anonymous",
      "C3 is owned by the anonymous desktop project"
    );

    const search = new SearchPage(page);
    const filters = new FilterModal(page);

    await search.goto(
      searchUrl({
        minPrice: 700,
        amenities: "Wifi",
        roomType: "Private Room",
        leaseDuration: "6 months",
      })
    );
    await search.expectResultsOrBrowseState();
    await expectSearchParamValueEventually(page, "amenities", "Wifi");

    await search.appliedFilterRemoveButton(/remove filter:?\s*wifi/i).click();

    await expectSearchParamAbsentEventually(page, "amenities");
    await expectSearchParamValueEventually(page, "roomType", "Private Room");

    await search.goto(
      searchUrl({
        minPrice: 700,
        roomType: "Private Room",
        leaseDuration: "6 months",
      })
    );
    await search.expectResultsOrBrowseState();
    await expectSearchParamValueEventually(page, "minPrice", "700");
    await expectSearchParamValueEventually(page, "roomType", "Private Room");
    await expectSearchParamValueEventually(page, "leaseDuration", "6 months");

    const urlBeforeModalClear = page.url();
    await filters.open();
    await filters.clearAll();
    await expect
      .poll(() => page.url(), {
        message: "modal Clear all to navigate to canonical cleared URL",
      })
      .not.toBe(urlBeforeModalClear);

    await expectSearchParamAbsentEventually(page, "minPrice");
    await expectSearchParamAbsentEventually(page, "roomType");
    await expectSearchParamAbsentEventually(page, "leaseDuration");
    await search.expectResultsOrBrowseState();
    await search.expectNoCrashBoundary();
    await expectSaneSearchUrl(page);
    await assertNoUnhandledErrors();
  });

  test("C4 @mobile-anonymous move-in calendar stays inline in the filter drawer", async ({
    page,
    assertNoUnhandledErrors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "mobile-anonymous",
      "C4 is owned by the anonymous mobile project"
    );

    const search = new SearchPage(page);
    const filters = new FilterModal(page);

    await search.goto(
      searchUrl({
        locationLabel: "San Francisco, California, United States",
        lat: 37.7749,
        lng: -122.4194,
      })
    );
    await search.expectResultsOrBrowseState();

    await filters.open();

    const dialog = filters.dialog();
    const minPriceThumb = dialog.getByRole("slider", {
      name: /minimum price/i,
    });
    const maxPriceThumb = dialog.getByRole("slider", {
      name: /maximum price/i,
    });
    const moveInTrigger = dialog.locator("#filter-move-in");

    await expect(minPriceThumb).toBeVisible();
    await expect(maxPriceThumb).toBeVisible();
    await expect(moveInTrigger).toBeVisible();

    await moveInTrigger.click();

    const calendar = dialog.locator("#filter-move-in-calendar");
    await expect(calendar).toBeVisible();

    const dialogBox = await dialog.boundingBox();
    const maxPriceBox = await maxPriceThumb.boundingBox();
    const moveInBox = await moveInTrigger.boundingBox();
    const calendarBox = await calendar.boundingBox();

    expect(dialogBox).not.toBeNull();
    expect(maxPriceBox).not.toBeNull();
    expect(moveInBox).not.toBeNull();
    expect(calendarBox).not.toBeNull();

    expect(calendarBox!.y).toBeGreaterThanOrEqual(
      moveInBox!.y + moveInBox!.height - 1
    );
    expect(calendarBox!.y).toBeGreaterThan(
      maxPriceBox!.y + maxPriceBox!.height
    );
    expect(calendarBox!.x).toBeGreaterThanOrEqual(dialogBox!.x - 1);
    expect(calendarBox!.x + calendarBox!.width).toBeLessThanOrEqual(
      dialogBox!.x + dialogBox!.width + 1
    );

    await search.expectNoCrashBoundary();
    await expectSaneSearchUrl(page);
    await assertNoUnhandledErrors();
  });
});
