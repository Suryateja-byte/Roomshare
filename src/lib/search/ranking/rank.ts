/**
 * Search Ranking Module - Ranking Functions
 *
 * Converts scores to ranks and builds score/rank maps for listings.
 * Ensures deterministic ordering with stable tie-breaking.
 */

import type {
  DebugSignals,
  RankableListing,
  RankingContext,
  RankingWeights,
} from "./types";
import { computeScore, computeSignals, DEFAULT_WEIGHTS } from "./score";

/**
 * Build a map of listing ID to score.
 *
 * @param listings - Array of listings to score
 * @param context - Ranking context (sort, center, medianPrice)
 * @param weights - Optional custom weights (defaults to DEFAULT_WEIGHTS)
 * @returns Map of listing ID to score (0-1, higher = better)
 */
export function buildScoreMap<T extends RankableListing>(
  listings: T[],
  context: RankingContext,
  weights: RankingWeights = DEFAULT_WEIGHTS,
): Map<string, number> {
  const map = new Map<string, number>();

  for (const listing of listings) {
    map.set(listing.id, computeScore(listing, context, weights));
  }

  return map;
}

/**
 * Rank listings by score in descending order.
 * Returns a new sorted array without modifying the original.
 * Uses stable tie-breaking by ID for determinism.
 *
 * @param candidates - Array of listings to rank
 * @param scoreMap - Map of listing ID to score
 * @returns New array sorted by score (descending), then by ID (ascending)
 */
export function rankListings<T extends { id: string }>(
  candidates: T[],
  scoreMap: Map<string, number>,
): T[] {
  return [...candidates].sort((a, b) => {
    const scoreA = scoreMap.get(a.id) ?? 0;
    const scoreB = scoreMap.get(b.id) ?? 0;

    // Higher score wins
    if (scoreB !== scoreA) return scoreB - scoreA;

    // Stable tie-break by ID (deterministic)
    return a.id.localeCompare(b.id);
  });
}

/**
 * Get debug signals for top N listings.
 * Only includes ID and normalized signal values (0-1) - no PII.
 *
 * @param listings - Array of listings with scores
 * @param scoreMap - Map of listing ID to score
 * @param context - Ranking context
 * @param limit - Maximum number of entries to return (default: 5)
 * @returns Array of debug signal objects (capped at limit)
 */
export function getDebugSignals<T extends RankableListing>(
  listings: T[],
  scoreMap: Map<string, number>,
  context: RankingContext,
  limit: number = 5,
): DebugSignals[] {
  // Sort by score to get top listings
  const ranked = rankListings(listings, scoreMap);

  // Take only top N
  const topListings = ranked.slice(0, limit);

  return topListings.map((listing) => {
    const signals = computeSignals(listing, context);
    const total = scoreMap.get(listing.id) ?? 0;

    return {
      id: listing.id,
      quality: round(signals.quality),
      rating: round(signals.rating),
      price: round(signals.price),
      recency: round(signals.recency),
      geo: round(signals.geo),
      total: round(total),
    };
  });
}

/**
 * Round to 2 decimal places for debug output.
 */
function round(n: number): number {
  return Math.round(n * 100) / 100;
}
