import type { Page } from "@playwright/test";
import { mockMapTileRequests } from "../helpers/map-mock-helpers";

export const DEFAULT_GEOCODING_SUGGESTION = {
  id: "e2e-san-francisco",
  place_name: "San Francisco, California, United States",
  center: [-122.4194, 37.7749],
  place_type: ["place"],
  bbox: [-122.5164, 37.7066, -122.357, 37.8324],
} as const;

export const DEFAULT_IRVING_GEOCODING_SUGGESTION = {
  id: "e2e-irving-street",
  place_name: "Irving Street, San Francisco, California, United States",
  center: [-122.4662, 37.7635],
  place_type: ["address"],
  bbox: [-122.5164, 37.7066, -122.357, 37.8324],
} as const;

export const SEARCH_LOCATION_FIXTURES = {
  sanFrancisco: DEFAULT_GEOCODING_SUGGESTION,
  irvingStreet: DEFAULT_IRVING_GEOCODING_SUGGESTION,
} as const;

interface SearchGeocodingSuggestion {
  id: string;
  place_name: string;
  center: readonly [number, number];
  place_type: readonly string[];
  bbox?: readonly [number, number, number, number];
}

export async function installSearchMapAndGeocodingMocks(page: Page) {
  await mockMapTileRequests(page);
}

export async function mockLocalAutocomplete(
  page: Page,
  suggestions: readonly SearchGeocodingSuggestion[] = [
    DEFAULT_GEOCODING_SUGGESTION,
  ]
) {
  await page.route("**/api/geocoding/autocomplete**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ results: suggestions }),
    });
  });
}
