import { test, expect } from "../fixtures/console-errors.fixture";
import { SearchPage } from "../pages/SearchPage";
import { seededSfSearchUrl } from "../utils/seedSearchData";

test.describe("Group A - Search page baseline", () => {
  test("A1 @desktop-anonymous @smoke anonymous user opens /search without errors", async ({
    page,
    assertNoUnhandledErrors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-anonymous",
      "A1 is the anonymous desktop smoke owner"
    );

    const search = new SearchPage(page);
    const response = await search.goto(seededSfSearchUrl());

    expect(response?.status()).toBe(200);
    await search.expectResultsOrBrowseState();
    await search.expectNoCrashBoundary();
    await search.expectSaneUrl();

    await page.reload({ waitUntil: "domcontentloaded" });
    await search.expectResultsOrBrowseState();
    await search.expectNoCrashBoundary();
    await search.expectSaneUrl();
    await assertNoUnhandledErrors();
  });
});
