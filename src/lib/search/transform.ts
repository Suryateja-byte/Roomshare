/**
 * Search API v2 - Transform Utilities
 *
 * Transforms existing data shapes to v2 response format.
 * Includes GeoJSON generation and pin tiering logic.
 */

import type { FeatureCollection, Point } from "geojson";
import type { ListingData, MapListingData } from "@/lib/data";
import {
  groupListingsByCoord,
  buildRankMapFromScores,
  computeTieredGroups,
  getPrimaryPinLimit,
  getBestListingInGroup,
  type MapMarkerListing,
} from "@/lib/maps/marker-utils";
import {
  CLUSTER_THRESHOLD,
  type SearchV2ListItem,
  type SearchV2GeoJSON,
  type SearchV2Pin,
  type SearchV2Mode,
  type SearchV2FeatureProperties,
} from "./types";

// ============================================================================
// Mode Determination
// ============================================================================

/**
 * Determine response mode based on mapListings count.
 * Uses CLUSTER_THRESHOLD (50) as the boundary.
 *
 * @param mapListingsCount - Number of listings in the map viewport
 * @returns 'geojson' if >=50, 'pins' if <50
 */
export function determineMode(mapListingsCount: number): SearchV2Mode {
  return mapListingsCount >= CLUSTER_THRESHOLD ? "geojson" : "pins";
}

/**
 * Check if pins should be included in the response.
 * Pins are only included when the result set is sparse (<50 listings).
 *
 * @param mapListingsCount - Number of listings in the map viewport
 * @returns true if pins should be included
 */
export function shouldIncludePins(mapListingsCount: number): boolean {
  return mapListingsCount < CLUSTER_THRESHOLD;
}

// ============================================================================
// List Item Transform
// ============================================================================

/**
 * Transform a ListingData to SearchV2ListItem format.
 *
 * @param listing - Full listing data from getListingsPaginated
 * @returns Formatted list item for v2 response
 */
export function transformToListItem(listing: ListingData): SearchV2ListItem {
  const badges: string[] = [];

  // Add near-match badge if applicable
  if (listing.isNearMatch) {
    badges.push("near-match");
  }

  // Add multi-room badge if multiple slots
  if (listing.totalSlots > 1) {
    badges.push("multi-room");
  }

  return {
    id: listing.id,
    title: listing.title,
    price: listing.price,
    image: listing.images[0] ?? null,
    lat: listing.location.lat,
    lng: listing.location.lng,
    badges: badges.length > 0 ? badges : undefined,
    // scoreHint is reserved for future relevance scoring
  };
}

/**
 * Transform an array of ListingData to SearchV2ListItem array.
 *
 * @param listings - Array of listing data
 * @returns Array of formatted list items
 */
export function transformToListItems(
  listings: ListingData[],
): SearchV2ListItem[] {
  return listings.map(transformToListItem);
}

// ============================================================================
// GeoJSON Transform
// ============================================================================

/**
 * Transform MapListingData array to GeoJSON FeatureCollection.
 * This is ALWAYS returned in the v2 response for Mapbox client-side clustering.
 *
 * @param listings - Array of map listing data
 * @returns GeoJSON FeatureCollection with Point features
 */
export function transformToGeoJSON(
  listings: MapListingData[],
): SearchV2GeoJSON {
  const features = listings.map((listing) => ({
    type: "Feature" as const,
    geometry: {
      type: "Point" as const,
      coordinates: [listing.location.lng, listing.location.lat] as [
        number,
        number,
      ],
    },
    properties: {
      id: listing.id,
      title: listing.title,
      price: listing.price,
      image: listing.images[0] ?? null,
      availableSlots: listing.availableSlots,
    } satisfies SearchV2FeatureProperties,
  }));

  return {
    type: "FeatureCollection",
    features,
  } as FeatureCollection<Point, SearchV2FeatureProperties>;
}

// ============================================================================
// Pin Transform
// ============================================================================

/**
 * Adapt MapListingData to MapMarkerListing interface for marker-utils.
 */
function adaptToMarkerListing(listing: MapListingData): MapMarkerListing {
  return {
    id: listing.id,
    title: listing.title,
    price: listing.price,
    availableSlots: listing.availableSlots,
    images: listing.images,
    location: listing.location,
  };
}

/**
 * Transform MapListingData array to tiered pins for sparse result sets.
 * Uses existing marker-utils functions for grouping and tiering.
 *
 * Pin tiering uses getPrimaryPinLimit() which:
 * - Defaults to 40 (code default, docs specify 15 for architecture)
 * - Can be overridden via NEXT_PUBLIC_PRIMARY_PINS env var
 * - Is clamped to 10-120 range
 *
 * @param listings - Array of map listing data
 * @returns Array of tiered pins with primary/mini classification
 */
export function transformToPins(
  listings: MapListingData[],
  scoreMap?: Map<string, number>,
): SearchV2Pin[] {
  if (listings.length === 0) {
    return [];
  }

  // Adapt to marker-utils interface
  const markerListings = listings.map(adaptToMarkerListing);

  // Get primary limit (respects NEXT_PUBLIC_PRIMARY_PINS env var)
  const primaryLimit = getPrimaryPinLimit();

  // Group by coordinate
  const groups = groupListingsByCoord(markerListings);

  // Build rank map - uses score-based ranking if scoreMap provided, else position-based
  const rankMap = buildRankMapFromScores(markerListings, scoreMap);

  // Compute tiered groups
  const tieredGroups = computeTieredGroups(groups, rankMap, primaryLimit);

  // Transform to v2 pin format
  return tieredGroups.map((group) => {
    // Explicitly pick best listing by lowest rank (highest score), not just [0]
    const bestListing = getBestListingInGroup(group.listings, rankMap);
    return {
      id: bestListing.id,
      lat: group.lat,
      lng: group.lng,
      price: bestListing.price,
      tier: group.tier,
      stackCount: group.listings.length > 1 ? group.listings.length : undefined,
    };
  });
}

// ============================================================================
// Combined Transform Helper
// ============================================================================

/**
 * Options for transformToMapResponse
 */
export interface TransformMapOptions {
  /** Optional score map for ranking-based pin tiering */
  scoreMap?: Map<string, number>;
  /** True when more listings exist than MAX_MAP_MARKERS allows */
  truncated?: boolean;
  /** Total count of matching listings before LIMIT (only set when truncated) */
  totalCandidates?: number;
}

/**
 * Transform map listings to v2 map response shape.
 * Always includes geojson, conditionally includes pins based on count.
 *
 * @param listings - Array of map listing data
 * @param options - Transform options including scoreMap and truncation info
 * @returns Object with geojson (always), pins (when sparse), and truncation info
 */
export function transformToMapResponse(
  listings: MapListingData[],
  options?: TransformMapOptions | Map<string, number>,
): {
  geojson: SearchV2GeoJSON;
  pins?: SearchV2Pin[];
  truncated?: boolean;
  totalCandidates?: number;
} {
  // Support legacy signature: transformToMapResponse(listings, scoreMap)
  const opts: TransformMapOptions = options instanceof Map
    ? { scoreMap: options }
    : options ?? {};

  const { scoreMap, truncated, totalCandidates } = opts;
  const geojson = transformToGeoJSON(listings);

  const result: {
    geojson: SearchV2GeoJSON;
    pins?: SearchV2Pin[];
    truncated?: boolean;
    totalCandidates?: number;
  } = { geojson };

  if (shouldIncludePins(listings.length)) {
    result.pins = transformToPins(listings, scoreMap);
  }

  // Add truncation info when present
  if (truncated) {
    result.truncated = truncated;
    if (totalCandidates !== undefined) {
      result.totalCandidates = totalCandidates;
    }
  }

  return result;
}
