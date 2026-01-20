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
const MAX_LAT_SPAN = 5;
const MAX_LNG_SPAN = 5;

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
