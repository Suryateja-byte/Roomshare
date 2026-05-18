import { test, expect } from "../fixtures/console-errors.fixture";
import { searchBoundsParams, searchUrl } from "../fixtures/search-data.fixture";
import { waitForMobileSheet } from "../helpers/mobile-helpers";
import { SearchPage } from "../pages/SearchPage";
import {
  expectSaneSearchUrl,
  expectSearchParamValueEventually,
} from "../utils/urlAssertions";

const DEEP_LINK_PARAMS = {
  minPrice: "900",
  maxPrice: "1800",
  moveInDate: "2027-01-15",
  endDate: "2027-02-15",
  sort: "price_asc",
};

function legacyAndInvalidUrl(): string {
  const params = searchBoundsParams();
  params.set("where", "Irving Street, San Francisco");
  params.set("lat", "37.763");
  params.set("lng", "-122.466");
  params.set("minBudget", "900");
  params.set("maxBudget", "1800");
  params.set("startDate", "2027-01-15");
  params.set("endDate", "not-a-date");
  params.set("pageNumber", "2");
  params.set("cursor", "<script>alert('cursor')</script>");
  return `/search?${params.toString()}`;
}

async function expectReadyAndSafe(
  search: SearchPage,
  assertNoUnhandledErrors: () => Promise<void>
) {
  await search.expectResultsOrBrowseState();
  await search.expectNoCrashBoundary();
  await expectSaneSearchUrl(search.page);
  await assertNoUnhandledErrors();
}

test.describe("Group J - URL state and navigation", () => {
  test("J1 @desktop-anonymous deep links, refresh, back, and forward preserve sane state", async ({
    page,
    assertNoUnhandledErrors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-anonymous",
      "J1 desktop URL-state coverage is owned by the anonymous desktop project"
    );

    const search = new SearchPage(page);
    await search.goto(searchUrl(DEEP_LINK_PARAMS));
    await expectReadyAndSafe(search, assertNoUnhandledErrors);

    await expectSearchParamValueEventually(page, "minPrice", "900");
    await expectSearchParamValueEventually(page, "maxPrice", "1800");
    await expectSearchParamValueEventually(page, "moveInDate", "2027-01-15");
    await expectSearchParamValueEventually(page, "endDate", "2027-02-15");
    await expectSearchParamValueEventually(page, "sort", "price_asc");

    await page.reload({ waitUntil: "domcontentloaded" });
    await expectReadyAndSafe(search, assertNoUnhandledErrors);
    await expectSearchParamValueEventually(page, "maxPrice", "1800");

    await search.goto(searchUrl({ ...DEEP_LINK_PARAMS, maxPrice: "1200" }));
    await expectReadyAndSafe(search, assertNoUnhandledErrors);
    await expectSearchParamValueEventually(page, "maxPrice", "1200");

    await page.goBack({ waitUntil: "domcontentloaded" });
    await expectReadyAndSafe(search, assertNoUnhandledErrors);
    await expectSearchParamValueEventually(page, "maxPrice", "1800");

    await page.goForward({ waitUntil: "domcontentloaded" });
    await expectReadyAndSafe(search, assertNoUnhandledErrors);
    await expectSearchParamValueEventually(page, "maxPrice", "1200");
  });

  test("J1 @desktop-anonymous legacy params, invalid dates, and tampered cursors render safely", async ({
    page,
    assertNoUnhandledErrors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-anonymous",
      "J1 legacy/invalid URL coverage is owned by the anonymous desktop project"
    );

    const search = new SearchPage(page);
    const response = await search.goto(legacyAndInvalidUrl());
    expect(response?.status()).not.toBe(500);

    await expectReadyAndSafe(search, assertNoUnhandledErrors);

    await expect(
      page.getByText(/Irving Street, San Francisco/i).first()
    ).toBeAttached({ timeout: 15_000 });
    await expect(page.locator("body")).not.toContainText(/stack trace/i);
  });

  test("J1 @mobile-anonymous mobile deep link and refresh preserve sane URL-compatible state", async ({
    page,
    assertNoUnhandledErrors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "mobile-anonymous",
      "J1 mobile URL-state coverage is owned by the anonymous mobile project"
    );

    const search = new SearchPage(page);
    await search.goto(searchUrl({ minPrice: "900", maxPrice: "1800" }));
    await search.expectResultsOrBrowseState();
    expect(await waitForMobileSheet(page)).toBe(true);
    await expectSaneSearchUrl(page);

    await page.reload({ waitUntil: "domcontentloaded" });
    await search.expectResultsOrBrowseState();
    expect(await waitForMobileSheet(page)).toBe(true);
    await expectSearchParamValueEventually(page, "minPrice", "900");
    await expectSearchParamValueEventually(page, "maxPrice", "1800");
    await expectSaneSearchUrl(page);
    await assertNoUnhandledErrors();
  });
});
