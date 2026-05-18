/**
 * Marker Utilities for Map Component
 *
 * Provides coordinate-based grouping for stacked markers and
 * price formatting for marker labels. Used by Map.tsx for
 * displaying multiple listings at the same location.
 */

import {
  getAvailabilityPresentation,
  type AvailabilityPublicAvailability,
} from "@/lib/search/availability-presentation";
import type { GroupContextPresentation } from "@/lib/search-types";

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
  totalSlots?: number;
  ownerId?: string;
  images?: string[];
  publicAvailability?: AvailabilityPublicAvailability;
  groupContext?: GroupContextPresentation | null;
  tier?: "primary" | "mini";
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
 * Group of exact-clone listings for map marker rendering.
 * Distinct IDs can still collapse when the visible marker payload is identical.
 */
export interface ExactCloneGroup<
  T extends MapMarkerListing = MapMarkerListing,
> {
  /** Stable key derived from the clone signature */
  key: string;
  /** First listing in source order, used as the visible canonical marker */
  listing: T;
  /** All listings collapsed into the canonical marker */
  listings: T[];
  /** All member listing IDs, including the canonical listing ID */
  memberIds: string[];
}

function normalizeCloneTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLowerCase();
}

function buildExactCloneKey(
  listing: MapMarkerListing,
  precision: number
): string {
  const presentation = getAvailabilityPresentation({
    availableSlots: listing.availableSlots,
    totalSlots: listing.totalSlots,
    publicAvailability: listing.publicAvailability,
    groupContext: listing.groupContext,
  });

  return [
    normalizeCloneTitle(listing.title),
    listing.price,
    presentation.presentationKey,
    listing.tier ?? "",
    listing.location.lat.toFixed(precision),
    listing.location.lng.toFixed(precision),
  ].join("|");
}

/**
 * Collapse exact-clone listings into a single canonical marker entry.
 * This is intentionally narrower than coordinate grouping and is used only by the map UI.
 *
 * @param listings - Array of listings in source order
 * @param precision - Decimal places for coordinate comparison (default: 5)
 * @returns Canonical marker groups preserving first-listing priority
 */
export function groupExactMapListingClones<T extends MapMarkerListing>(
  listings: T[],
  precision = COORD_PRECISION
): ExactCloneGroup<T>[] {
  const groups = new Map<string, ExactCloneGroup<T>>();
  const orderedGroups: ExactCloneGroup<T>[] = [];

  listings.forEach((listing) => {
    const key = buildExactCloneKey(listing, precision);
    const existing = groups.get(key);

    if (existing) {
      existing.listings.push(listing);
      existing.memberIds.push(listing.id);
      return;
    }

    const group: ExactCloneGroup<T> = {
      key,
      listing,
      listings: [listing],
      memberIds: [listing.id],
    };
    groups.set(key, group);
    orderedGroups.push(group);
  });

  return orderedGroups;
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
  precision = COORD_PRECISION
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
  listings: MapMarkerListing[]
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
  scoreMap?: Map<string, number>
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
  primaryLimit: number = DEFAULT_PRIMARY_LIMIT
): TieredGroup[] {
  // Clamp limit for safety
  const limit = Math.max(
    MIN_PRIMARY_LIMIT,
    Math.min(MAX_PRIMARY_LIMIT, primaryLimit)
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
  rankMap: Map<string, number>
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

export type MarkerRenderMode = "price" | "dot";

export type MarkerCollisionTier = "primary" | "mini";

export interface MarkerScreenPoint {
  x: number;
  y: number;
}

export interface MarkerScreenSize {
  width: number;
  height: number;
}

export interface MarkerScreenRect extends MarkerScreenPoint, MarkerScreenSize {}

export interface MarkerCollisionInput {
  id: string;
  memberIds?: readonly string[];
  tier?: MarkerCollisionTier;
  point: MarkerScreenPoint;
  pricePillSize: MarkerScreenSize;
  dotSize: number;
  active?: boolean;
  hovered?: boolean;
  keyboardFocused?: boolean;
  /**
   * Higher values win within the same interaction/tier bucket.
   * Ties are resolved by marker id for order-independent determinism.
   */
  priority?: number;
}

export type MarkerCollisionReason =
  | "accepted"
  | "outside-viewport"
  | "collides-with-price"
  | "collides-with-avoid-rect";

export interface MarkerRenderDecision {
  id: string;
  memberIds: readonly string[];
  tier: MarkerCollisionTier;
  renderMode: MarkerRenderMode;
  reason: MarkerCollisionReason;
  priorityScore: number;
  priorityReasons: readonly string[];
  priceRect: MarkerScreenRect;
  dotRect: MarkerScreenRect;
  collidesWithId?: string;
  collidesWithAvoidRectIndex?: number;
}

export interface MarkerCollisionPlanOptions {
  markers: readonly MarkerCollisionInput[];
  viewport: MarkerScreenRect;
  avoidRects?: readonly MarkerScreenRect[];
}

export type MarkerCollisionPlan = Record<string, MarkerRenderDecision>;

const MIN_PRICE_PILL_WIDTH = 56;
const MIN_PRICE_PILL_HEIGHT = 32;
const PRICE_PILL_COLLISION_PADDING_X = 8;
const PRICE_PILL_COLLISION_PADDING_Y = 6;
const MIN_DOT_SIZE = 10;

function centerRect(
  point: MarkerScreenPoint,
  size: MarkerScreenSize
): MarkerScreenRect {
  return {
    x: point.x - size.width / 2,
    y: point.y - size.height / 2,
    width: size.width,
    height: size.height,
  };
}

function buildPriceRect(marker: MarkerCollisionInput): MarkerScreenRect {
  const width =
    Math.max(MIN_PRICE_PILL_WIDTH, marker.pricePillSize.width) +
    PRICE_PILL_COLLISION_PADDING_X * 2;
  const height =
    Math.max(MIN_PRICE_PILL_HEIGHT, marker.pricePillSize.height) +
    PRICE_PILL_COLLISION_PADDING_Y * 2;

  return centerRect(marker.point, { width, height });
}

function buildDotRect(marker: MarkerCollisionInput): MarkerScreenRect {
  const size = Math.max(MIN_DOT_SIZE, marker.dotSize);
  return centerRect(marker.point, { width: size, height: size });
}

function rectsOverlap(a: MarkerScreenRect, b: MarkerScreenRect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function rectIntersectsViewport(
  rect: MarkerScreenRect,
  viewport: MarkerScreenRect
): boolean {
  return rectsOverlap(rect, viewport);
}

function getMarkerPriority(marker: MarkerCollisionInput): {
  score: number;
  reasons: string[];
} {
  const reasons: string[] = [];
  let score = marker.priority ?? 0;

  if (marker.active) {
    score += 1_000_000;
    reasons.push("active");
  }

  if (marker.hovered) {
    score += 900_000;
    reasons.push("hovered");
  }

  if (marker.keyboardFocused) {
    score += 900_000;
    reasons.push("keyboardFocused");
  }

  if ((marker.tier ?? "primary") === "primary") {
    score += 10_000;
    reasons.push("primary");
  } else {
    reasons.push("mini");
  }

  return { score, reasons };
}

/**
 * Plan price-pill vs dot rendering for projected map markers in screen space.
 * The plan is deterministic for identical marker data and does not depend on
 * input array identity or order.
 */
export function planMarkerCollisionRendering({
  markers,
  viewport,
  avoidRects = [],
}: MarkerCollisionPlanOptions): MarkerCollisionPlan {
  const prepared = markers.map((marker) => {
    const priority = getMarkerPriority(marker);
    return {
      marker,
      priceRect: buildPriceRect(marker),
      dotRect: buildDotRect(marker),
      priorityScore: priority.score,
      priorityReasons: priority.reasons,
    };
  });

  const sorted = [...prepared].sort((a, b) => {
    if (b.priorityScore !== a.priorityScore) {
      return b.priorityScore - a.priorityScore;
    }

    return a.marker.id.localeCompare(b.marker.id);
  });

  const acceptedPriceRects: Array<{
    id: string;
    rect: MarkerScreenRect;
  }> = [];
  const decisions: MarkerCollisionPlan = {};

  sorted.forEach((entry) => {
    const avoidRectIndex = avoidRects.findIndex((avoidRect) =>
      rectsOverlap(entry.priceRect, avoidRect)
    );

    const acceptedCollision = acceptedPriceRects.find((accepted) =>
      rectsOverlap(entry.priceRect, accepted.rect)
    );

    let renderMode: MarkerRenderMode = "price";
    let reason: MarkerCollisionReason = "accepted";

    if (!rectIntersectsViewport(entry.priceRect, viewport)) {
      renderMode = "dot";
      reason = "outside-viewport";
    } else if (avoidRectIndex >= 0) {
      renderMode = "dot";
      reason = "collides-with-avoid-rect";
    } else if (acceptedCollision) {
      renderMode = "dot";
      reason = "collides-with-price";
    }

    if (renderMode === "price") {
      acceptedPriceRects.push({
        id: entry.marker.id,
        rect: entry.priceRect,
      });
    }

    decisions[entry.marker.id] = {
      id: entry.marker.id,
      memberIds: entry.marker.memberIds ?? [entry.marker.id],
      tier: entry.marker.tier ?? "primary",
      renderMode,
      reason,
      priorityScore: entry.priorityScore,
      priorityReasons: entry.priorityReasons,
      priceRect: entry.priceRect,
      dotRect: entry.dotRect,
      ...(acceptedCollision ? { collidesWithId: acceptedCollision.id } : {}),
      ...(avoidRectIndex >= 0
        ? { collidesWithAvoidRectIndex: avoidRectIndex }
        : {}),
    };
  });

  return Object.fromEntries(
    Object.entries(decisions).sort(([idA], [idB]) => idA.localeCompare(idB))
  );
}
