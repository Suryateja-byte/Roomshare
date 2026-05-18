import { test, expect } from "../fixtures/console-errors.fixture";
import {
  loadMoreButton,
  selectSortOption,
} from "../helpers/search-release-gate-helpers";
import { setupPaginationMock } from "../helpers/pagination-mock-factory";
import { searchUrl } from "../fixtures/search-data.fixture";
import { SearchPage } from "../pages/SearchPage";
import {
  expectCursorReset,
  expectNoDuplicateValues,
} from "../utils/cursorAssertions";
import { expectSaneSearchUrl } from "../utils/urlAssertions";

async function visibleListingIds(search: SearchPage): Promise<string[]> {
  const ids = await search
    .listingCards()
    .evaluateAll((nodes) =>
      nodes
        .map((node) => node.getAttribute("data-listing-id"))
        .filter((id): id is string => Boolean(id))
    );

  return ids;
}

async function activateRetryButton(page: import("@playwright/test").Page) {
  const retryButton = page.getByRole("button", { name: /try again/i });
  await expect(retryButton).toBeVisible();
  await retryButton.focus();
  await expect(retryButton).toBeFocused();
  await page.keyboard.press("Enter");
}

test.describe("Group E - Sort and pagination", () => {
  test.describe.configure({ mode: "serial" });

  test("E1 @desktop-anonymous sort resets pagination and removes cursor state", async ({
    page,
    assertNoUnhandledErrors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-anonymous",
      "E1 is owned by the anonymous desktop project"
    );

    await setupPaginationMock(page, { totalLoadMoreItems: 24 });

    const search = new SearchPage(page);
    await search.goto(searchUrl());
    await search.expectResultsOrBrowseState();

    const initialCount = await search.listingCards().count();
    expect(initialCount).toBeGreaterThan(0);
    expect(initialCount).toBeLessThanOrEqual(12);

    await expect(loadMoreButton(page)).toBeVisible({ timeout: 15_000 });
    await loadMoreButton(page).click();
    await expect(search.listingCards()).toHaveCount(initialCount + 12, {
      timeout: 30_000,
    });

    await selectSortOption(page, "Price: Low to High");
    await page.waitForURL(/sort=price_asc/, { timeout: 15_000 });
    await expect(search.listingCards().first()).toBeVisible({
      timeout: 30_000,
    });

    const resetCount = await search.listingCards().count();
    expect(resetCount).toBeGreaterThan(0);
    expect(resetCount).toBeLessThanOrEqual(12);
    expect(new URL(page.url()).searchParams.get("sort")).toBe("price_asc");
    expectCursorReset(page);
    expect(new URL(page.url()).searchParams.get("page")).toBeNull();
    expectNoDuplicateValues(await visibleListingIds(search));
    await search.expectNoCrashBoundary();
    await expectSaneSearchUrl(page);
    await assertNoUnhandledErrors();
  });

  test("E2 @desktop-anonymous show more appends unique cards without URL cursor", async ({
    page,
    assertNoUnhandledErrors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-anonymous",
      "E2 is owned by the anonymous desktop project"
    );

    const mock = await setupPaginationMock(page, { totalLoadMoreItems: 24 });

    const search = new SearchPage(page);
    await search.goto(searchUrl());
    await search.expectResultsOrBrowseState();

    const initialCount = await search.listingCards().count();
    expect(initialCount).toBeGreaterThan(0);
    await expect(loadMoreButton(page)).toBeVisible({ timeout: 15_000 });

    await loadMoreButton(page).click();
    await expect(search.listingCards()).toHaveCount(initialCount + 12, {
      timeout: 30_000,
    });
    expect(mock.loadMoreCallCount()).toBe(1);
    expect(mock.successfulLoadCount()).toBe(1);
    expectNoDuplicateValues(await visibleListingIds(search));
    expectCursorReset(page);

    await expect(loadMoreButton(page)).toBeVisible({ timeout: 15_000 });
    await loadMoreButton(page).click();
    await expect(search.listingCards()).toHaveCount(initialCount + 24, {
      timeout: 30_000,
    });
    expect(mock.loadMoreCallCount()).toBe(2);
    expect(mock.successfulLoadCount()).toBe(2);
    expectNoDuplicateValues(await visibleListingIds(search));
    expectCursorReset(page);

    await search.expectNoCrashBoundary();
    await expectSaneSearchUrl(page);
    await assertNoUnhandledErrors();
  });

  test("E3 @desktop-anonymous load-more failure is retryable without duplicates", async ({
    page,
    assertNoUnhandledErrors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-anonymous",
      "E3 is owned by the anonymous desktop project"
    );

    const mock = await setupPaginationMock(page, {
      totalLoadMoreItems: 24,
      failOnLoadMore: 1,
    });

    const search = new SearchPage(page);
    await search.goto(searchUrl());
    await search.expectResultsOrBrowseState();

    const initialCount = await search.listingCards().count();
    expect(initialCount).toBeGreaterThan(0);
    await expect(loadMoreButton(page)).toBeVisible({ timeout: 15_000 });

    await loadMoreButton(page).click();

    const retryButton = page.getByRole("button", { name: /try again/i });
    const loadMoreAlert = search
      .resultsContainer()
      .getByRole("alert")
      .filter({ hasText: /connection lost/i });
    await expect(loadMoreAlert).toBeVisible({ timeout: 30_000 });
    await expect(retryButton).toBeVisible();
    expect(await search.listingCards().count()).toBe(initialCount);
    expect(mock.loadMoreCallCount()).toBe(1);
    expect(mock.successfulLoadCount()).toBe(0);

    await activateRetryButton(page);
    await expect(search.listingCards()).toHaveCount(initialCount + 12, {
      timeout: 30_000,
    });
    await expect(loadMoreAlert).toBeHidden({ timeout: 5_000 });
    expect(mock.loadMoreCallCount()).toBe(2);
    expect(mock.successfulLoadCount()).toBe(1);
    expectNoDuplicateValues(await visibleListingIds(search));
    expectCursorReset(page);
    await search.expectNoCrashBoundary();
    await expectSaneSearchUrl(page);
    await assertNoUnhandledErrors();
  });

  test("E4 @desktop-anonymous load-more rate limit is user-readable and retryable", async ({
    page,
    assertNoUnhandledErrors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-anonymous",
      "E4 is owned by the anonymous desktop project"
    );

    const mock = await setupPaginationMock(page, {
      totalLoadMoreItems: 24,
      rateLimitOnLoadMore: 1,
    });

    const search = new SearchPage(page);
    await search.goto(searchUrl());
    await search.expectResultsOrBrowseState();

    const initialCount = await search.listingCards().count();
    expect(initialCount).toBeGreaterThan(0);
    await expect(loadMoreButton(page)).toBeVisible({ timeout: 15_000 });

    await loadMoreButton(page).click();

    const retryButton = page.getByRole("button", { name: /try again/i });
    const loadMoreAlert = search
      .resultsContainer()
      .getByRole("alert")
      .filter({ hasText: /too many requests/i });
    await expect(loadMoreAlert).toBeVisible({ timeout: 30_000 });
    await expect(retryButton).toBeVisible();
    expect(await search.listingCards().count()).toBe(initialCount);
    expect(mock.loadMoreCallCount()).toBe(1);
    expect(mock.successfulLoadCount()).toBe(0);

    await activateRetryButton(page);
    await expect(search.listingCards()).toHaveCount(initialCount + 12, {
      timeout: 30_000,
    });
    await expect(loadMoreAlert).toBeHidden({ timeout: 5_000 });
    expect(mock.loadMoreCallCount()).toBe(2);
    expect(mock.successfulLoadCount()).toBe(1);
    expectNoDuplicateValues(await visibleListingIds(search));
    expectCursorReset(page);
    await search.expectNoCrashBoundary();
    await expectSaneSearchUrl(page);
    await assertNoUnhandledErrors();
  });
});
