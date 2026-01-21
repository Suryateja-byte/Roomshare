/**
 * Bounds Validation Utility
 *
 * Validates and parses map bounding box parameters to prevent:
 * - NaN/Infinity attacks
 * - World-query full-table scans
 * - Out-of-range coordinates
 */

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

// Web Mercator practical limits
const LAT_MIN = -85;
const LAT_MAX = 85;
const LNG_MIN = -180;
const LNG_MAX = 180;

// Maximum viewport span (5° ~550km allows regional views with clustering)
// Increased from 2 to match Airbnb-style behavior: show markers at wider zoom
// Exported for reuse in search-v2-service bounds clamping
export const MAX_LAT_SPAN = 5;
export const MAX_LNG_SPAN = 5;

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

  // Viewport size check (handle antimeridian crossing)
  const crossesAntimeridian = parsed.minLng > parsed.maxLng;
  const lngSpan = crossesAntimeridian
    ? 180 - parsed.minLng + (parsed.maxLng + 180)
    : parsed.maxLng - parsed.minLng;
  const latSpan = parsed.maxLat - parsed.minLat;

  if (latSpan > MAX_LAT_SPAN || lngSpan > MAX_LNG_SPAN) {
    return { valid: false, error: "Viewport too large. Zoom in further." };
  }

  return { valid: true, bounds: parsed };
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

  // Calculate center
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
