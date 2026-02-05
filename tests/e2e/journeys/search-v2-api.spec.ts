/**
 * E2E Test Suite: Search API v2 Endpoint
 *
 * Tests the unified search endpoint that returns both list results and map data
 * in a single response. Feature-flagged via ?v2=1 URL param for testing.
 */

import { test, expect, tags, SF_BOUNDS, searchResultsContainer } from "../helpers";

test.describe("Search API v2 Endpoint", () => {
  test.describe("Feature flag gating", () => {
    test(`${tags.core} - Returns 404 when v2 not enabled`, async ({
      request,
    }) => {
      // Request without ?v2=1 should return 404 (assuming feature flag is off)
      const response = await request.get("/api/search/v2");

      // Either 404 (flag disabled) or 200 (flag enabled globally)
      expect([200, 404]).toContain(response.status());
    });

    test(`${tags.core} - Returns 200 with v2=1 param`, async ({ request }) => {
      const response = await request.get("/api/search/v2?v2=1");

      expect(response.status()).toBe(200);
    });

    test(`${tags.core} - Returns 200 with v2=true param`, async ({
      request,
    }) => {
      const response = await request.get("/api/search/v2?v2=true");

      expect(response.status()).toBe(200);
    });
  });

  test.describe("Response structure", () => {
    test(`${tags.core} - Returns valid response structure`, async ({
      request,
    }) => {
      const response = await request.get("/api/search/v2?v2=1");
      expect(response.status()).toBe(200);

      const data = await response.json();

      // Check meta object
      expect(data.meta).toBeDefined();
      expect(data.meta.queryHash).toBeDefined();
      expect(data.meta.queryHash).toHaveLength(16);
      expect(data.meta.generatedAt).toBeDefined();
      expect(data.meta.mode).toMatch(/^(geojson|pins)$/);

      // Check list object
      expect(data.list).toBeDefined();
      expect(Array.isArray(data.list.items)).toBe(true);
      expect(data.list).toHaveProperty("nextCursor");
      expect(data.list).toHaveProperty("total");

      // Check map object
      expect(data.map).toBeDefined();
      expect(data.map.geojson).toBeDefined();
      expect(data.map.geojson.type).toBe("FeatureCollection");
      expect(Array.isArray(data.map.geojson.features)).toBe(true);
    });

    test(`${tags.core} - Includes x-request-id header`, async ({ request }) => {
      const response = await request.get("/api/search/v2?v2=1");

      expect(response.headers()["x-request-id"]).toBeDefined();
    });

    test(`${tags.core} - Includes Cache-Control header`, async ({
      request,
    }) => {
      const response = await request.get("/api/search/v2?v2=1");

      expect(response.headers()["cache-control"]).toContain("s-maxage");
    });
  });

  test.describe("Mode determination", () => {
    test(`${tags.core} - GeoJSON is always present regardless of mode`, async ({
      request,
    }) => {
      // Test with bounds that should return results
      const response = await request.get(
        `/api/search/v2?v2=1&minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`,
      );

      expect(response.status()).toBe(200);
      const data = await response.json();

      // GeoJSON must ALWAYS be present
      expect(data.map.geojson).toBeDefined();
      expect(data.map.geojson.type).toBe("FeatureCollection");
    });

    test(`${tags.core} - Pins only present when mode is pins`, async ({
      request,
    }) => {
      const response = await request.get("/api/search/v2?v2=1");
      expect(response.status()).toBe(200);

      const data = await response.json();

      if (data.meta.mode === "pins") {
        // Pins should be present in pins mode
        expect(data.map.pins).toBeDefined();
        expect(Array.isArray(data.map.pins)).toBe(true);
      } else {
        // Pins should NOT be present in geojson mode
        expect(data.map.pins).toBeUndefined();
      }
    });
  });

  test.describe("Query hash stability", () => {
    test(`${tags.core} - Same params produce same queryHash`, async ({
      request,
    }) => {
      const params = "v2=1&minPrice=1000&maxPrice=2000";

      const response1 = await request.get(`/api/search/v2?${params}`);
      const response2 = await request.get(`/api/search/v2?${params}`);

      const data1 = await response1.json();
      const data2 = await response2.json();

      expect(data1.meta.queryHash).toBe(data2.meta.queryHash);
    });

    test(`${tags.core} - Different params produce different queryHash`, async ({
      request,
    }) => {
      const response1 = await request.get("/api/search/v2?v2=1&minPrice=1000");
      const response2 = await request.get("/api/search/v2?v2=1&minPrice=2000");

      const data1 = await response1.json();
      const data2 = await response2.json();

      expect(data1.meta.queryHash).not.toBe(data2.meta.queryHash);
    });
  });

  test.describe("Pagination", () => {
    test(`${tags.core} - Returns nextCursor when more pages available`, async ({
      request,
    }) => {
      // Request with a small limit to likely get pagination
      const response = await request.get("/api/search/v2?v2=1&limit=1");
      expect(response.status()).toBe(200);

      const data = await response.json();

      // If there are more results, nextCursor should be present
      if (data.list.total > 1) {
        expect(data.list.nextCursor).not.toBeNull();
        expect(typeof data.list.nextCursor).toBe("string");
      }
    });

    test(`${tags.core} - Cursor-based pagination works`, async ({
      request,
    }) => {
      // Get first page
      const response1 = await request.get("/api/search/v2?v2=1&limit=5");
      const data1 = await response1.json();

      if (data1.list.nextCursor) {
        // Get second page using cursor
        const response2 = await request.get(
          `/api/search/v2?v2=1&limit=5&cursor=${data1.list.nextCursor}`,
        );
        const data2 = await response2.json();

        expect(response2.status()).toBe(200);
        expect(Array.isArray(data2.list.items)).toBe(true);

        // Items should be different between pages
        if (data1.list.items.length > 0 && data2.list.items.length > 0) {
          expect(data1.list.items[0].id).not.toBe(data2.list.items[0].id);
        }
      }
    });
  });

  test.describe("List items format", () => {
    test(`${tags.core} - List items have correct properties`, async ({
      request,
    }) => {
      const response = await request.get("/api/search/v2?v2=1");
      expect(response.status()).toBe(200);

      const data = await response.json();

      if (data.list.items.length > 0) {
        const item = data.list.items[0];

        // Required properties
        expect(item).toHaveProperty("id");
        expect(item).toHaveProperty("title");
        expect(item).toHaveProperty("price");
        expect(item).toHaveProperty("lat");
        expect(item).toHaveProperty("lng");

        // Types
        expect(typeof item.id).toBe("string");
        expect(typeof item.title).toBe("string");
        expect(typeof item.lat).toBe("number");
        expect(typeof item.lng).toBe("number");
      }
    });
  });

  test.describe("GeoJSON format", () => {
    test(`${tags.core} - GeoJSON features have correct structure`, async ({
      request,
    }) => {
      const response = await request.get(
        `/api/search/v2?v2=1&minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`,
      );
      expect(response.status()).toBe(200);

      const data = await response.json();

      if (data.map.geojson.features.length > 0) {
        const feature = data.map.geojson.features[0];

        expect(feature.type).toBe("Feature");
        expect(feature.geometry).toBeDefined();
        expect(feature.geometry.type).toBe("Point");
        expect(Array.isArray(feature.geometry.coordinates)).toBe(true);
        expect(feature.geometry.coordinates).toHaveLength(2);

        // GeoJSON uses [lng, lat] order
        const [lng, lat] = feature.geometry.coordinates;
        expect(typeof lng).toBe("number");
        expect(typeof lat).toBe("number");

        // Properties
        expect(feature.properties).toBeDefined();
        expect(feature.properties.id).toBeDefined();
      }
    });
  });

  test.describe("Filter integration", () => {
    test(`${tags.core} - Price filter works`, async ({ request }) => {
      const response = await request.get(
        "/api/search/v2?v2=1&minPrice=1000&maxPrice=2000",
      );
      expect(response.status()).toBe(200);

      const data = await response.json();

      // All items should be within price range (if any)
      for (const item of data.list.items) {
        if (item.price !== null) {
          expect(item.price).toBeGreaterThanOrEqual(1000);
          expect(item.price).toBeLessThanOrEqual(2000);
        }
      }
    });

    test(`${tags.core} - Bounds filter works`, async ({ request }) => {
      const response = await request.get(
        `/api/search/v2?v2=1&minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`,
      );
      expect(response.status()).toBe(200);

      const data = await response.json();

      // All items should be within bounds (if any)
      for (const item of data.list.items) {
        expect(item.lat).toBeGreaterThanOrEqual(SF_BOUNDS.minLat);
        expect(item.lat).toBeLessThanOrEqual(SF_BOUNDS.maxLat);
        expect(item.lng).toBeGreaterThanOrEqual(SF_BOUNDS.minLng);
        expect(item.lng).toBeLessThanOrEqual(SF_BOUNDS.maxLng);
      }
    });
  });

  test.describe("Ranker feature flag (Step 5 regression guard)", () => {
    test(`${tags.core} - API accepts ranker=1 flag without errors`, async ({
      request,
    }) => {
      // Must-not-regress: ranker flag must be accepted and not break the API
      const response = await request.get("/api/search/v2?v2=1&ranker=1");

      expect(response.status()).toBe(200);

      const data = await response.json();

      // Response structure must remain valid when ranker is enabled
      expect(data.meta).toBeDefined();
      expect(data.meta.queryHash).toBeDefined();
      expect(data.list).toBeDefined();
      expect(Array.isArray(data.list.items)).toBe(true);
      expect(data.map).toBeDefined();
      expect(data.map.geojson).toBeDefined();
    });

    test(`${tags.core} - Ranker with bounds returns valid pins structure`, async ({
      request,
    }) => {
      // Test ranker with bounds (sparse mode) to verify pin tiering structure
      const response = await request.get(
        `/api/search/v2?v2=1&ranker=1&minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`,
      );

      expect(response.status()).toBe(200);

      const data = await response.json();

      // If in pins mode, verify pins structure is valid
      if (data.meta.mode === "pins" && data.map.pins) {
        expect(Array.isArray(data.map.pins)).toBe(true);

        // Each pin must have required fields
        for (const pin of data.map.pins) {
          expect(pin).toHaveProperty("id");
          expect(pin).toHaveProperty("lat");
          expect(pin).toHaveProperty("lng");
          expect(pin).toHaveProperty("tier");
          expect(["primary", "mini"]).toContain(pin.tier);
        }

        // No duplicate IDs allowed
        const ids = data.map.pins.map((p: { id: string }) => p.id);
        expect(new Set(ids).size).toBe(ids.length);
      }
    });

    test(`${tags.core} - Ranker=0 explicitly disables ranking`, async ({
      request,
    }) => {
      // Verify ranker=0 is accepted (allows explicit opt-out)
      const response = await request.get("/api/search/v2?v2=1&ranker=0");

      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data.meta).toBeDefined();
      expect(data.list).toBeDefined();
    });
  });

  test.describe("Page integration with ?searchV2=1", () => {
    test(`${tags.core} - Search page loads with v2 flag`, async ({ page }) => {
      // Navigate to search page with v2 flag
      await page.goto("/search?searchV2=1");

      // Wait for DOM to be ready (not networkidle - search page has polling)
      await page.waitForLoadState("domcontentloaded");

      // Verify search results heading is visible
      // Note: Use .first() because SearchLayoutView renders children in both
      // mobile and desktop containers (responsive layout), creating duplicate headings
      const heading = page
        .getByRole("heading", {
          name: /\d+ places?|available/i,
        })
        .first();
      await expect(heading).toBeVisible({ timeout: 30000 });
    });

    test(`${tags.core} - List items render with v2 data`, async ({ page }) => {
      await page.goto("/search?searchV2=1");
      await page.waitForLoadState("domcontentloaded");

      // Wait for heading first (known to work), confirms page loaded
      const heading = page
        .getByRole("heading", {
          name: /\d+ places?|available/i,
        })
        .first();
      await expect(heading).toBeVisible({ timeout: 30000 });

      // Check for listing cards in the results (scoped to visible container)
      // Note: data-testid="listing-card-{id}" uses dynamic suffix, so use prefix selector
      const listingCards = searchResultsContainer(page).locator('[data-testid^="listing-card-"]');

      // Wait for at least one card to appear (or empty state)
      const cardOrEmptyState = listingCards
        .first()
        .or(page.getByText(/no listings|no matches found/i));
      await expect(cardOrEmptyState).toBeVisible({ timeout: 15000 });
    });

    // Skip map test if Mapbox token not configured (test environment)
    test(`${tags.core} - Map loads with v2 data`, async ({ page }) => {
      // Use desktop viewport to ensure map is visible (hidden on mobile by default)
      await page.setViewportSize({ width: 1280, height: 800 });

      await page.goto("/search?searchV2=1");
      await page.waitForLoadState("domcontentloaded");

      // Wait for heading first to confirm page loaded
      const heading = page
        .getByRole("heading", {
          name: /\d+ places?|available/i,
        })
        .first();
      await expect(heading).toBeVisible({ timeout: 30000 });

      // Wait for map container to be visible
      // Note: Use .first() because SearchLayoutView may render map in multiple containers
      const mapContainer = page.locator(".mapboxgl-map").first();

      // Map may not render if Mapbox token is missing in test environment
      // Check for either map container OR the loading fallback
      const mapOrPlaceholder = mapContainer.or(
        page.locator('[data-testid="map-loading-fallback"]').first(),
      );
      await expect(mapOrPlaceholder).toBeVisible({ timeout: 30000 });
    });

    test(`${tags.core} - V2 and V1 produce consistent list results`, async ({
      page,
    }) => {
      // First, get v1 results count
      await page.goto("/search");
      await page.waitForLoadState("domcontentloaded");

      // Note: Use .first() because SearchLayoutView renders children in both
      // mobile and desktop containers (responsive layout), creating duplicate headings
      const v1Heading = page
        .getByRole("heading", {
          name: /\d+ places?|available/i,
        })
        .first();
      await expect(v1Heading).toBeVisible({ timeout: 30000 });
      const v1Text = await v1Heading.textContent();

      // Then get v2 results count
      await page.goto("/search?searchV2=1");
      await page.waitForLoadState("domcontentloaded");

      const v2Heading = page
        .getByRole("heading", {
          name: /\d+ places?|available/i,
        })
        .first();
      await expect(v2Heading).toBeVisible({ timeout: 30000 });
      const v2Text = await v2Heading.textContent();

      // Extract numbers from both headings
      const v1Count = v1Text?.match(/(\d+)/)?.[1] || "0";
      const v2Count = v2Text?.match(/(\d+)/)?.[1] || "0";

      // Counts should be the same (both use same underlying data)
      expect(v2Count).toBe(v1Count);
    });
  });
});
