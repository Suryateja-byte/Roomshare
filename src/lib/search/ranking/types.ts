/**
 * Search Ranking Module - Type Definitions
 *
 * Types for the heuristic-based ranking system that scores listings
 * for map pin tiering. Designed for future extensibility to ML-based ranking.
 */

/**
 * Context passed to scoring functions.
 * Contains information about the search context that influences scoring.
 */
export interface RankingContext {
  /** Current sort option (affects signal weighting) */
  sort: string;
  /** Map center point for distance scoring (optional - skip geo signal if absent) */
  center?: { lat: number; lng: number };
  /** Median price from map candidates for price competitiveness (optional) */
  localMedianPrice?: number;
  /** Enable debug output (limited to 5 pins, no PII) */
  debug?: boolean;
}

/**
 * Weights for each ranking signal.
 * All weights should sum to 1.0 for normalized scoring.
 */
export interface RankingWeights {
  /** Pre-computed quality score from SearchDoc (avg_rating*20 + view_count*0.1 + review_count*5) */
  quality: number;
  /** Rating with review count confidence adjustment */
  rating: number;
  /** Price competitiveness relative to local median */
  price: number;
  /** Listing recency (newer = higher) */
  recency: number;
  /** Distance from map center (closer = higher) */
  geo: number;
}

/**
 * Individual signal values (all normalized to 0-1 range).
 */
export interface SignalValues {
  quality: number;
  rating: number;
  price: number;
  recency: number;
  geo: number;
}

/**
 * Debug output for a single listing (no PII).
 * Only includes id and normalized signal values.
 */
export interface DebugSignals {
  id: string;
  quality: number;
  rating: number;
  price: number;
  recency: number;
  geo: number;
  total: number;
}

/**
 * Minimum fields required from a listing for ranking.
 * Uses optional fields since not all may be present.
 */
export interface RankableListing {
  id: string;
  /** Pre-computed recommended score from SearchDoc */
  recommendedScore?: number | null;
  /** Average rating 0-5 */
  avgRating?: number | null;
  /** Number of reviews */
  reviewCount?: number | null;
  /** Price per period */
  price?: number | null;
  /** Listing creation timestamp */
  createdAt?: Date | string | null;
  /** Latitude for geo scoring */
  lat?: number | null;
  /** Longitude for geo scoring */
  lng?: number | null;
}

/**
 * Ranking configuration for version tracking and tuning.
 */
export interface RankingConfig {
  /** Version identifier for A/B testing and debugging */
  version: string;
  /** Signal weights */
  weights: RankingWeights;
}
