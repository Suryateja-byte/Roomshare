/**
 * Search Ranking Module - Scoring Functions
 *
 * Computes normalized (0-1) scores for each ranking signal.
 * All signals are designed to be interpretable and tunable.
 */

import type {
  RankableListing,
  RankingContext,
  RankingWeights,
  SignalValues,
} from "./types";

/**
 * Default weights for v1 heuristic ranker.
 * Sum = 1.0 for normalized final scores.
 */
export const DEFAULT_WEIGHTS: RankingWeights = {
  quality: 0.25, // Pre-computed recommended_score
  rating: 0.25, // Rating with review confidence
  price: 0.15, // Price competitiveness
  recency: 0.15, // Listing freshness
  geo: 0.2, // Distance from center
};

/**
 * Compute the overall ranking score for a listing.
 * Returns a value between 0 and 1 (higher = better).
 */
export function computeScore(
  listing: RankableListing,
  context: RankingContext,
  weights: RankingWeights = DEFAULT_WEIGHTS,
): number {
  const signals = computeSignals(listing, context);

  return (
    weights.quality * signals.quality +
    weights.rating * signals.rating +
    weights.price * signals.price +
    weights.recency * signals.recency +
    weights.geo * signals.geo
  );
}

/**
 * Compute all individual signal values for a listing.
 * All signals are normalized to 0-1 range.
 */
export function computeSignals(
  listing: RankableListing,
  context: RankingContext,
): SignalValues {
  return {
    quality: normalizeRecommendedScore(listing.recommendedScore),
    rating: normalizeRating(listing.avgRating, listing.reviewCount),
    price: normalizePriceCompetitiveness(
      listing.price,
      context.localMedianPrice,
    ),
    recency: normalizeRecency(listing.createdAt),
    geo: normalizeDistance(listing.lat, listing.lng, context.center),
  };
}

/**
 * Normalize recommended_score using sigmoid.
 * Typical range: 0-200, maps to 0-1 with midpoint around 50.
 *
 * @param score - Pre-computed recommended_score (avg_rating*20 + view_count*0.1 + review_count*5)
 * @returns Normalized value 0-1
 */
export function normalizeRecommendedScore(
  score: number | null | undefined,
): number {
  if (score == null || score <= 0) return 0.3; // Neutral default for missing data

  // Sigmoid normalization: 1 / (1 + e^(-k*(x-midpoint)))
  // k=0.04 gives good spread, midpoint=50 centers the curve
  const k = 0.04;
  const midpoint = 50;
  return 1 / (1 + Math.exp(-k * (score - midpoint)));
}

/**
 * Normalize rating with review count confidence.
 * Uses Bayesian average to handle low review counts.
 *
 * @param rating - Average rating 0-5
 * @param reviewCount - Number of reviews
 * @returns Normalized value 0-1
 */
export function normalizeRating(
  rating: number | null | undefined,
  reviewCount: number | null | undefined,
): number {
  if (rating == null) return 0.5; // Neutral for no rating

  const count = reviewCount ?? 0;
  const prior = 3.5; // Prior average rating
  const minReviews = 5; // Minimum reviews for full confidence

  // Bayesian average: (prior * minReviews + rating * count) / (minReviews + count)
  const adjustedRating =
    (prior * minReviews + rating * count) / (minReviews + count);

  // Normalize 0-5 to 0-1
  return Math.min(1, Math.max(0, adjustedRating / 5));
}

/**
 * Normalize price competitiveness relative to local median.
 * Returns highest score (1.0) at median, decays toward extremes.
 *
 * @param price - Listing price
 * @param medianPrice - Median price from map candidates
 * @returns Normalized value 0-1 (1.0 = at median, lower for extremes)
 */
export function normalizePriceCompetitiveness(
  price: number | null | undefined,
  medianPrice: number | null | undefined,
): number {
  if (price == null || medianPrice == null || medianPrice <= 0) {
    return 0.5; // Neutral for missing data
  }

  // Ratio of price to median (1.0 = at median)
  const ratio = price / medianPrice;

  // Gaussian-like decay from median
  // exp(-((ln(ratio))^2) / (2 * sigma^2))
  // sigma = 0.5 gives reasonable spread
  const sigma = 0.5;
  const logRatio = Math.log(ratio);
  return Math.exp(-(logRatio * logRatio) / (2 * sigma * sigma));
}

/**
 * Normalize listing recency using exponential decay.
 * Newer listings score higher.
 *
 * @param createdAt - Listing creation timestamp
 * @returns Normalized value 0-1 (1.0 = brand new, decays over time)
 */
export function normalizeRecency(
  createdAt: Date | string | null | undefined,
): number {
  if (createdAt == null) return 0.5; // Neutral for missing data

  const created =
    typeof createdAt === "string" ? new Date(createdAt) : createdAt;
  const now = Date.now();
  const ageMs = now - created.getTime();

  if (ageMs <= 0) return 1.0; // Future dates get max score

  // Half-life of 30 days (in milliseconds)
  const halfLifeMs = 30 * 24 * 60 * 60 * 1000;

  // Exponential decay: 0.5^(age / halfLife)
  // After 30 days: 0.5, 60 days: 0.25, 90 days: 0.125
  return Math.pow(0.5, ageMs / halfLifeMs);
}

/**
 * Normalize distance from map center using exponential decay.
 * Closer listings score higher.
 *
 * @param lat - Listing latitude
 * @param lng - Listing longitude
 * @param center - Map center point
 * @returns Normalized value 0-1 (1.0 = at center, decays with distance)
 */
export function normalizeDistance(
  lat: number | null | undefined,
  lng: number | null | undefined,
  center: { lat: number; lng: number } | undefined,
): number {
  // No geo scoring if center is not provided (skip signal)
  if (center == null) return 0.5;

  if (lat == null || lng == null) return 0.3; // Lower score for missing coords

  // Haversine distance in km
  const distanceKm = haversineDistance(lat, lng, center.lat, center.lng);

  // Exponential decay with half-distance of 5km
  // At 5km: 0.5, 10km: 0.25, 15km: 0.125
  const halfDistanceKm = 5;
  return Math.pow(0.5, distanceKm / halfDistanceKm);
}

/**
 * Calculate Haversine distance between two points in km.
 */
function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Compute median price from a list of listings.
 * Used to determine local price competitiveness.
 *
 * @param listings - Array of listings with price field
 * @returns Median price or undefined if no valid prices
 */
export function computeMedianPrice(
  listings: Array<{ price?: number | null }>,
): number | undefined {
  const prices = listings
    .map((l) => l.price)
    .filter((p): p is number => p != null && p > 0)
    .sort((a, b) => a - b);

  if (prices.length === 0) return undefined;

  const mid = Math.floor(prices.length / 2);
  return prices.length % 2 !== 0
    ? prices[mid]
    : (prices[mid - 1] + prices[mid]) / 2;
}

/**
 * Get center point from map bounds.
 *
 * @param bounds - Map bounds object with sw/ne corners
 * @returns Center point or undefined
 */
export function getBoundsCenter(bounds: {
  sw: { lat: number; lng: number };
  ne: { lat: number; lng: number };
}): { lat: number; lng: number } {
  return {
    lat: (bounds.sw.lat + bounds.ne.lat) / 2,
    lng: (bounds.sw.lng + bounds.ne.lng) / 2,
  };
}
