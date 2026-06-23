import { crossesAntimeridian } from "@/lib/search-types";
import { clampBoundsToMaxSpan, type MapBounds } from "@/lib/validation";
import {
  LAT_MIN,
  LAT_MAX,
  LNG_MIN,
  LNG_MAX,
  MAP_FETCH_MAX_LAT_SPAN,
  MAP_FETCH_MAX_LNG_SPAN,
} from "@/lib/constants";

/** Fraction of the viewport span to expand by when pre-fetching nearby listings. */
export const FETCH_BOUNDS_PADDING = 0.2;

/** Normalize a longitude into [-180, 180). */
function wrapLng(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

/**
 * Pad viewport bounds by `padding` (a fraction of the span) to pre-fetch nearby
 * listings, then clamp to the map-fetch max spans.
 *
 * Antimeridian-aware: for a dateline-crossing viewport (`minLng > maxLng`) the
 * longitude span is computed the crossing-aware way and each edge is expanded
 * outward with wrap — mirroring `isValidViewport` / `validateAndParseBounds` /
 * `clampBoundsToMaxSpan`. A plain `maxLng - minLng` would be negative for a
 * crossing viewport and pad/clamp the wrong way (e.g. 170/-170 -> 238/-238).
 *
 * The clamp is delegated to `clampBoundsToMaxSpan`, which is a no-op when the
 * padded bounds are already within limits, so the common (non-crossing,
 * small-viewport) prefetch path is unchanged.
 */
export function padBounds(
  bounds: MapBounds,
  padding: number = FETCH_BOUNDS_PADDING
): MapBounds {
  const latSpan = bounds.maxLat - bounds.minLat;
  const crosses = crossesAntimeridian(bounds.minLng, bounds.maxLng);
  const lngSpan = crosses
    ? 180 - bounds.minLng + (bounds.maxLng + 180)
    : bounds.maxLng - bounds.minLng;

  const latPad = latSpan * padding;
  const lngPad = lngSpan * padding;

  const minLat = Math.max(LAT_MIN, bounds.minLat - latPad);
  const maxLat = Math.min(LAT_MAX, bounds.maxLat + latPad);

  const padded: MapBounds = crosses
    ? {
        minLat,
        maxLat,
        minLng: wrapLng(bounds.minLng - lngPad),
        maxLng: wrapLng(bounds.maxLng + lngPad),
      }
    : {
        minLat,
        maxLat,
        minLng: Math.max(LNG_MIN, bounds.minLng - lngPad),
        maxLng: Math.min(LNG_MAX, bounds.maxLng + lngPad),
      };

  return clampBoundsToMaxSpan(
    padded,
    MAP_FETCH_MAX_LAT_SPAN,
    MAP_FETCH_MAX_LNG_SPAN
  );
}
