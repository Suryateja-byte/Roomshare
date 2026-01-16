import { Page } from "@playwright/test";

/**
 * Coordinates for stacked markers (center of SF_BOUNDS)
 */
export const STACKED_COORDS = {
  lat: 37.775,
  lng: -122.435,
};

/**
 * Slightly modified SF bounds to force a new fetch
 * (PersistentMapWrapper skips fetch if params are identical)
 */
export const SF_BOUNDS_ALT = {
  minLat: 37.7,
  maxLat: 37.85,
  minLng: -122.52,
  maxLng: -122.35,
};

/**
 * MapMarkerListing interface matching API response
 */
interface MapMarkerListing {
  id: string;
  title: string;
  price: number;
  availableSlots: number;
  location: { lat: number; lng: number };
  images: string[];
  ownerId: string;
}

/**
 * Extract listing IDs from rendered cards on the page
 */
export async function extractListingIdsFromCards(
  page: Page,
  count: number = 2,
): Promise<string[]> {
  const cards = page.locator("[data-listing-id]");
  const cardCount = await cards.count();

  if (cardCount < count) {
    throw new Error(`Need at least ${count} listing cards, found ${cardCount}`);
  }

  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = await cards.nth(i).getAttribute("data-listing-id");
    if (id) ids.push(id);
  }

  return ids;
}

/**
 * Create mock MapMarkerListing objects at stacked coordinates
 */
export function createStackedMockListings(ids: string[]): MapMarkerListing[] {
  return ids.map((id, index) => ({
    id,
    title: `Stacked Listing ${index + 1}`,
    price: 1000 + index * 100,
    availableSlots: 2,
    location: {
      lat: STACKED_COORDS.lat,
      lng: STACKED_COORDS.lng,
    },
    images: [],
    ownerId: `owner-${index}`,
  }));
}

/**
 * Setup network interception for stacked marker testing.
 *
 * Strategy:
 * 1. Extract listing IDs from SSR-rendered cards
 * 2. Set up mock route with those IDs at stacked coordinates
 * 3. Navigate away then back to trigger fresh page load with mocked API
 *
 * @returns Object with cleanup function, listing IDs, and triggerRefetch
 */
export async function setupStackedMarkerMock(page: Page): Promise<{
  ids: string[];
  cleanup: () => Promise<void>;
  triggerRefetch: () => Promise<void>;
}> {
  // Extract IDs from currently rendered cards
  const ids = await extractListingIdsFromCards(page, 2);

  // Create mock response with stacked coordinates
  const mockListings = createStackedMockListings(ids);

  // Add request listener to debug all requests
  page.on("request", (request) => {
    if (request.url().includes("map-listings")) {
      console.log(`[REQUEST] ${request.method()} ${request.url()}`);
    }
  });

  page.on("response", (response) => {
    if (response.url().includes("map-listings")) {
      console.log(
        `[RESPONSE] ${response.status()} ${response.url()} (from: ${response.request().resourceType()})`,
      );
    }
  });

  // Intercept map-listings API at context level (catches all requests)
  console.log(`[setupStackedMarkerMock] Setting up route interception`);
  const context = page.context();
  await context.route("**/api/map-listings**", async (route) => {
    console.log(
      `[setupStackedMarkerMock] Intercepting: ${route.request().url()}`,
    );
    console.log(
      `[setupStackedMarkerMock] Returning ${mockListings.length} mock listings`,
    );
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ listings: mockListings }),
    });
  });

  // Build search URL with alt bounds that will trigger new fetch
  const searchUrl = `/search?minLat=${SF_BOUNDS_ALT.minLat}&maxLat=${SF_BOUNDS_ALT.maxLat}&minLng=${SF_BOUNDS_ALT.minLng}&maxLng=${SF_BOUNDS_ALT.maxLng}`;

  return {
    ids,
    cleanup: async () => {
      await context.unroute("**/api/map-listings**");
    },
    triggerRefetch: async () => {
      // Navigate away to clear component state
      await page.goto("/");
      await page.waitForLoadState("domcontentloaded");
      // Navigate to search with different bounds - triggers fresh fetch with mock
      await page.goto(searchUrl, { waitUntil: "networkidle" });
    },
  };
}

/**
 * Wait for stacked marker to appear on map.
 * Since triggerRefetch uses networkidle, the API call has already completed.
 * We just need to wait for markers to render.
 */
export async function waitForStackedMarker(
  page: Page,
  timeout: number = 10000,
): Promise<void> {
  // Wait for marker to be visible
  // The mock intercepts the API and returns stacked listings at the same coordinates
  await page.locator(".mapboxgl-marker:visible").first().waitFor({
    state: "visible",
    timeout,
  });

  // Brief pause for React to complete marker rendering
  await page.waitForTimeout(300);
}
