/**
 * Bounds Validation Utility
 *
 * Validates and parses map bounding box parameters to prevent:
 * - NaN/Infinity attacks
 * - World-query full-table scans
 * - Out-of-range coordinates
 */

import {
  LAT_MIN,
  LAT_MAX,
  LNG_MIN,
  LNG_MAX,
  MAX_LAT_SPAN,
  MAX_LNG_SPAN,
  LAT_OFFSET_DEGREES,
} from './constants';

// Re-export for backward compatibility
export { MAX_LAT_SPAN, MAX_LNG_SPAN };

export interface MapBounds {
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
}

export interface BoundsValidationResult {
  valid: boolean;
  bounds?: MapBounds;
  error?: string;
}

/**
 * Validates and parses bounding box parameters from URL query string.
 *
 * @returns BoundsValidationResult with either valid bounds or an error message
 */
export function validateAndParseBounds(
  minLng: string | null,
  maxLng: string | null,
  minLat: string | null,
  maxLat: string | null,
): BoundsValidationResult {
  // Require all four bounds - no full-table scans allowed
  if (!minLng || !maxLng || !minLat || !maxLat) {
    return {
      valid: false,
      error: "All bounds parameters required (minLng, maxLng, minLat, maxLat)",
    };
  }

  const parsed = {
    minLng: parseFloat(minLng),
    maxLng: parseFloat(maxLng),
    minLat: parseFloat(minLat),
    maxLat: parseFloat(maxLat),
  };

  // NaN/Infinity check
  if (Object.values(parsed).some((v) => !Number.isFinite(v))) {
    return { valid: false, error: "Invalid coordinate values" };
  }

  // Range checks
  if (parsed.minLat < LAT_MIN || parsed.maxLat > LAT_MAX) {
    return { valid: false, error: "Latitude out of range" };
  }
  if (parsed.minLng < LNG_MIN || parsed.maxLng > LNG_MAX) {
    return { valid: false, error: "Longitude out of range" };
  }

  // Latitude order check (minLat should be < maxLat)
  if (parsed.minLat >= parsed.maxLat) {
    return { valid: false, error: "Invalid latitude range" };
  }

  // P1-5: Clamp oversized bounds instead of rejecting
  // This provides consistent behavior and better UX
  const clampedBounds = clampBoundsToMaxSpan(parsed);

  return { valid: true, bounds: clampedBounds };
}

/**
 * Clamps bounds to max span (keeps center, reduces span).
 * Used for list queries where we silently reduce oversized viewports
 * instead of rejecting them (unlike map-listings which rejects).
 *
 * @param bounds - The bounds to clamp
 * @returns Clamped bounds centered on original viewport center
 */
export function clampBoundsToMaxSpan(bounds: MapBounds): MapBounds {
  const { minLat, maxLat, minLng, maxLng } = bounds;

  const latSpan = maxLat - minLat;
  const crossesAntimeridian = minLng > maxLng;
  const lngSpan = crossesAntimeridian
    ? (180 - minLng) + (maxLng + 180)
    : maxLng - minLng;

  // If within limits, return unchanged (preserves antimeridian crossing)
  if (latSpan <= MAX_LAT_SPAN && lngSpan <= MAX_LNG_SPAN) {
    return bounds;
  }

  // Calculate center for clamping
  const centerLat = (minLat + maxLat) / 2;
  let centerLng: number;
  if (crossesAntimeridian) {
    const adjustedMax = maxLng + 360;
    centerLng = (minLng + adjustedMax) / 2;
    if (centerLng > 180) centerLng -= 360;
  } else {
    centerLng = (minLng + maxLng) / 2;
  }

  // Clamp spans
  const clampedLatSpan = Math.min(latSpan, MAX_LAT_SPAN);
  const clampedLngSpan = Math.min(lngSpan, MAX_LNG_SPAN);

  const halfLat = clampedLatSpan / 2;
  const halfLng = clampedLngSpan / 2;

  return {
    minLat: Math.max(LAT_MIN, centerLat - halfLat),
    maxLat: Math.min(LAT_MAX, centerLat + halfLat),
    minLng: Math.max(LNG_MIN, centerLng - halfLng),
    maxLng: Math.min(LNG_MAX, centerLng + halfLng),
  };
}

/**
 * Derives bounding box from a single point with ~10km radius.
 * Used when only lat/lng is provided without explicit bounds (P1-4).
 *
 * Uses LAT_OFFSET_DEGREES (~0.09°, ~10km) for latitude offset.
 * Adjusts longitude offset based on latitude (cosine factor) to maintain
 * approximately equal distance in both directions.
 *
 * @param lat - Latitude of center point
 * @param lng - Longitude of center point
 * @returns MapBounds centered on the point with ~10km radius
 */
export function deriveBoundsFromPoint(lat: number, lng: number): MapBounds {
  // Adjust longitude offset based on latitude
  // At higher latitudes, need larger lng offset for same distance
  const cosLat = Math.cos((lat * Math.PI) / 180);

  // Prevent division by near-zero at poles
  const lngOffset = cosLat < 0.01 ? 180 : LAT_OFFSET_DEGREES / cosLat;

  return {
    minLat: Math.max(LAT_MIN, lat - LAT_OFFSET_DEGREES),
    maxLat: Math.min(LAT_MAX, lat + LAT_OFFSET_DEGREES),
    minLng: Math.max(LNG_MIN, lng - lngOffset),
    maxLng: Math.min(LNG_MAX, lng + lngOffset),
  };
}
