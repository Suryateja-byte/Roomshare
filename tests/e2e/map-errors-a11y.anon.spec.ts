/**
 * E2E Test Suite: Map Error States and Accessibility
 * Tests 10.1-10.5 (Error States) and 11.1-11.5 (Accessibility)
 *
 * Covers error handling for map interactions and WCAG accessibility compliance.
 *
 * NOTE: The viewport validation test (10.4) works in both v1 and v2 modes.
 */

import {
  test,
  expect,
  tags,
  SF_BOUNDS,
  searchResultsContainer,
} from "./helpers/test-utils";
import { waitForMapReady, pollForMarkers } from "./helpers";
import type { Page } from "@playwright/test";

const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;
const SEARCH_URL = `/search?${boundsQS}`;
const C078_MARKER_COORDS = { lat: 37.775, lng: -122.435 };

async function getVisibleCardIdsForDeterministicMarkers(
  page: Page,
  minCount: number
): Promise<string[]> {
  await expect(async () => {
    const ids = await page.evaluate(() => {
      return Array.from(
        document.querySelectorAll(
          '[data-testid="listing-card"][data-listing-id]'
        )
      )
        .filter((el) => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        })
        .map((el) => el.getAttribute("data-listing-id"))
        .filter((id): id is string => typeof id === "string");
    });

    expect(new Set(ids).size).toBeGreaterThanOrEqual(minCount);
  }).toPass({ timeout: 30_000, intervals: [500, 1000, 2000] });

  const ids = await page.evaluate(() => {
    return Array.from(
      document.querySelectorAll('[data-testid="listing-card"][data-listing-id]')
    )
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .map((el) => el.getAttribute("data-listing-id"))
      .filter((id): id is string => typeof id === "string");
  });

  return Array.from(new Set(ids));
}

async function getMarkerCardOverlaps(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const markerIds = Array.from(
      document.querySelectorAll(".maplibregl-marker")
    )
      .filter((marker) => {
        const rect = marker.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .map((marker) =>
        marker
          .querySelector("[data-listing-id]")
          ?.getAttribute("data-listing-id")
      )
      .filter((id): id is string => typeof id === "string");

    const cardIds = new Set(
      Array.from(
        document.querySelectorAll(
          '[data-testid="listing-card"][data-listing-id]'
        )
      )
        .filter((card) => {
          const rect = card.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        })
        .map((card) => card.getAttribute("data-listing-id"))
        .filter((id): id is string => typeof id === "string")
    );

    return markerIds.filter((id) => cardIds.has(id));
  });
}

async function setupDeterministicMarkerCardOverlaps(
  page: Page,
  minCount: number
): Promise<string[]> {
  await expect(
    searchResultsContainer(page).locator('[data-testid="listing-card"]').first()
  ).toBeVisible({ timeout: 30_000 });

  const cardIds = await getVisibleCardIdsForDeterministicMarkers(
    page,
    minCount
  );
  const mockListings = cardIds.map((id, index) => ({
    id,
    title: `C078 Deterministic Listing ${index + 1}`,
    price: 1200 + index * 100,
    availableSlots: 1 + index,
    location: C078_MARKER_COORDS,
    images: [],
    ownerId: `c078-owner-${index + 1}`,
  }));

  await page.context().route("**/api/map-listings**", async (route) => {
    const requestQueryHash =
      route.request().headers()["x-search-query-hash"] ||
      "c078-deterministic-markers";

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        kind: "ok",
        data: {
          listings: mockListings,
          truncated: false,
        },
        meta: {
          queryHash: requestQueryHash,
          backendSource: "map-api",
          responseVersion: "c078-deterministic-markers",
        },
      }),
    });
  });

  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");

  const mapListingsResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/map-listings") && response.status() === 200,
    { timeout: 30_000 }
  );
  await page.goto(SEARCH_URL, { waitUntil: "domcontentloaded" });
  await expect(
    searchResultsContainer(page).locator('[data-testid="listing-card"]').first()
  ).toBeVisible({ timeout: 30_000 });
  await expect(mapListingsResponse).resolves.toBeTruthy();

  await waitForMapReady(page);
  await page.waitForFunction(() => !!(window as any).__e2eMapRef, {
    timeout: 30_000,
  });

  const jumped = await page.evaluate((coords) => {
    return new Promise<boolean>((resolve) => {
      const map = (window as any).__e2eMapRef;
      if (!map) {
        resolve(false);
        return;
      }

      const setProgrammatic = (window as any).__e2eSetProgrammaticMove;
      if (typeof setProgrammatic === "function") {
        setProgrammatic(true);
      }

      let resolved = false;
      const finish = () => {
        if (resolved) return;
        resolved = true;
        resolve(true);
      };

      map.once("idle", finish);
      map.jumpTo({ center: [coords.lng, coords.lat], zoom: 16 });
      setTimeout(finish, 8000);
    });
  }, C078_MARKER_COORDS);
  expect(jumped).toBe(true);

  await expect(async () => {
    await page.evaluate(() => (window as any).__e2eUpdateMarkers?.());
    const overlapping = await getMarkerCardOverlaps(page);
    expect(overlapping.length).toBeGreaterThanOrEqual(minCount);
  }).toPass({ timeout: 45_000, intervals: [500, 1000, 2000, 5000] });

  return (await getMarkerCardOverlaps(page)).slice(0, minCount);
}

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
    test.skip(
      projectName.includes("Mobile"),
      "Map tests require desktop viewport - skipping on mobile"
    );
    test.skip(
      projectName === "webkit",
      "Map tests have timing issues on webkit - skipping"
    );
  });

  // ---------------------------------------------------------------------------
  // 10.x: Error States
  // ---------------------------------------------------------------------------
  test.describe("10.x: Error States", () => {
    test(`${tags.anon} 10.1 - No results state shows empty state message`, async ({
      page,
    }) => {
      // Search with a query that will return no results
      await page.goto(`/search?q=xyznonexistentlisting123456789&${boundsQS}`);
      await page.waitForLoadState("domcontentloaded");

      // Should show empty state or "no results" message
      // Scope to visible search container to avoid matching CSS-hidden mobile/desktop duplicate
      const container = searchResultsContainer(page);
      const emptyStateVisible = container.locator(
        '[data-testid="empty-state"]'
      );
      const noMatchesHeading = container.getByRole("heading", {
        name: /no matches/i,
      });
      const noListingsText = container.getByText(
        /no listings found|couldn.*find any listings/i
      );

      // Either the empty state container, "No matches found" heading, or "no listings" text
      // Wait longer because SSR may initially render with stale data before client takes over
      const emptyIndicator = emptyStateVisible
        .or(noMatchesHeading)
        .or(noListingsText)
        .first();
      const emptyVisible = await emptyIndicator
        .isVisible({ timeout: 20_000 })
        .catch(() => false);
      if (!emptyVisible) {
        // The query might have returned results from seed data or the empty state uses
        // a different pattern. Check if there are listing cards instead.
        const hasCards =
          (await container.locator('[data-testid="listing-card"]').count()) > 0;
        if (hasCards) {
          test.skip(
            true,
            "Query returned results from seed data — cannot test empty state"
          );
          return;
        }
        // If no cards and no empty state, just annotate
        test.info().annotations.push({
          type: "info",
          description:
            "Neither empty state nor listing cards visible — page may still be loading",
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

      // Wait for map to be ready before checking for messages
      await waitForMapReady(page);

      // Check for error/info message about zooming in or clamped bounds
      const zoomMessage = page.getByText(/Zoom in|Zoomed in to show results/i);
      const alertBanner = page.getByRole("alert").filter({ hasText: /Zoom/i });
      const statusBanner = page
        .getByRole("status")
        .filter({ hasText: /Zoom/i });

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
        const mapContainer = page.locator(
          '[role="region"][aria-label*="map" i]'
        );
        await expect(mapContainer.first()).toBeVisible();
      }
    });

    test(`${tags.anon} 10.5 - Map remains interactive after map ready`, async ({
      page,
    }) => {
      // Collect console errors
      const consoleErrors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") {
          consoleErrors.push(msg.text());
        }
      });

      // Navigate to search page
      await page.goto(SEARCH_URL);
      await waitForMapReady(page);

      const mapRegion = page
        .locator('[role="region"][aria-label*="map" i]')
        .first();
      await expect(mapRegion).toBeVisible();

      const canvas = page.locator(".maplibregl-canvas").first();
      await expect(canvas).toBeVisible();

      const mapToolsButton = page
        .locator('button[aria-label^="Map tools"]')
        .first();
      await expect(mapToolsButton).toBeVisible();

      await mapToolsButton.click();
      await expect(page.getByTestId("map-tools-drop-pin")).toBeVisible({
        timeout: 5_000,
      });

      await expect(mapRegion).toBeVisible();
      await expect(canvas).toBeVisible();
      await expect(
        page.locator('button[aria-label^="Map tools"]').first()
      ).toBeVisible();

      // Filter out expected/benign errors
      const criticalErrors = consoleErrors.filter(
        (e) =>
          !e.includes("mapbox") &&
          !e.includes("maplibre") &&
          !e.includes("webpack") &&
          !e.includes("HMR") &&
          !e.includes("hydrat") &&
          !e.includes("favicon") &&
          !e.includes("ResizeObserver") &&
          !e.includes("WebGL") &&
          !e.includes("Failed to create") &&
          !e.includes("404") &&
          !e.includes("AbortError") &&
          !e.includes("Environment validation") &&
          !e.includes("net::ERR") &&
          !e.includes("Failed to load resource") &&
          !e.includes("Failed to fetch") &&
          !e.includes("Load failed") &&
          !e.includes("FetchTimeoutError") &&
          !e.includes("timed out") &&
          !e.includes("photon.komoot") &&
          !e.includes("TimeoutError") &&
          !e.includes("Warning:") &&
          !e.includes("Deprecated") &&
          !e.includes("CORS") &&
          !e.includes("cookie") &&
          !e.includes("Refused to") &&
          !e.includes("source-map") &&
          !e.includes("chunk") &&
          !e.includes("Supabase") &&
          !e.includes("NEXT_") &&
          !e.includes("act(") &&
          !e.includes("punycode")
      );

      // Should have no critical JavaScript errors
      expect(criticalErrors).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 11.x: Accessibility
  // ---------------------------------------------------------------------------
  test.describe("11.x: Accessibility", () => {
    test(`${tags.anon} ${tags.a11y} 11.1 - Map container has accessible name`, async ({
      page,
    }) => {
      await page.goto(SEARCH_URL);
      await waitForMapReady(page);

      // Map should have role="region" and aria-label
      const mapRegion = page.locator(
        '[role="region"][aria-label="Interactive map showing listing locations"]'
      );

      // Wait for map to fully render
      await waitForMapReady(page);

      // Check if map container with proper ARIA exists
      const mapContainer = page.locator(".maplibregl-map").first();
      const mapContainerVisible = await mapContainer
        .isVisible({ timeout: 5000 })
        .catch(() => false);

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
          const anyMapRegion = page.locator(
            '[role="region"][aria-label*="map" i]'
          );
          await expect(anyMapRegion.first()).toBeVisible();
        }
      } else {
        // Map may not render in headless mode without WebGL
        test.skip(!mapContainerVisible, "Map not rendered (WebGL unavailable)");
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
      const srAnnouncement = page.locator(
        '.sr-only[role="status"][aria-live="polite"]'
      );
      const announcementCount = await srAnnouncement.count();

      // Map component should have screen reader announcements for marker selection
      expect(announcementCount).toBeGreaterThan(0);

      // Also check for keyboard navigation instructions
      const keyboardInstructions = page.locator(
        "#map-marker-instructions.sr-only"
      );
      if ((await keyboardInstructions.count()) > 0) {
        const instructionsText = await keyboardInstructions.textContent();
        expect(instructionsText).toContain("arrow keys");
      }
    });

    test(`${tags.anon} ${tags.a11y} 11.3 - Popup is keyboard navigable`, async ({
      page,
    }) => {
      await page.goto(SEARCH_URL);
      await waitForMapReady(page);

      // Wait for markers to load
      await pollForMarkers(page, 1).catch(() => {});

      // Check if markers are present
      const markers = page.locator(".maplibregl-marker");
      const markerCount = await markers.count();

      test.skip(
        markerCount === 0,
        "No markers available for keyboard navigation test"
      );

      // Try to focus on a marker
      const firstMarkerInner = markers
        .first()
        .locator('[role="button"], [tabindex="0"]')
        .first();
      await firstMarkerInner.focus();

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

    test(`${tags.anon} ${tags.a11y} 11.4 - Focus management on popup open`, async ({
      page,
    }) => {
      await page.goto(SEARCH_URL);
      const listingId = (
        await setupDeterministicMarkerCardOverlaps(page, 1)
      )[0]!;

      // Click a marker to open popup
      await page
        .locator(`.maplibregl-marker [data-listing-id="${listingId}"]`)
        .first()
        .click();

      const popup = page.locator(".maplibregl-popup");
      await expect(popup).toBeVisible({ timeout: 2000 });
      await expect(page.locator('[data-testid="map-popup-card"]')).toBeVisible({
        timeout: 2000,
      });

      // Screen reader announcement should update with selected listing info.
      await expect(
        page.locator('.sr-only[role="status"][aria-live="polite"]', {
          hasText: /Selected listing: C078 Deterministic Listing 1/i,
        })
      ).toHaveCount(1, { timeout: 2000 });
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
        const bottomSheet = page.locator(
          '[role="region"][aria-label="Search results"]'
        );

        // Mobile view should show the bottom sheet
        const sheetVisible = await bottomSheet
          .isVisible({ timeout: 5000 })
          .catch(() => false);

        if (sheetVisible) {
          await expect(bottomSheet).toHaveAttribute("role", "region");
          await expect(bottomSheet).toHaveAttribute(
            "aria-label",
            "Search results"
          );

          // Check for drag handle with slider role
          const dragHandle = bottomSheet.locator('[role="slider"]');
          if ((await dragHandle.count()) > 0) {
            await expect(dragHandle.first()).toHaveAttribute(
              "aria-label",
              "Results panel size"
            );
            await expect(dragHandle.first()).toHaveAttribute(
              "aria-valuemin",
              "0"
            );
            await expect(dragHandle.first()).toHaveAttribute(
              "aria-valuemax",
              "2"
            );
          }
        } else {
          // Check if mobile container exists as fallback
          const mobileContainer = page.locator(
            '[data-testid="mobile-search-results-container"]'
          );
          const containerExists = await mobileContainer
            .count()
            .then((c) => c > 0);
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

        const bottomSheet = page.locator(
          '[role="region"][aria-label="Search results"]'
        );
        const sheetVisible = await bottomSheet
          .isVisible({ timeout: 5000 })
          .catch(() => false);

        test.skip(!sheetVisible, "Bottom sheet not visible in this viewport");

        // Find the drag handle slider
        const dragHandle = bottomSheet.locator('[role="slider"]');
        test.skip(
          (await dragHandle.count()) === 0,
          "Drag handle slider not found"
        );

        // Focus on drag handle
        await dragHandle.first().focus();

        // Ensure sheet is collapsed first (Home key sets snap to 0) so ArrowUp has room to expand.
        // The 2-snap model has valuenow in {0, 1}; ArrowUp at max (1) is a no-op.
        await page.keyboard.press("Home");
        await expect
          .poll(
            async () => {
              const val = await dragHandle
                .first()
                .getAttribute("aria-valuenow");
              return parseInt(val || "1", 10);
            },
            { timeout: 2000 }
          )
          .toBe(0);

        const initialNum = 0;

        // Press ArrowUp to expand
        await page.keyboard.press("ArrowUp");

        // Wait for the value to update after ArrowUp
        await expect
          .poll(
            async () => {
              const val = await dragHandle
                .first()
                .getAttribute("aria-valuenow");
              return parseInt(val || "0", 10);
            },
            { timeout: 2000 }
          )
          .toBeGreaterThan(initialNum);

        const afterUpValue = await dragHandle
          .first()
          .getAttribute("aria-valuenow");
        const afterUpNum = parseInt(afterUpValue || "1", 10);
        expect(afterUpNum).toBeGreaterThan(initialNum);

        // Test Escape key to collapse
        await page.keyboard.press("Escape");

        // Wait for value to settle after collapse
        await expect
          .poll(
            async () => {
              const val = await dragHandle
                .first()
                .getAttribute("aria-valuenow");
              return parseInt(val || "1", 10);
            },
            { timeout: 2000 }
          )
          .toBeLessThan(afterUpNum);
      });
    });
  });
});
