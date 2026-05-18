import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/console-errors.fixture";
import { searchBoundsParams, searchUrl } from "../fixtures/search-data.fixture";
import { loadMoreButton } from "../helpers/search-release-gate-helpers";
import { setupPaginationMock } from "../helpers/pagination-mock-factory";
import { mockSearchRateLimit } from "../fixtures/network-errors.fixture";
import { SearchPage } from "../pages/SearchPage";
import { expectSaneSearchUrl } from "../utils/urlAssertions";

const MAX_EXPECTED_FILTER_CHIPS = 20;

function apiSearchUrl(params: URLSearchParams): string {
  return `/api/search/v2?${params.toString()}`;
}

function tamperedCursorPayload(): string {
  return Buffer.from(
    JSON.stringify({
      v: 999,
      k: ["NaN", "<script>alert('cursor')</script>"],
      id: "../../../etc/passwd",
      s: "recommended",
    })
  ).toString("base64url");
}

function excessiveArrayUrl(): string {
  const params = searchBoundsParams();

  for (let index = 0; index < 80; index++) {
    params.append("amenities", index % 2 === 0 ? "wifi" : `invalid-${index}`);
    params.append("houseRules", index % 3 === 0 ? "no_smoking" : "<script>");
    params.append("languages", index % 4 === 0 ? "English" : `lang-${index}`);
  }

  return `/search?${params.toString()}`;
}

async function installXssGuards(page: Page) {
  let dialogTriggered = false;
  page.on("dialog", async (dialog) => {
    dialogTriggered = true;
    await dialog.dismiss();
  });

  await page.addInitScript(() => {
    const win = window as typeof window & { __roomshareXssHit?: boolean };
    win.__roomshareXssHit = false;
    window.alert = () => {
      win.__roomshareXssHit = true;
    };
  });

  return {
    dialogTriggered: () => dialogTriggered,
    scriptTriggered: () =>
      page.evaluate(() => Boolean((window as any).__roomshareXssHit)),
  };
}

async function expectSearchSurfaceSafe(search: SearchPage) {
  await search.expectResultsOrBrowseState();
  await search.expectNoCrashBoundary();
  await expectSaneSearchUrl(search.page);
  await expect(search.page.locator("body")).not.toContainText(/stack trace/i);
}

async function expectNoDangerousDom(page: Page) {
  const dangerousDomCount = await page
    .locator('[onerror], [onload], a[href^="javascript:"]')
    .count();
  expect(dangerousDomCount).toBe(0);
}

async function activateRetryButton(page: Page) {
  const retryButton = page.getByRole("button", { name: /try again/i });
  await expect(retryButton).toBeVisible();
  await retryButton.focus();
  await expect(retryButton).toBeFocused();
  await page.keyboard.press("Enter");
}

test.describe("Group J - Security and abuse", () => {
  test("J2 @desktop-anonymous XSS query values do not execute or break search", async ({
    page,
    assertNoUnhandledErrors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-anonymous",
      "J2 XSS coverage is owned by the anonymous desktop project"
    );

    const guards = await installXssGuards(page);
    const payload = `<img src=x onerror="alert('xss')"><script>alert('xss')</script>javascript:alert(1)`;

    const search = new SearchPage(page);
    await search.goto(searchUrl({ q: payload }));
    await expectSearchSurfaceSafe(search);

    expect(guards.dialogTriggered()).toBe(false);
    expect(await guards.scriptTriggered()).toBe(false);
    await expectNoDangerousDom(page);
    await assertNoUnhandledErrors();
  });

  test("J3 @desktop-anonymous whitespace-only query trims to safe browse state", async ({
    page,
    assertNoUnhandledErrors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-anonymous",
      "J3 whitespace coverage is owned by the anonymous desktop project"
    );

    const search = new SearchPage(page);
    await search.goto(searchUrl({ q: "      " }, { bounds: false }));
    await expectSearchSurfaceSafe(search);

    const decodedQuery = new URL(page.url()).searchParams.get("q") ?? "";
    expect(decodedQuery.trim()).toBe("");

    const visibleCardCount = await search.listingCards().count();
    expect(visibleCardCount).toBeLessThanOrEqual(12);
    await assertNoUnhandledErrors();
  });

  test("J4 @desktop-anonymous tampered cursors are safe in API and page flows", async ({
    page,
    assertNoUnhandledErrors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-anonymous",
      "J4 cursor-tampering coverage is owned by the anonymous desktop project"
    );

    const cursor = tamperedCursorPayload();
    const params = searchBoundsParams();
    params.set("cursor", cursor);

    const response = await page.request.get(apiSearchUrl(params));
    expect(response.status()).not.toBe(500);

    const contentType = response.headers()["content-type"] ?? "";
    if (contentType.includes("application/json")) {
      const body = await response.json();
      expect(JSON.stringify(body)).not.toMatch(/stack trace|prisma|postgres/i);
    }

    const search = new SearchPage(page);
    await search.goto(`/search?${params.toString()}`);
    await expectSearchSurfaceSafe(search);
    await expectNoDangerousDom(page);
    await assertNoUnhandledErrors();
  });

  test("J5 @desktop-anonymous excessive arrays are capped or ignored safely", async ({
    page,
    assertNoUnhandledErrors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-anonymous",
      "J5 excessive-array coverage is owned by the anonymous desktop project"
    );

    const search = new SearchPage(page);
    await search.goto(excessiveArrayUrl());
    await expectSearchSurfaceSafe(search);
    await expectNoDangerousDom(page);

    const chipButtons = search
      .appliedFiltersRegion()
      .getByRole("button")
      .filter({ visible: true });
    const chipCount = await chipButtons.count().catch(() => 0);
    expect(chipCount).toBeLessThanOrEqual(MAX_EXPECTED_FILTER_CHIPS);
    await assertNoUnhandledErrors();
  });

  test("J6 @failure-mocked deterministic rate-limit burst remains user-readable and retryable", async ({
    page,
    assertNoUnhandledErrors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "failure-mocked",
      "J6 rate-limit burst coverage is owned by the failure-mocked project"
    );

    const mock = await setupPaginationMock(page, {
      totalLoadMoreItems: 24,
      rateLimitOnLoadMore: 1,
    });

    const search = new SearchPage(page);
    await search.goto(searchUrl());
    await search.expectResultsOrBrowseState();

    await mockSearchRateLimit(page);
    const burstStatuses = await page.evaluate(async () => {
      const url =
        "/api/search/v2?maxLat=37.850&maxLng=-122.350&minLat=37.700&minLng=-122.520";
      return Promise.all(
        Array.from({ length: 5 }, () =>
          fetch(url).then((response) => response.status)
        )
      );
    });
    expect(burstStatuses).toEqual([429, 429, 429, 429, 429]);

    const initialCount = await search.listingCards().count();
    expect(initialCount).toBeGreaterThan(0);
    await expect(loadMoreButton(page)).toBeVisible({ timeout: 15_000 });
    await loadMoreButton(page).click();

    const loadMoreAlert = search
      .resultsContainer()
      .getByRole("alert")
      .filter({ hasText: /too many requests/i });
    await expect(loadMoreAlert).toBeVisible({ timeout: 30_000 });
    expect(await search.listingCards().count()).toBe(initialCount);
    expect(mock.loadMoreCallCount()).toBe(1);

    await activateRetryButton(page);
    await expect(search.listingCards()).toHaveCount(initialCount + 12, {
      timeout: 30_000,
    });
    await expect(loadMoreAlert).toBeHidden({ timeout: 5_000 });
    expect(mock.successfulLoadCount()).toBe(1);
    await expectSearchSurfaceSafe(search);
    await assertNoUnhandledErrors();
  });
});
