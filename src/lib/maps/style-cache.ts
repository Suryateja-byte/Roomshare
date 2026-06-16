import type { StyleSpecification } from "maplibre-gl";

/**
 * Module-scope caches that make the /search map's remount instant and flash-free.
 *
 * The map lives in the /search layout subtree. Navigating to a listing detail
 * (a sibling /listings/[id] route) unmounts that subtree, so returning to search
 * rebuilds the MapLibre instance from scratch. Without caching, every rebuild
 * re-fetches + swaps the basemap style (a visible flash) and renders at a
 * placeholder zoom before snapping to the real viewport (a visible bbox recalc).
 *
 * These caches persist for the lifetime of the page load (they reset on a hard
 * reload), which is exactly the desired scope. The module is SSR-safe: it never
 * touches `window`/DOM at import time.
 */

// --- Resolved basemap styles ---------------------------------------------------
// Only ever hold a REAL themed style (vendored or upstream Liberty), never the
// raster LIGHT_STYLE_FALLBACK or the dark URL-string fallback. This guarantees an
// offline/failed style load can never poison the cache: a later successful mount
// can still upgrade the map to the vector theme.

let cachedLightStyle: StyleSpecification | null = null;
let cachedDarkStyle: StyleSpecification | null = null;

export function getCachedLightStyle(): StyleSpecification | null {
  return cachedLightStyle;
}

export function setCachedLightStyle(style: StyleSpecification): void {
  cachedLightStyle = style;
}

export function getCachedDarkStyle(): StyleSpecification | null {
  return cachedDarkStyle;
}

export function setCachedDarkStyle(style: StyleSpecification): void {
  cachedDarkStyle = style;
}

// --- Last camera, keyed by URL-bounds signature --------------------------------
// Keying by the (quantized) viewport bounds means the camera is only restored when
// returning to the *same* viewport. A brand-new search to a different location has
// different bounds → a different signature → cache miss → the existing URL-bounds
// behavior runs, so a stale camera from another place is never reused.

export interface CameraSnapshot {
  longitude: number;
  latitude: number;
  zoom: number;
  bearing: number;
  pitch: number;
}

let cachedCamera: CameraSnapshot | null = null;
let cachedCameraKey: string | null = null;

export function getCachedCamera(key: string): CameraSnapshot | null {
  return cachedCameraKey === key ? cachedCamera : null;
}

export function setCachedCamera(key: string, camera: CameraSnapshot): void {
  cachedCameraKey = key;
  cachedCamera = camera;
}

/**
 * Test-only: clear every module-scope cache so each test starts cold and the
 * caches never leak style/camera state between cases.
 */
export function resetMapCachesForTests(): void {
  cachedLightStyle = null;
  cachedDarkStyle = null;
  cachedCamera = null;
  cachedCameraKey = null;
}

// Quantize to 3 decimals (~110m). This matches the search URL's BOUNDS_PRECISION
// (see src/lib/search/search-query.ts), so the signature built from the map's live
// bounds at write time and the signature built from the URL bounds at read time
// derive from the same rounded numbers and compare equal.
const quantize = (value: number): string =>
  (Math.round(value * 1000) / 1000).toFixed(3);

export function boundsSignature(
  minLat: number,
  maxLat: number,
  minLng: number,
  maxLng: number
): string {
  return [minLat, maxLat, minLng, maxLng].map(quantize).join(",");
}

/**
 * Build a bounds signature from URL search params, or `null` when any bound is
 * missing or non-finite (e.g. point-coordinate or query-only URLs).
 */
export function boundsSignatureFromParams(params: {
  get(name: string): string | null;
}): string | null {
  const raw = [
    params.get("minLat"),
    params.get("maxLat"),
    params.get("minLng"),
    params.get("maxLng"),
  ];
  if (raw.some((value) => value == null)) return null;
  const nums = raw.map((value) => parseFloat(value as string));
  if (nums.some((value) => !Number.isFinite(value))) return null;
  return boundsSignature(nums[0], nums[1], nums[2], nums[3]);
}
