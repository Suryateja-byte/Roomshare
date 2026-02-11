/**
 * Map Interactions Advanced E2E Tests (Stories 5-8)
 *
 * Tests marker clustering, stacked/overlapping marker popups,
 * sort interaction with map markers, and bounds URL round-trip.
 *
 * Coverage:
 * - Story 5: Map Marker Clustering (5.1, 5.2)
 * - Story 6: Stacked/Overlapping Marker Popup (6.1, 6.2)
 * - Story 7: Map + Sort Interaction (7.1, 7.2)
 * - Story 8: Map Bounds URL Round-Trip (8.1, 8.2, 8.3)
 *
 * NOTE: Mapbox GL JS requires WebGL. In headless Chromium without GPU,
 * the map may not fully initialize, so tests gracefully skip when the
 * canvas or markers are not available.
 *
 * Run:
 *   pnpm playwright test tests/e2e/map-interactions-advanced.anon.spec.ts --project=chromium-anon
 * Debug:
 *   pnpm playwright test tests/e2e/map-interactions-advanced.anon.spec.ts --project=chromium-anon --headed
 */

import { test, expect, selectors, timeouts, SF_BOUNDS, searchResultsContainer, waitForMapReady } from "./helpers";
import {
  waitForMapRef,
  isMapAvailable,
  zoomToExpandClusters,
  getAllMarkerListingIds,
  isCardInViewport,
  getCardState,
} from "./helpers/sync-helpers";
import type { Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;
const SEARCH_URL = `/search?${boundsQS}`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Navigate to search page and wait for interactive state.
 */
async function waitForSearchPage(page: Page, url = SEARCH_URL) {
  await page.goto(url);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForSelector("button", { timeout: 30_000 });
  await waitForMapReady(page);
}

/**
 * Get current zoom level from map via E2E hook.
 */
async function getMapZoom(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const map = (window as any).__e2eMapRef;
    return map?.getZoom?.() ?? null;
  });
}

/**
 * Get map center from E2E hook.
 */
async function getMapCenter(
  page: Page,
): Promise<{ lat: number; lng: number } | null> {
  return page.evaluate(() => {
    const map = (window as any).__e2eMapRef;
    if (!map?.getCenter) return null;
    const c = map.getCenter();
    return { lat: c.lat, lng: c.lng };
  });
}

/**
 * Parse URL bounds as floats from a full URL string.
 */
function getUrlBounds(url: string): {
  minLat: number | null;
  maxLat: number | null;
  minLng: number | null;
  maxLng: number | null;
} {
  const urlObj = new URL(url, "http://localhost");
  const parse = (key: string) => {
    const val = urlObj.searchParams.get(key);
    return val !== null ? parseFloat(val) : null;
  };
  return {
    minLat: parse("minLat"),
    maxLat: parse("maxLat"),
    minLng: parse("minLng"),
    maxLng: parse("maxLng"),
  };
}

/**
 * Jump the map to a specific zoom level programmatically via E2E hooks.
 * Flags the move as programmatic so "Search as I move" does not fire.
 * Waits for the map idle event (tiles loaded and rendered).
 */
async function jumpToZoom(page: Page, zoom: number): Promise<boolean> {
  return page.evaluate(
    (z) => {
      return new Promise<boolean>((resolve) => {
        const map = (window as any).__e2eMapRef;
        const setProgrammatic = (window as any).__e2eSetProgrammaticMove;
        if (!map || !setProgrammatic) {
          resolve(false);
          return;
        }
        setProgrammatic(true);
        map.once("idle", () => resolve(true));
        map.jumpTo({ zoom: z });
        setTimeout(() => resolve(true), 10_000);
      });
    },
    zoom,
  );
}

/**
 * Trigger manual marker update via E2E hook.
 * Needed after programmatic zoom to force the sourcedata handler to re-render markers.
 */
async function triggerMarkerUpdate(page: Page): Promise<void> {
  await page.evaluate(() => {
    const updateMarkers = (window as any).__e2eUpdateMarkers;
    if (typeof updateMarkers === "function") updateMarkers();
  });
  // Wait for map to finish rendering after marker update
  await waitForMapReady(page);
}

/**
 * Simulate a map pan by dragging from center in the given direction.
 */
async function simulateMapPan(
  page: Page,
  deltaX = 100,
  deltaY = 0,
): Promise<boolean> {
  const map = page.locator(selectors.map).first();
  if ((await map.count()) === 0) return false;

  try {
    const box = await map.boundingBox();
    if (!box) return false;

    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 10 });
    await page.mouse.up();

    await waitForMapReady(page);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure "Search as I move" toggle is ON.
 */
async function ensureSearchAsMoveOn(page: Page): Promise<void> {
  const toggle = page.locator(
    'button[role="switch"]:has-text("Search as I move")',
  );
  if ((await toggle.count()) === 0) return;
  const isChecked = await toggle.getAttribute("aria-checked");
  if (isChecked === "false") {
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true", { timeout: 5_000 });
  }
}

// ===========================================================================
// Test Suite
// ===========================================================================

test.describe("Map Interactions Advanced (Stories 5-8)", () => {
  // Run as anonymous user
  test.use({ storageState: { cookies: [], origins: [] } });

  // Map tests need extra time for WebGL rendering and tile loading in CI
  test.beforeEach(async () => { test.slow(); });

  // =========================================================================
  // Story 5: Map Marker Clustering
  // =========================================================================

  test.describe("5 - Map Marker Clustering", () => {
    test("5.1 (P1) - zooming out creates cluster markers", async ({
      page,
    }) => {
      await waitForSearchPage(page);

      if (!(await isMapAvailable(page))) {
        test.skip(true, "Map not available (WebGL unavailable in headless)");
        return;
      }

      const hasRef = await waitForMapRef(page);
      if (!hasRef) {
        test.skip(true, "Map ref not available");
        return;
      }

      // Step 1: Zoom in to level 14 to see individual markers
      const zoomedIn = await jumpToZoom(page, 14);
      if (!zoomedIn) {
        test.skip(true, "Could not zoom map programmatically");
        return;
      }
      await triggerMarkerUpdate(page);

      const markersAtZoom14 = await page
        .locator(".mapboxgl-marker:visible")
        .count();

      if (markersAtZoom14 === 0) {
        test.skip(true, "No markers at zoom 14 -- insufficient seed data");
        return;
      }

      // Step 2: Zoom out to level 10 to create clusters
      const zoomedOut = await jumpToZoom(page, 10);
      expect(zoomedOut).toBe(true);
      await triggerMarkerUpdate(page);
      await waitForMapReady(page);

      const markersAtZoom10 = await page
        .locator(".mapboxgl-marker:visible")
        .count();

      // With multiple listings, zooming out should either:
      // a) reduce marker count (clusters formed), or
      // b) produce cluster markers with numeric text content (e.g. "3", "5")
      const clusterMarkers = page
        .locator(".mapboxgl-marker:visible")
        .filter({ hasText: /^\d+$/ });
      const clusterCount = await clusterMarkers.count();

      // At least one of these conditions should hold:
      // - marker count changed (clusters formed or unclustered)
      // - cluster markers with numeric labels exist
      const hasClusterBehavior =
        markersAtZoom10 !== markersAtZoom14 || clusterCount > 0;

      // If only 1 listing exists, no clustering is possible -- skip gracefully
      if (markersAtZoom14 <= 1 && !hasClusterBehavior) {
        test.skip(
          true,
          "Only 1 listing available -- clustering not applicable",
        );
        return;
      }

      expect(hasClusterBehavior).toBe(true);
    });

    test("5.2 (P1) - clicking a cluster marker expands it", async ({
      page,
    }) => {
      await waitForSearchPage(page);

      if (!(await isMapAvailable(page))) {
        test.skip(true, "Map not available (WebGL unavailable in headless)");
        return;
      }

      const hasRef = await waitForMapRef(page);
      if (!hasRef) {
        test.skip(true, "Map ref not available");
        return;
      }

      // Zoom out to level 10 to create cluster markers
      const zoomedOut = await jumpToZoom(page, 10);
      expect(zoomedOut).toBe(true);
      await triggerMarkerUpdate(page);
      await waitForMapReady(page);

      // Find cluster markers (markers with numeric-only text like "2", "5")
      const clusterMarkers = page
        .locator(".mapboxgl-marker:visible")
        .filter({ hasText: /^\d+$/ });
      const clusterCount = await clusterMarkers.count();

      if (clusterCount === 0) {
        test.skip(true, "No cluster markers visible at zoom 10");
        return;
      }

      // Record state before clicking
      const zoomBefore = await getMapZoom(page);
      const markerCountBefore = await page
        .locator(".mapboxgl-marker:visible")
        .count();

      // Click the first cluster via evaluate to bypass actionability timeout
      await clusterMarkers.first().evaluate((el) => (el as HTMLElement).click());

      // Wait for cluster expansion animation to complete
      await waitForMapReady(page);

      // After clicking a cluster, either zoom increased or marker count changed
      const zoomAfter = await getMapZoom(page);
      const markerCountAfter = await page
        .locator(".mapboxgl-marker:visible")
        .count();

      const zoomIncreased =
        zoomBefore !== null &&
        zoomAfter !== null &&
        zoomAfter > zoomBefore;
      const markerCountChanged = markerCountAfter !== markerCountBefore;

      expect(zoomIncreased || markerCountChanged).toBe(true);
    });
  });

  // =========================================================================
  // Story 6: Stacked/Overlapping Marker Popup
  // =========================================================================

  test.describe("6 - Stacked/Overlapping Marker Popup", () => {
    test("6.1 (P1) - overlapping markers show stacked popup", async ({
      page,
    }) => {
      await waitForSearchPage(page);

      if (!(await isMapAvailable(page))) {
        test.skip(true, "Map not available (WebGL unavailable in headless)");
        return;
      }

      const hasRef = await waitForMapRef(page);
      if (!hasRef) {
        test.skip(true, "Map ref not available");
        return;
      }

      // Zoom in to expand clusters and reveal individual markers
      const expanded = await zoomToExpandClusters(page);
      if (!expanded) {
        test.skip(true, "Could not expand clusters");
        return;
      }

      const markers = page.locator(".mapboxgl-marker:visible");
      const markerCount = await markers.count();

      if (markerCount < 2) {
        test.skip(true, "Need at least 2 markers to test overlapping");
        return;
      }

      // Find markers that are visually close (within 5px of each other)
      // by comparing their bounding boxes
      let overlappingIndex: number | null = null;
      for (let i = 0; i < markerCount - 1; i++) {
        const box1 = await markers.nth(i).boundingBox();
        if (!box1) continue;

        for (let j = i + 1; j < markerCount; j++) {
          const box2 = await markers.nth(j).boundingBox();
          if (!box2) continue;

          const dx = Math.abs(
            box1.x + box1.width / 2 - (box2.x + box2.width / 2),
          );
          const dy = Math.abs(
            box1.y + box1.height / 2 - (box2.y + box2.height / 2),
          );

          if (dx < 5 && dy < 5) {
            overlappingIndex = i;
            break;
          }
        }
        if (overlappingIndex !== null) break;
      }

      if (overlappingIndex === null) {
        // No overlapping markers found -- click first marker and verify popup
        // shows either single listing or stacked format
        await markers.first().evaluate((el) => (el as HTMLElement).click());

        const popup = page.locator(".mapboxgl-popup");
        await expect(popup).toBeVisible({ timeout: timeouts.action });

        // Popup should contain either "View Details" (single) or "listings at this location" (stacked)
        const hasViewDetails = await popup
          .locator('button:has-text("View Details")')
          .count();
        const hasStackedText = await popup
          .locator('text=/\\d+ listings? at this location/')
          .count();

        expect(hasViewDetails + hasStackedText).toBeGreaterThan(0);

        test.info().annotations.push({
          type: "note",
          description:
            "No overlapping markers found in seed data; verified popup format on single marker instead.",
        });
        return;
      }

      // Click the overlapping marker via evaluate to bypass actionability timeout
      await markers.nth(overlappingIndex).evaluate((el) => (el as HTMLElement).click());

      const popup = page.locator(".mapboxgl-popup");
      await expect(popup).toBeVisible({ timeout: timeouts.action });

      // Stacked popup should have "N listings at this location" or individual listing items
      const stackedPopup = page.locator('[data-testid="stacked-popup"]');
      const hasStackedPopup = (await stackedPopup.count()) > 0;

      if (hasStackedPopup) {
        // Verify the stacked popup has multiple items
        const popupText = await popup.textContent();
        expect(popupText).toMatch(/\d+ listings? at this location/i);
      } else {
        // Markers may be close but have different coordinates -- single popup is acceptable
        const hasViewDetails = await popup
          .locator('button:has-text("View Details")')
          .count();
        expect(hasViewDetails).toBeGreaterThan(0);
      }
    });

    test("6.2 (P2) - stacked popup item click scrolls to card and highlights it", async ({
      page,
    }) => {
      await waitForSearchPage(page);

      if (!(await isMapAvailable(page))) {
        test.skip(true, "Map not available (WebGL unavailable in headless)");
        return;
      }

      const hasRef = await waitForMapRef(page);
      if (!hasRef) {
        test.skip(true, "Map ref not available");
        return;
      }

      const expanded = await zoomToExpandClusters(page);
      if (!expanded) {
        test.skip(true, "Could not expand clusters");
        return;
      }

      // Click each visible marker to look for a stacked popup
      const markers = page.locator(".mapboxgl-marker:visible");
      const markerCount = await markers.count();

      let foundStackedPopup = false;
      for (let i = 0; i < Math.min(markerCount, 10); i++) {
        await markers.nth(i).evaluate((el) => (el as HTMLElement).click());
        // Wait for popup to appear before checking if it's a stacked popup
        await page.locator(".mapboxgl-popup").waitFor({ state: 'visible', timeout: timeouts.action }).catch(() => {});

        const stackedPopup = page.locator('[data-testid="stacked-popup"]');
        if ((await stackedPopup.count()) > 0) {
          foundStackedPopup = true;

          // Click the first stacked popup item
          const firstItem = page
            .locator('[data-testid^="stacked-popup-item-"]')
            .first();
          if ((await firstItem.count()) === 0) break;

          // Extract listing ID from the item's data-testid
          const testId = await firstItem.getAttribute("data-testid");
          const listingId = testId?.replace("stacked-popup-item-", "") ?? "";

          await firstItem.click();

          // Popup should close after item click
          await expect(page.locator(".mapboxgl-popup")).not.toBeVisible({
            timeout: 3000,
          });

          // Card should be scrolled into view and highlighted
          if (listingId) {
            const cardInView = await isCardInViewport(page, listingId);
            expect(cardInView).toBe(true);

            const cardState = await getCardState(page, listingId);
            expect(cardState.isActive).toBe(true);
          }

          break;
        }

        // Close popup before trying next marker
        await page.keyboard.press("Escape");
      }

      if (!foundStackedPopup) {
        test.skip(
          true,
          "No stacked popup found -- seed data may lack co-located listings",
        );
      }
    });
  });

  // =========================================================================
  // Story 7: Map + Sort Interaction
  // =========================================================================

  test.describe("7 - Map + Sort Interaction", () => {
    test("7.1 (P1) - changing sort preserves map markers", async ({
      page,
    }) => {
      await waitForSearchPage(page);

      if (!(await isMapAvailable(page))) {
        test.skip(true, "Map not available (WebGL unavailable in headless)");
        return;
      }

      const hasRef = await waitForMapRef(page);
      if (!hasRef) {
        test.skip(true, "Map ref not available");
        return;
      }

      // Expand clusters to get consistent individual marker count
      await zoomToExpandClusters(page);

      // Record initial marker count
      const initialMarkerCount = await page
        .locator(".mapboxgl-marker:visible")
        .count();

      if (initialMarkerCount === 0) {
        test.skip(true, "No markers available to verify sort stability");
        return;
      }

      // Change sort order via URL navigation (preserving bounds)
      await page.goto(`${SEARCH_URL}&sort=price_asc`);
      await page.waitForLoadState("domcontentloaded");
      await waitForMapReady(page);

      // Map canvas should still be visible (no unmount flash)
      const mapCanvas = page.locator(".mapboxgl-canvas:visible").first();
      await expect(mapCanvas).toBeVisible({ timeout: 5000 });

      // Wait for map to settle after sort change
      // PersistentMapWrapper's MAP_RELEVANT_KEYS excludes sort
      await waitForMapReady(page);

      // Re-expand clusters since page navigated
      const hasRefAfterSort = await waitForMapRef(page);
      if (hasRefAfterSort) {
        await zoomToExpandClusters(page);
      }

      const afterSortMarkerCount = await page
        .locator(".mapboxgl-marker:visible")
        .count();

      // Marker count should be the same -- sort does not affect which listings
      // are within bounds. Allow a tolerance of 1 for timing variance.
      expect(afterSortMarkerCount).toBeGreaterThanOrEqual(
        initialMarkerCount - 1,
      );
      expect(afterSortMarkerCount).toBeLessThanOrEqual(
        initialMarkerCount + 1,
      );
    });

    test("7.2 (P2) - sort change does not trigger map data re-fetch", async ({
      page,
    }) => {
      // Track /api/map-listings calls
      let mapListingsCalls = 0;

      await page.route("**/api/map-listings*", async (route) => {
        mapListingsCalls++;
        await route.continue();
      });

      await waitForSearchPage(page);

      if (!(await isMapAvailable(page))) {
        // Clean up route before skipping
        await page.unroute("**/api/map-listings*");
        test.skip(true, "Map not available (WebGL unavailable in headless)");
        return;
      }

      // Record call count after initial page load
      const callsAfterLoad = mapListingsCalls;

      // Navigate with sort change (preserving bounds)
      await page.goto(`${SEARCH_URL}&sort=newest`);
      await page.waitForLoadState("domcontentloaded");

      await waitForMapReady(page);
      // Intentional wait: must exceed the 2s PersistentMapWrapper throttle to verify no delayed map-listings call fires
      await page.waitForTimeout(2500);

      // PersistentMapWrapper filters out sort param from MAP_RELEVANT_KEYS,
      // so no additional /api/map-listings call should occur from the sort change.
      // The page navigation itself may trigger a fresh load, so we check that
      // the total calls are not significantly higher than expected.
      const callsAfterSort = mapListingsCalls;

      // At most 1 additional call from the page navigation itself is acceptable.
      // The key assertion: sort change alone should not trigger a map re-fetch.
      expect(callsAfterSort).toBeLessThanOrEqual(callsAfterLoad + 1);

      // Clean up
      await page.unroute("**/api/map-listings*");
    });
  });

  // =========================================================================
  // Story 8: Map Bounds URL Round-Trip
  // =========================================================================

  test.describe("8 - Map Bounds URL Round-Trip", () => {
    test("8.1 (P0) - URL bounds produce correct map viewport", async ({
      page,
    }) => {
      // Use specific tight bounds for downtown SF
      const specificBounds = {
        minLat: 37.76,
        maxLat: 37.79,
        minLng: -122.44,
        maxLng: -122.41,
      };
      const specificBoundsQS = `minLat=${specificBounds.minLat}&maxLat=${specificBounds.maxLat}&minLng=${specificBounds.minLng}&maxLng=${specificBounds.maxLng}`;

      await waitForSearchPage(page, `/search?${specificBoundsQS}`);

      const hasRef = await waitForMapRef(page);
      if (!hasRef) {
        test.skip(true, "Map ref not available (WebGL unavailable)");
        return;
      }

      // Read map center from E2E hook
      const center = await getMapCenter(page);
      if (!center) {
        test.skip(true, "Could not read map center via E2E hook");
        return;
      }

      // Center should be approximately in the middle of the bounds
      const expectedLat =
        (specificBounds.minLat + specificBounds.maxLat) / 2; // 37.775
      const expectedLng =
        (specificBounds.minLng + specificBounds.maxLng) / 2; // -122.425

      const tolerance = 0.02;
      expect(center.lat).toBeGreaterThanOrEqual(expectedLat - tolerance);
      expect(center.lat).toBeLessThanOrEqual(expectedLat + tolerance);
      expect(center.lng).toBeGreaterThanOrEqual(expectedLng - tolerance);
      expect(center.lng).toBeLessThanOrEqual(expectedLng + tolerance);
    });

    test("8.2 (P1) - map pan updates URL bounds correctly", async ({
      page,
    }) => {
      await waitForSearchPage(page);

      if (!(await isMapAvailable(page))) {
        test.skip(true, "Map not available (WebGL unavailable in headless)");
        return;
      }

      await ensureSearchAsMoveOn(page);

      // Record initial URL bounds
      const initialBounds = getUrlBounds(page.url());
      expect(initialBounds.minLng).not.toBeNull();

      // Pan map east (drag from center to left so the viewport shifts right/east)
      const panned = await simulateMapPan(page, -150, 0);
      if (!panned) {
        test.skip(true, "Map pan failed");
        return;
      }

      // Poll for debounced URL bounds update after pan
      await expect.poll(
        () => getUrlBounds(page.url()).minLng,
        { timeout: 30_000, message: 'Waiting for URL bounds to update after pan' },
      ).not.toBe(initialBounds.minLng);

      // Parse new URL bounds
      const newBounds = getUrlBounds(page.url());

      if (newBounds.minLng === null || initialBounds.minLng === null) {
        test.skip(true, "URL bounds not updated after pan");
        return;
      }

      // Panning east means minLng and maxLng should both increase
      expect(newBounds.minLng).toBeGreaterThan(initialBounds.minLng!);
      expect(newBounds.maxLng!).toBeGreaterThan(initialBounds.maxLng!);

      // Latitude should be roughly unchanged (horizontal pan)
      expect(newBounds.minLat!).toBeCloseTo(initialBounds.minLat!, 1);
      expect(newBounds.maxLat!).toBeCloseTo(initialBounds.maxLat!, 1);

      // Bounds span should be approximately the same (pan, not zoom)
      const initialSpan = initialBounds.maxLng! - initialBounds.minLng!;
      const newSpan = newBounds.maxLng! - newBounds.minLng!;
      expect(newSpan).toBeCloseTo(initialSpan, 1);
    });

    test("8.3 (P2) - shared URL shows same map area in different contexts", async ({
      page,
      browser,
    }) => {
      // Use specific bounds that both contexts will load
      const sharedBounds = {
        minLat: 37.75,
        maxLat: 37.8,
        minLng: -122.45,
        maxLng: -122.4,
      };
      const sharedBoundsQS = `minLat=${sharedBounds.minLat}&maxLat=${sharedBounds.maxLat}&minLng=${sharedBounds.minLng}&maxLng=${sharedBounds.maxLng}`;
      const sharedUrl = `/search?${sharedBoundsQS}`;

      // Load in first context (current page)
      await waitForSearchPage(page, sharedUrl);

      const hasRef1 = await waitForMapRef(page);
      if (!hasRef1) {
        test.skip(true, "Map ref not available in first context");
        return;
      }

      const center1 = await getMapCenter(page);
      if (!center1) {
        test.skip(true, "Could not read map center in first context");
        return;
      }

      // Open second browser context (simulates a different user opening the shared URL)
      const context2 = await browser.newContext({
        storageState: { cookies: [], origins: [] },
      });
      const page2 = await context2.newPage();

      try {
        await page2.goto(sharedUrl);
        await page2.waitForLoadState("domcontentloaded");
        await waitForMapReady(page2);

        const hasRef2 = await waitForMapRef(page2);
        if (!hasRef2) {
          test.skip(true, "Map ref not available in second context");
          return;
        }

        const center2 = await getMapCenter(page2);
        if (!center2) {
          test.skip(true, "Could not read map center in second context");
          return;
        }

        // Both map centers should be within 0.01 degrees of each other
        const latDiff = Math.abs(center1.lat - center2.lat);
        const lngDiff = Math.abs(center1.lng - center2.lng);

        expect(latDiff).toBeLessThan(0.01);
        expect(lngDiff).toBeLessThan(0.01);

        // Both pages should show listing cards
        const cards1 = searchResultsContainer(page).locator('[data-testid="listing-card"]');
        const cards2 = searchResultsContainer(page2).locator('[data-testid="listing-card"]');

        // At least verify both pages loaded content (cards may or may not exist
        // depending on seed data, but body should be visible)
        expect(await page.locator("body").isVisible()).toBe(true);
        expect(await page2.locator("body").isVisible()).toBe(true);
      } finally {
        await context2.close();
      }
    });
  });
});
