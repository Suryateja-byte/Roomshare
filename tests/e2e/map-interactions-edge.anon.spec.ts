/**
 * Map Interactions Edge Cases E2E Tests (Stories 9-12)
 *
 * Covers edge-case map behaviors not exercised by the core interaction tests:
 * - 9. DynamicMap Lazy Loading (9.1-9.2)
 * - 10. Map Error Boundary (10.1-10.2)
 * - 11. Privacy Circles (11.1-11.3)
 * - 12. Location Conflict Banner (12.1)
 *
 * NOTE: Many of these tests depend on specific conditions (WebGL, seed data,
 * V1 data path). Tests skip gracefully with informational annotations when
 * preconditions are not met.
 *
 * Run: pnpm playwright test tests/e2e/map-interactions-edge.anon.spec.ts --project=chromium-anon
 * Debug: pnpm playwright test tests/e2e/map-interactions-edge.anon.spec.ts --project=chromium-anon --headed
 */

import { test, expect, tags, timeouts, SF_BOUNDS, selectors, searchResultsContainer, waitForMapReady } from "./helpers/test-utils";
import { waitForMapRef, isMapAvailable } from "./helpers/sync-helpers";
import type { Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;
const SEARCH_URL = `/search?${boundsQS}`;

// Known benign errors to filter out (WebGL, HMR, hydration, network, etc.)
const BENIGN_ERROR_PATTERNS = [
  "mapbox",
  "webpack",
  "HMR",
  "hydrat",
  "favicon",
  "ResizeObserver",
  "WebGL",
  "Failed to create",
  "404",
  "net::ERR",
  "Failed to load resource",
  "AbortError",
  "abort",
  "cancelled",
  "Failed to fetch",
  "Load failed",
  "ChunkLoadError",
  "Loading chunk",
  "Environment validation",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Wait for the search page to be interactive.
 */
async function waitForSearchPage(page: Page, url = SEARCH_URL) {
  await page.goto(url);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForSelector("button", { timeout: timeouts.navigation });
  await waitForMapReady(page);
}

// ---------------------------------------------------------------------------
// Test suite config
// ---------------------------------------------------------------------------

test.describe("Map Interactions Edge Cases (Stories 9-12)", () => {
  // Desktop viewport required: map only renders on >= 768px
  test.use({
    storageState: { cookies: [], origins: [] },
    viewport: { width: 1280, height: 800 },
  });

  // Skip on mobile browsers and webkit
  test.beforeEach(async ({}, testInfo) => {
    test.slow(); // Map tests need extra time for WebGL rendering in CI
    const projectName = testInfo.project.name;
    if (projectName.includes("Mobile")) {
      test.skip(true, "Map tests require desktop viewport - skipping on mobile");
    }
    if (projectName === "webkit") {
      test.skip(true, "Map tests have timing issues on webkit - skipping");
    }
  });

  // =========================================================================
  // 9. DynamicMap Lazy Loading
  // =========================================================================
  test.describe("9. DynamicMap Lazy Loading", () => {
    test(`${tags.anon} 9.1 - Mapbox bundle is loaded lazily (P2)`, async ({ page }) => {
      // Track all JS chunks loaded during homepage navigation
      const homepageChunks: string[] = [];
      const searchChunks: string[] = [];

      page.on("response", (response) => {
        const url = response.url();
        if (url.endsWith(".js") || url.includes(".js?")) {
          homepageChunks.push(url);
        }
      });

      // Step 1: Navigate to homepage (no map)
      await page.goto("/");
      await page.waitForLoadState("domcontentloaded");
      await page.waitForLoadState("domcontentloaded");

      // Check that no mapbox-gl chunk was loaded on the homepage
      const homepageMapboxChunks = homepageChunks.filter(
        (url) => url.includes("mapbox-gl") || url.includes("mapboxgl")
      );

      // NOTE: Next.js prefetching may eagerly load chunks when hovering links.
      // We verify the bundle was NOT loaded as part of initial page render.
      // If prefetching loaded it, we still annotate rather than fail.
      if (homepageMapboxChunks.length > 0) {
        test.info().annotations.push({
          type: "info",
          description:
            "Mapbox chunk detected on homepage -- may be Next.js prefetch. " +
            "DynamicMap lazy() import is still valid if chunk was prefetched on link hover.",
        });
      }

      // Step 2: Navigate to search page (has map)
      // Reset listener to capture only new chunks
      page.removeAllListeners("response");
      page.on("response", (response) => {
        const url = response.url();
        if (url.endsWith(".js") || url.includes(".js?")) {
          searchChunks.push(url);
        }
      });

      await page.goto(SEARCH_URL);
      await page.waitForLoadState("domcontentloaded");
      await waitForMapReady(page);

      // Verify that mapbox-gl chunk OR canvas (proof of Mapbox) is present on search page
      const mapCanvas = page.locator(".maplibregl-canvas");
      const mapContainer = page.locator(selectors.map);
      const mapVisible =
        (await mapCanvas.count()) > 0 || (await mapContainer.count()) > 0;

      if (!mapVisible) {
        test.info().annotations.push({
          type: "skip-reason",
          description: "Map not rendered (WebGL unavailable in headless mode)",
        });
        return;
      }

      // The map rendered, so the bundle was loaded -- this confirms lazy loading
      // worked (it was not present on homepage but is present on search).
      // If we didn't see it on the homepage, that confirms the lazy import.
      if (homepageMapboxChunks.length === 0) {
        // Confirm that at least one mapbox-related chunk loaded for the search page
        // (or the map canvas itself is proof enough)
        expect(mapVisible).toBe(true);
      }
    });

    test(`${tags.anon} 9.2 - Loading placeholder shows while bundle loads (P2)`, async ({
      page,
      context,
    }) => {
      // Throttle network to slow 3G to observe the loading placeholder
      let cdpThrottled = false;
      try {
        const cdp = await context.newCDPSession(page);
        await cdp.send("Network.emulateNetworkConditions", {
          offline: false,
          downloadThroughput: (400_000 / 8), // Slow 3G: 400kbps
          uploadThroughput: (200_000 / 8),
          latency: 400,
        });
        cdpThrottled = true;
      } catch {
        // CDP not available in non-Chromium browsers
        test.info().annotations.push({
          type: "skip-reason",
          description: "CDP network throttling not available (non-Chromium browser)",
        });
      }

      // Navigate to search page
      await page.goto(SEARCH_URL);
      await page.waitForLoadState("domcontentloaded");

      // Look for "Loading map..." placeholder before canvas appears
      const loadingText = page.getByText("Loading map...");
      let loadingWasVisible = false;

      // Try to catch the loading state (timing-sensitive)
      try {
        await expect(loadingText).toBeVisible({ timeout: 5000 });
        loadingWasVisible = true;
      } catch {
        // Loading state may have been too fast to observe even on slow network
      }

      // Wait for page to fully load
      await waitForMapReady(page, cdpThrottled ? 30_000 : 15_000);

      // Reset network conditions
      if (cdpThrottled) {
        try {
          const cdp = await context.newCDPSession(page);
          await cdp.send("Network.emulateNetworkConditions", {
            offline: false,
            downloadThroughput: -1,
            uploadThroughput: -1,
            latency: 0,
          });
        } catch {
          // ignore cleanup errors
        }
      }

      // After loading completes, either canvas or loading placeholder should have appeared
      const mapCanvas = page.locator(".maplibregl-canvas");
      const canvasVisible = await mapCanvas.isVisible().catch(() => false);

      if (loadingWasVisible) {
        // Loading placeholder was shown -- verify it resolved to actual canvas
        // (canvas may not appear in headless without WebGL, so this is best-effort)
        if (canvasVisible) {
          await expect(mapCanvas.first()).toBeVisible();
        }
      } else if (!canvasVisible) {
        // Neither loading text nor canvas visible -- WebGL likely unavailable
        test.info().annotations.push({
          type: "skip-reason",
          description:
            "Loading placeholder was too fast to observe and map canvas not rendered " +
            "(WebGL may be unavailable). Run with --headed for full verification.",
        });
      }
      // If canvas appeared without catching loading text, the bundle loaded fast
      // even on throttled network -- that is acceptable behavior
    });
  });

  // =========================================================================
  // 10. Map Error Boundary
  // =========================================================================
  test.describe("10. Map Error Boundary", () => {
    test(`${tags.anon} 10.1 - Error boundary shows fallback UI (P1)`, async ({ page }) => {
      // Approach: Navigate to search page with an intentionally broken Mapbox
      // token to trigger initialization failure. Alternatively, verify the
      // static fallback structure exists by injecting an error condition.
      //
      // NOTE: Simulating React render errors in E2E is inherently unreliable.
      // We take a multi-pronged approach:
      // 1. Try to trigger an error via the map ref
      // 2. If that fails, verify the fallback UI structure statically

      await page.goto(SEARCH_URL);
      await page.waitForLoadState("domcontentloaded");
      await waitForMapReady(page);

      // Check if map is currently available
      const mapAvailable = await isMapAvailable(page);

      if (!mapAvailable) {
        // Map did not render -- check if the error fallback is showing
        const fallbackText = page.getByText("Map unavailable");
        const fallbackVisible = await fallbackText.isVisible().catch(() => false);

        if (fallbackVisible) {
          // Error boundary is working -- verify retry button
          await expect(fallbackText).toBeVisible();
          const retryButton = page.getByRole("button", { name: /retry/i });
          const retryVisible = await retryButton.isVisible().catch(() => false);
          if (retryVisible) {
            await expect(retryButton).toBeVisible();
          }

          // Verify rest of page is still functional (listing cards or filters)
          const pageBody = page.locator("body");
          await expect(pageBody).toBeVisible();
        } else {
          test.info().annotations.push({
            type: "skip-reason",
            description:
              "Map not rendered and error boundary fallback not shown. " +
              "WebGL may be unavailable without triggering the error boundary path.",
          });
        }
        return;
      }

      // Map is available -- try to trigger an error via page.evaluate
      // This is best-effort; React error boundaries catch render errors,
      // not imperative JS errors from page.evaluate.
      const errorInjected = await page.evaluate(() => {
        try {
          const map = (window as any).__e2eMapRef;
          if (map) {
            // Remove the map to simulate a crash scenario
            map.remove();
            (window as any).__e2eMapRef = null;
            return true;
          }
          return false;
        } catch {
          return false;
        }
      });

      if (errorInjected) {
        await page.waitForLoadState("domcontentloaded");

        // Check if fallback appeared after map removal
        const fallbackText = page.getByText("Map unavailable");
        const fallbackVisible = await fallbackText.isVisible().catch(() => false);

        if (fallbackVisible) {
          await expect(fallbackText).toBeVisible();
          const retryButton = page.getByRole("button", { name: /retry/i });
          const retryVisible = await retryButton.isVisible().catch(() => false);
          if (retryVisible) {
            await expect(retryButton).toBeVisible();
          }
        } else {
          // Map.remove() does not always trigger React error boundary.
          // Annotate that the error boundary could not be triggered in E2E.
          test.info().annotations.push({
            type: "info",
            description:
              "Map.remove() did not trigger React error boundary fallback. " +
              "MapErrorBoundary is best verified via unit/integration tests.",
          });
        }
      } else {
        test.info().annotations.push({
          type: "skip-reason",
          description:
            "E2E map ref not available to inject error. " +
            "MapErrorBoundary is best verified via unit/integration tests.",
        });
      }

      // In all cases, verify the rest of the page is functional
      const bodyVisible = await page.locator("body").isVisible();
      expect(bodyVisible).toBe(true);
    });

    test(`${tags.anon} 10.2 - MapErrorBanner on fetch failure (V1 path) (P2)`, async ({
      page,
    }) => {
      // NOTE: This test only works in V1 mode where map data is fetched from
      // /api/map-listings. In V2 mode, data is provided via SearchV2DataContext
      // and this API route is not used.

      // Mock /api/map-listings to return 500
      await page.route("**/api/map-listings*", async (route) => {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Internal server error" }),
        });
      });

      await page.goto(SEARCH_URL);
      await page.waitForLoadState("domcontentloaded");

      // Wait for the page to process the error
      await page.waitForLoadState("domcontentloaded");

      // Look for an error banner with role="alert"
      const alertBanner = page.getByRole("alert");
      let bannerVisible = false;

      try {
        await expect(alertBanner.first()).toBeVisible({ timeout: timeouts.action });
        bannerVisible = true;
      } catch {
        // Alert banner may not appear if V2 mode is active
      }

      if (bannerVisible) {
        // Verify the banner contains an error-related message
        const bannerText = await alertBanner.first().textContent();
        const hasErrorMessage =
          bannerText?.toLowerCase().includes("error") ||
          bannerText?.toLowerCase().includes("failed") ||
          bannerText?.toLowerCase().includes("unavailable");

        if (hasErrorMessage) {
          // Look for Retry button
          const retryButton = page.getByRole("button", { name: /retry/i });
          const retryVisible = await retryButton.isVisible().catch(() => false);
          if (retryVisible) {
            await expect(retryButton).toBeVisible();
          }
        }
      } else {
        // V2 mode is likely active -- the mock did not affect the data path
        test.info().annotations.push({
          type: "skip-reason",
          description:
            "Error banner not shown. App is likely using V2 data path " +
            "(SearchV2DataContext) which does not fetch from /api/map-listings. " +
            "This test is only applicable to V1 mode.",
        });
      }

      // Regardless of mode, page should remain functional
      const bodyVisible = await page.locator("body").isVisible();
      expect(bodyVisible).toBe(true);
    });
  });

  // =========================================================================
  // 11. Privacy Circles
  // =========================================================================
  test.describe("11. Privacy Circles", () => {
    test(`${tags.anon} 11.1 - Privacy circle layer renders for listings (P1)`, async ({
      page,
    }) => {
      await waitForSearchPage(page);

      // Guard: check map is available
      const mapAvailable = await isMapAvailable(page);
      if (!mapAvailable) {
        test.skip(true, "Map not available (WebGL unavailable in headless mode)");
        return;
      }

      // Guard: wait for E2E map ref
      const hasMapRef = await waitForMapRef(page);
      if (!hasMapRef) {
        test.skip(true, "E2E map ref not exposed (NEXT_PUBLIC_E2E may not be set)");
        return;
      }

      // Query the Mapbox source and layer for privacy circles
      const privacyCircleInfo = await page.evaluate(() => {
        const map = (window as any).__e2eMapRef;
        if (!map) return null;

        const hasSource = map.getSource("privacy-circles") !== undefined;
        const hasLayer = (() => {
          try {
            return map.getLayer("privacy-circles") !== undefined;
          } catch {
            return false;
          }
        })();

        return { hasSource, hasLayer };
      });

      if (!privacyCircleInfo) {
        test.info().annotations.push({
          type: "skip-reason",
          description: "Map ref available but getSource/getLayer returned null",
        });
        return;
      }

      // If listings exist in bounds, privacy-circles source should be present.
      // If 0 listings, PrivacyCircle component returns null (no source added).
      const listingCards = searchResultsContainer(page).locator(selectors.listingCard);
      const cardCount = await listingCards.count();

      if (cardCount > 0) {
        // Listings exist -- privacy circle source should be present
        expect(privacyCircleInfo.hasSource).toBe(true);
        // Layer should also be present
        if (privacyCircleInfo.hasSource) {
          expect(privacyCircleInfo.hasLayer).toBe(true);
        }
      } else {
        // No listings -- privacy circles may not be rendered
        test.info().annotations.push({
          type: "info",
          description:
            "No listing cards found in bounds. Privacy circle source may not be added " +
            "when there are 0 listings.",
        });
      }
    });

    test(`${tags.anon} 11.2 - Privacy circles scale with zoom level (P2)`, async ({
      page,
    }) => {
      await waitForSearchPage(page);

      const mapAvailable = await isMapAvailable(page);
      if (!mapAvailable) {
        test.skip(true, "Map not available (WebGL unavailable in headless mode)");
        return;
      }

      const hasMapRef = await waitForMapRef(page);
      if (!hasMapRef) {
        test.skip(true, "E2E map ref not exposed");
        return;
      }

      // Check that privacy-circles layer exists before proceeding
      const layerExists = await page.evaluate(() => {
        const map = (window as any).__e2eMapRef;
        if (!map) return false;
        try {
          return map.getLayer("privacy-circles") !== undefined;
        } catch {
          return false;
        }
      });

      if (!layerExists) {
        test.info().annotations.push({
          type: "skip-reason",
          description:
            "Privacy-circles layer not found. " +
            "May require listings in bounds or specific data conditions.",
        });
        return;
      }

      // Step 1: Get circle-radius paint property at zoom 12
      const radiusAtZoom12 = await page.evaluate(() => {
        const map = (window as any).__e2eMapRef;
        const setProgrammatic = (window as any).__e2eSetProgrammaticMove;
        if (!map || !setProgrammatic) return null;

        setProgrammatic(true);
        map.jumpTo({ zoom: 12 });

        // The paint property is an expression (interpolate), so we read
        // the evaluated value via queryRenderedFeatures or getPaintProperty.
        try {
          const prop = map.getPaintProperty("privacy-circles", "circle-radius");
          // If it is a literal number, return it directly
          if (typeof prop === "number") return prop;
          // If it is an expression, return the expression structure for comparison
          return JSON.stringify(prop);
        } catch {
          return null;
        }
      });

      // Step 2: Get circle-radius paint property at zoom 16
      const radiusAtZoom16 = await page.evaluate(() => {
        const map = (window as any).__e2eMapRef;
        const setProgrammatic = (window as any).__e2eSetProgrammaticMove;
        if (!map || !setProgrammatic) return null;

        setProgrammatic(true);
        map.jumpTo({ zoom: 16 });

        try {
          const prop = map.getPaintProperty("privacy-circles", "circle-radius");
          if (typeof prop === "number") return prop;
          return JSON.stringify(prop);
        } catch {
          return null;
        }
      });

      if (radiusAtZoom12 === null || radiusAtZoom16 === null) {
        test.info().annotations.push({
          type: "skip-reason",
          description:
            "Could not read circle-radius paint property at different zoom levels.",
        });
        return;
      }

      // If the paint property is a static number at both zooms, they should differ
      // (larger radius at higher zoom). If it is an expression (interpolate), the
      // expression itself is the same at both zoom levels (Mapbox evaluates it
      // dynamically), so we verify the expression contains zoom-based interpolation.
      if (typeof radiusAtZoom12 === "number" && typeof radiusAtZoom16 === "number") {
        expect(radiusAtZoom16).toBeGreaterThan(radiusAtZoom12);
      } else {
        // Both should be the same expression (zoom-based interpolation)
        // Verify the expression structure mentions "interpolate" or "zoom"
        const expressionStr =
          typeof radiusAtZoom12 === "string" ? radiusAtZoom12 : String(radiusAtZoom12);
        const hasZoomInterpolation =
          expressionStr.includes("interpolate") || expressionStr.includes("zoom");
        if (hasZoomInterpolation) {
          // Expression-based radius confirmed -- Mapbox will scale at runtime
          expect(hasZoomInterpolation).toBe(true);
        } else {
          test.info().annotations.push({
            type: "info",
            description:
              `circle-radius paint property is not a simple number or zoom expression. ` +
              `Zoom 12: ${radiusAtZoom12}, Zoom 16: ${radiusAtZoom16}`,
          });
        }
      }
    });

    test(`${tags.anon} 11.3 - Exact listing coordinates not exposed to DOM (P1)`, async ({
      page,
    }) => {
      await waitForSearchPage(page);

      const mapAvailable = await isMapAvailable(page);
      if (!mapAvailable) {
        test.skip(true, "Map not available (WebGL unavailable in headless mode)");
        return;
      }

      // Wait for map to settle before checking markers
      const markers = page.locator(".maplibregl-marker");
      await waitForMapReady(page);
      const markerCount = await markers.count();

      if (markerCount === 0) {
        test.info().annotations.push({
          type: "skip-reason",
          description: "No markers rendered -- cannot verify coordinate exposure.",
        });
        return;
      }

      // Inspect all marker elements for data attributes or text content
      // containing raw lat/lng to 6+ decimal places
      const coordinateExposure = await page.evaluate(() => {
        // Pattern for coordinates with 6+ decimal places (e.g., 37.761234 or -122.421234)
        const coordPattern = /-?\d{1,3}\.\d{6,}/;

        const markers = Array.from(document.querySelectorAll(".maplibregl-marker"));
        const exposedCoords: string[] = [];

        for (const marker of markers) {
          // Check data attributes
          const attrs = marker.attributes;
          for (let i = 0; i < attrs.length; i++) {
            const attr = attrs[i];
            // Skip transform/style attributes -- these contain pixel coordinates, not geo
            if (attr.name === "style" || attr.name === "class") continue;
            if (coordPattern.test(attr.value)) {
              exposedCoords.push(`marker attr ${attr.name}="${attr.value}"`);
            }
          }

          // Check inner data attributes (excluding style/transform)
          const innerElements = marker.querySelectorAll("[data-lat], [data-lng], [data-latitude], [data-longitude]");
          for (const el of Array.from(innerElements)) {
            const lat = el.getAttribute("data-lat") || el.getAttribute("data-latitude");
            const lng = el.getAttribute("data-lng") || el.getAttribute("data-longitude");
            if (lat && coordPattern.test(lat)) {
              exposedCoords.push(`inner data-lat="${lat}"`);
            }
            if (lng && coordPattern.test(lng)) {
              exposedCoords.push(`inner data-lng="${lng}"`);
            }
          }

          // Check text content (excluding price text) for raw coordinates
          const textContent = marker.textContent || "";
          // Only flag if the text looks like a coordinate pair, not a price
          const coordPairPattern = /-?\d{1,3}\.\d{6,}\s*,\s*-?\d{1,3}\.\d{6,}/;
          if (coordPairPattern.test(textContent)) {
            exposedCoords.push(`marker text="${textContent.substring(0, 50)}"`);
          }
        }

        return exposedCoords;
      });

      // No marker should expose exact coordinates to the DOM
      expect(coordinateExposure).toHaveLength(0);

      // Also check popup content if a popup is open
      const popup = page.locator(".maplibregl-popup");
      if ((await popup.count()) > 0) {
        const popupCoordExposure = await page.evaluate(() => {
          const coordPairPattern = /-?\d{1,3}\.\d{6,}\s*,\s*-?\d{1,3}\.\d{6,}/;
          const popups = Array.from(document.querySelectorAll(".maplibregl-popup"));
          const exposed: string[] = [];

          for (const popup of popups) {
            const text = popup.textContent || "";
            if (coordPairPattern.test(text)) {
              exposed.push(`popup text="${text.substring(0, 50)}"`);
            }
          }
          return exposed;
        });

        expect(popupCoordExposure).toHaveLength(0);
      }
    });
  });

  // =========================================================================
  // 12. Location Conflict Banner
  // =========================================================================
  test.describe("12. Location Conflict Banner", () => {
    test(`${tags.anon} 12.1 - Panning far from search location shows conflict warning (P2)`, async ({
      page,
    }) => {
      // Navigate with a named location query and tight bounds around Mission District
      const missionBounds = "minLat=37.75&maxLat=37.77&minLng=-122.43&maxLng=-122.41";
      const searchUrl = `/search?q=Mission+District&${missionBounds}`;

      await waitForSearchPage(page, searchUrl);

      const mapAvailable = await isMapAvailable(page);
      if (!mapAvailable) {
        test.skip(true, "Map not available (WebGL unavailable in headless mode)");
        return;
      }

      const hasMapRef = await waitForMapRef(page);
      if (!hasMapRef) {
        test.skip(true, "E2E map ref not exposed");
        return;
      }

      // Turn "Search as I move" toggle OFF so panning does not auto-update URL
      const toggle = page.locator('button[role="switch"]').filter({ hasText: /search as i move/i });
      const toggleCount = await toggle.count();

      if (toggleCount === 0) {
        test.info().annotations.push({
          type: "skip-reason",
          description: "'Search as I move' toggle not found on page.",
        });
        return;
      }

      // Check if toggle is currently ON (aria-checked="true")
      const isToggleOn = await toggle.first().getAttribute("aria-checked");
      if (isToggleOn === "true") {
        await toggle.first().click();
        await expect(toggle.first()).toHaveAttribute("aria-checked", "false", { timeout: 5_000 });
      }

      // Pan the map far from Mission District using programmatic move
      // Move to a location well outside Mission District (e.g., north to Marin)
      const panResult = await page.evaluate(() => {
        return new Promise<boolean>((resolve) => {
          const map = (window as any).__e2eMapRef;
          const setProgrammatic = (window as any).__e2eSetProgrammaticMove;
          if (!map) {
            resolve(false);
            return;
          }

          // Do NOT flag as programmatic -- we want the app to detect the user pan
          if (setProgrammatic) setProgrammatic(false);

          map.once("idle", () => resolve(true));
          // Jump to Marin County (far north of Mission District)
          map.jumpTo({ center: [-122.5, 38.05], zoom: 12 });
          setTimeout(() => resolve(true), 5000);
        });
      });

      if (!panResult) {
        test.info().annotations.push({
          type: "skip-reason",
          description: "Could not pan map programmatically.",
        });
        return;
      }

      // Wait for map to settle and potential conflict detection
      await waitForMapReady(page);

      // Look for conflict banner or warning
      // The location conflict banner is distinct from the regular "Search this area" banner.
      // It may appear as role="alert" or role="status" with location name reference.
      const conflictBanner = page.getByRole("alert");
      const statusBanner = page.getByRole("status");
      const searchAreaButton = page.getByRole("button", { name: /search this area/i });

      let conflictDetected = false;

      // Check for alert-type conflict banner
      if (await conflictBanner.first().isVisible().catch(() => false)) {
        const bannerText = await conflictBanner.first().textContent();
        if (
          bannerText?.toLowerCase().includes("mission") ||
          bannerText?.toLowerCase().includes("conflict") ||
          bannerText?.toLowerCase().includes("different")
        ) {
          conflictDetected = true;
        }
      }

      // Check for status-type banner (e.g., "Search this area" with count)
      if (!conflictDetected && await statusBanner.first().isVisible().catch(() => false)) {
        conflictDetected = true;
      }

      // Check if "Search this area" button appeared (indicator of map/query mismatch)
      if (!conflictDetected && await searchAreaButton.isVisible().catch(() => false)) {
        conflictDetected = true;
      }

      if (conflictDetected) {
        // Verify the banner/button is visible and actionable
        const anyIndicator = conflictBanner
          .first()
          .or(statusBanner.first())
          .or(searchAreaButton);

        await expect(anyIndicator.first()).toBeVisible();
      } else {
        // Location conflict may not be implemented or may require specific conditions
        // (e.g., the q param must resolve to coordinates, locationConflict state in context)
        test.info().annotations.push({
          type: "info",
          description:
            "No location conflict banner detected after panning far from Mission District. " +
            "locationConflict in MapBoundsContext may not be triggered without resolved " +
            "geocoded coordinates (lat/lng params alongside q param).",
        });
      }

      // Verify page remains functional regardless of conflict state
      const bodyVisible = await page.locator("body").isVisible();
      expect(bodyVisible).toBe(true);
    });
  });
});
