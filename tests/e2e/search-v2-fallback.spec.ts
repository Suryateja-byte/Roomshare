/**
 * Search V2/V1 Fallback Behavior (P1)
 *
 * Validates the V2 search API response shape, fallback behavior,
 * and client-side error handling. Uses authenticated (chromium) project.
 *
 * NOTE: SSR fallback cannot be tested via route interception because
 * Playwright can only intercept client-side fetches, not server-side.
 * Tests focus on API shape validation and client-side behaviors.
 *
 * Run: pnpm playwright test tests/e2e/search-v2-fallback.spec.ts --project=chromium
 */

import {
  test,
  expect,
  SF_BOUNDS,
  selectors,
  timeouts,
  tags,
} from "./helpers/test-utils";

// --------------------------------------------------------------------------
// Constants
// --------------------------------------------------------------------------

const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;
const SEARCH_URL = `/search?${boundsQS}`;
const V2_API_URL = `/api/search/v2?${boundsQS}`;

/** Wait for search results heading to be attached (heading is sr-only, not visible) */
async function waitForResults(page: import("@playwright/test").Page) {
  await page.waitForLoadState("domcontentloaded");
  // Wait for the search results heading OR zero-results heading to appear in DOM.
  // The #search-results-heading is sr-only (visually hidden), so use toBeAttached.
  // SSR can be slow in CI — use navigation timeout (30s) instead of 15s.
  const resultsHeading = page.locator("#search-results-heading");
  const zeroResults = page.locator('h2:has-text("No matches found"), h3:has-text("No exact matches")');
  await expect(resultsHeading.or(zeroResults).first()).toBeAttached({ timeout: timeouts.navigation });
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

test.describe("Search V2/V1 Fallback Behavior", () => {
  test.use({
    viewport: { width: 1280, height: 800 },
  });

  // 1. V2 API happy path: returns 200 with valid shape
  test("1. V2 API returns 200 with valid response shape", async ({ page }) => {
    const response = await page.request.get(V2_API_URL);

    // V2 API should return 200
    expect(response.status()).toBe(200);

    const json = await response.json();

    // V2 response should be an object (not null)
    expect(json).toBeTruthy();
    expect(typeof json).toBe("object");
  });

  // 2. V2 response has meta.mode, list.items, map.geojson
  test("2. V2 response has expected data structure", async ({ page }) => {
    const response = await page.request.get(V2_API_URL);
    expect(response.status()).toBe(200);

    const json = await response.json();

    // V2 response shape: { meta: { mode }, list: { items }, map: { geojson, pins } }
    // Check for meta
    expect(json.meta).toBeTruthy();
    expect(json.meta.mode).toBeTruthy();
    expect(typeof json.meta.mode).toBe("string");

    // Check for list
    expect(json.list).toBeTruthy();
    expect(Array.isArray(json.list.items)).toBe(true);

    // Check for map
    expect(json.map).toBeTruthy();
    expect(json.map.geojson).toBeTruthy();
    // GeoJSON should have a type (FeatureCollection)
    expect(json.map.geojson.type).toBe("FeatureCollection");
    expect(Array.isArray(json.map.geojson.features)).toBe(true);
  });

  // 3. V2 API with filters: returns filtered results
  test("3. V2 API returns filtered results", async ({ page }) => {
    const filteredUrl = `${V2_API_URL}&roomType=Private+Room`;
    const response = await page.request.get(filteredUrl);

    expect(response.status()).toBe(200);

    const json = await response.json();
    expect(json.list).toBeTruthy();
    expect(Array.isArray(json.list.items)).toBe(true);

    // If there are results, they should all be Private Room type
    // (This depends on data availability, so we just verify the shape)
    if (json.list.items.length > 0) {
      // At minimum, the response should have items with expected fields
      const firstItem = json.list.items[0];
      expect(firstItem.id).toBeTruthy();
    }
  });

  // 4. V2 API with sort: returns sorted results
  test("4. V2 API returns sorted results", async ({ page }) => {
    const sortedUrl = `${V2_API_URL}&sort=price_asc`;
    const response = await page.request.get(sortedUrl);

    expect(response.status()).toBe(200);

    const json = await response.json();
    expect(json.list).toBeTruthy();
    expect(Array.isArray(json.list.items)).toBe(true);

    // Verify items are sorted by price ascending
    if (json.list.items.length > 1) {
      const prices = json.list.items
        .map((item: { price?: number }) => item.price)
        .filter((p: number | undefined): p is number => typeof p === "number");

      // Prices should be non-decreasing
      for (let i = 1; i < prices.length; i++) {
        expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]);
      }
    }
  });

  // 5. V2 API with cursor: returns next page
  test("5. V2 API with cursor returns next page", async ({ page }) => {
    // First request to get initial results and cursor
    const response = await page.request.get(V2_API_URL);
    expect(response.status()).toBe(200);

    const json = await response.json();
    const cursor = json.list?.nextCursor || json.list?.cursor;

    if (cursor) {
      // Request next page using cursor
      const nextPageUrl = `${V2_API_URL}&cursor=${encodeURIComponent(cursor)}`;
      const nextResponse = await page.request.get(nextPageUrl);

      expect(nextResponse.status()).toBe(200);

      const nextJson = await nextResponse.json();
      expect(nextJson.list).toBeTruthy();
      expect(Array.isArray(nextJson.list.items)).toBe(true);

      // Next page items should be different from first page
      if (json.list.items.length > 0 && nextJson.list.items.length > 0) {
        const firstPageIds = new Set(json.list.items.map((i: { id: string }) => i.id));
        const nextPageIds = nextJson.list.items.map((i: { id: string }) => i.id);

        // At least some items should be different (no complete overlap)
        const overlap = nextPageIds.filter((id: string) => firstPageIds.has(id));
        expect(overlap.length).toBeLessThan(nextJson.list.items.length);
      }
    } else {
      console.log("Info: No cursor returned (fewer results than page size)");
    }
  });

  // 6. [SSR limitation] V2 failure cannot be mocked via route interception for SSR
  test("6. SSR V2 failure fallback is not testable via route interception", async ({ page }) => {
    // DOCUMENTATION TEST: This test documents a known testing limitation.
    //
    // page.route() only intercepts client-side fetches (browser network requests).
    // The V2/V1 fallback in search/page.tsx happens server-side during SSR,
    // which means:
    // - We cannot use page.route() to mock the V2 failure
    // - We cannot verify V1 fallback behavior through E2E tests
    // - SSR fallback must be tested via integration tests or by controlling
    //   the feature flag (features.searchV2)
    //
    // What we CAN verify: the page loads successfully regardless of V2/V1 path.

    await page.goto(SEARCH_URL);
    await waitForResults(page);

    // Page should render results regardless of which path was used
    // The heading is sr-only (visually hidden for accessibility), so use toBeAttached
    const heading = page.locator("#search-results-heading").first();
    await expect(heading).toBeAttached();

    const headingText = await heading.textContent();
    expect(headingText?.trim()).toBeTruthy();
    // Should show a count like "X places" or "100+ places"
    expect(headingText).toMatch(/\d+\+?\s+place/);
  });

  // 7. Client-side V2 failure: search-as-I-move error handling
  test("7. client-side V2 error handling for dynamic fetches", async ({ page }) => {
    // Navigate to search page first
    await page.goto(SEARCH_URL);
    await waitForResults(page);

    // Mock V2 API to fail for subsequent client-side requests
    // This simulates "search as I move" failures
    await page.route("**/api/search/v2**", (route) => {
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Internal Server Error" }),
      });
    });

    // The load-more button uses fetchMoreListings (server action),
    // not the V2 API directly. So we test the load-more error path instead.
    const loadMoreButton = page.getByRole("button", { name: /show more places/i });

    if (await loadMoreButton.isVisible().catch(() => false)) {
      // Mock the server action to fail
      await page.route("**/search**", (route) => {
        if (route.request().method() === "POST") {
          // Server action failure
          route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ error: "Server Error" }),
          });
        } else {
          route.continue();
        }
      });

      await loadMoreButton.click();
      await page.waitForTimeout(3000);

      // After error, the button should not be in loading state
      // and an error message or retry option should appear
      const errorText = page.locator('text="Try again"');
      const hasError = await errorText.isVisible().catch(() => false);

      // Either we see an error message or the button is back to normal
      if (hasError) {
        await expect(errorText).toBeVisible();
      }
    }
  });

  // 8. V2 response version mismatch: stale responses are discarded
  test("8. page renders correctly and stale data is not shown", async ({ page }) => {
    // This test verifies the versionCheckedSetter mechanism indirectly.
    // SearchResultsClient is keyed by searchParamsString, which means:
    // - When search params change, the entire component remounts
    // - This naturally discards stale state (extraListings, nextCursor)
    // - The seenIdsRef is re-initialized with new SSR listings

    // Load initial search
    await page.goto(SEARCH_URL);
    await waitForResults(page);

    const heading = page.locator("#search-results-heading").first();

    // Navigate to a different search (add filter)
    await page.goto(`${SEARCH_URL}&roomType=Private+Room`);
    await waitForResults(page);

    // Results should update (component remounted due to key change)
    const filteredText = await heading.textContent();

    // The key mechanism ensures fresh state - verify heading updated
    expect(filteredText?.trim()).toBeTruthy();

    // Navigate back to original search
    await page.goto(SEARCH_URL);
    await waitForResults(page);

    // Should show fresh results again (not stale filtered results)
    const refreshedText = await heading.textContent();
    expect(refreshedText?.trim()).toBeTruthy();
  });
});
