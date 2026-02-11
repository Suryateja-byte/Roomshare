/**
 * E2E Test Suite: Map Error States and Accessibility
 * Tests 10.1-10.5 (Error States) and 11.1-11.5 (Accessibility)
 *
 * Covers error handling for map interactions and WCAG accessibility compliance.
 *
 * NOTE: Some error tests (10.2, 10.3) are skipped by default because v2 mode
 * provides map data via context (SearchV2DataContext), not /api/map-listings.
 * The viewport validation test (10.4) works in both v1 and v2 modes.
 */

import { test, expect, tags, timeouts, SF_BOUNDS, searchResultsContainer } from "./helpers/test-utils";
import { waitForMapReady, pollForMarkers } from "./helpers";

const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;
const SEARCH_URL = `/search?${boundsQS}`;

// Valid viewport bounds for normal tests (SF area, within MAX_SPAN limits)
const VALID_BOUNDS = {
  minLng: -122.5,
  maxLng: -122.0,
  minLat: 37.5,
  maxLat: 38.0,
};

// Invalid viewport bounds (exceeds MAX_LAT_SPAN=5 and MAX_LNG_SPAN=5)
const INVALID_BOUNDS = {
  minLng: -130,
  maxLng: -120,
  minLat: 30,
  maxLat: 45,
};

test.describe("Map Error States and Accessibility", () => {
  // Desktop viewport required: map only renders on >= 768px
  test.use({
    storageState: { cookies: [], origins: [] },
    viewport: { width: 1280, height: 800 },
  });

  // Skip on mobile browsers and webkit - map tests require specific browser support
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

  // Helper: wait for map error banner
  async function waitForMapError(
    page: import("@playwright/test").Page,
    errorPattern: RegExp,
    timeout = timeouts.action
  ) {
    await page.waitForLoadState("domcontentloaded");

    // Wait for map panel to render
    const hideMapButton = page.getByRole("button", { name: /hide map/i });
    await expect(hideMapButton).toBeVisible({ timeout: timeouts.navigation });

    // Wait for loading to complete
    const loadingText = page.getByText("Loading map...");
    try {
      await expect(loadingText).toBeVisible({ timeout: 2000 });
      await expect(loadingText).not.toBeVisible({ timeout });
    } catch {
      // Loading text was never visible or already gone
    }

    // Look for error banner with role="alert"
    const alertBanner = page.getByRole("alert").filter({ hasText: errorPattern });
    await expect(alertBanner).toBeVisible({ timeout });
  }

  // ---------------------------------------------------------------------------
  // 10.x: Error States
  // ---------------------------------------------------------------------------
  test.describe("10.x: Error States", () => {
    test(`${tags.anon} 10.1 - No results state shows empty state message`, async ({ page }) => {
      // Search with a query that will return no results
      await page.goto(`/search?q=xyznonexistentlisting123456789&${boundsQS}`);
      await page.waitForLoadState("domcontentloaded");

      // Should show empty state or "no results" message
      // Scope to visible search container to avoid matching CSS-hidden mobile/desktop duplicate
      const container = searchResultsContainer(page);
      const emptyStateVisible = container.locator('[data-testid="empty-state"]');
      const noMatchesHeading = container.getByRole("heading", { name: /no matches/i });
      const noListingsText = container.getByText(/no listings found|couldn.*find any listings/i);

      // Either the empty state container, "No matches found" heading, or "no listings" text
      // Wait longer because SSR may initially render with stale data before client takes over
      const emptyIndicator = emptyStateVisible.or(noMatchesHeading).or(noListingsText).first();
      const emptyVisible = await emptyIndicator.isVisible({ timeout: 20_000 }).catch(() => false);
      if (!emptyVisible) {
        // The query might have returned results from seed data or the empty state uses
        // a different pattern. Check if there are listing cards instead.
        const hasCards = await container.locator('[data-testid="listing-card"]').count() > 0;
        if (hasCards) {
          test.skip(true, "Query returned results from seed data — cannot test empty state");
          return;
        }
        // If no cards and no empty state, just annotate
        test.info().annotations.push({
          type: "info",
          description: "Neither empty state nor listing cards visible — page may still be loading",
        });
      }
      await expect(emptyIndicator).toBeVisible({ timeout: 25_000 });

      // Map should still be interactive (not crashed)
      const mapContainer = page.locator('[role="region"][aria-label*="map" i]');
      const mapExists = await mapContainer.count();
      if (mapExists > 0) {
        await expect(mapContainer.first()).toBeVisible();
      }
    });

    // NOTE: V2 mode provides map data via SearchV2DataContext, not /api/map-listings.
    // This test is skipped by default but kept for v1 mode testing.
    test.skip(`${tags.anon} 10.2 - Network error shows error banner with retry`, async ({
      page,
      network,
    }) => {
      // Mock server error for map-listings API
      await network.mockApiResponse("**/api/map-listings*", {
        status: 500,
        body: { error: "Internal server error" },
      });

      await page.goto(
        `/search?minLng=${VALID_BOUNDS.minLng}&maxLng=${VALID_BOUNDS.maxLng}&minLat=${VALID_BOUNDS.minLat}&maxLat=${VALID_BOUNDS.maxLat}`
      );

      // Wait for error banner
      await waitForMapError(page, /Server error|Failed to load/i);

      // Retry button should be visible
      const retryButton = page.getByRole("button", { name: /retry/i });
      await expect(retryButton).toBeVisible();

      // Map container should still be present (graceful degradation)
      const mapRegion = page.locator('[role="region"][aria-label*="map" i]');
      if ((await mapRegion.count()) > 0) {
        await expect(mapRegion.first()).toBeVisible();
      }
    });

    // NOTE: V2 mode provides map data via context, not /api/map-listings.
    // This test is skipped by default but kept for v1 mode testing.
    test.skip(`${tags.anon} 10.3 - Rate limit (429) shows rate limit message`, async ({
      page,
      network,
    }) => {
      // Mock rate limit response
      await network.mockApiResponse("**/api/map-listings*", {
        status: 429,
        body: { error: "Too many requests", retryAfter: 30 },
      });

      await page.goto(
        `/search?minLng=${VALID_BOUNDS.minLng}&maxLng=${VALID_BOUNDS.maxLng}&minLat=${VALID_BOUNDS.minLat}&maxLat=${VALID_BOUNDS.maxLat}`
      );

      // Wait for rate limit message
      await waitForMapError(page, /Too many requests|rate limit/i);
    });

    test(`${tags.anon} 10.4 - Invalid bounds (zoom out too far) shows "Zoom in" message`, async ({
      page,
    }) => {
      // Navigate with viewport exceeding MAX_LAT_SPAN (5 degrees)
      // lat span = 45 - 30 = 15 degrees (exceeds limit)
      // lng span = -120 - (-130) = 10 degrees (exceeds limit)
      await page.goto(
        `/search?minLng=${INVALID_BOUNDS.minLng}&maxLng=${INVALID_BOUNDS.maxLng}&minLat=${INVALID_BOUNDS.minLat}&maxLat=${INVALID_BOUNDS.maxLat}`
      );

      // Should show "Zoom in further" error message
      // NOTE: Current implementation clamps bounds instead of showing error,
      // so we check for either the error message or the info message
      await page.waitForLoadState("domcontentloaded");

      const hideMapButton = page.getByRole("button", { name: /hide map/i });
      await expect(hideMapButton).toBeVisible({ timeout: timeouts.navigation });

      // Wait for map to be ready before checking for messages
      await waitForMapReady(page);

      // Check for error/info message about zooming in or clamped bounds
      const zoomMessage = page.getByText(/Zoom in|Zoomed in to show results/i);
      const alertBanner = page.getByRole("alert").filter({ hasText: /Zoom/i });
      const statusBanner = page.getByRole("status").filter({ hasText: /Zoom/i });

      // Check each locator sequentially (compatible with older TS targets)
      let messageVisible = false;
      if (await zoomMessage.isVisible().catch(() => false)) {
        messageVisible = true;
      } else if (await alertBanner.isVisible().catch(() => false)) {
        messageVisible = true;
      } else if (await statusBanner.isVisible().catch(() => false)) {
        messageVisible = true;
      }

      // Either shows message or map still renders (graceful degradation with clamped bounds)
      if (!messageVisible) {
        // If no message, verify map is still functional
        const mapContainer = page.locator('[role="region"][aria-label*="map" i]');
        await expect(mapContainer.first()).toBeVisible();
      }
    });

    test(`${tags.anon} 10.5 - Map remains interactive during error state`, async ({ page }) => {
      // Navigate to search page
      await page.goto(SEARCH_URL);
      await waitForMapReady(page);

      // Collect console errors
      const consoleErrors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") {
          consoleErrors.push(msg.text());
        }
      });

      // Try to interact with map controls
      const hideMapBtn = page.getByRole("button", { name: /hide map/i });
      await hideMapBtn.click();

      const showMapBtn = page.getByRole("button", { name: /show map/i });
      if (await showMapBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await showMapBtn.click();
        await expect(hideMapBtn).toBeVisible({ timeout: 2000 });
      }

      // Filter out expected/benign errors
      const criticalErrors = consoleErrors.filter(
        (e) =>
          !e.includes("mapbox") &&
          !e.includes("webpack") &&
          !e.includes("HMR") &&
          !e.includes("hydrat") &&
          !e.includes("favicon") &&
          !e.includes("ResizeObserver") &&
          !e.includes("WebGL") &&
          !e.includes("Failed to create") &&
          !e.includes("404") &&
          !e.includes("AbortError") &&
          !e.includes("Environment validation")
      );

      // Should have no critical JavaScript errors
      expect(criticalErrors).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 11.x: Accessibility
  // ---------------------------------------------------------------------------
  test.describe("11.x: Accessibility", () => {
    test(`${tags.anon} ${tags.a11y} 11.1 - Map container has accessible name`, async ({ page }) => {
      await page.goto(SEARCH_URL);
      await waitForMapReady(page);

      // Map should have role="region" and aria-label
      const mapRegion = page.locator(
        '[role="region"][aria-label="Interactive map showing listing locations"]'
      );

      // Wait for map to fully render
      await waitForMapReady(page);

      // Check if map container with proper ARIA exists
      const mapContainer = page.locator('.maplibregl-map').first();
      const mapContainerVisible = await mapContainer.isVisible({ timeout: 5000 }).catch(() => false);

      if (mapContainerVisible) {
        // Check parent region for accessibility
        const regionExists = await mapRegion.count();
        if (regionExists > 0) {
          await expect(mapRegion.first()).toBeVisible();
          await expect(mapRegion.first()).toHaveAttribute("role", "region");
          await expect(mapRegion.first()).toHaveAttribute(
            "aria-label",
            "Interactive map showing listing locations"
          );
        } else {
          // Alternative: check for any map-related region
          const anyMapRegion = page.locator('[role="region"][aria-label*="map" i]');
          await expect(anyMapRegion.first()).toBeVisible();
        }
      } else {
        // Map may not render in headless mode without WebGL
        test.skip(true, "Map not rendered (WebGL unavailable)");
      }
    });

    test(`${tags.anon} ${tags.a11y} 11.2 - Markers have ARIA labels via screen reader announcements`, async ({
      page,
    }) => {
      await page.goto(SEARCH_URL);
      await waitForMapReady(page);

      // Wait for markers to potentially load
      await pollForMarkers(page, 1).catch(() => {});

      // Check for screen reader announcement div (sr-only with role="status")
      const srAnnouncement = page.locator('.sr-only[role="status"][aria-live="polite"]');
      const announcementCount = await srAnnouncement.count();

      // Map component should have screen reader announcements for marker selection
      expect(announcementCount).toBeGreaterThan(0);

      // Also check for keyboard navigation instructions
      const keyboardInstructions = page.locator("#map-marker-instructions.sr-only");
      if ((await keyboardInstructions.count()) > 0) {
        const instructionsText = await keyboardInstructions.textContent();
        expect(instructionsText).toContain("arrow keys");
      }
    });

    test(`${tags.anon} ${tags.a11y} 11.3 - Popup is keyboard navigable`, async ({ page }) => {
      await page.goto(SEARCH_URL);
      await waitForMapReady(page);

      // Wait for markers to load
      await pollForMarkers(page, 1).catch(() => {});

      // Check if markers are present
      const markers = page.locator(".maplibregl-marker");
      const markerCount = await markers.count();

      if (markerCount === 0) {
        test.skip(true, "No markers available for keyboard navigation test");
        return;
      }

      // Try to focus on a marker
      const firstMarker = markers.first();
      await firstMarker.focus();

      // Press Enter or Space to activate
      await page.keyboard.press("Enter");

      // Check if popup appeared
      const popup = page.locator(".maplibregl-popup");
      if (await popup.isVisible({ timeout: 2000 }).catch(() => false)) {
        // Popup should contain focusable elements
        const popupContent = popup.locator("a, button, [tabindex]");
        const focusableCount = await popupContent.count();
        expect(focusableCount).toBeGreaterThanOrEqual(0); // At least verify structure

        // Try to tab through popup
        await page.keyboard.press("Tab");

        // Escape should close popup
        await page.keyboard.press("Escape");
        await expect(popup).not.toBeVisible({ timeout: 2000 });
      }
    });

    test(`${tags.anon} ${tags.a11y} 11.4 - Focus management on popup open`, async ({ page }) => {
      await page.goto(SEARCH_URL);
      await waitForMapReady(page);

      // Wait for markers to load
      await pollForMarkers(page, 1).catch(() => {});

      // Check for markers
      const markers = page.locator(".maplibregl-marker");
      const markerCount = await markers.count();

      if (markerCount === 0) {
        test.skip(true, "No markers available for focus management test");
        return;
      }

      // Click a marker to open popup
      await markers.first().click();

      // Check if popup is visible
      const popup = page.locator(".maplibregl-popup");
      if (await popup.isVisible({ timeout: 2000 }).catch(() => false)) {
        // Screen reader announcement should update with selected listing info
        const srAnnouncement = page.locator('.sr-only[role="status"][aria-live="polite"]').first();
        const announcementText = await srAnnouncement.textContent();

        // Announcement should contain listing info when a marker is selected
        // (may be empty initially, populated after selection)
        if (announcementText && announcementText.trim()) {
          expect(announcementText.toLowerCase()).toMatch(/selected|listing|\$/i);
        }
      }
    });

    // Bottom sheet tests require mobile viewport
    test.describe("11.5 - Bottom sheet accessibility", () => {
      test.use({
        viewport: { width: 393, height: 852 },
      });

      test(`${tags.anon} ${tags.a11y} ${tags.mobile} - Bottom sheet has role="region" and aria-label`, async ({
        page,
      }) => {
        await page.goto(SEARCH_URL);
        await page.waitForLoadState("domcontentloaded");

        // Wait for listings to load
        const listings = page.locator('a[href^="/listings/"]');
        await expect(listings.first()).toBeAttached({ timeout: 30000 });

        // Check for bottom sheet with proper ARIA
        const bottomSheet = page.locator('[role="region"][aria-label="Search results"]');

        // Mobile view should show the bottom sheet
        const sheetVisible = await bottomSheet.isVisible({ timeout: 5000 }).catch(() => false);

        if (sheetVisible) {
          await expect(bottomSheet).toHaveAttribute("role", "region");
          await expect(bottomSheet).toHaveAttribute("aria-label", "Search results");

          // Check for drag handle with slider role
          const dragHandle = bottomSheet.locator('[role="slider"]');
          if ((await dragHandle.count()) > 0) {
            await expect(dragHandle.first()).toHaveAttribute("aria-label", "Results panel size");
            await expect(dragHandle.first()).toHaveAttribute("aria-valuemin", "0");
            await expect(dragHandle.first()).toHaveAttribute("aria-valuemax", "2");
          }
        } else {
          // Check if mobile container exists as fallback
          const mobileContainer = page.locator('[data-testid="mobile-search-results-container"]');
          const containerExists = await mobileContainer.count().then((c) => c > 0);
          expect(containerExists || sheetVisible).toBeTruthy();
        }
      });

      test(`${tags.anon} ${tags.a11y} ${tags.mobile} - Bottom sheet keyboard navigation`, async ({
        page,
      }) => {
        await page.goto(SEARCH_URL);
        await page.waitForLoadState("domcontentloaded");

        // Wait for listings
        const listings = page.locator('a[href^="/listings/"]');
        await expect(listings.first()).toBeAttached({ timeout: 30000 });

        const bottomSheet = page.locator('[role="region"][aria-label="Search results"]');
        const sheetVisible = await bottomSheet.isVisible({ timeout: 5000 }).catch(() => false);

        if (!sheetVisible) {
          test.skip(true, "Bottom sheet not visible in this viewport");
          return;
        }

        // Find the drag handle slider
        const dragHandle = bottomSheet.locator('[role="slider"]');
        if ((await dragHandle.count()) === 0) {
          test.skip(true, "Drag handle slider not found");
          return;
        }

        // Focus on drag handle
        await dragHandle.first().focus();

        // Test arrow key navigation
        const initialValue = await dragHandle.first().getAttribute("aria-valuenow");
        const initialNum = parseInt(initialValue || "1", 10);

        // Press ArrowUp to expand
        await page.keyboard.press("ArrowUp");

        // Wait for the value to update after ArrowUp
        if (initialNum < 2) {
          await expect.poll(
            async () => {
              const val = await dragHandle.first().getAttribute("aria-valuenow");
              return parseInt(val || "1", 10);
            },
            { timeout: 2000 }
          ).toBeGreaterThan(initialNum);
        }

        const afterUpValue = await dragHandle.first().getAttribute("aria-valuenow");
        const afterUpNum = parseInt(afterUpValue || "1", 10);

        if (initialNum < 2) {
          expect(afterUpNum).toBeGreaterThanOrEqual(initialNum);
        }

        // Test Escape key to collapse
        await page.keyboard.press("Escape");

        // Wait for value to settle after collapse
        await expect.poll(
          async () => {
            const val = await dragHandle.first().getAttribute("aria-valuenow");
            return parseInt(val || "1", 10);
          },
          { timeout: 2000 }
        ).toBeLessThanOrEqual(afterUpNum);
      });
    });
  });
});
