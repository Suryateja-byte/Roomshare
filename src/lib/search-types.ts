/**
 * Shared search types and utility functions.
 *
 * Extracted from data.ts to break the circular dependency:
 *   data.ts <-> search-doc-queries.ts
 *
 * Both data.ts and search-doc-queries.ts import from this module.
 * data.ts re-exports everything here for backward compatibility.
 */

import {
  MIN_QUERY_LENGTH,
  MAX_QUERY_LENGTH,
} from "@/lib/constants";

// ============================================
// Core Types
// ============================================

export interface ListingData {
  id: string;
  title: string;
  description: string;
  price: number;
  images: string[];
  availableSlots: number;
  totalSlots: number;
  amenities: string[];
  houseRules: string[];
  householdLanguages: string[];
  primaryHomeLanguage?: string;
  genderPreference?: string;
  householdGender?: string;
  leaseDuration?: string;
  roomType?: string;
  moveInDate?: Date;
  ownerId?: string;
  location: {
    address?: string; // Optional - only included in listing detail, not search
    city: string;
    state: string;
    zip?: string; // Optional - only included in listing detail, not search
    lat: number;
    lng: number;
  };
  // Near-match indicator for search results that partially match filters
  isNearMatch?: boolean;
}

export type SortOption =
  | "recommended"
  | "price_asc"
  | "price_desc"
  | "newest"
  | "rating";

export interface FilterParams {
  query?: string;
  minPrice?: number;
  maxPrice?: number;
  amenities?: string[];
  moveInDate?: string;
  leaseDuration?: string;
  houseRules?: string[];
  roomType?: string;
  languages?: string[];
  genderPreference?: string;
  householdGender?: string;
  bounds?: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  };
  page?: number;
  limit?: number;
  sort?: SortOption;
  // Flag to enable near-match expansion when exact matches are few
  nearMatches?: boolean;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Hybrid pagination result type - supports both offset and keyset pagination
// Extends PaginatedResult pattern with optional cursor-based navigation
export type PaginatedResultHybrid<T> = {
  items: T[];
  total: number | null; // null when count is expensive (>100 results)
  page: number;
  limit: number;
  totalPages: number | null;
  hasNextPage?: boolean;
  hasPrevPage?: boolean;
  nextCursor?: string | null;
  prevCursor?: string | null;
  // Near-match expansion count when exact matches are few
  nearMatchCount?: number;
  // Description of near-match expansion performed (e.g., "Showing rooms within $200 of your budget")
  nearMatchExpansion?: string;
};

// Map-optimized listing interface (minimal fields for markers)
export interface MapListingData {
  id: string;
  title: string;
  price: number;
  availableSlots: number;
  ownerId?: string;
  images: string[];
  location: {
    lat: number;
    lng: number;
  };
  /** Pin tier for V2 mode: primary = larger pin, mini = smaller pin */
  tier?: "primary" | "mini";
}

// Extended listing type with computed fields for filtering/sorting
export interface ListingWithMetadata extends ListingData {
  createdAt: Date;
  viewCount: number;
  avgRating: number;
  reviewCount: number;
}

// Types for filter analysis
export interface FilterSuggestion {
  filter: string;
  label: string;
  resultsWithout: number;
  suggestion: string;
}

// ============================================
// Utility Functions
// ============================================

// Helper function to sanitize search query and escape special characters
// Supports international characters (unicode) while escaping SQL-dangerous chars
export function sanitizeSearchQuery(query: string): string {
  if (!query) return "";

  // Trim and limit length first
  let sanitized = query.trim().slice(0, MAX_QUERY_LENGTH);

  // Unicode normalization (NFC) - ensures consistent representation
  // e.g., "cafe\u0301" composed vs decomposed forms are treated the same
  sanitized = sanitized.normalize("NFC");

  // Remove invisible/zero-width characters that could bypass validation
  // Includes: ZWSP, ZWJ, ZWNJ, RTL/LTR overrides, BOM, etc.
  sanitized = sanitized
    .replace(/[\u200B-\u200F\u2028-\u202F\uFEFF\u00AD]/g, "") // Zero-width and formatting chars
    .replace(/[\u2060-\u206F]/g, "") // Word joiners, invisible operators
    .replace(/[\uDB40-\uDBFF][\uDC00-\uDFFF]/g, ""); // Tag characters

  // Encode HTML entities to prevent XSS
  // This ensures that even if displayed, it won't execute as HTML
  sanitized = sanitized
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Escape SQL LIKE special characters
  sanitized = sanitized.replace(/%/g, "\\%").replace(/_/g, "\\_");

  // Remove only truly dangerous characters, keep unicode letters/numbers
  // Allow: letters (any language), numbers, spaces, common punctuation
  // Remove: SQL injection chars, control chars, etc.
  sanitized = sanitized
    .replace(/[\x00-\x1F\x7F]/g, "") // Control characters
    .replace(/[;'"\\`]/g, "") // SQL-dangerous quotes and semicolons
    .replace(/--/g, "") // SQL comment
    .replace(/\/\*/g, "") // SQL block comment start
    .replace(/\*\//g, ""); // SQL block comment end

  return sanitized.trim();
}

// Validate query meets minimum requirements
export function isValidQuery(query: string): boolean {
  const sanitized = sanitizeSearchQuery(query);
  return sanitized.length >= MIN_QUERY_LENGTH;
}

// Check if coordinates are valid (not NULL, not zero, within valid range)
// lat=0, lng=0 is in the Gulf of Guinea and not a valid address
export function hasValidCoordinates(
  lat: number | null | undefined,
  lng: number | null | undefined,
): boolean {
  if (lat === null || lat === undefined || lng === null || lng === undefined) {
    return false;
  }
  // Check for zero coordinates (invalid geocoding result)
  if (lat === 0 && lng === 0) {
    return false;
  }
  // Check valid ranges
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return false;
  }
  return true;
}

/**
 * Detects if bounds cross the antimeridian (international date line at +/-180 degrees).
 * When map view spans from Asia to Americas, minLng (west) > maxLng (east).
 * This is a valid scenario requiring split queries.
 */
export function crossesAntimeridian(minLng: number, maxLng: number): boolean {
  return minLng > maxLng;
}
