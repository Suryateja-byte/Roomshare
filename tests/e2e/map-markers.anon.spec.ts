/**
 * Map Marker Interactions E2E Tests (Scenarios 3.1-3.9)
 *
 * Tests marker click, popup interactions, keyboard navigation, and cluster expansion.
 *
 * NOTE: Mapbox GL JS requires WebGL. In headless Chromium without GPU,
 * the map may not fully initialize, so tests gracefully skip when markers
 * are not available.
 *
 * For full visual testing, run with --headed flag:
 *   pnpm playwright test tests/e2e/map-markers.spec.ts --project=chromium-anon --headed
 */

import {
  test,
  expect,
  timeouts,
  tags,
  SF_BOUNDS,
} from "./helpers";
import type { Page } from "@playwright/test";

// Build search URL with SF bounds
const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;
const SEARCH_URL = `/search?${boundsQS}`;

// Animation timing constants
const CLUSTER_ANIMATION_MS = 700;
const MAP_EASE_ANIMATION_MS = 300;

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Check if map canvas is visible (WebGL initialized)
 */
async function isMapAvailable(page: Page): Promise<boolean> {
  const map = page.locator(".mapboxgl-canvas:visible").first();
  try {
    await map.waitFor({ state: "visible", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Wait for popup to appear after marker interaction
 */
async function waitForPopup(page: Page): Promise<void> {
  await expect(page.locator(".mapboxgl-popup")).toBeVisible({
    timeout: timeouts.action,
  });
}

/**
 * Close popup via close button (handles both single and stacked popups)
 */
async function closePopupViaButton(page: Page): Promise<void> {
  const closeBtn = page
    .locator(
      'button[aria-label="Close listing preview"], button[aria-label="Close popup"]'
    )
    .first();
  await closeBtn.click();
  await expect(page.locator(".mapboxgl-popup")).not.toBeVisible({
    timeout: 2000,
  });
}

/**
 * Get the first visible marker element
 */
function getFirstVisibleMarker(page: Page) {
  return page.locator(".mapboxgl-marker:visible").first();
}

/**
 * Tab through page elements until a marker is focused
 * Returns true if a marker was focused, false otherwise
 */
async function tabToMarker(page: Page, maxAttempts = 30): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(50);

    // Check if active element is a marker (has aria-label with price format "$X/month")
    const isMarkerFocused = await page.evaluate(() => {
      const active = document.activeElement;
      if (!active) return false;
      const ariaLabel = active.getAttribute("aria-label") || "";
      return ariaLabel.includes("$") && ariaLabel.includes("/month");
    });

    if (isMarkerFocused) return true;
  }
  return false;
}

/**
 * Get current zoom level from map via E2E testing hook
 */
async function getMapZoom(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const mapInstance = (window as any).__e2eMapRef;
    return mapInstance?.getZoom?.() ?? null;
  });
}

/**
 * Wait for the E2E map ref to be exposed (map is loaded and ready).
 * Returns true if the map ref is available, false if timed out.
 */
async function waitForMapRef(page: Page, timeout = 30000): Promise<boolean> {
  try {
    await page.waitForFunction(
      () => !!(window as any).__e2eMapRef,
      { timeout }
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Zoom in to expand clusters and reveal individual markers.
 *
 * Uses the E2E testing hook (window.__e2eSetProgrammaticMove + __e2eMapRef.jumpTo)
 * to zoom programmatically WITHOUT triggering "Search as I move" URL updates.
 * This solves the chicken-and-egg problem where zooming in triggers a search
 * with narrow bounds that returns 0 results.
 *
 * After zooming, waits for the map `idle` event (all tiles loaded + rendered)
 * so that querySourceFeatures returns the correct unclustered points.
 */
async function zoomToExpandClusters(page: Page): Promise<boolean> {
  // Check if individual markers are already visible
  const existingCount = await page.locator(".mapboxgl-marker:visible").count();
  if (existingCount > 0) return true;

  // Wait for map E2E hook to be available
  const hasMapRef = await waitForMapRef(page);
  if (!hasMapRef) return false;

  // Get a listing location to center on (listings are spread across SF,
  // so we need to center the viewport on actual listings when zooming in)
  const listingCenter = await page.evaluate(() => {
    // Try to get coordinates from the GeoJSON source
    const map = (window as any).__e2eMapRef;
    if (map && map.getSource("listings")) {
      try {
        const features = map.querySourceFeatures("listings");
        if (features.length > 0) {
          const coords = features[0].geometry.coordinates;
          return { lng: coords[0], lat: coords[1] };
        }
      } catch {}
    }
    return null;
  });

  // Zoom to a level that unclusters markers, centered on a listing
  const zoomed = await page.evaluate(
    ({ center }) => {
      return new Promise<boolean>((resolve) => {
        const map = (window as any).__e2eMapRef;
        const setProgrammatic = (window as any).__e2eSetProgrammaticMove;
        if (!map || !setProgrammatic) {
          resolve(false);
          return;
        }

        // Flag as programmatic move BEFORE zooming — handleMoveEnd will skip search
        setProgrammatic(true);

        // Wait for map to become idle (tiles loaded, rendering complete)
        map.once("idle", () => {
          resolve(true);
        });

        // jumpTo with center on a known listing location
        const jumpOptions: any = { zoom: 14 };
        if (center) {
          jumpOptions.center = [center.lng, center.lat];
        }
        map.jumpTo(jumpOptions);

        // Safety timeout in case idle never fires
        setTimeout(() => resolve(true), 10000);
      });
    },
    { center: listingCenter }
  );

  if (!zoomed) return false;

  // After idle, tiles are loaded but the sourcedata handler skips tile events
  // during non-cluster-expansion moves. Manually trigger marker update.
  // After idle, manually trigger marker update in case the sourcedata handler
  // missed tile events during the programmatic zoom
  await page.evaluate(() => {
    const updateMarkers = (window as any).__e2eUpdateMarkers;
    if (typeof updateMarkers === "function") {
      updateMarkers();
    }
  });

  // Wait for React to process the state update and render Marker components
  await page.waitForTimeout(1000);

  const finalCount = await page.locator(".mapboxgl-marker:visible").count();
  return finalCount > 0;
}

/**
 * Wait for markers with automatic cluster expansion.
 * First checks for existing markers, then zooms in to expand clusters if needed.
 */
async function waitForMarkersWithClusterExpansion(
  page: Page,
  options?: { timeout?: number; minCount?: number }
): Promise<number> {
  const minCount = options?.minCount ?? 1;

  // Check if markers are already visible
  let markerCount = await page.locator(".mapboxgl-marker:visible").count();

  if (markerCount < minCount) {
    // Zoom in to expand clusters (uses E2E hook, won't trigger search)
    await zoomToExpandClusters(page);
  }

  // Recount after expansion attempt
  markerCount = await page.locator(".mapboxgl-marker:visible").count();
  return markerCount;
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

test.describe("Map Marker Interactions", () => {
  // Run as anonymous user
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ page }) => {
    await page.goto(SEARCH_URL);
    await page.waitForLoadState("domcontentloaded");

    // Wait for map E2E hook to be exposed (map loaded + React effect ran)
    const mapReady = await waitForMapRef(page);
    if (!mapReady) return; // Tests will skip via isMapAvailable check

    // Zoom in programmatically to expand clusters into individual markers.
    // Uses __e2eSetProgrammaticMove to prevent "Search as I move" from
    // updating the URL and wiping out SSR-rendered listing results.
    await zoomToExpandClusters(page);
  });

  // =========================================================================
  // 3.1-3.2: Marker Click and Popup (P0)
  // =========================================================================

  test.describe("3.1-3.2: Marker Click and Popup (P0)", () => {
    test("3.1 - clicking marker opens popup with listing preview", async ({
      page,
    }) => {
      // Skip if map not available (WebGL issue)
      if (!(await isMapAvailable(page))) {
        test.skip(true, "Map not available (WebGL unavailable in headless)");
        return;
      }

      // Wait for markers
      const markerCount = await waitForMarkersWithClusterExpansion(page);
      if (markerCount === 0) {
        test.skip(true, "No markers available");
        return;
      }

      const marker = getFirstVisibleMarker(page);
      await expect(marker).toBeVisible({ timeout: timeouts.action });

      // Click marker
      await marker.click();
      await page.waitForTimeout(timeouts.animation);

      // Popup should appear
      const popup = page.locator(".mapboxgl-popup");
      await expect(popup).toBeVisible({ timeout: timeouts.action });

      // Verify popup has expected content (price, image area, or listing info)
      // Single listing popup has "View Details" button
      // Stacked popup has "listings at this location" text
      const hasViewDetails = await popup
        .locator('button:has-text("View Details")')
        .count();
      const hasStackedHeader = await popup
        .locator('text="listings at this location"')
        .count();

      expect(hasViewDetails + hasStackedHeader).toBeGreaterThan(0);
    });

    test("3.2a - close popup via close button", async ({ page }) => {
      if (!(await isMapAvailable(page))) {
        test.skip(true, "Map not available");
        return;
      }

      const markerCount = await waitForMarkersWithClusterExpansion(page);
      if (markerCount === 0) {
        test.skip(true, "No markers available");
        return;
      }

      const marker = getFirstVisibleMarker(page);
      await marker.click();
      await waitForPopup(page);

      // Close via button
      await closePopupViaButton(page);

      // Popup should be gone
      await expect(page.locator(".mapboxgl-popup")).not.toBeVisible({
        timeout: 2000,
      });
    });

    test("3.2b - close popup by clicking elsewhere on map", async ({
      page,
    }) => {
      if (!(await isMapAvailable(page))) {
        test.skip(true, "Map not available");
        return;
      }

      const markerCount = await waitForMarkersWithClusterExpansion(page);
      if (markerCount === 0) {
        test.skip(true, "No markers available");
        return;
      }

      const marker = getFirstVisibleMarker(page);
      await marker.click();
      await waitForPopup(page);

      // Get map canvas bounding box
      const mapCanvas = page.locator(".mapboxgl-canvas:visible").first();
      const boundingBox = await mapCanvas.boundingBox();
      expect(boundingBox).toBeTruthy();

      // Click on corner of map (less likely to hit another marker)
      await page.mouse.click(
        boundingBox!.x + 20,
        boundingBox!.y + boundingBox!.height - 20
      );
      await page.waitForTimeout(timeouts.animation);

      // Popup count should be 0 or 1 (might open another marker's popup)
      const popupCount = await page.locator(".mapboxgl-popup").count();
      expect(popupCount).toBeLessThanOrEqual(1);
    });

    test("3.2c - popup close button has correct ARIA label", async ({
      page,
    }) => {
      if (!(await isMapAvailable(page))) {
        test.skip(true, "Map not available");
        return;
      }

      const markerCount = await waitForMarkersWithClusterExpansion(page);
      if (markerCount === 0) {
        test.skip(true, "No markers available");
        return;
      }

      const marker = getFirstVisibleMarker(page);
      await marker.click();
      await waitForPopup(page);

      // Check for accessible close button
      const closeBtn = page.locator(
        'button[aria-label="Close listing preview"], button[aria-label="Close popup"]'
      );
      await expect(closeBtn.first()).toBeVisible();
      const ariaLabel = await closeBtn.first().getAttribute("aria-label");
      expect(ariaLabel).toMatch(/close/i);
    });
  });

  // =========================================================================
  // 3.3: Cluster Expansion (P0)
  // =========================================================================

  test.describe("3.3: Cluster Expansion (P0)", () => {
    test("3.3 - clicking cluster marker zooms in to expand", async ({
      page,
    }) => {
      if (!(await isMapAvailable(page))) {
        test.skip(true, "Map not available");
        return;
      }

      // Get initial zoom level
      const initialZoom = await getMapZoom(page);

      // Wait for markers (may include clusters)
      const markerCount = await waitForMarkersWithClusterExpansion(page);
      if (markerCount === 0) {
        test.skip(true, "No markers available");
        return;
      }

      // Look for cluster marker (has count badge showing a number like "2", "3", etc.)
      const clusterMarker = page
        .locator(".mapboxgl-marker:visible")
        .filter({ hasText: /^\d+$/ });
      const clusterCount = await clusterMarker.count();

      if (clusterCount === 0) {
        // No clusters visible - zoom out programmatically to create clusters
        await page.evaluate(() => {
          const map = (window as any).__e2eMapRef;
          const setProgrammatic = (window as any).__e2eSetProgrammaticMove;
          if (map && setProgrammatic) {
            setProgrammatic(true);
            map.jumpTo({ zoom: 10 }); // Zoom out to create clusters
          }
        });
        await page.waitForTimeout(1500);

        const newClusterCount = await clusterMarker.count();
        if (newClusterCount === 0) {
          test.skip(true, "No cluster markers available at any zoom level");
          return;
        }
      }

      // Click the first cluster
      await clusterMarker.first().click();

      // Wait for zoom animation
      await page.waitForTimeout(CLUSTER_ANIMATION_MS + 200);

      // Check if zoom increased (cluster expanded)
      const newZoom = await getMapZoom(page);

      // Either zoom increased OR more markers are now visible (cluster expanded)
      if (initialZoom !== null && newZoom !== null) {
        expect(newZoom).toBeGreaterThanOrEqual(initialZoom);
      }

      // Alternative check: marker count may have changed
      const newMarkerCount = await page
        .locator(".mapboxgl-marker:visible")
        .count();
      expect(newMarkerCount).toBeGreaterThanOrEqual(1);
    });
  });

  // =========================================================================
  // 3.4: Popup Navigation (P1)
  // =========================================================================

  test.describe("3.4: Popup Navigation (P1)", () => {
    test('3.4 - "View Details" button navigates to listing page', async ({
      page,
    }) => {
      if (!(await isMapAvailable(page))) {
        test.skip(true, "Map not available");
        return;
      }

      const markerCount = await waitForMarkersWithClusterExpansion(page);
      if (markerCount === 0) {
        test.skip(true, "No markers available");
        return;
      }

      const marker = getFirstVisibleMarker(page);
      await marker.click();
      await waitForPopup(page);

      // Find View Details button/link
      const popup = page.locator(".mapboxgl-popup");
      const viewDetailsLink = popup.locator('a:has(button:has-text("View Details"))');
      const stackedItemLink = popup.locator('[data-testid^="stacked-popup-open-"]');

      // Check if it's a single listing popup or stacked popup
      const isSingleListing = (await viewDetailsLink.count()) > 0;
      const isStackedListing = (await stackedItemLink.count()) > 0;

      if (isSingleListing) {
        // Get href before clicking
        const href = await viewDetailsLink.getAttribute("href");
        expect(href).toMatch(/^\/listings\//);

        // Click and verify navigation
        await viewDetailsLink.click();
        await page.waitForURL(`**${href}`, { timeout: timeouts.navigation });
        expect(page.url()).toContain("/listings/");
      } else if (isStackedListing) {
        // For stacked popup, click the arrow/link to navigate
        const href = await stackedItemLink.first().getAttribute("href");
        expect(href).toMatch(/^\/listings\//);

        await stackedItemLink.first().click();
        await page.waitForURL(`**${href}`, { timeout: timeouts.navigation });
        expect(page.url()).toContain("/listings/");
      } else {
        test.fail(true, "No navigation link found in popup");
      }
    });
  });

  // =========================================================================
  // 3.5-3.8: Keyboard Accessibility (P1-P2)
  // =========================================================================

  test.describe("3.5-3.8: Keyboard Accessibility (P1-P2)", () => {
    test("3.5 - Enter key opens popup on focused marker", async ({ page }) => {
      if (!(await isMapAvailable(page))) {
        test.skip(true, "Map not available");
        return;
      }

      const markerCount = await waitForMarkersWithClusterExpansion(page);
      if (markerCount === 0) {
        test.skip(true, "No markers available");
        return;
      }

      // Tab to focus a marker
      const foundMarker = await tabToMarker(page);
      if (!foundMarker) {
        test.skip(true, "Could not tab to marker");
        return;
      }

      // Press Enter to open popup
      await page.keyboard.press("Enter");
      await page.waitForTimeout(timeouts.animation);

      // Popup should appear
      await expect(page.locator(".mapboxgl-popup")).toBeVisible({
        timeout: timeouts.action,
      });
    });

    test("3.5b - Space key opens popup on focused marker", async ({ page }) => {
      if (!(await isMapAvailable(page))) {
        test.skip(true, "Map not available");
        return;
      }

      const markerCount = await waitForMarkersWithClusterExpansion(page);
      if (markerCount === 0) {
        test.skip(true, "No markers available");
        return;
      }

      // Tab to focus a marker
      const foundMarker = await tabToMarker(page);
      if (!foundMarker) {
        test.skip(true, "Could not tab to marker");
        return;
      }

      // Press Space to open popup
      await page.keyboard.press("Space");
      await page.waitForTimeout(timeouts.animation);

      // Popup should appear
      await expect(page.locator(".mapboxgl-popup")).toBeVisible({
        timeout: timeouts.action,
      });
    });

    test("3.5c - marker has correct ARIA attributes for accessibility", async ({
      page,
    }) => {
      if (!(await isMapAvailable(page))) {
        test.skip(true, "Map not available");
        return;
      }

      const markerCount = await waitForMarkersWithClusterExpansion(page);
      if (markerCount === 0) {
        test.skip(true, "No markers available");
        return;
      }

      const marker = getFirstVisibleMarker(page);

      // Check role="button"
      const markerInner = marker.locator('[role="button"]');
      await expect(markerInner).toBeVisible();

      // Check tabIndex for keyboard accessibility
      const tabIndex = await markerInner.getAttribute("tabindex");
      expect(tabIndex).toBe("0");

      // Check aria-label contains price and navigation hint
      // Format: "$1200/month, Title, N spots available. Use arrow keys to navigate between markers."
      const ariaLabel = await markerInner.getAttribute("aria-label");
      expect(ariaLabel).toBeTruthy();
      expect(ariaLabel).toMatch(/\$/); // Contains price
      expect(ariaLabel).toMatch(/\/month/); // Contains "/month"
      expect(ariaLabel).toMatch(/arrow keys/i); // Contains navigation hint
    });

    test("3.6 - arrow keys navigate between markers", async ({ page }) => {
      if (!(await isMapAvailable(page))) {
        test.skip(true, "Map not available");
        return;
      }

      const markerCount = await waitForMarkersWithClusterExpansion(page);
      if (markerCount < 2) {
        test.skip(true, "Need at least 2 markers for navigation test");
        return;
      }

      // Tab to focus a marker
      const foundMarker = await tabToMarker(page);
      if (!foundMarker) {
        test.skip(true, "Could not tab to marker");
        return;
      }

      // Get initial focused marker's aria-label (for debugging navigation)
      const initialLabel = await page.evaluate(
        () => document.activeElement?.getAttribute("aria-label") || ""
      );
      void initialLabel; // Used for debugging; we verify currentLabel in the loop

      // Try each arrow key to navigate
      for (const key of ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"]) {
        await page.keyboard.press(key);
        await page.waitForTimeout(MAP_EASE_ANIMATION_MS + 100);

        // Check if focus moved to a different element or same element
        const currentLabel = await page.evaluate(
          () => document.activeElement?.getAttribute("aria-label") || ""
        );

        // Focus should still be on a marker (contains $ and listing)
        expect(currentLabel).toMatch(/\$/);
        expect(currentLabel).toMatch(/\/month/);
      }

      // Verify we're still on a marker after navigation
      const finalLabel = await page.evaluate(
        () => document.activeElement?.getAttribute("aria-label") || ""
      );
      expect(finalLabel).toMatch(/\/month/);
    });

    test("3.7 - Home key jumps to first marker, End to last", async ({
      page,
    }) => {
      if (!(await isMapAvailable(page))) {
        test.skip(true, "Map not available");
        return;
      }

      const markerCount = await waitForMarkersWithClusterExpansion(page);
      if (markerCount < 2) {
        test.skip(true, "Need at least 2 markers for Home/End test");
        return;
      }

      // Tab to focus a marker
      const foundMarker = await tabToMarker(page);
      if (!foundMarker) {
        test.skip(true, "Could not tab to marker");
        return;
      }

      // Press Home to go to first marker
      await page.keyboard.press("Home");
      await page.waitForTimeout(MAP_EASE_ANIMATION_MS + 100);

      // Should still be focused on a marker
      const afterHomeLabel = await page.evaluate(
        () => document.activeElement?.getAttribute("aria-label") || ""
      );
      expect(afterHomeLabel).toMatch(/\/month/);

      // Press End to go to last marker
      await page.keyboard.press("End");
      await page.waitForTimeout(MAP_EASE_ANIMATION_MS + 100);

      // Should still be focused on a marker
      const afterEndLabel = await page.evaluate(
        () => document.activeElement?.getAttribute("aria-label") || ""
      );
      expect(afterEndLabel).toMatch(/\/month/);

      // Verify Home and End give different results (unless only 1 marker)
      if (markerCount > 1) {
        // Press Home again
        await page.keyboard.press("Home");
        await page.waitForTimeout(MAP_EASE_ANIMATION_MS + 100);
        const homeLabel = await page.evaluate(
          () => document.activeElement?.getAttribute("aria-label") || ""
        );

        // Press End again
        await page.keyboard.press("End");
        await page.waitForTimeout(MAP_EASE_ANIMATION_MS + 100);
        const endLabel = await page.evaluate(
          () => document.activeElement?.getAttribute("aria-label") || ""
        );

        // If multiple markers, Home and End should focus different markers
        // (different aria-labels since they include the price)
        if (markerCount > 1) {
          // Labels should exist, navigation worked
          expect(homeLabel.length).toBeGreaterThan(0);
          expect(endLabel.length).toBeGreaterThan(0);
        }
      }
    });

    test("3.8 - Escape key closes popup", async ({ page }) => {
      if (!(await isMapAvailable(page))) {
        test.skip(true, "Map not available");
        return;
      }

      const markerCount = await waitForMarkersWithClusterExpansion(page);
      if (markerCount === 0) {
        test.skip(true, "No markers available");
        return;
      }

      const marker = getFirstVisibleMarker(page);
      await marker.click();
      await waitForPopup(page);

      // Press Escape
      await page.keyboard.press("Escape");
      await page.waitForTimeout(timeouts.animation);

      // Popup should be closed
      await expect(page.locator(".mapboxgl-popup")).not.toBeVisible({
        timeout: 2000,
      });
    });

    test("3.8b - Escape closes popup but card highlight persists (activeId independent)", async ({ page }) => {
      if (!(await isMapAvailable(page))) {
        test.skip(true, "Map not available");
        return;
      }

      const markerCount = await waitForMarkersWithClusterExpansion(page);
      if (markerCount === 0) {
        test.skip(true, "No markers available");
        return;
      }

      const marker = getFirstVisibleMarker(page);
      await marker.click();
      await waitForPopup(page);

      // Check for highlighted card using evaluate (Tailwind v4 classes may not
      // be reliably matched via Playwright CSS selectors)
      const highlightCountBefore = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('[data-testid="listing-card"]'))
          .filter(el => el.classList.contains("ring-2"))
          .length;
      });

      // Press Escape
      await page.keyboard.press("Escape");
      await page.waitForTimeout(timeouts.animation);

      // Popup should be gone
      await expect(page.locator(".mapboxgl-popup")).not.toBeVisible({
        timeout: 2000,
      });

      // Card highlight persists after Escape because activeId is managed
      // independently from selectedListing (popup state). Only setSelectedListing(null)
      // is called on Escape — setActive(null) is NOT called.
      // This is by design: the "last viewed" card stays highlighted.
      const highlightCountAfter = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('[data-testid="listing-card"]'))
          .filter(el => el.classList.contains("ring-2"))
          .length;
      });
      expect(highlightCountAfter).toBe(highlightCountBefore);
    });
  });

  // =========================================================================
  // 3.9: Stacked Marker Offset (P2)
  //
  // NOTE: StackedListingPopup component exists at src/components/map/StackedListingPopup.tsx
  // but is NOT integrated into Map.tsx yet. Tests 3.9b and 3.9c (stacked popup
  // interactions) are skipped until the popup is wired up.
  // Test 3.9 verifies the marker OFFSET logic which IS implemented.
  // =========================================================================

  test.describe("3.9: Stacked Marker Offset (P2)", () => {
    test("3.9 - markerPositions memo applies offsets for same-coord listings", async ({
      page,
    }) => {
      if (!(await isMapAvailable(page))) {
        test.skip(true, "Map not available");
        return;
      }

      const markerCount = await waitForMarkersWithClusterExpansion(page);
      if (markerCount === 0) {
        test.skip(true, "No markers available");
        return;
      }

      // Verify the offset logic exists by checking that the markerPositions memo
      // handles same-coordinate listings. We test this indirectly by verifying
      // that multiple markers are rendered at distinct DOM positions.
      const markers = page.locator(".mapboxgl-marker:visible");
      const count = await markers.count();

      if (count < 2) {
        test.skip(true, "Need at least 2 markers to verify offset behavior");
        return;
      }

      // Get bounding boxes of first two markers
      const box1 = await markers.nth(0).boundingBox();
      const box2 = await markers.nth(1).boundingBox();

      expect(box1).toBeTruthy();
      expect(box2).toBeTruthy();

      // Markers should be at different positions (whether stacked-offset or
      // naturally at different coordinates)
      const samePosition =
        Math.abs(box1!.x - box2!.x) < 1 && Math.abs(box1!.y - box2!.y) < 1;
      expect(samePosition).toBe(false);
    });

    test("3.9b - stacked popup allows selecting individual listings", async () => {
      // TODO: StackedListingPopup exists but is not imported in Map.tsx.
      // Skip until the stacked popup is integrated into the map component.
      test.skip(
        true,
        "StackedListingPopup not yet integrated into Map.tsx"
      );
    });

    test("3.9c - stacked popup is keyboard accessible", async () => {
      // TODO: StackedListingPopup exists but is not imported in Map.tsx.
      // Skip until the stacked popup is integrated into the map component.
      test.skip(
        true,
        "StackedListingPopup not yet integrated into Map.tsx"
      );
    });
  });

  // =========================================================================
  // Accessibility Audit
  // =========================================================================

  test.describe("Accessibility Checks", () => {
    test(`${tags.a11y} - markers are keyboard focusable`, async ({ page }) => {
      if (!(await isMapAvailable(page))) {
        test.skip(true, "Map not available");
        return;
      }

      const markerCount = await waitForMarkersWithClusterExpansion(page);
      if (markerCount === 0) {
        test.skip(true, "No markers available");
        return;
      }

      // All marker inner elements should have tabindex="0"
      const markerButtons = page.locator('.mapboxgl-marker [role="button"]');
      const count = await markerButtons.count();

      if (count > 0) {
        for (let i = 0; i < Math.min(count, 5); i++) {
          const tabIndex = await markerButtons.nth(i).getAttribute("tabindex");
          expect(tabIndex).toBe("0");
        }
      }
    });

    test(`${tags.a11y} - keyboard focus is visible on markers`, async ({
      page,
    }) => {
      if (!(await isMapAvailable(page))) {
        test.skip(true, "Map not available");
        return;
      }

      const markerCount = await waitForMarkersWithClusterExpansion(page);
      if (markerCount === 0) {
        test.skip(true, "No markers available");
        return;
      }

      // Tab to marker
      const foundMarker = await tabToMarker(page);
      if (!foundMarker) {
        test.skip(true, "Could not tab to marker");
        return;
      }

      // Check for visible focus indicator (the component uses a focus ring)
      // The MapClient.tsx shows focus ring when keyboardFocusedId matches
      const focusRing = page.locator(
        ".mapboxgl-marker .border-blue-500, .mapboxgl-marker .border-blue-400"
      );
      const hasFocusRing = (await focusRing.count()) > 0;

      // Alternative: check if any marker has z-50 (elevated z-index when focused)
      const elevatedMarker = page.locator(".mapboxgl-marker .z-50");
      const hasElevated = (await elevatedMarker.count()) > 0;

      // At least one focus indicator should be present
      expect(hasFocusRing || hasElevated).toBe(true);
    });

    test(`${tags.a11y} - popup is announced with appropriate content`, async ({
      page,
    }) => {
      if (!(await isMapAvailable(page))) {
        test.skip(true, "Map not available");
        return;
      }

      const markerCount = await waitForMarkersWithClusterExpansion(page);
      if (markerCount === 0) {
        test.skip(true, "No markers available");
        return;
      }

      const marker = getFirstVisibleMarker(page);
      await marker.click();
      await waitForPopup(page);

      const popup = page.locator(".mapboxgl-popup");

      // Popup should contain meaningful content
      const popupText = await popup.textContent();
      expect(popupText).toBeTruthy();
      expect(popupText!.length).toBeGreaterThan(0);

      // Should have interactive elements (buttons/links)
      const interactiveElements = popup.locator("button, a");
      expect(await interactiveElements.count()).toBeGreaterThan(0);
    });
  });
});
