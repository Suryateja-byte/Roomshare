/**
 * Search API v2 - Shared Types and Constants
 *
 * Provides a unified response format combining list results and map data
 * in a single endpoint, behind a feature flag.
 */

import type { Feature, FeatureCollection, Point } from "geojson";

// ============================================================================
// Constants
// ============================================================================

/** Threshold for determining mode: >= 50 = 'geojson', < 50 = 'pins' */
export const CLUSTER_THRESHOLD = 50;

/** Bounds quantization for cache key normalization (~100m precision) */
export const BOUNDS_EPSILON = 0.001;

// ============================================================================
// Response Types
// ============================================================================

/** Mode determines whether pins array is included (always have geojson) */
export type SearchV2Mode = "geojson" | "pins";

/** Properties for GeoJSON point features */
export interface SearchV2FeatureProperties {
  id: string;
  title: string;
  price: number | null;
  image: string | null;
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
  lat: number;
  lng: number;
  /** Badges like 'near-match', 'multi-room' */
  badges?: string[];
  /** Relevance score hint for debugging/sorting */
  scoreHint?: number | null;
}

/** Pin with tier information for sparse results */
export interface SearchV2Pin {
  id: string;
  lat: number;
  lng: number;
  price?: number | null;
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
  /** ISO timestamp when response was generated */
  generatedAt: string;
  /** Mode based on mapListings.length: 'geojson' if >= 50, 'pins' if < 50 */
  mode: SearchV2Mode;
  /** Ranking version (debug only, when ?debugRank=1) */
  rankingVersion?: string;
  /** Whether ranking was applied (debug only) */
  rankingEnabled?: boolean;
  /** Top signals for debugging (capped at 5, no PII, debug only) */
  topSignals?: SearchV2DebugSignals[];
}

/** List section of the response */
export interface SearchV2List {
  items: SearchV2ListItem[];
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
}

/** Complete v2 search response */
export interface SearchV2Response {
  meta: SearchV2Meta;
  list: SearchV2List;
  map: SearchV2Map;
}
