import { Page } from '@playwright/test';

/**
 * Minimal valid MapLibre style JSON — prevents all tile source fetching.
 * version 8 is required by MapLibre GL. Empty sources/layers means the map
 * initializes and fires onLoad without requesting any tiles.
 */
const MINIMAL_STYLE_JSON = JSON.stringify({
  version: 8,
  sources: {},
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#f0f0f0' },
    },
  ],
});

/** 1×1 transparent PNG (68 bytes) */
const TRANSPARENT_1X1_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAAlwSFlzAAAWJQAAFiUBSVIk8AAAAA0lEQVQI12P4z8BQDwAEgAF/QualIQAAAABJRU5ErkJggg==',
  'base64',
);

/** Empty sprite JSON */
const EMPTY_SPRITE_JSON = JSON.stringify({});

/** Mock geocoding response — single SF feature, enough for BoundaryLayer */
const MOCK_GEOCODING_RESPONSE = JSON.stringify({
  type: 'FeatureCollection',
  features: [
    {
      id: 'place.sf',
      type: 'Feature',
      place_type: ['place'],
      text: 'San Francisco',
      place_name: 'San Francisco, California, United States',
      center: [-122.4194, 37.7749],
      geometry: { type: 'Point', coordinates: [-122.4194, 37.7749] },
      bbox: [-122.5164, 37.7066, -122.3570, 37.8324],
      properties: {},
      context: [
        { id: 'region.ca', text: 'California' },
        { id: 'country.us', text: 'United States' },
      ],
    },
  ],
  attribution: 'mock',
});

/**
 * Intercept all external map tile/style/geocoding requests and return
 * minimal valid responses. This prevents network flakiness in CI and
 * avoids hitting live tile servers or billed geocoding APIs.
 *
 * Safe to call on every test — routes only match external map domains
 * and the local dark-mode style path. App API routes (`/api/*`) are
 * never intercepted.
 */
export async function mockMapTileRequests(page: Page): Promise<void> {
  // --- OpenFreeMap style JSON (light mode) ---
  await page.route('**/tiles.openfreemap.org/styles/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: MINIMAL_STYLE_JSON,
    });
  });

  // --- Local dark-mode style JSON ---
  await page.route('**/map-styles/liberty-dark.json', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: MINIMAL_STYLE_JSON,
    });
  });

  // --- OpenFreeMap sprites (JSON + PNG) ---
  await page.route('**/tiles.openfreemap.org/sprites/**', async (route) => {
    const url = route.request().url();
    if (url.endsWith('.json')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: EMPTY_SPRITE_JSON,
      });
    } else if (url.endsWith('.png')) {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: TRANSPARENT_1X1_PNG,
      });
    } else {
      await route.fulfill({ status: 204, body: '' });
    }
  });

  // --- Vector tiles + glyphs (.pbf) ---
  await page.route('**/tiles.openfreemap.org/**/*.pbf', async (route) => {
    await route.fulfill({ status: 204, body: '' });
  });

  // --- Raster tiles (.png) ---
  await page.route('**/tiles.openfreemap.org/**/*.png', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: TRANSPARENT_1X1_PNG,
    });
  });

  // --- OpenFreeMap planet metadata (vector source URL) ---
  await page.route('**/tiles.openfreemap.org/planet', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        tilejson: '3.0.0',
        tiles: [],
        minzoom: 0,
        maxzoom: 14,
      }),
    });
  });

  // --- Mapbox geocoding API ---
  await page.route('**/api.mapbox.com/geocoding/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: MOCK_GEOCODING_RESPONSE,
    });
  });

  // --- Mapbox font glyphs (if any remain) ---
  await page.route('**/api.mapbox.com/fonts/**', async (route) => {
    await route.fulfill({ status: 204, body: '' });
  });
}
