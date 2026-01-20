/**
 * E2E Test Suite: Map Error Handling
 *
 * Tests error handling for map interactions including:
 * - Viewport validation (zoom level limits)
 * - Rate limiting feedback
 * - Error recovery with retry
 *
 * Note: Error messages from PersistentMapWrapper:
 * - Viewport too large: "Zoom in further to see listings"
 * - Rate limited (429): "Too many requests. Please wait a moment."
 * - Server error (500): "Server error. Please try again."
 */

import { test, expect, tags, timeouts } from "../helpers";

test.describe("Map Error Handling", () => {
  // Map tests run as anonymous user
  test.use({ storageState: { cookies: [], origins: [] } });

  // Helper to wait for map panel and error state
  async function waitForMapError(
    page: import("@playwright/test").Page,
    errorPattern: RegExp,
    timeout = timeouts.action,
  ) {
    // Wait for hydration and map panel to mount (desktop default shows map)
    await page.waitForLoadState("domcontentloaded");

    // The PersistentMapWrapper has a 2s debounce before fetching
    // Plus client-side validation runs immediately for viewport errors
    await page.waitForTimeout(500);

    // Look for the error banner in the map container
    await expect(page.getByText(errorPattern).first()).toBeVisible({ timeout });
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

  test.describe("Rate limiting feedback", () => {
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

  test.describe("Server error handling", () => {
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

      // Filter out expected errors (e.g., aborted requests, hydration warnings, etc.)
      const unexpectedErrors = consoleErrors.filter(
        (err) =>
          !err.includes("AbortError") &&
          !err.includes("aborted") &&
          !err.includes("cancelled") &&
          !err.includes("Hydration") &&
          !err.includes("hydration") &&
          !err.includes("Failed to fetch") && // Network race condition during rapid navigation
          !err.includes("net::ERR") &&
          !err.includes("NetworkError"),
      );

      // Should have no unexpected console errors
      expect(unexpectedErrors).toEqual([]);
    });
  });
});
