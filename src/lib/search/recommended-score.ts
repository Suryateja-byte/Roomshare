/**
 * Compute recommended score with time decay, freshness boost, and log scaling.
 *
 * Components:
 * - Rating score: avgRating * 20
 * - Review score: reviewCount * 5
 * - View score: log(1 + views) * 10 * decayFactor
 * - Freshness boost: +15 points for new listings (decays over 7 days)
 */
export function computeRecommendedScore(
  avgRating: number,
  viewCount: number,
  reviewCount: number,
  createdAt: Date,
): number {
  const ratingScore = avgRating * 20;
  const reviewScore = reviewCount * 5;

  const daysSinceCreation = Math.floor(
    (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24),
  );

  // Views from older listings contribute less (30-day half-life, min 10%).
  const decayFactor = Math.max(0.1, 1 - (daysSinceCreation / 30) * 0.5);
  const viewScore = Math.log(1 + viewCount) * 10 * decayFactor;

  // Day 0: +15, Day 7+: +0.
  const freshnessBoost =
    daysSinceCreation <= 7 ? 15 * (1 - daysSinceCreation / 7) : 0;

  return ratingScore + viewScore + reviewScore + freshnessBoost;
}
