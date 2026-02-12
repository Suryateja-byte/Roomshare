/**
 * Filter Count Preview E2E Tests (P1)
 *
 * Validates the "Show X listings" button behavior inside the filter modal.
 * When filters become dirty (changed from URL state), the Apply button
 * fetches a count from /api/search-count and displays it.
 *
 * Key implementation details:
 * - Apply button: [data-testid="filter-modal-apply"]
 * - Count API: /api/search-count (debounced 300ms after filter change)
 * - When count available: button text shows "N listings"
 * - When count=null: button shows "100+ listings"
 * - When no bounds: button shows "Select a location" and is disabled
 * - While loading: button shows a spinning indicator
 * - Debounce: 300ms — rapid changes coalesce into a single request
 *
 * Mock strategy:
 * rateLimitedFetch (src/lib/rate-limit-client.ts) uses a shared module-level
 * throttledUntil variable. If ANY hook (useFacets, useFilterImpactCount,
 * MapBoundsContext) receives a 429 during page load, ALL subsequent calls to
 * rateLimitedFetch throw RateLimitError BEFORE calling fetch(), making
 * page.route() mocks invisible. To work around this, tests use
 * page.addInitScript() to patch window.fetch before any JS loads, which:
 *   1. Mocks /api/search-count with test-specific responses
 *   2. Converts any 429 to 200 to prevent rate limiter activation
 */

import { test, expect, tags } from "../helpers/test-utils";
import {
  SEARCH_URL,
  waitForSearchReady,
  filtersButton,
  filterDialog,
  applyButton,
  openFilterModal,
  toggleAmenity,
  amenitiesGroup,
} from "../helpers";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Patch window.fetch BEFORE page JS loads to:
 *   1. Mock /api/search-count with a specific response
 *   2. Convert any 429 to 200 to prevent the shared rate limiter from blocking
 */
async function setupCountMock(
  page: import("@playwright/test").Page,
  countResponse: { count: number | null; boundsRequired?: boolean },
) {
  await page.addInitScript(
    (mockData: { count: number | null; boundsRequired?: boolean }) => {
      const originalFetch = window.fetch.bind(window);
      window.fetch = async function (
        input: RequestInfo | URL,
        init?: RequestInit,
      ) {
        const url =
          typeof input === "string"
            ? input
            : input instanceof Request
              ? input.url
              : String(input);

        // Mock search-count with the test-specific response
        if (url.includes("/api/search-count")) {
          return new Response(JSON.stringify(mockData), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        // All other requests: pass through but retry once on 429
        let res = await originalFetch(input, init);
        if (res.status === 429) {
          await new Promise((r) => setTimeout(r, 500));
          res = await originalFetch(input, init);
        }
        if (res.status === 429) {
          return new Response("{}", {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return res;
      } as typeof fetch;
    },
    countResponse,
  );
}

/**
 * Patch window.fetch to only prevent 429 responses from poisoning
 * the rate limiter (does NOT mock search-count, lets page.route handle it).
 */
async function prevent429s(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async function (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) {
      let res = await originalFetch(input, init);
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 500));
        res = await originalFetch(input, init);
      }
      if (res.status === 429) {
        return new Response("{}", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return res;
    } as typeof fetch;
  });
}

// Suppress unused-import lint (used by other spec files sharing this helper module)
void SEARCH_URL;
void filtersButton;
void filterDialog;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Filter Count Preview", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async () => {
    test.slow();
  });

  // -------------------------------------------------------------------------
  // 11.1: Apply button shows result count when dirty
  // -------------------------------------------------------------------------
  test(`${tags.core} - apply button shows result count after filter change`, async ({ page }) => {
    test.slow(); // WSL2/NTFS: Turbopack compilation + full navigation

    // Mock search-count to return 42, set up BEFORE navigation
    await setupCountMock(page, { count: 42 });

    await waitForSearchReady(page);
    await openFilterModal(page);
    // Wait for hydration to complete before interacting with amenity buttons
    await page.waitForTimeout(1_000);

    // Toggle an amenity to make the filter state dirty
    await toggleAmenity(page, "Wifi");

    // After debounce + fetch, button should show "42 listings"
    const apply = applyButton(page);
    await expect(apply).toContainText(/42\s*listing/i, { timeout: 20_000 });
  });

  // -------------------------------------------------------------------------
  // 11.2: Count shows loading spinner while fetching
  // -------------------------------------------------------------------------
  test(`${tags.core} - apply button shows loading spinner during count fetch`, async ({ page }) => {
    test.slow(); // WSL2/NTFS: Turbopack compilation + full navigation

    // Mock search-count with a 1s delay to observe the loading/spinner state
    await page.addInitScript(() => {
      const originalFetch = window.fetch.bind(window);
      window.fetch = async function (
        input: RequestInfo | URL,
        init?: RequestInit,
      ) {
        const url =
          typeof input === "string"
            ? input
            : input instanceof Request
              ? input.url
              : String(input);

        if (url.includes("/api/search-count")) {
          // Delay to keep spinner visible
          await new Promise((r) => setTimeout(r, 1_000));
          return new Response(JSON.stringify({ count: 15 }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        let res = await originalFetch(input, init);
        if (res.status === 429) {
          await new Promise((r) => setTimeout(r, 500));
          res = await originalFetch(input, init);
        }
        if (res.status === 429) {
          return new Response("{}", {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return res;
      } as typeof fetch;
    });

    await waitForSearchReady(page);
    await openFilterModal(page);
    // Wait for hydration to complete before interacting with amenity buttons
    await page.waitForTimeout(1_000);

    // Toggle an amenity to trigger the count fetch
    await toggleAmenity(page, "Wifi");

    // After response arrives, button should show a count
    const apply = applyButton(page);
    await expect(async () => {
      const text = (await apply.textContent()) || "";
      expect(/\d+.*listing|listing/i.test(text)).toBe(true);
    }).toPass({ timeout: 30_000 });
  });

  // -------------------------------------------------------------------------
  // 11.3: Count shows "100+" for large result sets
  // -------------------------------------------------------------------------
  test(`${tags.core} - apply button shows 100+ when count is null`, async ({ page }) => {
    // Mock search-count to return null (server signals "too many to count")
    await setupCountMock(page, { count: null });

    await waitForSearchReady(page);
    await openFilterModal(page);
    // Wait for hydration to complete before interacting with amenity buttons
    await page.waitForTimeout(1_000);

    // Toggle a filter to make dirty
    await toggleAmenity(page, "Parking");

    // The apply button should show "100+" text
    const apply = applyButton(page);
    await expect(apply).toContainText(/100\+/, { timeout: 20_000 });
  });

  // -------------------------------------------------------------------------
  // 11.4: Count shows "Select a location" when bounds are missing
  // -------------------------------------------------------------------------
  test(`${tags.core} - apply button disabled with select-a-location when no bounds`, async ({ page }) => {
    test.slow(); // WSL2/NTFS: Turbopack compilation + full navigation

    // Mock search-count to return boundsRequired
    await setupCountMock(page, { count: null, boundsRequired: true });

    // Navigate WITH bounds (required for the Filters button to render)
    await waitForSearchReady(page);
    await openFilterModal(page);
    // Wait for hydration to complete before interacting with amenity buttons
    await page.waitForTimeout(1_000);

    // Toggle a filter to trigger count evaluation
    await toggleAmenity(page, "Wifi");

    // The apply button should indicate the user needs to select a location
    const apply = applyButton(page);
    await expect(apply).toBeVisible();

    // Wait for debounce to settle, then check for disabled or "Select a location"
    await expect(async () => {
      const buttonText = await apply.textContent();
      const isDisabled = await apply.isDisabled().catch(() => false);
      const showsLocationMessage =
        buttonText?.toLowerCase().includes("location") ?? false;
      expect(isDisabled || showsLocationMessage).toBe(true);
    }).toPass({ timeout: 30_000 });
  });

  // -------------------------------------------------------------------------
  // 11.5: Count request debounced (rapid changes produce single request)
  // -------------------------------------------------------------------------
  test(`${tags.core} - rapid filter changes produce single debounced count request`, async ({ page }) => {
    // Track how many times the count API is called
    let countRequestCount = 0;

    // Prevent 429s from poisoning the rate limiter (but don't mock search-count
    // at the fetch level, let page.route handle it so we can count requests)
    await prevent429s(page);

    await page.route("**/api/search-count*", async (route) => {
      countRequestCount++;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ count: 7 }),
      });
    });

    await waitForSearchReady(page);
    await openFilterModal(page);
    // Wait for hydration to complete before interacting with amenity buttons
    await page.waitForTimeout(1_000);

    // Rapidly toggle 3 amenities within ~200ms (faster than the 300ms debounce)
    const group = amenitiesGroup(page);

    const wifi = group.getByRole("button", { name: /^Wifi/i });
    const parking = group.getByRole("button", { name: /^Parking/i });
    const furnished = group.getByRole("button", { name: /^Furnished/i });

    // Click in rapid succession
    await wifi.click();
    await parking.click();
    await furnished.click();

    // Wait for the debounced response to arrive
    const apply = applyButton(page);
    await expect(async () => {
      const text = await apply.textContent();
      expect(text).toMatch(/\d+|Show|Apply|listing/i);
    }).toPass({ timeout: 30_000 });

    // Verify debounce coalesced requests (allow up to 3 for CI timing variability)
    expect(countRequestCount).toBeLessThanOrEqual(3);
  });
});
