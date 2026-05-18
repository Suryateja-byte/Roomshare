import { test, expect } from "../fixtures/console-errors.fixture";
import { setupPaginationMock } from "../helpers/pagination-mock-factory";
import { searchUrl } from "../fixtures/search-data.fixture";
import { SearchPage } from "../pages/SearchPage";
import { expectSaneSearchUrl } from "../utils/urlAssertions";

test.describe("Group D - Results states", () => {
  test.describe.configure({ mode: "serial" });

  test("D1 @desktop-anonymous zero results show suggestions or clear path", async ({
    page,
    assertNoUnhandledErrors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-anonymous",
      "D1 is owned by the anonymous desktop project"
    );

    const search = new SearchPage(page);
    await search.goto(
      searchUrl({
        amenities: "Pool,Gym,Furnished",
        roomType: "Shared Room",
        maxPrice: 50,
      })
    );

    await expect(
      page.getByText(/No matches found|No exact matches/i).first()
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page
        .getByRole("button", { name: /clear all filters|clear filters/i })
        .or(page.getByRole("link", { name: /clear all filters/i }))
        .or(page.getByRole("button", { name: /browse all/i }))
        .first()
    ).toBeVisible({ timeout: 15_000 });
    await search.expectNoCrashBoundary();
    await expectSaneSearchUrl(page);
    await assertNoUnhandledErrors();
  });

  test("D2 @desktop-anonymous sparse results show expansion suggestions", async ({
    page,
    assertNoUnhandledErrors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-anonymous",
      "D2 is owned by the anonymous desktop project"
    );

    const search = new SearchPage(page);
    await search.goto(
      searchUrl({
        amenities: "Gym",
        roomType: "Entire Place",
        maxPrice: 1900,
      })
    );

    await expect(search.listingCards().first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/Expand your search/i).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByText(/within \$200 of your budget|in a wider area/i).first()
    ).toBeVisible({ timeout: 15_000 });
    await search.expectNoCrashBoundary();
    await expectSaneSearchUrl(page);
    await assertNoUnhandledErrors();
  });

  test("D3 @desktop-anonymous result cap asks user to refine search", async ({
    page,
    assertNoUnhandledErrors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-anonymous",
      "D3 is owned by the anonymous desktop project"
    );

    await setupPaginationMock(page, { totalLoadMoreItems: 60 });

    const search = new SearchPage(page);
    await search.goto(searchUrl());
    await search.expectResultsOrBrowseState();

    const loadMoreButton = page.getByRole("button", {
      name: /show more places/i,
    });
    await expect(loadMoreButton).toBeVisible({ timeout: 15_000 });

    for (let index = 0; index < 4; index += 1) {
      if (!(await loadMoreButton.isVisible().catch(() => false))) {
        break;
      }
      await loadMoreButton.click();
      await expect
        .poll(
          async () =>
            (await loadMoreButton.isVisible().catch(() => false))
              ? !(await loadMoreButton.isDisabled().catch(() => false))
              : true,
          { message: "load more action to finish" }
        )
        .toBe(true);
    }

    await expect(
      page.getByRole("heading", {
        name: /reached the 60-result browsing limit/i,
      })
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole("button", { name: /refine search/i })
    ).toBeVisible();
    await expect(loadMoreButton).toBeHidden();
    await search.expectNoCrashBoundary();
    await expectSaneSearchUrl(page);
    await assertNoUnhandledErrors();
  });

  test("D4 @desktop-anonymous expanded near matches show separator and advisory", async ({
    page,
    assertNoUnhandledErrors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-anonymous",
      "D4 is owned by the anonymous desktop project"
    );

    const search = new SearchPage(page);
    await search.goto(
      searchUrl({
        amenities: "Pool,Gym,Parking",
        roomType: "Entire Place",
        maxPrice: 1900,
        nearMatches: 1,
      })
    );

    await expect(
      page.locator('[role="separator"][aria-label*="near match"]').first()
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByText(/expanded|near matches|slightly outside/i).first()
    ).toBeVisible({ timeout: 15_000 });
    await expect(search.listingCards().first()).toBeVisible();
    await search.expectNoCrashBoundary();
    await expectSaneSearchUrl(page);
    await assertNoUnhandledErrors();
  });
});
