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

export interface BoundsValidationOptions {
  /** Maximum allowed latitude span in degrees before clamping/rejecting */
  maxLatSpan?: number;
  /** Maximum allowed longitude span in degrees before clamping/rejecting */
  maxLngSpan?: number;
  /** Clamp oversized bounds instead of rejecting */
  clampOversized?: boolean;
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
  options: BoundsValidationOptions = {},
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

  const maxLatSpan = options.maxLatSpan ?? MAX_LAT_SPAN;
  const maxLngSpan = options.maxLngSpan ?? MAX_LNG_SPAN;
  const clampOversized = options.clampOversized ?? true;

  const latSpan = parsed.maxLat - parsed.minLat;
  const crossesAntimeridian = parsed.minLng > parsed.maxLng;
  const lngSpan = crossesAntimeridian
    ? (180 - parsed.minLng) + (parsed.maxLng + 180)
    : parsed.maxLng - parsed.minLng;

  if (latSpan > maxLatSpan || lngSpan > maxLngSpan) {
    if (!clampOversized) {
      return { valid: false, error: "Viewport too large" };
    }
    return {
      valid: true,
      bounds: clampBoundsToMaxSpan(parsed, maxLatSpan, maxLngSpan),
    };
  }

  return { valid: true, bounds: parsed };
}

/**
 * Clamps bounds to max span (keeps center, reduces span).
 * Used across search flows to silently reduce oversized viewports.
 *
 * @param bounds - The bounds to clamp
 * @returns Clamped bounds centered on original viewport center
 */
export function clampBoundsToMaxSpan(
  bounds: MapBounds,
  maxLatSpan: number = MAX_LAT_SPAN,
  maxLngSpan: number = MAX_LNG_SPAN,
): MapBounds {
  const { minLat, maxLat, minLng, maxLng } = bounds;

  const latSpan = maxLat - minLat;
  const crossesAntimeridian = minLng > maxLng;
  const lngSpan = crossesAntimeridian
    ? (180 - minLng) + (maxLng + 180)
    : maxLng - minLng;

  // If within limits, return unchanged (preserves antimeridian crossing)
  if (latSpan <= maxLatSpan && lngSpan <= maxLngSpan) {
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
  const clampedLatSpan = Math.min(latSpan, maxLatSpan);
  const clampedLngSpan = Math.min(lngSpan, maxLngSpan);

  const halfLat = clampedLatSpan / 2;
  const halfLng = clampedLngSpan / 2;

  // Calculate clamped latitude bounds (same for all cases)
  const clampedMinLat = Math.max(LAT_MIN, centerLat - halfLat);
  const clampedMaxLat = Math.min(LAT_MAX, centerLat + halfLat);

  // Handle antimeridian crossing case separately to preserve the crossing property
  if (crossesAntimeridian) {
    // For antimeridian crossing, centerLng is near +/-180
    // Calculate raw bounds that may need wrapping
    let newMinLng = centerLng - halfLng;
    let newMaxLng = centerLng + halfLng;

    // Wrap minLng if it goes below -180 (should wrap to positive side)
    if (newMinLng < LNG_MIN) {
      newMinLng = newMinLng + 360;
    }
    // Wrap maxLng if it goes above 180 (should wrap to negative side)
    if (newMaxLng > LNG_MAX) {
      newMaxLng = newMaxLng - 360;
    }

    // Ensure we still have a valid crossing (minLng > maxLng)
    // If wrapping didn't produce a crossing, the span was small enough
    // to fit without crossing, so use normal clamping
    if (newMinLng > newMaxLng) {
      return {
        minLat: clampedMinLat,
        maxLat: clampedMaxLat,
        minLng: newMinLng,
        maxLng: newMaxLng,
      };
    }
    // Fall through to normal clamping if crossing collapsed
  }

  // Normal case (no antimeridian crossing) - standard clamping
  return {
    minLat: clampedMinLat,
    maxLat: clampedMaxLat,
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
