import { test, expect } from "../fixtures/console-errors.fixture";
import { SearchPage } from "../pages/SearchPage";
import { seededSfSearchUrl } from "../utils/seedSearchData";
import {
  expectSaneSearchUrl,
  expectSearchParamAbsentEventually,
  expectSearchParamValueEventually,
} from "../utils/urlAssertions";

test.describe("Group C - Budget validation", () => {
  test.describe.configure({ mode: "serial" });

  test("C1 @desktop-anonymous valid min/max budget creates canonical price params", async ({
    page,
    assertNoUnhandledErrors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-anonymous",
      "C1 is owned by the anonymous desktop project"
    );

    const search = new SearchPage(page);
    await search.goto(seededSfSearchUrl());
    await search.expectResultsOrBrowseState();

    await search.setDesktopHeaderBudget("700", "2200");
    await search.submitDesktopHeaderSearch();

    await expectSearchParamValueEventually(page, "minPrice", "700");
    await expectSearchParamValueEventually(page, "maxPrice", "2200");
    await expect(search.appliedFiltersRegion()).toContainText(/\$700|2,200/i, {
      timeout: 15_000,
    });
    await search.expectResultsOrBrowseState();
    await search.expectNoCrashBoundary();
    await expectSaneSearchUrl(page);
    await assertNoUnhandledErrors();
  });

  test("C1 @desktop-anonymous inverted and negative budgets are normalized safely", async ({
    page,
    assertNoUnhandledErrors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-anonymous",
      "C1 is owned by the anonymous desktop project"
    );

    const search = new SearchPage(page);
    await search.goto(seededSfSearchUrl());
    await search.expectResultsOrBrowseState();

    await search.setDesktopHeaderBudget("3000", "1000");
    await search.submitDesktopHeaderSearch();

    await expectSearchParamValueEventually(page, "minPrice", "1000");
    await expectSearchParamValueEventually(page, "maxPrice", "3000");

    await search.goto(seededSfSearchUrl());
    await search.expectResultsOrBrowseState();
    await search.setDesktopHeaderBudget("-100", "-50");
    await search.submitDesktopHeaderSearch();

    await expect
      .poll(
        () => {
          const url = new URL(page.url());
          const values = [
            url.searchParams.get("minPrice"),
            url.searchParams.get("maxPrice"),
          ];
          return {
            hasRawNegative: /minPrice=-|maxPrice=-/.test(url.href),
            allValuesSafe: values.every(
              (value) => value === null || Number(value) >= 0
            ),
          };
        },
        { message: "negative budget params to be clamped or removed" }
      )
      .toEqual({ hasRawNegative: false, allValuesSafe: true });

    await search.expectResultsOrBrowseState();
    await search.expectNoCrashBoundary();
    await expectSaneSearchUrl(page);
    await assertNoUnhandledErrors();
  });

  test("C1 @desktop-anonymous empty budget values remove price params", async ({
    page,
    assertNoUnhandledErrors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-anonymous",
      "C1 is owned by the anonymous desktop project"
    );

    const search = new SearchPage(page);
    await search.goto(seededSfSearchUrl());
    await search.expectResultsOrBrowseState();

    await search.setDesktopHeaderBudget("800", "2400");
    await search.submitDesktopHeaderSearch();
    await expectSearchParamValueEventually(page, "minPrice", "800");
    await expectSearchParamValueEventually(page, "maxPrice", "2400");

    await search.clearDesktopHeaderBudget();
    await search.submitDesktopHeaderSearch();

    await expectSearchParamAbsentEventually(page, "minPrice");
    await expectSearchParamAbsentEventually(page, "maxPrice");
    await search.expectResultsOrBrowseState();
    await search.expectNoCrashBoundary();
    await expectSaneSearchUrl(page);
    await assertNoUnhandledErrors();
  });
});
