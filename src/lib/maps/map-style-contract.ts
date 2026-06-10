/**
 * Contract between the vendored basemap style and runtime map code.
 *
 * Pure constants (no React) so the build-time style generator
 * (scripts/generate-map-style.ts), Jest contract tests, and runtime
 * components (POILayer) all import the same source of truth.
 *
 * If OpenFreeMap Liberty ever renames or removes one of these layer ids,
 * the generator fails loudly at regeneration time instead of the POI
 * toggles silently breaking in production.
 */

/** OpenMapTiles (Liberty style) layer IDs toggled by the Transit category */
export const TRANSIT_LAYERS = [
  "poi_transit",
  "road_transit_rail",
  "road_transit_rail_hatching",
];

/** Layer IDs toggled by the Landmarks category */
export const LANDMARK_LAYERS = ["poi_r1", "poi_r7", "poi_r20"];

/** Layer IDs toggled by the Parks category */
export const PARK_LAYERS = [
  "park",
  "park_outline",
  "landcover_wood",
  "landcover_grass",
];

/**
 * Every layer id the app manipulates at runtime. The style generator
 * refuses to write an artifact missing any of these.
 */
export const REQUIRED_BASEMAP_LAYER_IDS = [
  ...TRANSIT_LAYERS,
  ...LANDMARK_LAYERS,
  ...PARK_LAYERS,
];

/**
 * The only remote hosts a vendored style artifact may reference
 * (tiles, glyphs, sprites). Anything else fails the artifact contract test.
 */
export const ALLOWED_REMOTE_HOSTS = ["tiles.openfreemap.org"];
