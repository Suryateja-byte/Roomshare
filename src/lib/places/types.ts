/**
 * Type definitions for Neighborhood Intelligence POI data.
 * These types represent extracted place data from Google Places UI Kit.
 */

/**
 * Point of Interest data extracted from Places UI Kit.
 * ToS compliant: Places UI Kit Service Specific Terms section 11.1
 * allows displaying on non-Google maps.
 */
export interface POI {
  /** Google Place ID */
  placeId: string;
  /** Display name of the place */
  name: string;
  /** Latitude coordinate */
  lat: number;
  /** Longitude coordinate */
  lng: number;
  /** Distance from listing in miles (computed client-side) */
  distanceMiles?: number;
  /** Estimated walking time in minutes */
  walkMins?: number;
  /** Google rating (1-5) */
  rating?: number;
  /** Number of user ratings */
  userRatingsTotal?: number;
  /** Whether currently open */
  openNow?: boolean;
  /** Formatted address */
  address?: string;
  /** Primary place type */
  primaryType?: string;
  /** Google Maps URL for the place */
  googleMapsURI?: string;
  /** Photo reference for display */
  photoReference?: string;
}

/**
 * Metadata about a neighborhood search.
 */
export interface SearchMeta {
  /** Original search radius in meters */
  radiusMeters: number;
  /** Actual radius used (may have expanded) */
  radiusUsed: number;
  /** Number of results found */
  resultCount: number;
  /** Distance to closest result in miles */
  closestMiles: number;
  /** Distance to farthest result in miles */
  farthestMiles: number;
  /** Search mode: 'type' for nearby search, 'text' for text search */
  searchMode: 'type' | 'text';
  /** Original query text from user */
  queryText?: string;
  /** Timestamp of the search */
  timestamp?: number;
}

/**
 * Combined POI results with metadata.
 */
export interface NeighborhoodSearchResult {
  /** Array of POIs sorted by distance */
  pois: POI[];
  /** Search metadata */
  meta: SearchMeta;
}

/**
 * Cache key for neighborhood searches.
 */
export interface NeighborhoodCacheKey {
  /** Listing ID */
  listingId: string;
  /** Normalized query string */
  normalizedQuery: string;
  /** Search radius in meters */
  radiusMeters: number;
  /** Search mode */
  searchMode: 'type' | 'text';
}

/**
 * Cached neighborhood search result.
 */
export interface CachedNeighborhoodResult {
  /** POI data */
  pois: POI[];
  /** Search metadata */
  meta: SearchMeta;
  /** When this was cached */
  cachedAt: Date;
  /** When this expires (max 30 days per ToS) */
  expiresAt: Date;
}

/**
 * State for the selected POI in the UI.
 */
export interface SelectedPOIState {
  /** Currently selected POI */
  poi: POI | null;
  /** Source of selection: 'list' or 'map' */
  source: 'list' | 'map' | null;
}

/**
 * State for POI hover interactions.
 */
export interface HoveredPOIState {
  /** Currently hovered POI ID */
  placeId: string | null;
  /** Source of hover: 'list' or 'map' */
  source: 'list' | 'map' | null;
}

/**
 * Props for components that display POI data.
 */
export interface POIDisplayProps {
  /** Array of POIs to display */
  pois: POI[];
  /** Search metadata */
  meta: SearchMeta;
  /** Listing coordinates for distance reference */
  listingLatLng: { lat: number; lng: number };
  /** Whether user is a Pro subscriber */
  isProUser: boolean;
  /** Currently selected POI */
  selectedPOI?: POI | null;
  /** Currently hovered POI ID */
  hoveredPOIId?: string | null;
  /** Callback when POI is selected */
  onPOISelect?: (poi: POI) => void;
  /** Callback when POI is hovered */
  onPOIHover?: (placeId: string | null) => void;
}

/**
 * Subscription tiers for the application.
 */
export type SubscriptionTier = 'free' | 'pro';

/**
 * Check if a tier has Pro features.
 */
export function isProTier(tier: SubscriptionTier | string | undefined): boolean {
  return tier === 'pro';
}
