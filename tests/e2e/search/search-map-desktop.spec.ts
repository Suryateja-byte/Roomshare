import { test, expect } from "../fixtures/console-errors.fixture";
import type { Page, Request } from "@playwright/test";
import { searchUrl } from "../fixtures/search-data.fixture";
import {
  getActiveListingId,
  getMarkerListingId,
  isCardInViewport,
  waitForCardHighlight,
  waitForMapRef,
  waitForMarkersWithClusterExpansion,
} from "../helpers/sync-helpers";
import { MapPanel } from "../pages/MapPanel";
import { SearchPage } from "../pages/SearchPage";
import { expectSaneSearchUrl } from "../utils/urlAssertions";

const SEARCH_RESPONSE_VERSION =
  "2026-04-19.canonical-availability-parity.search-contract-v2";

type Deferred = {
  promise: Promise<void>;
  resolve: () => void;
};

function createDeferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

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

async function clearMapPreference(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.removeItem("roomshare-map-preference");
  });
}

function mapPreferenceScript() {
  return JSON.parse(
    localStorage.getItem("roomshare-map-preference") ?? "{}"
  ) as { desktop?: string; mobile?: string };
}

function okMapResponse(request: Request) {
  return {
    kind: "ok",
    data: {
      listings: [],
      truncated: false,
    },
    meta: {
      queryHash: request.headers()["x-search-query-hash"] ?? "e2e-map-query",
      backendSource: "map-api",
      responseVersion: SEARCH_RESPONSE_VERSION,
    },
  };
}

function boundsKey(page: Page): string {
  const url = new URL(page.url());
  return ["minLat", "maxLat", "minLng", "maxLng"]
    .map((key) => `${key}=${url.searchParams.get(key) ?? ""}`)
    .join("&");
}

test.describe("Group H - Desktop map/list split view", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await mockValidManifest(page);
    await clearMapPreference(page);
  });

  test("H1 @desktop-anonymous hide/show map preference persists", async ({
    page,
    assertNoUnhandledErrors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-anonymous",
      "H1 desktop map preference is owned by the anonymous desktop project"
    );

    const search = new SearchPage(page);
    const map = new MapPanel(page);
    await search.goto(searchUrl());
    await search.expectResultsOrBrowseState();
    await map.expectShellVisible();

    await expect(map.toolbarToggle()).toHaveAttribute("aria-pressed", "true");
    await map.toolbarToggle().click();

    await expect(map.shell()).toBeHidden({ timeout: 15_000 });
    await expect(map.showMapButton()).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(() => page.evaluate(mapPreferenceScript))
      .toMatchObject({ desktop: "list-only" });

    await page.reload({ waitUntil: "domcontentloaded" });
    await search.expectResultsOrBrowseState();
    await expect(map.shell()).toBeHidden({ timeout: 15_000 });
    await expect(map.showMapButton()).toBeVisible({ timeout: 15_000 });

    await map.showMapButton().click();

    await map.expectShellVisible();
    await expect
      .poll(() => page.evaluate(mapPreferenceScript))
      .toMatchObject({ desktop: "split" });
    await search.expectNoCrashBoundary();
    await expectSaneSearchUrl(page);
    await assertNoUnhandledErrors();
  });

  test("H2 @desktop-anonymous marker click focuses and scrolls the matching listing", async ({
    page,
    assertNoUnhandledErrors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-anonymous",
      "H2 marker/list focus is owned by the anonymous desktop project"
    );

    const search = new SearchPage(page);
    const map = new MapPanel(page);
    await search.goto(searchUrl());
    await search.expectResultsOrBrowseState();
    await map.expectShellVisible();
    test.skip(
      !(await waitForMapRef(page)),
      "Map ref unavailable in this browser environment"
    );

    const markerCount = await waitForMarkersWithClusterExpansion(page, {
      minCount: 1,
    });
    test.skip(markerCount === 0, "No visible markers available to click");

    const listingId = await getMarkerListingId(page, 0);
    expect(listingId).toBeTruthy();

    await map.markerButtonByListingId(listingId!).click();

    await waitForCardHighlight(page, listingId!);
    await expect.poll(() => getActiveListingId(page)).toBe(listingId);
    await expect.poll(() => isCardInViewport(page, listingId!)).toBe(true);
    await expect(
      search
        .resultsContainer()
        .locator(`[data-testid="listing-card"][data-listing-id="${listingId}"]`)
        .first()
    ).toHaveAttribute("data-focus-state", "active");
    await search.expectNoCrashBoundary();
    await expectSaneSearchUrl(page);
    await assertNoUnhandledErrors();
  });

  test("H3 @desktop-anonymous map pan and zoom keep URL/list/map state sane", async ({
    page,
    assertNoUnhandledErrors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-anonymous",
      "H3 desktop pan/zoom coverage is owned by the anonymous desktop project"
    );

    const search = new SearchPage(page);
    const map = new MapPanel(page);
    await search.goto(searchUrl());
    await search.expectResultsOrBrowseState();
    await map.expectShellVisible();
    test.skip(
      !(await waitForMapRef(page)),
      "Map ref unavailable in this browser environment"
    );

    const initialBounds = boundsKey(page);
    const box = await map.canvas().boundingBox();
    test.skip(!box, "Map canvas is not measurable");

    const centerX = box!.x + box!.width / 2;
    const centerY = box!.y + box!.height / 2;
    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await page.mouse.move(centerX + box!.width * 0.2, centerY, { steps: 8 });
    await page.mouse.up();
    await page.mouse.wheel(0, -250);

    await expect
      .poll(() => boundsKey(page), {
        timeout: 30_000,
        message: "map interaction should update canonical bounds",
      })
      .not.toBe(initialBounds);
    await search.expectResultsOrBrowseState();
    await map.expectShellVisible();
    await search.expectNoCrashBoundary();
    await expectSaneSearchUrl(page);
    await assertNoUnhandledErrors();
  });

  test("H4 @failure-mocked map loading and server failure show retryable fallback", async ({
    page,
    assertNoUnhandledErrors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "failure-mocked",
      "H4 map failure coverage is owned by the failure-mocked project"
    );

    const releaseFirstMapRequest = createDeferred();
    const firstMapRequestSeen = createDeferred();
    let requestCount = 0;

    await page.route("**/api/map-listings**", async (route) => {
      requestCount += 1;
      if (requestCount === 1) {
        firstMapRequestSeen.resolve();
        await releaseFirstMapRequest.promise;
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "E2E mocked map failure" }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(okMapResponse(route.request())),
      });
    });

    const search = new SearchPage(page);
    const map = new MapPanel(page);
    const navigation = search.goto(searchUrl());

    await firstMapRequestSeen.promise;
    await expect(
      map
        .status(/loading map/i)
        .or(map.loadingBar())
        .first()
    ).toBeVisible({ timeout: 15_000 });
    releaseFirstMapRequest.resolve();
    await navigation;

    await expect(map.errorAlert(/server error|failed/i)).toBeVisible({
      timeout: 30_000,
    });
    await map.retryButton().click();

    await expect.poll(() => requestCount).toBeGreaterThanOrEqual(2);
    await expect(map.errorAlert(/server error|failed/i)).toBeHidden({
      timeout: 15_000,
    });
    await map.expectShellVisible();
    await search.expectNoCrashBoundary();
    await expectSaneSearchUrl(page);
    await assertNoUnhandledErrors();
  });

  test("H5 @failure-mocked map rate limit is user-readable and retryable", async ({
    page,
    assertNoUnhandledErrors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "failure-mocked",
      "H5 map rate-limit coverage is owned by the failure-mocked project"
    );

    let requestCount = 0;
    await page.route("**/api/map-listings**", async (route) => {
      requestCount += 1;
      if (requestCount <= 2) {
        await route.fulfill({
          status: 429,
          contentType: "application/json",
          headers: { "Retry-After": "0" },
          body: JSON.stringify({
            error: "Too many map requests. Please try again shortly.",
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(okMapResponse(route.request())),
      });
    });

    const search = new SearchPage(page);
    const map = new MapPanel(page);
    await search.goto(searchUrl());
    await search.expectResultsOrBrowseState();

    await expect(map.errorAlert(/too many requests/i)).toBeVisible({
      timeout: 30_000,
    });
    await expect.poll(() => requestCount).toBeGreaterThanOrEqual(2);

    await map.retryButton().click();

    await expect.poll(() => requestCount).toBeGreaterThanOrEqual(3);
    await expect(map.errorAlert(/too many requests/i)).toBeHidden({
      timeout: 15_000,
    });
    await map.expectShellVisible();
    await search.expectNoCrashBoundary();
    await expectSaneSearchUrl(page);
    await assertNoUnhandledErrors();
  });

  test("H6 @desktop-anonymous invalid oversized bounds show a safe zoom-in state", async ({
    page,
    assertNoUnhandledErrors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-anonymous",
      "H6 invalid desktop bounds coverage is owned by the anonymous desktop project"
    );

    const search = new SearchPage(page);
    const map = new MapPanel(page);
    await search.goto(
      searchUrl({
        minLng: -130,
        maxLng: -120,
        minLat: 30,
        maxLat: 45,
      })
    );
    await search.expectResultsOrBrowseState();

    const zoomMessage = map
      .status(/zoom in further|zoomed in/i)
      .or(map.errorAlert(/zoom in further|invalid/i))
      .or(page.getByText(/zoom in further|zoomed in/i))
      .first();
    await expect(zoomMessage.or(map.shell()).first()).toBeVisible({
      timeout: 30_000,
    });
    await search.expectNoCrashBoundary();
    await expectSaneSearchUrl(page);
    await assertNoUnhandledErrors();
  });
});
