/**
 * Search API v2 - Shared Types and Constants
 *
 * Provides a unified response format combining list results and map data
 * in a single endpoint, behind a feature flag.
 */

import type { Feature, FeatureCollection, Point } from "geojson";
import type { PublicAvailability } from "./public-availability";
import type {
  GroupContextPresentation,
  GroupSummary,
  ListingData,
} from "@/lib/search-types";

// ============================================================================
// Constants (re-exported from canonical source for backward compatibility)
// ============================================================================

// Re-export from constants for backward compatibility
export { CLUSTER_THRESHOLD, BOUNDS_EPSILON } from "@/lib/constants";

// ============================================================================
// Response Types
// ============================================================================

/** Mode determines whether pins array is included (always have geojson) */
export type SearchV2Mode = "geojson" | "pins";

/** Properties for GeoJSON point features */
export interface SearchV2FeatureProperties {
  id: string;
  title: string;
  price: number;
  image: string | null;
  availableSlots: number;
  publicAvailability: PublicAvailability;
  groupContext?: GroupContextPresentation | null;
  /** @deprecated No longer populated in API responses (S3 security fix) */
  ownerId?: string;
}

/** A single point feature for the map */
export type SearchV2Feature = Feature<Point, SearchV2FeatureProperties>;

/** GeoJSON FeatureCollection for Mapbox clustering */
export type SearchV2GeoJSON = FeatureCollection<
  Point,
  SearchV2FeatureProperties
>;

/** List item in v2 response */
export interface SearchV2ListItem {
  id: string;
  title: string;
  price: number | null;
  image: string | null;
  /** Approximate public latitude, coarsened before leaving the server. */
  lat: number;
  /** Approximate public longitude, coarsened before leaving the server. */
  lng: number;
  /** Badges like 'near-match', 'multi-room' */
  badges?: string[];
  /** Available slots for badge rendering */
  availableSlots?: number;
  /** Total slots for badge rendering */
  totalSlots?: number;
  /** Normalized additive availability contract for future readers */
  publicAvailability: PublicAvailability;
  groupSummary?: GroupSummary | null;
  groupContext?: GroupContextPresentation | null;
  /** Relevance score hint for debugging/sorting */
  scoreHint?: number | null;
}

/** Pin with tier information for sparse results */
export interface SearchV2Pin {
  id: string;
  /** Approximate public latitude, coarsened before leaving the server. */
  lat: number;
  /** Approximate public longitude, coarsened before leaving the server. */
  lng: number;
  price?: number | null;
  publicAvailability: PublicAvailability;
  /** Primary pins are larger, mini pins are smaller */
  tier?: "primary" | "mini";
  /** Number of listings at this location */
  stackCount?: number;
}

/** Debug signals for ranking (only in debug mode, no PII) */
export interface SearchV2DebugSignals {
  id: string;
  quality: number;
  rating: number;
  price: number;
  recency: number;
  geo: number;
  total: number;
}

/** Metadata about the search response */
export interface SearchV2Meta {
  /** 16-char SHA256 hash of query params (bounds quantized with BOUNDS_EPSILON) */
  queryHash: string;
  /** Durable snapshot id used to replay list/map results for pagination stability */
  querySnapshotId?: string;
  /** ISO timestamp when response was generated */
  generatedAt: string;
  /** Mode based on mapListings.length: 'geojson' if >= 50, 'pins' if < 50 */
  mode: SearchV2Mode;
  /** Search projection version when list or map reads use projection-backed search docs */
  projectionVersion?: number;
  /** Projection epoch pinned into a query snapshot. Serialized as string to preserve bigint precision. */
  projectionEpoch?: string;
  /** Embedding model/version when semantic search powered the list response */
  embeddingVersion?: string;
  /** Ranker profile version pinned into the snapshot contract */
  rankerProfileVersion?: string;
  /** Lowest active unit identity epoch included in the snapshot contract */
  unitIdentityEpochFloor?: number;
  /** Snapshot contract version used by the response */
  snapshotVersion?: string;
  /** Ranking version (debug only, when ?debugRank=1) */
  rankingVersion?: string;
  /** Whether ranking was applied (debug only) */
  rankingEnabled?: boolean;
  /** Top signals for debugging (capped at 5, no PII, debug only) */
  topSignals?: SearchV2DebugSignals[];
  /** Non-fatal warnings (e.g., bounds clamped, fallback used) */
  warnings?: string[];
}

/** List section of the response */
export interface SearchV2List {
  items: SearchV2ListItem[];
  /** Full-fidelity card payload for first-party web clients */
  fullItems?: ListingData[];
  /** Base64url encoded cursor for next page, null if no more pages */
  nextCursor: string | null;
  /** Exact total if ≤100, null if >100 (hybrid count optimization) */
  total?: number | null;
}

/** Map section of the response */
export interface SearchV2Map {
  /** ALWAYS present - GeoJSON FeatureCollection for Mapbox <Source cluster={true}> */
  geojson: SearchV2GeoJSON;
  /** ONLY when mode='pins' (sparse, <50 mapListings) - tiered pins for true-marker rendering */
  pins?: SearchV2Pin[];
  /** True when more listings exist than MAX_MAP_MARKERS (200) allows */
  truncated?: boolean;
  /** Total count of matching listings before LIMIT was applied (only set when truncated) */
  totalCandidates?: number;
}

/** Complete v2 search response */
export interface SearchV2Response {
  meta: SearchV2Meta;
  list: SearchV2List;
  map: SearchV2Map;
}
