/**
 * Tests for computeRecommendedScore function
 *
 * Tests the improved ranking formula with:
 * - Time decay on views (30-day half-life)
 * - Freshness boost for new listings (first 7 days)
 * - Logarithmic scaling on views (prevents gaming)
 */

import { computeRecommendedScore } from "@/app/api/cron/refresh-search-docs/route";

describe("computeRecommendedScore", () => {
  // Helper to create a date N days ago
  const daysAgo = (days: number): Date => {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  };

  describe("freshness boost", () => {
    it("gives +15 freshness boost on day 0", () => {
      const newListing = computeRecommendedScore(0, 0, 0, new Date());
      // Day 0: ratingScore=0, viewScore=0, reviewScore=0, freshnessBoost=15
      expect(newListing).toBeCloseTo(15, 1);
    });

    it("gives ~+8.6 freshness boost on day 3", () => {
      const midWeekListing = computeRecommendedScore(0, 0, 0, daysAgo(3));
      // Day 3 (Math.floor): freshnessBoost = 15 * (1 - 3/7) ≈ 15 * 0.571 ≈ 8.57
      expect(midWeekListing).toBeCloseTo(15 * (1 - 3 / 7), 1);
    });

    it("gives no freshness boost after day 7", () => {
      const weekOldListing = computeRecommendedScore(0, 0, 0, daysAgo(7));
      expect(weekOldListing).toBeCloseTo(0, 1);
    });

    it("gives no freshness boost after day 30", () => {
      const oldListing = computeRecommendedScore(0, 0, 0, daysAgo(30));
      expect(oldListing).toBeCloseTo(0, 1);
    });

    it("new listing ranks higher than identical old listing (freshness)", () => {
      const newScore = computeRecommendedScore(4.0, 100, 5, new Date());
      const oldScore = computeRecommendedScore(4.0, 100, 5, daysAgo(30));
      expect(newScore).toBeGreaterThan(oldScore);
    });
  });

  describe("time decay on views", () => {
    it("views from new listing have full contribution (decayFactor = 1.0)", () => {
      const newListing = computeRecommendedScore(0, 1000, 0, new Date());
      // log(1001) * 10 * 1.0 ≈ 69.08 + 15 (freshness)
      const expectedViewScore = Math.log(1001) * 10;
      const freshnessBoost = 15;
      expect(newListing).toBeCloseTo(expectedViewScore + freshnessBoost, 1);
    });

    it("views from 30-day old listing have reduced contribution (decayFactor = 0.5)", () => {
      const oldListing = computeRecommendedScore(0, 1000, 0, daysAgo(30));
      // log(1001) * 10 * 0.5 ≈ 34.54, no freshness
      const expectedViewScore = Math.log(1001) * 10 * 0.5;
      expect(oldListing).toBeCloseTo(expectedViewScore, 1);
    });

    it("views from 60-day old listing have minimum contribution (decayFactor = 0.1)", () => {
      const veryOldListing = computeRecommendedScore(0, 1000, 0, daysAgo(60));
      // decayFactor = max(0.1, 1 - (60/30)*0.5) = max(0.1, 0) = 0.1
      const expectedViewScore = Math.log(1001) * 10 * 0.1;
      expect(veryOldListing).toBeCloseTo(expectedViewScore, 1);
    });

    it("older listings have lower view contribution than newer ones", () => {
      const newScore = computeRecommendedScore(0, 500, 0, new Date());
      const midScore = computeRecommendedScore(0, 500, 0, daysAgo(15));
      const oldScore = computeRecommendedScore(0, 500, 0, daysAgo(60));

      // Adjust for freshness boost when comparing
      const newWithoutFreshness = newScore - 15;
      const midWithoutFreshness = midScore;
      expect(newWithoutFreshness).toBeGreaterThan(midWithoutFreshness);
      expect(midWithoutFreshness).toBeGreaterThan(oldScore);
    });
  });

  describe("logarithmic view scaling (anti-gaming)", () => {
    it("100 views gives approximately 46 points (not 10)", () => {
      // With new listing: log(101) * 10 * 1.0 ≈ 46.1 + 15 freshness
      const score = computeRecommendedScore(0, 100, 0, new Date());
      const viewPart = Math.log(101) * 10; // ≈ 46.1
      expect(score).toBeCloseTo(viewPart + 15, 1);
    });

    it("1000 views gives approximately 69 points (not 100)", () => {
      // With new listing: log(1001) * 10 * 1.0 ≈ 69.1 + 15 freshness
      const score = computeRecommendedScore(0, 1000, 0, new Date());
      const viewPart = Math.log(1001) * 10; // ≈ 69.1
      expect(score).toBeCloseTo(viewPart + 15, 1);
    });

    it("10x increase in views gives less than 10x score increase (log scaling)", () => {
      const score100 = computeRecommendedScore(0, 100, 0, daysAgo(30));
      const score1000 = computeRecommendedScore(0, 1000, 0, daysAgo(30));

      // Linear: 10x views would give 10x score increase
      // Logarithmic: 10x views gives much less than 10x increase
      const ratio = score1000 / score100;
      expect(ratio).toBeLessThan(2); // Not even 2x, far from 10x
      expect(ratio).toBeGreaterThan(1); // But still higher
    });

    it("10x more views only gives ~23 more points (log scaling)", () => {
      // Both 30 days old (no freshness, 0.5 decay)
      const score100 = computeRecommendedScore(0, 100, 0, daysAgo(30));
      const score1000 = computeRecommendedScore(0, 1000, 0, daysAgo(30));

      // Difference: (log(1001) - log(101)) * 10 * 0.5 ≈ 11.5
      const difference = score1000 - score100;
      expect(difference).toBeLessThan(50); // Not 90 (linear would give)
      expect(difference).toBeGreaterThan(5);
    });
  });

  describe("rating and review contributions (unchanged weights)", () => {
    it("5-star rating gives +100 points", () => {
      const zeroRating = computeRecommendedScore(0, 0, 0, daysAgo(30));
      const fiveStars = computeRecommendedScore(5, 0, 0, daysAgo(30));
      expect(fiveStars - zeroRating).toBeCloseTo(100, 1);
    });

    it("4-star rating gives +80 points", () => {
      const zeroRating = computeRecommendedScore(0, 0, 0, daysAgo(30));
      const fourStars = computeRecommendedScore(4, 0, 0, daysAgo(30));
      expect(fourStars - zeroRating).toBeCloseTo(80, 1);
    });

    it("10 reviews gives +50 points", () => {
      const noReviews = computeRecommendedScore(0, 0, 0, daysAgo(30));
      const tenReviews = computeRecommendedScore(0, 0, 10, daysAgo(30));
      expect(tenReviews - noReviews).toBeCloseTo(50, 1);
    });
  });

  describe("combined formula behavior", () => {
    it("calculates correct total for typical new listing", () => {
      // New listing: 4.5 stars, 200 views, 8 reviews
      const score = computeRecommendedScore(4.5, 200, 8, new Date());

      // Expected breakdown:
      // ratingScore = 4.5 * 20 = 90
      // reviewScore = 8 * 5 = 40
      // viewScore = log(201) * 10 * 1.0 ≈ 53.0
      // freshnessBoost = 15
      // Total ≈ 198
      expect(score).toBeCloseTo(90 + 40 + Math.log(201) * 10 + 15, 1);
    });

    it("calculates correct total for old listing", () => {
      // 60-day old listing: 4.0 stars, 500 views, 20 reviews
      const score = computeRecommendedScore(4.0, 500, 20, daysAgo(60));

      // Expected breakdown:
      // ratingScore = 4.0 * 20 = 80
      // reviewScore = 20 * 5 = 100
      // viewScore = log(501) * 10 * 0.1 ≈ 6.2 (decay factor at minimum)
      // freshnessBoost = 0 (past 7 days)
      // Total ≈ 186.2
      expect(score).toBeCloseTo(80 + 100 + Math.log(501) * 10 * 0.1, 1);
    });

    it("highly-rated old listing can still rank well", () => {
      // Old but excellent listing
      const oldExcellent = computeRecommendedScore(5.0, 1000, 50, daysAgo(90));
      // New but mediocre listing
      const newMediocre = computeRecommendedScore(3.0, 10, 1, new Date());

      // Old excellent should still beat new mediocre
      expect(oldExcellent).toBeGreaterThan(newMediocre);
    });

    it("fresh boost helps new listings compete", () => {
      // New listing with few views/reviews
      const newModest = computeRecommendedScore(4.0, 50, 2, new Date());
      // Older listing with more views but no reviews
      const oldModest = computeRecommendedScore(4.0, 200, 2, daysAgo(14));

      // Despite fewer views, new listing should be competitive due to freshness
      // newModest: 80 + 10 + ~39 + 15 = ~144
      // oldModest: 80 + 10 + ~26.5 + 0 = ~116.5
      expect(newModest).toBeGreaterThan(oldModest);
    });
  });

  describe("edge cases", () => {
    it("handles zero values correctly", () => {
      const score = computeRecommendedScore(0, 0, 0, new Date());
      // Only freshness boost
      expect(score).toBeCloseTo(15, 1);
    });

    it("handles very high view counts", () => {
      const score = computeRecommendedScore(5, 1000000, 100, new Date());
      // log(1000001) * 10 ≈ 138.2
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(1000); // Reasonable upper bound
    });

    it("handles very old listings (100+ days)", () => {
      const score = computeRecommendedScore(4, 500, 10, daysAgo(100));
      // Should still produce a valid score
      expect(score).toBeGreaterThan(0);
      // Decay factor is at minimum (0.1)
      expect(score).toBeCloseTo(80 + 50 + Math.log(501) * 10 * 0.1, 1);
    });

    it("handles fractional ratings", () => {
      const score = computeRecommendedScore(4.7, 100, 5, daysAgo(30));
      expect(score).toBeCloseTo(4.7 * 20 + 5 * 5 + Math.log(101) * 10 * 0.5, 1);
    });
  });
});
