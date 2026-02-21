/**
 * Shared Search Types
 *
 * Extracted from data.ts to break circular dependency between
 * data.ts <-> search-doc-queries.ts.
 *
 * Both modules import types from here instead of from each other.
 */

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
