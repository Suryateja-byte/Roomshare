/**
 * Map Marker Cap Stability Tests
 *
 * Verifies that map markers are capped at MAX_MAP_MARKERS (200).
 * The cap is enforced server-side in search-doc-queries.ts and verified
 * client-side by counting rendered .maplibregl-marker elements.
 *
 * Run:
 *   pnpm playwright test tests/search-stability/map-marker-cap.anon.spec.ts --project=chromium-anon
 */

import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_MAP_MARKERS = 200;

const SF_BOUNDS = {
  minLat: 37.7,
  maxLat: 37.85,
  minLng: -122.52,
  maxLng: -122.35,
};

const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;
const SEARCH_URL = `/search?${boundsQS}`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Check if the map canvas is visible (WebGL initialized) */
async function isMapAvailable(
  page: import("@playwright/test").Page
): Promise<boolean> {
  try {
    await page.locator(".maplibregl-canvas:visible").first().waitFor({
      state: "visible",
      timeout: 5_000,
    });
    return true;
  } catch {
    return false;
  }
}

/** Wait for the E2E map ref to be exposed */
async function waitForMapRef(
  page: import("@playwright/test").Page,
  timeout = 30_000
): Promise<boolean> {
  try {
    await page.waitForFunction(() => !!(window as any).__e2eMapRef, {
      timeout,
    });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Map Marker Cap (MAX_MAP_MARKERS=200)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async () => {
    test.slow(); // Map tests need extra time for WebGL rendering
  });

  test("rendered marker count does not exceed MAX_MAP_MARKERS", async ({
    page,
  }) => {
    await page.goto(SEARCH_URL);
    await page.waitForLoadState("domcontentloaded");

    // Skip if map is not available (headless WebGL issue)
    if (!(await isMapAvailable(page))) {
      test.skip(true, "Map not available (WebGL unavailable in headless)");
      return;
    }

    // Wait for map to load and data to render
    const hasMapRef = await waitForMapRef(page);
    if (!hasMapRef) {
      test.skip(true, "Map E2E ref not available");
      return;
    }

    // Wait for markers to appear (or for the map to settle with no markers)
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

    // Count all map markers (visible and hidden -- the cap applies to total)
    const markerCount = await page.locator(".maplibregl-marker").count();

    // The marker count must not exceed the cap
    expect(markerCount).toBeLessThanOrEqual(MAX_MAP_MARKERS);
  });

  test("no console errors about DOM element limits during map rendering", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto(SEARCH_URL);
    await page.waitForLoadState("domcontentloaded");

    if (!(await isMapAvailable(page))) {
      test.skip(true, "Map not available (WebGL unavailable in headless)");
      return;
    }

    // Wait for map to fully render
    await waitForMapRef(page);
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

    // Check for DOM limit or performance-related console errors
    const domLimitErrors = consoleErrors.filter(
      (msg) =>
        msg.toLowerCase().includes("dom") ||
        msg.toLowerCase().includes("too many") ||
        msg.toLowerCase().includes("maximum") ||
        msg.toLowerCase().includes("exceeded")
    );

    expect(domLimitErrors).toHaveLength(0);
  });

  test("GeoJSON source feature count respects marker cap", async ({ page }) => {
    await page.goto(SEARCH_URL);
    await page.waitForLoadState("domcontentloaded");

    if (!(await isMapAvailable(page))) {
      test.skip(true, "Map not available (WebGL unavailable in headless)");
      return;
    }

    const hasMapRef = await waitForMapRef(page);
    if (!hasMapRef) {
      test.skip(true, "Map E2E ref not available");
      return;
    }

    // Wait for data to load
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

    // Query the GeoJSON source for total features
    const featureCount = await page.evaluate(() => {
      const map = (window as any).__e2eMapRef;
      if (!map) return -1;

      // Try to get the listings source data
      const source = map.getSource("listings");
      if (!source) return -1;

      // For GeoJSON sources, we can query rendered features
      try {
        const features = map.querySourceFeatures("listings");
        return features.length;
      } catch {
        return -1;
      }
    });

    // If we could read features, verify the cap
    if (featureCount >= 0) {
      // Note: querySourceFeatures may return duplicates across tiles,
      // so we check individual unique features via coordinate dedup
      const uniqueFeatureCount = await page.evaluate(() => {
        const map = (window as any).__e2eMapRef;
        if (!map) return 0;
        try {
          const features = map.querySourceFeatures("listings");
          const seen = new Set<string>();
          for (const f of features) {
            const coords = f.geometry?.coordinates;
            const id = f.properties?.id || f.id;
            const key = id ? String(id) : `${coords?.[0]},${coords?.[1]}`;
            seen.add(key);
          }
          return seen.size;
        } catch {
          return 0;
        }
      });

      if (uniqueFeatureCount > 0) {
        expect(uniqueFeatureCount).toBeLessThanOrEqual(MAX_MAP_MARKERS);
      }
    }
  });
});
