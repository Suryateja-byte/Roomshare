/**
 * Search Constants - Single Source of Truth
 *
 * All search-related constants live here to prevent drift between files.
 * Import from this module instead of defining locally.
 */

// ============================================
// Price & Pagination
// ============================================

/** Maximum allowed price value (prevents overflow/abuse) */
export const MAX_SAFE_PRICE = 1_000_000_000;

/** Maximum allowed page number */
export const MAX_SAFE_PAGE = 100;

/** Maximum items in array parameters (amenities, etc.) */
export const MAX_ARRAY_ITEMS = 20;

/** Default results per page */
export const DEFAULT_PAGE_SIZE = 12;

/** Maximum results per page */
export const MAX_PAGE_SIZE = 100;

// ============================================
// Query Length
// ============================================

/** Minimum search query length */
export const MIN_QUERY_LENGTH = 2;

/** Maximum search query length */
export const MAX_QUERY_LENGTH = 200;

// ============================================
// Geographic Bounds
// ============================================

/**
 * Default radius for point-to-bounds conversion (in km).
 * Used when user provides lat/lng instead of bounding box.
 */
export const LAT_OFFSET_KM = 10;

/**
 * LAT_OFFSET in degrees (1° latitude ≈ 111km).
 * 10km ≈ 0.09 degrees latitude.
 */
export const LAT_OFFSET_DEGREES = 0.09;

/**
 * Maximum viewport span for latitude (in degrees).
 * 5° ≈ 550km - allows regional views with clustering.
 */
export const MAX_LAT_SPAN = 5;

/**
 * Maximum viewport span for longitude (in degrees).
 * 5° ≈ 550km at equator, less at higher latitudes.
 */
export const MAX_LNG_SPAN = 5;

// ============================================
// Coordinate Limits (Web Mercator practical)
// ============================================

/** Minimum latitude (Web Mercator practical limit) */
export const LAT_MIN = -85;

/** Maximum latitude (Web Mercator practical limit) */
export const LAT_MAX = 85;

/** Minimum longitude */
export const LNG_MIN = -180;

/** Maximum longitude */
export const LNG_MAX = 180;

// ============================================
// Timing & Thresholds
// ============================================

/** Auto-clear timeout for programmatic map move flag (ms) */
export const PROGRAMMATIC_MOVE_TIMEOUT_MS = 2500;

/** Debounce delay for area count requests on map move (ms) */
export const AREA_COUNT_DEBOUNCE_MS = 600;

/** Client-side cache TTL for area count responses (ms) */
export const AREA_COUNT_CACHE_TTL_MS = 30000;

/** Threshold for "slow" search transition warning (ms) */
export const SLOW_TRANSITION_THRESHOLD_MS = 6000;

/** Result count threshold: >= this uses 'geojson' clustering, < uses 'pins' */
export const CLUSTER_THRESHOLD = 50;

/** Bounds quantization for cache key normalization (~100m precision) */
export const BOUNDS_EPSILON = 0.001;
