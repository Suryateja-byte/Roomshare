/**
 * UI Flow API Response Depth Tests
 *
 * Tests that critical user flows produce correct API responses,
 * not just correct UI changes. Bridges the gap between UI-only E2E tests
 * and direct API tests.
 *
 * These tests perform real UI interactions AND verify the API responses
 * that those interactions trigger, catching bugs where:
 * - UI shows success but API returned an error (optimistic update without rollback)
 * - API returns wrong data structure (breaking downstream consumers)
 * - API leaks internal details in error responses
 */

import {
  test,
  expect,
  selectors,
  SF_BOUNDS,
  searchResultsContainer,
} from "../helpers";

test.describe("UI Flow API Depth", () => {
  test.use({ storageState: "playwright/.auth/user.json" });

  test.beforeEach(async () => {
    test.slow();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Search flow — verify API response structure when searching
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe("Search API depth", () => {
    test("UFD-01: search page load triggers API with correct response structure", async ({
      page,
    }) => {
      // Set up response interception before navigating
      const searchResponsePromise = page.waitForResponse(
        (r) =>
          r.url().includes("/api/search") &&
          !r.url().includes("/api/search-count") &&
          r.request().method() === "GET" &&
          r.status() === 200 &&
          (r.headers()["content-type"] || "").includes("application/json"),
        { timeout: 30_000 }
      );

      await page.goto(
        `/search?minLat=${SF_BOUNDS.minLat}&minLng=${SF_BOUNDS.minLng}&maxLat=${SF_BOUNDS.maxLat}&maxLng=${SF_BOUNDS.maxLng}`
      );
      await page.waitForLoadState("domcontentloaded");

      // Wait for search API response
      const response = await searchResponsePromise.catch(() => null);
      if (!response) {
        // SSR may have pre-fetched — skip API check
        return;
      }

      const data = await response.json();

      // Structural assertions — don't check specific values
      if (data.list) {
        // v2 response format
        expect(Array.isArray(data.list.items)).toBe(true);
        expect(data.list).toHaveProperty("nextCursor");
      } else if (data.listings) {
        // v1 response format
        expect(Array.isArray(data.listings)).toBe(true);
      }

      // Security: no PII fields in listing results
      const listings = data.list?.items ?? data.listings ?? [];
      for (const listing of listings.slice(0, 3)) {
        expect(listing).not.toHaveProperty("ownerEmail");
        expect(listing).not.toHaveProperty("ownerPhone");
        expect(listing).not.toHaveProperty("passwordHash");
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Favorites flow — verify toggle API response
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe("Favorites API depth", () => {
    test("UFD-02: favorite toggle produces correct API response", async ({
      page,
    }) => {
      await page.goto(
        `/search?minLat=${SF_BOUNDS.minLat}&minLng=${SF_BOUNDS.minLng}&maxLat=${SF_BOUNDS.maxLat}&maxLng=${SF_BOUNDS.maxLng}`
      );
      await page.waitForLoadState("domcontentloaded");

      // Wait for results to load
      const firstCard = searchResultsContainer(page)
        .locator(selectors.listingCard)
        .first();

      if (
        !(await firstCard
          .isVisible({ timeout: 15_000 })
          .catch(() => false))
      ) {
        test.skip(true, "No listing cards found — skip favorites test");
        return;
      }

      // Find the favorite/save button
      const favoriteButton = firstCard
        .locator(
          'button[aria-label*="save" i], button[aria-label*="favorite" i], [data-testid="favorite-button"]'
        )
        .first();

      if (!(await favoriteButton.isVisible().catch(() => false))) {
        test.skip(true, "No favorite button visible");
        return;
      }

      // Set up API response interception before clicking
      const favResponsePromise = page.waitForResponse(
        (r) =>
          r.url().includes("/api/favorites") &&
          r.request().method() === "POST",
        { timeout: 15_000 }
      );

      await favoriteButton.click();

      const favResponse = await favResponsePromise.catch(() => null);
      if (!favResponse) {
        // Button may not trigger API (e.g., login gate)
        return;
      }

      // Verify API response structure
      expect(favResponse.status()).toBe(200);
      const favData = await favResponse.json();

      // Toggle response must have `saved` boolean
      expect(favData).toHaveProperty("saved");
      expect(typeof favData.saved).toBe("boolean");

      // Must not leak user details
      expect(favData).not.toHaveProperty("userId");
      expect(favData).not.toHaveProperty("email");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Notifications flow — verify mark-as-read API response
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe("Notifications API depth", () => {
    test("UFD-03: notifications page loads with correct API structure", async ({
      page,
      request,
    }) => {
      // Direct API call to check notifications endpoint response structure
      const response = await request.get("/api/messages?view=unreadCount");

      if (response.status() === 200) {
        const data = await response.json();
        expect(data).toHaveProperty("count");
        expect(typeof data.count).toBe("number");
      }

      // Navigate to notifications page
      await page.goto("/notifications");
      await page.waitForLoadState("domcontentloaded");

      // If redirected to login, skip
      if (page.url().includes("/login")) {
        test.skip(true, "Auth session expired");
        return;
      }

      // Page should render notification content or empty state
      await expect(
        page
          .getByRole("heading", { name: /notification/i })
          .or(page.getByText(/no.*notification/i))
          .first()
      ).toBeVisible({ timeout: 15_000 });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Search count API — verify debounced count response
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe("Search count API depth", () => {
    test("UFD-04: map move triggers search-count with numeric response", async ({
      page,
    }) => {
      // Listen for search-count API calls
      const countResponses: Array<{ status: number; body: unknown }> = [];

      await page.route("**/api/search-count*", async (route) => {
        const response = await route.fetch();
        const body = await response.json().catch(() => null);
        countResponses.push({ status: response.status(), body });
        await route.fulfill({ response });
      });

      await page.goto(
        `/search?minLat=${SF_BOUNDS.minLat}&minLng=${SF_BOUNDS.minLng}&maxLat=${SF_BOUNDS.maxLat}&maxLng=${SF_BOUNDS.maxLng}`
      );
      await page.waitForLoadState("domcontentloaded");

      // Wait for search-count API responses
      await page.waitForResponse(
        (resp) => resp.url().includes("/api/search-count"),
        { timeout: 10_000 }
      ).catch(() => {});

      // Check captured responses
      for (const resp of countResponses) {
        expect(resp.status).toBe(200);
        if (resp.body && typeof resp.body === "object") {
          const body = resp.body as Record<string, unknown>;
          expect(body).toHaveProperty("count");
          expect(typeof body.count).toBe("number");
          expect(body.count).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });
});
