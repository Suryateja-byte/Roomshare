/**
 * E2E Test Suite: Map Error Handling
 *
 * Tests error handling for map interactions including:
 * - Viewport validation (zoom level limits) - CLIENT-SIDE, works with v1 and v2
 * - Rate limiting feedback - V1 ONLY (v2 uses server-provided data)
 * - Error recovery with retry - V1 ONLY (v2 uses server-provided data)
 *
 * Note: Error messages from PersistentMapWrapper:
 * - Viewport too large: "Zoom in further to see listings"
 * - Rate limited (429): "Too many requests. Please wait a moment."
 * - Server error (500): "Server error. Please try again."
 *
 * V1 vs V2 Mode:
 * - V1: Map component fetches its own data via /api/map-listings
 * - V2: Search page provides map data via SearchV2DataContext
 * - Tests that mock /api/map-listings only work in v1 mode
 * - Viewport validation works in both modes (client-side check)
 */

import { test, expect, tags, timeouts } from "../helpers";

test.describe("Map Error Handling", () => {
  // Map tests run as anonymous user with desktop viewport
  // Desktop viewport required: map only renders on ≥768px (useMapPreference hook)
  test.use({
    storageState: { cookies: [], origins: [] },
    viewport: { width: 1280, height: 800 },
  });

  // Skip on mobile browsers and webkit - map tests require specific browser support
  // - Mobile: device emulation overrides viewport settings
  // - webkit: rendering timing issues cause flaky map visibility detection
  test.beforeEach(async ({}, testInfo) => {
    const projectName = testInfo.project.name;
    if (projectName.includes("Mobile")) {
      test.skip(true, "Map tests require desktop viewport - skipping on mobile");
    }
    if (projectName === "webkit") {
      test.skip(true, "Map tests have timing issues on webkit - skipping");
    }
  });

  // Helper to wait for map panel and error state
  async function waitForMapError(
    page: import("@playwright/test").Page,
    errorPattern: RegExp,
    timeout = timeouts.action,
  ) {
    // Wait for DOM to be ready (don't use networkidle - Next.js HMR keeps connections open)
    await page.waitForLoadState("domcontentloaded");

    // Wait for the map panel to be rendered - "Hide map" button indicates map container is mounted
    // This is more reliable than a fixed timeout as it accounts for:
    // - React hydration time
    // - V2MapDataSetter/V1PathResetSetter effect execution
    // - PersistentMapWrapper mounting and effect cycles
    const hideMapButton = page.getByRole("button", { name: /hide map/i });
    await expect(hideMapButton).toBeVisible({ timeout: timeouts.navigation });

    // Wait for the "Loading map..." text to disappear if present
    // This indicates React has completed state updates and the map wrapper
    // has transitioned from loading to error/ready state
    const loadingText = page.getByText("Loading map...");
    try {
      // Give a short window to check if loading is visible
      await expect(loadingText).toBeVisible({ timeout: 2000 });
      // If it was visible, wait for it to disappear
      await expect(loadingText).not.toBeVisible({ timeout: timeout });
    } catch {
      // Loading text was never visible or already gone - that's fine
    }

    // Now look for the error banner in the map container
    // Use getByRole('alert') with filter to distinguish from Next.js route announcer
    // (which also has role="alert" but is empty)
    const alertBanner = page.getByRole("alert").filter({ hasText: errorPattern });
    await expect(alertBanner).toBeVisible({ timeout });
  }

  test.describe("Viewport validation", () => {
    test(`${tags.anon} - Shows error when viewport too large`, async ({
      page,
    }) => {
      // Navigate to search with very wide bounds (beyond 5 degree limit)
      // lat span = 45 - 30 = 15 degrees (exceeds MAX_LAT_SPAN of 5)
      // lng span = -120 - (-130) = 10 degrees (exceeds MAX_LNG_SPAN of 5)
      await page.goto("/search?minLng=-130&maxLng=-120&minLat=30&maxLat=45");

      // The exact error message is "Zoom in further to see listings"
      await waitForMapError(page, /Zoom in further to see listings/i);
    });

    test(`${tags.anon} - Clears error when viewport becomes valid`, async ({
      page,
    }) => {
      // Start with invalid (too large) viewport
      await page.goto("/search?minLng=-130&maxLng=-120&minLat=30&maxLat=45");

      // Should show error initially
      await waitForMapError(page, /Zoom in further to see listings/i);

      // Navigate to valid viewport (within 2 degree limits)
      await page.goto(
        "/search?minLng=-122.5&maxLng=-122.0&minLat=37.5&maxLat=38.0",
      );

      // Wait for the error to clear (debounce + state update)
      await page.waitForTimeout(1000);

      // Check that error message is no longer visible
      const errorLocator = page.getByText(/Zoom in further to see listings/i);
      await expect(errorLocator).not.toBeVisible({ timeout: timeouts.action });
    });
  });

  // SKIP: V1-only tests - v2 mode provides map data via context, skipping /api/map-listings
  test.describe.skip("Rate limiting feedback", () => {
    test(`${tags.anon} - Shows rate limit message when API returns 429`, async ({
      page,
      network,
    }) => {
      // Mock rate limit response for map-listings API
      // Must be set BEFORE navigation
      await network.mockApiResponse("**/api/map-listings*", {
        status: 429,
        body: { error: "Too many requests", retryAfter: 30 },
      });

      // Navigate to search with valid bounds
      await page.goto(
        "/search?minLng=-122.5&maxLng=-122.0&minLat=37.5&maxLat=38.0",
      );

      // Wait for hydration
      await page.waitForLoadState("domcontentloaded");

      // Wait for debounce (2s) + fetch to complete
      await page.waitForTimeout(3000);

      // The exact message is "Too many requests. Please wait a moment."
      await expect(page.getByText(/Too many requests/i).first()).toBeVisible({
        timeout: timeouts.action,
      });
    });
  });

  // SKIP: V1-only tests - v2 mode provides map data via context, skipping /api/map-listings
  test.describe.skip("Server error handling", () => {
    test(`${tags.anon} - Shows error for server failure`, async ({
      page,
      network,
    }) => {
      // Mock server error - must be set BEFORE navigation
      await network.mockApiResponse("**/api/map-listings*", {
        status: 500,
        body: { error: "Internal server error" },
      });

      await page.goto(
        "/search?minLng=-122.5&maxLng=-122.0&minLat=37.5&maxLat=38.0",
      );

      // Wait for hydration
      await page.waitForLoadState("domcontentloaded");

      // Wait for debounce (2s) + fetch to complete
      await page.waitForTimeout(3000);

      // The exact message is "Server error. Please try again."
      await expect(page.getByText(/Server error/i).first()).toBeVisible({
        timeout: timeouts.action,
      });

      // Retry button should be visible
      await expect(page.getByRole("button", { name: /retry/i })).toBeVisible();
    });

    test(`${tags.anon} - Retry button recovers from temporary error`, async ({
      page,
    }) => {
      // Track request count to return error first, then success
      let requestCount = 0;
      await page.route("**/api/map-listings*", async (route) => {
        requestCount++;
        if (requestCount === 1) {
          await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ error: "Server error" }),
          });
        } else {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ listings: [] }),
          });
        }
      });

      await page.goto(
        "/search?minLng=-122.5&maxLng=-122.0&minLat=37.5&maxLat=38.0",
      );

      // Wait for hydration
      await page.waitForLoadState("domcontentloaded");

      // Wait for debounce (2s) + fetch to complete
      await page.waitForTimeout(3000);

      // Should show error banner - exact message is "Server error. Please try again."
      const errorBanner = page.getByText(/Server error/i).first();
      await expect(errorBanner).toBeVisible({ timeout: timeouts.action });

      // Click retry button
      await page.getByRole("button", { name: /retry/i }).click();

      // Wait for retry fetch to complete
      await page.waitForTimeout(1000);

      // Error should be cleared
      await expect(errorBanner).not.toBeVisible({ timeout: timeouts.action });
    });
  });

  test.describe("Rapid interaction handling", () => {
    test(`${tags.anon} - No console errors during normal map navigation`, async ({
      page,
    }) => {
      const consoleErrors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") {
          consoleErrors.push(msg.text());
        }
      });

      // Navigate to search with valid bounds
      await page.goto(
        "/search?minLng=-122.5&maxLng=-122.0&minLat=37.5&maxLat=38.0",
      );

      // Wait for initial load
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(1000); // Let React hydrate

      // Simulate a few URL changes (as if map was panned)
      const boundsSequence = [
        { minLng: -122.4, maxLng: -121.9, minLat: 37.4, maxLat: 37.9 },
        { minLng: -122.3, maxLng: -121.8, minLat: 37.5, maxLat: 38.0 },
        { minLng: -122.5, maxLng: -122.0, minLat: 37.6, maxLat: 38.1 },
      ];

      for (const bounds of boundsSequence) {
        const params = new URLSearchParams({
          minLng: bounds.minLng.toString(),
          maxLng: bounds.maxLng.toString(),
          minLat: bounds.minLat.toString(),
          maxLat: bounds.maxLat.toString(),
        });
        await page.goto(`/search?${params.toString()}`);
        // Small delay between navigations
        await page.waitForTimeout(500);
      }

      // Wait for any pending fetches to complete (2s debounce + network time)
      await page.waitForTimeout(4000);

      // Filter out expected errors (e.g., aborted requests, hydration warnings, env validation, etc.)
      const unexpectedErrors = consoleErrors.filter(
        (err) =>
          !err.includes("AbortError") &&
          !err.includes("aborted") &&
          !err.includes("cancelled") &&
          !err.includes("Hydration") &&
          !err.includes("hydration") &&
          !err.includes("Failed to fetch") && // Network race condition during rapid navigation
          !err.includes("net::ERR") &&
          !err.includes("NetworkError") &&
          // Server-side environment validation warnings (expected in test environment)
          !err.includes("Environment validation failed") &&
          !err.includes("NEXTAUTH_URL") &&
          !err.includes("CRON_SECRET") &&
          // ServiceWorker/Mapbox font loading errors (expected in test environment)
          !err.includes("ServiceWorker") &&
          !err.includes("api.mapbox.com/fonts") &&
          // Firefox/Playwright internal errors (request aborted by navigation)
          !err.includes("NS_BINDING_ABORTED") &&
          !err.includes("juggler"),
      );

      // Should have no unexpected console errors
      expect(unexpectedErrors).toEqual([]);
    });
  });

  // SKIP: V1-only tests - v2 mode provides map data via context, skipping /api/map-listings
  test.describe.skip("Viewport pan and marker refresh", () => {
    test(`${tags.anon} - Pan triggers marker refresh with new bounds`, async ({
      page,
    }) => {
      // Track all map-listings API requests
      const mapListingRequests: { url: string; bounds: Record<string, string> }[] = [];

      await page.route("**/api/map-listings*", async (route) => {
        const url = route.request().url();
        const urlObj = new URL(url);
        const bounds = {
          minLng: urlObj.searchParams.get("minLng") || "",
          maxLng: urlObj.searchParams.get("maxLng") || "",
          minLat: urlObj.searchParams.get("minLat") || "",
          maxLat: urlObj.searchParams.get("maxLat") || "",
        };
        mapListingRequests.push({ url, bounds });

        // Return mock response
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ listings: [] }),
        });
      });

      // Step 1: Navigate with initial bounds (SF area)
      const initialBounds = {
        minLng: "-122.5",
        maxLng: "-122.0",
        minLat: "37.5",
        maxLat: "38.0",
      };
      await page.goto(
        `/search?minLng=${initialBounds.minLng}&maxLng=${initialBounds.maxLng}&minLat=${initialBounds.minLat}&maxLat=${initialBounds.maxLat}`,
      );

      // Wait for initial load and API call
      await page.waitForLoadState("domcontentloaded");
      // Wait for debounce (2s) + fetch
      await page.waitForTimeout(3000);

      // Step 2: Verify initial API call was made with correct bounds
      expect(mapListingRequests.length).toBeGreaterThanOrEqual(1);
      const initialRequest = mapListingRequests[mapListingRequests.length - 1];
      expect(initialRequest.bounds.minLng).toBe(initialBounds.minLng);
      expect(initialRequest.bounds.maxLng).toBe(initialBounds.maxLng);
      expect(initialRequest.bounds.minLat).toBe(initialBounds.minLat);
      expect(initialRequest.bounds.maxLat).toBe(initialBounds.maxLat);

      // Step 3: Capture request count before pan
      const requestCountBeforePan = mapListingRequests.length;

      // Step 4: Simulate pan by changing URL bounds
      const pannedBounds = {
        minLng: "-122.4",
        maxLng: "-121.9",
        minLat: "37.6",
        maxLat: "38.1",
      };
      await page.goto(
        `/search?minLng=${pannedBounds.minLng}&maxLng=${pannedBounds.maxLng}&minLat=${pannedBounds.minLat}&maxLat=${pannedBounds.maxLat}`,
      );

      // Wait for debounce (2s) + fetch
      await page.waitForTimeout(3000);

      // Step 5: Verify new API request was made with updated bounds
      expect(mapListingRequests.length).toBeGreaterThan(requestCountBeforePan);

      const pannedRequest = mapListingRequests[mapListingRequests.length - 1];
      expect(pannedRequest.bounds.minLng).toBe(pannedBounds.minLng);
      expect(pannedRequest.bounds.maxLng).toBe(pannedBounds.maxLng);
      expect(pannedRequest.bounds.minLat).toBe(pannedBounds.minLat);
      expect(pannedRequest.bounds.maxLat).toBe(pannedBounds.maxLat);
    });

    test(`${tags.anon} - Debounce prevents excessive API calls during rapid pan`, async ({
      page,
    }) => {
      // Track all map-listings API requests
      const mapListingRequests: string[] = [];

      await page.route("**/api/map-listings*", async (route) => {
        mapListingRequests.push(route.request().url());
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ listings: [] }),
        });
      });

      // Navigate to initial position
      await page.goto(
        "/search?minLng=-122.5&maxLng=-122.0&minLat=37.5&maxLat=38.0",
      );
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(500); // Let hydration complete

      // Capture initial request count
      const initialRequestCount = mapListingRequests.length;

      // Simulate rapid consecutive pans (faster than debounce period)
      const rapidBoundsSequence = [
        { minLng: -122.4, maxLng: -121.9, minLat: 37.4, maxLat: 37.9 },
        { minLng: -122.3, maxLng: -121.8, minLat: 37.5, maxLat: 38.0 },
        { minLng: -122.2, maxLng: -121.7, minLat: 37.6, maxLat: 38.1 },
        { minLng: -122.1, maxLng: -121.6, minLat: 37.7, maxLat: 38.2 },
      ];

      // Execute rapid pans with minimal delay (under 2s debounce)
      for (const bounds of rapidBoundsSequence) {
        const params = new URLSearchParams({
          minLng: bounds.minLng.toString(),
          maxLng: bounds.maxLng.toString(),
          minLat: bounds.minLat.toString(),
          maxLat: bounds.maxLat.toString(),
        });
        await page.goto(`/search?${params.toString()}`);
        // 200ms delay - faster than 2s debounce
        await page.waitForTimeout(200);
      }

      // Wait for debounce to settle (2s) + network time
      await page.waitForTimeout(4000);

      // Count new requests after rapid pans
      const newRequestCount = mapListingRequests.length - initialRequestCount;

      // With 2s debounce, rapid pans should be batched
      // We expect far fewer requests than the number of pans (4 pans)
      // Ideally only 1-2 requests should be made (after debounce settles)
      expect(newRequestCount).toBeLessThan(rapidBoundsSequence.length);
    });
  });
});
