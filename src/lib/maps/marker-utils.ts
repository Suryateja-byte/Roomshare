/**
 * Marker Utilities for Map Component
 *
 * Provides coordinate-based grouping for stacked markers and
 * price formatting for marker labels. Used by Map.tsx for
 * displaying multiple listings at the same location.
 */

/** Coordinate precision for grouping (~1.1m at equator) */
export const COORD_PRECISION = 5;

/**
 * Minimal listing interface for marker grouping
 * Matches the Listing interface used in Map.tsx
 */
export interface MapMarkerListing {
  id: string;
  title: string;
  price: number;
  availableSlots: number;
  ownerId?: string;
  images?: string[];
  location: {
    lat: number;
    lng: number;
  };
}

/**
 * Group of listings at the same coordinate
 */
export interface ListingGroup {
  /** Unique key for React rendering */
  key: string;
  /** TRUE latitude (not offset) */
  lat: number;
  /** TRUE longitude (not offset) */
  lng: number;
  /** All listings at this coordinate */
  listings: MapMarkerListing[];
}

/**
 * Groups listings by coordinate, keeping true position.
 * Uses coordinate precision to group nearby points (~1.1m at 5 decimals).
 *
 * @param listings - Array of listings to group
 * @param precision - Decimal places for coordinate comparison (default: 5)
 * @returns Array of listing groups at unique coordinates
 */
export function groupListingsByCoord(
  listings: MapMarkerListing[],
  precision = COORD_PRECISION,
): ListingGroup[] {
  const groups = new Map<string, MapMarkerListing[]>();

  listings.forEach((listing) => {
    const key = `${listing.location.lat.toFixed(precision)},${listing.location.lng.toFixed(precision)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(listing);
  });

  return Array.from(groups.entries()).map(([key, groupListings]) => ({
    key,
    lat: groupListings[0].location.lat, // TRUE coordinate
    lng: groupListings[0].location.lng, // TRUE coordinate
    listings: groupListings,
  }));
}

/**
 * Formats price range for stacked markers.
 * Shows single price if all same, otherwise shows range.
 *
 * @param listings - Array of listings to format price for
 * @returns Formatted price string (e.g., "$1,200" or "$850–$1,200")
 */
export function formatStackPriceRange(listings: MapMarkerListing[]): string {
  if (listings.length === 0) return "";

  const prices = listings.map((l) => l.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);

  const fmt = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

  return min === max
    ? fmt.format(min)
    : `${fmt.format(min)}–${fmt.format(max)}`;
}

/**
 * Extended ListingGroup with tier classification for Airbnb-style pin tiering
 */
export interface TieredGroup extends ListingGroup {
  /** Best rank among listings (lower = better, 0 = highest priority) */
  groupRank: number;
  /** Pin type to render: primary (price pill) or mini (small dot) */
  tier: "primary" | "mini";
}

/**
 * Default primary pin limit. Configurable via NEXT_PUBLIC_PRIMARY_PINS.
 * Clamped to 10-120 range for safety.
 */
export const DEFAULT_PRIMARY_LIMIT = 40;
export const MIN_PRIMARY_LIMIT = 10;
export const MAX_PRIMARY_LIMIT = 120;

/**
 * Parse and clamp primary pin limit from env var.
 * Returns a value between MIN_PRIMARY_LIMIT and MAX_PRIMARY_LIMIT.
 */
export function getPrimaryPinLimit(): number {
  const envVal = process.env.NEXT_PUBLIC_PRIMARY_PINS;
  if (!envVal) return DEFAULT_PRIMARY_LIMIT;

  const parsed = parseInt(envVal, 10);
  if (isNaN(parsed)) return DEFAULT_PRIMARY_LIMIT;

  return Math.max(MIN_PRIMARY_LIMIT, Math.min(MAX_PRIMARY_LIMIT, parsed));
}

/**
 * Build listingId → rank index map from listings array.
 * Rank is array index (0 = highest priority, based on API sort order).
 *
 * @param listings - Array of listings in rank order
 * @returns Map of listing ID to rank index
 */
export function buildRankMap(
  listings: MapMarkerListing[],
): Map<string, number> {
  const map = new Map<string, number>();
  listings.forEach((listing, index) => {
    map.set(listing.id, index);
  });
  return map;
}

/**
 * Build listingId → rank index map from score map.
 * Converts scores to ranks (0 = best, higher = worse).
 * Falls back to position-based ranking if no scores provided.
 *
 * @param listings - Array of listings to rank
 * @param scoreMap - Optional map of listing ID to score (0-1, higher = better)
 * @returns Map of listing ID to rank index (lower = better)
 */
export function buildRankMapFromScores(
  listings: MapMarkerListing[],
  scoreMap?: Map<string, number>,
): Map<string, number> {
  // Fallback to position-based ranking (current behavior)
  if (!scoreMap || scoreMap.size === 0) {
    return buildRankMap(listings);
  }

  // Sort listings by score descending, then by ID for determinism
  const sorted = [...listings].sort((a, b) => {
    const scoreA = scoreMap.get(a.id) ?? 0;
    const scoreB = scoreMap.get(b.id) ?? 0;

    // Higher score = better = lower rank
    if (scoreB !== scoreA) return scoreB - scoreA;

    // Stable tie-break by ID
    return a.id.localeCompare(b.id);
  });

  // Build rank map from sorted order
  const rankMap = new Map<string, number>();
  sorted.forEach((listing, index) => {
    rankMap.set(listing.id, index);
  });

  return rankMap;
}

/**
 * Compute tiered groups with primary/mini classification.
 * Groups are sorted by rank, listings within groups are also sorted.
 *
 * @param groups - Array of listing groups from groupListingsByCoord
 * @param rankMap - Map of listing ID to rank index
 * @param primaryLimit - Number of top groups to mark as primary
 * @returns Array of tiered groups sorted by rank
 */
export function computeTieredGroups(
  groups: ListingGroup[],
  rankMap: Map<string, number>,
  primaryLimit: number = DEFAULT_PRIMARY_LIMIT,
): TieredGroup[] {
  // Clamp limit for safety
  const limit = Math.max(
    MIN_PRIMARY_LIMIT,
    Math.min(MAX_PRIMARY_LIMIT, primaryLimit),
  );

  const tieredGroups: TieredGroup[] = groups.map((group) => {
    // Sort listings within group by rank (best first)
    const sortedListings = [...group.listings].sort((a, b) => {
      const rankA = rankMap.get(a.id) ?? Infinity;
      const rankB = rankMap.get(b.id) ?? Infinity;
      return rankA - rankB;
    });

    // Group rank = best (lowest) rank among its listings
    const groupRank = sortedListings.reduce((min, listing) => {
      const rank = rankMap.get(listing.id) ?? Infinity;
      return Math.min(min, rank);
    }, Infinity);

    return {
      ...group,
      listings: sortedListings,
      groupRank,
      tier: "mini" as const, // Will be updated after sorting
    };
  });

  // Sort groups by groupRank ascending (best first)
  tieredGroups.sort((a, b) => a.groupRank - b.groupRank);

  // Mark top N as primary, rest as mini
  tieredGroups.forEach((group, index) => {
    group.tier = index < limit ? "primary" : "mini";
  });

  return tieredGroups;
}

/**
 * Get best listing from a group by rank.
 * Explicitly selects the listing with lowest rank (highest score).
 * Used for pin display to show the highest-priority listing.
 *
 * @param listings - Array of listings in the group
 * @param rankMap - Map of listing ID to rank (lower = better)
 * @returns Best listing in the group
 */
export function getBestListingInGroup(
  listings: MapMarkerListing[],
  rankMap: Map<string, number>,
): MapMarkerListing {
  if (listings.length === 0) {
    throw new Error("Cannot get best listing from empty group");
  }

  if (listings.length === 1) {
    return listings[0];
  }

  return listings.reduce((best, current) => {
    const bestRank = rankMap.get(best.id) ?? Infinity;
    const currentRank = rankMap.get(current.id) ?? Infinity;
    return currentRank < bestRank ? current : best;
  });
}
