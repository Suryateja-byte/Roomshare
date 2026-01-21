/**
 * Search Ranking Module
 *
 * Provides score-based ranking for map pin tiering.
 * V1 uses heuristic signals; designed for future ML integration.
 *
 * Usage:
 *   import { isRankingEnabled, buildScoreMap, computeMedianPrice } from '@/lib/search/ranking';
 *
 *   if (isRankingEnabled(params.ranker)) {
 *     const context = {
 *       sort: params.sort,
 *       center: getBoundsCenter(bounds),
 *       localMedianPrice: computeMedianPrice(mapListings),
 *     };
 *     const scoreMap = buildScoreMap(mapListings, context);
 *     // Pass scoreMap to transformToPins for score-based tiering
 *   }
 */

import { features } from "@/lib/env";

// Re-export types
export type {
  RankingContext,
  RankingWeights,
  SignalValues,
  DebugSignals,
  RankableListing,
  RankingConfig,
} from "./types";

// Re-export scoring functions
export {
  DEFAULT_WEIGHTS,
  computeScore,
  computeSignals,
  normalizeRecommendedScore,
  normalizeRating,
  normalizePriceCompetitiveness,
  normalizeRecency,
  normalizeDistance,
  computeMedianPrice,
  getBoundsCenter,
} from "./score";

// Re-export ranking functions
export { buildScoreMap, rankListings, getDebugSignals } from "./rank";

/**
 * Current ranking version for A/B testing and debugging.
 */
export const RANKING_VERSION = "v1-heuristic";

/**
 * Check if ranking is enabled.
 * Supports URL override for dev testing (gated to non-production).
 *
 * @param urlRanker - Value of ?ranker= query param (optional)
 * @returns true if ranking should be applied
 */
export function isRankingEnabled(urlRanker?: string | null): boolean {
  // URL override only allowed when debug mode is permitted
  // This prevents production users from enabling/disabling ranking via URL
  if (features.searchDebugRanking) {
    // URL override - explicit enable
    if (urlRanker === "1" || urlRanker === "true") return true;

    // URL override - explicit disable
    if (urlRanker === "0" || urlRanker === "false") return false;
  }

  // Fall back to env feature flag
  return features.searchRanking;
}
