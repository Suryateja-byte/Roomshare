import { Page } from "@playwright/test";

/**
 * Pin Tiering E2E Test Helpers
 *
 * Provides deterministic mocking for pin tiering tests.
 * Creates 10 listings at 10 unique coordinates to guarantee
 * both primary and mini pins when NEXT_PUBLIC_PRIMARY_PINS=5.
 */

/**
 * Generate unique coordinates within SF bounds for testing.
 * Uses small increments to keep all pins within visible viewport.
 * With 49 points and 0.002 lat increment, spread is only ~0.1 degrees.
 *
 * @param count - Number of unique coordinates to generate
 * @returns Array of lat/lng coordinates
 */
export function generateUniqueCoordinates(
  count: number = 10,
): Array<{ lat: number; lng: number }> {
  const coords: Array<{ lat: number; lng: number }> = [];
  // Center point in SF
  const baseLat = 37.77;
  const baseLng = -122.42;

  for (let i = 0; i < count; i++) {
    // Smaller increments: ~0.002 lat = ~220m, 0.001 lng = ~85m
    // Total spread for 49 points: lat ~0.1 degrees, lng ~0.05 degrees
    coords.push({
      lat: baseLat + i * 0.002,
      lng: baseLng + i * 0.001,
    });
  }

  return coords;
}

/**
 * Create mock listings at unique coordinates.
 * Ensures we have more groups than PRIMARY_PIN_LIMIT.
 *
 * @param ids - Array of listing IDs to use
 * @param coordinates - Array of coordinates for each listing
 * @returns Array of mock listing objects matching API response format
 */
/**
 * Default primary pin limit (must match marker-utils DEFAULT_PRIMARY_LIMIT).
 * First `PRIMARY_PIN_LIMIT` listings get tier "primary", rest get "mini".
 */
const PRIMARY_PIN_LIMIT = 40;

export function createMockListingsForTiering(
  ids: string[],
  coordinates: Array<{ lat: number; lng: number }>,
): Array<{
  id: string;
  title: string;
  price: number;
  availableSlots: number;
  location: { lat: number; lng: number };
  images: string[];
  ownerId: string;
  tier: "primary" | "mini";
}> {
  return ids.map((id, index) => ({
    id,
    title: `Tiering Test Listing ${index + 1}`,
    price: 800 + index * 100,
    availableSlots: 2,
    location: coordinates[index % coordinates.length],
    images: [],
    ownerId: `owner-${index}`,
    // Assign tier: first PRIMARY_PIN_LIMIT are primary, rest are mini
    tier: (index < PRIMARY_PIN_LIMIT ? "primary" : "mini") as
      | "primary"
      | "mini",
  }));
}

/**
 * Setup mock for pin tiering tests.
 * Creates 49 listings at 49 unique locations.
 * Must be < 50 to avoid Mapbox clustering (CLUSTER_THRESHOLD = 50).
 * With default PRIMARY_PIN_LIMIT=40, this guarantees 9 mini pins.
 *
 * Strategy (same as stacked-marker-helpers):
 * 1. Set up mock route with context.route (catches all requests)
 * 2. Navigate away to "/" to clear component state
 * 3. Navigate back to search with specific bounds to trigger fresh fetch with mock
 *
 * @param page - Playwright page instance
 * @returns Object with listing IDs, cleanup function, and triggerRefetch function
 */
export async function setupPinTieringMock(page: Page): Promise<{
  ids: string[];
  cleanup: () => Promise<void>;
  triggerRefetch: () => Promise<void>;
}> {
  // Generate 49 unique IDs to exceed PRIMARY_PIN_LIMIT of 40 but stay under CLUSTER_THRESHOLD of 50
  const ids = Array.from({ length: 49 }, (_, i) => `tiering-test-${i + 1}`);
  const coordinates = generateUniqueCoordinates(49);
  const mockListings = createMockListingsForTiering(ids, coordinates);

  // Use context-level route for more reliable interception (catches all requests including navigation)
  const context = page.context();
  let mockCallCount = 0;

  console.log(`[Pin Tiering Mock] Setting up route interception`);
  await context.route("**/api/map-listings**", async (route) => {
    mockCallCount++;
    console.log(`[Pin Tiering Mock] Intercepted request #${mockCallCount}`);
    console.log(
      `[Pin Tiering Mock] Returning ${mockListings.length} mock listings`,
    );
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ listings: mockListings }),
    });
  });

  // Build URL within our mock coordinates (tighter for 49 points)
  // Coordinates range: lat 37.77-37.866, lng -122.42 to -122.372
  // Viewport sized to show all pins comfortably
  const bounds = {
    minLat: 37.75,
    maxLat: 37.9,
    minLng: -122.45,
    maxLng: -122.35,
  };
  const searchUrl = `/search?minLat=${bounds.minLat}&maxLat=${bounds.maxLat}&minLng=${bounds.minLng}&maxLng=${bounds.maxLng}`;

  return {
    ids,
    cleanup: async () => {
      await context.unroute("**/api/map-listings**");
    },
    triggerRefetch: async () => {
      // Navigate AWAY first to clear component state (key insight from stacked-marker-helpers)
      await page.goto("/");
      await page.waitForLoadState("domcontentloaded");

      // Navigate to search with specific bounds - triggers fresh fetch with mock
      await page.goto(searchUrl, { waitUntil: "domcontentloaded" });

      // Wait for VISIBLE map canvas (page has both mobile and desktop maps)
      const mapCanvas = page.locator(".maplibregl-canvas:visible").first();
      await mapCanvas.waitFor({ state: "visible", timeout: 30000 });

      // Brief pause for React to complete marker rendering
      await page.waitForTimeout(500);
    },
  };
}
