/**
 * Tests for search ranking scoring functions
 */

import {
  normalizeRecommendedScore,
  normalizeRating,
  normalizePriceCompetitiveness,
  normalizeRecency,
  normalizeDistance,
  computeMedianPrice,
  getBoundsCenter,
  computeScore,
  computeSignals,
  DEFAULT_WEIGHTS,
} from "../score";
import type { RankableListing, RankingContext } from "../types";

describe("normalizeRecommendedScore", () => {
  it("returns 0.3 for null/undefined", () => {
    expect(normalizeRecommendedScore(null)).toBe(0.3);
    expect(normalizeRecommendedScore(undefined)).toBe(0.3);
  });

  it("returns 0.3 for zero or negative", () => {
    expect(normalizeRecommendedScore(0)).toBe(0.3);
    expect(normalizeRecommendedScore(-10)).toBe(0.3);
  });

  it("returns value between 0 and 1", () => {
    expect(normalizeRecommendedScore(10)).toBeGreaterThan(0);
    expect(normalizeRecommendedScore(10)).toBeLessThan(1);
    expect(normalizeRecommendedScore(100)).toBeGreaterThan(0);
    expect(normalizeRecommendedScore(100)).toBeLessThan(1);
  });

  it("is monotonically increasing", () => {
    const s10 = normalizeRecommendedScore(10);
    const s50 = normalizeRecommendedScore(50);
    const s100 = normalizeRecommendedScore(100);
    const s200 = normalizeRecommendedScore(200);

    expect(s50).toBeGreaterThan(s10);
    expect(s100).toBeGreaterThan(s50);
    expect(s200).toBeGreaterThan(s100);
  });

  it("returns approximately 0.5 at midpoint (50)", () => {
    const score = normalizeRecommendedScore(50);
    expect(score).toBeCloseTo(0.5, 1);
  });
});

describe("normalizeRating", () => {
  it("returns 0.5 for null rating", () => {
    expect(normalizeRating(null, 10)).toBe(0.5);
    expect(normalizeRating(undefined, 10)).toBe(0.5);
  });

  it("returns value between 0 and 1", () => {
    expect(normalizeRating(5, 100)).toBeGreaterThan(0);
    expect(normalizeRating(5, 100)).toBeLessThanOrEqual(1);
    expect(normalizeRating(1, 100)).toBeGreaterThan(0);
    expect(normalizeRating(1, 100)).toBeLessThan(1);
  });

  it("higher rating = higher score", () => {
    const r3 = normalizeRating(3, 10);
    const r4 = normalizeRating(4, 10);
    const r5 = normalizeRating(5, 10);

    expect(r4).toBeGreaterThan(r3);
    expect(r5).toBeGreaterThan(r4);
  });

  it("uses Bayesian average - low review count pulls toward prior", () => {
    // With 1 review at 5.0, should be pulled toward prior (3.5)
    const fewReviews = normalizeRating(5, 1);
    // With 100 reviews at 5.0, should be close to 5.0
    const manyReviews = normalizeRating(5, 100);

    expect(manyReviews).toBeGreaterThan(fewReviews);
  });

  it("handles null review count", () => {
    const score = normalizeRating(4, null);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });
});

describe("normalizePriceCompetitiveness", () => {
  it("returns 0.5 for null price or median", () => {
    expect(normalizePriceCompetitiveness(null, 1000)).toBe(0.5);
    expect(normalizePriceCompetitiveness(1000, null)).toBe(0.5);
    expect(normalizePriceCompetitiveness(null, null)).toBe(0.5);
  });

  it("returns 0.5 for zero median", () => {
    expect(normalizePriceCompetitiveness(1000, 0)).toBe(0.5);
  });

  it("returns 1.0 when price equals median", () => {
    const score = normalizePriceCompetitiveness(1000, 1000);
    expect(score).toBeCloseTo(1.0, 5);
  });

  it("score decays as price deviates from median", () => {
    const atMedian = normalizePriceCompetitiveness(1000, 1000);
    const above = normalizePriceCompetitiveness(1500, 1000);
    const below = normalizePriceCompetitiveness(500, 1000);

    expect(atMedian).toBeGreaterThan(above);
    expect(atMedian).toBeGreaterThan(below);
  });

  it("is symmetric around median (in log space)", () => {
    const double = normalizePriceCompetitiveness(2000, 1000);
    const half = normalizePriceCompetitiveness(500, 1000);

    // Should be approximately equal (symmetric in log space)
    expect(double).toBeCloseTo(half, 2);
  });
});

describe("normalizeRecency", () => {
  it("returns 0.5 for null date", () => {
    expect(normalizeRecency(null)).toBe(0.5);
    expect(normalizeRecency(undefined)).toBe(0.5);
  });

  it("returns 1.0 for future dates", () => {
    const future = new Date(Date.now() + 86400000); // Tomorrow
    expect(normalizeRecency(future)).toBe(1.0);
  });

  it("returns approximately 0.5 after 30 days", () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const score = normalizeRecency(thirtyDaysAgo);
    expect(score).toBeCloseTo(0.5, 1);
  });

  it("returns approximately 0.25 after 60 days", () => {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const score = normalizeRecency(sixtyDaysAgo);
    expect(score).toBeCloseTo(0.25, 1);
  });

  it("newer = higher score", () => {
    const now = new Date();
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    expect(normalizeRecency(now)).toBeGreaterThan(normalizeRecency(weekAgo));
    expect(normalizeRecency(weekAgo)).toBeGreaterThan(
      normalizeRecency(monthAgo),
    );
  });

  it("accepts string dates", () => {
    const dateStr = new Date().toISOString();
    const score = normalizeRecency(dateStr);
    expect(score).toBeGreaterThan(0.9);
  });
});

describe("normalizeDistance", () => {
  const sfCenter = { lat: 37.7749, lng: -122.4194 };

  it("returns 0.5 when center is undefined", () => {
    expect(normalizeDistance(37.7749, -122.4194, undefined)).toBe(0.5);
  });

  it("returns 0.3 for null coordinates", () => {
    expect(normalizeDistance(null, -122.4194, sfCenter)).toBe(0.3);
    expect(normalizeDistance(37.7749, null, sfCenter)).toBe(0.3);
  });

  it("returns 1.0 at center", () => {
    const score = normalizeDistance(37.7749, -122.4194, sfCenter);
    expect(score).toBeCloseTo(1.0, 2);
  });

  it("returns approximately 0.5 at 5km", () => {
    // ~5km north of SF center
    const score = normalizeDistance(37.8199, -122.4194, sfCenter);
    expect(score).toBeCloseTo(0.5, 1);
  });

  it("closer = higher score", () => {
    const atCenter = normalizeDistance(37.7749, -122.4194, sfCenter);
    const nearby = normalizeDistance(37.79, -122.42, sfCenter);
    const far = normalizeDistance(37.9, -122.5, sfCenter);

    expect(atCenter).toBeGreaterThan(nearby);
    expect(nearby).toBeGreaterThan(far);
  });
});

describe("computeMedianPrice", () => {
  it("returns undefined for empty array", () => {
    expect(computeMedianPrice([])).toBeUndefined();
  });

  it("returns undefined when no valid prices", () => {
    expect(
      computeMedianPrice([{ price: null }, { price: undefined }]),
    ).toBeUndefined();
    expect(computeMedianPrice([{ price: 0 }, { price: -100 }])).toBeUndefined();
  });

  it("returns single price for one item", () => {
    expect(computeMedianPrice([{ price: 1000 }])).toBe(1000);
  });

  it("returns median for odd count", () => {
    expect(
      computeMedianPrice([{ price: 100 }, { price: 200 }, { price: 300 }]),
    ).toBe(200);
  });

  it("returns average of middle two for even count", () => {
    expect(
      computeMedianPrice([
        { price: 100 },
        { price: 200 },
        { price: 300 },
        { price: 400 },
      ]),
    ).toBe(250);
  });

  it("ignores null/zero prices", () => {
    expect(
      computeMedianPrice([
        { price: null },
        { price: 100 },
        { price: 0 },
        { price: 200 },
        { price: 300 },
      ]),
    ).toBe(200);
  });
});

describe("getBoundsCenter", () => {
  it("returns center point", () => {
    const bounds = {
      sw: { lat: 37.7, lng: -122.5 },
      ne: { lat: 37.8, lng: -122.4 },
    };

    const center = getBoundsCenter(bounds);

    expect(center.lat).toBeCloseTo(37.75, 5);
    expect(center.lng).toBeCloseTo(-122.45, 5);
  });
});

describe("computeScore", () => {
  const baseListing: RankableListing = {
    id: "test-1",
    price: 1000,
    lat: 37.7749,
    lng: -122.4194,
    recommendedScore: 50,
    avgRating: 4.0,
    reviewCount: 10,
    createdAt: new Date(),
  };

  const baseContext: RankingContext = {
    sort: "recommended",
    center: { lat: 37.7749, lng: -122.4194 },
    localMedianPrice: 1000,
  };

  it("returns value between 0 and 1", () => {
    const score = computeScore(baseListing, baseContext);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("weights sum to 1", () => {
    const sum =
      DEFAULT_WEIGHTS.quality +
      DEFAULT_WEIGHTS.rating +
      DEFAULT_WEIGHTS.price +
      DEFAULT_WEIGHTS.recency +
      DEFAULT_WEIGHTS.geo;
    expect(sum).toBeCloseTo(1.0, 5);
  });

  it("higher quality listing scores higher", () => {
    const lowQuality = computeScore(
      { ...baseListing, recommendedScore: 10 },
      baseContext,
    );
    const highQuality = computeScore(
      { ...baseListing, recommendedScore: 100 },
      baseContext,
    );
    expect(highQuality).toBeGreaterThan(lowQuality);
  });

  it("higher rated listing scores higher", () => {
    const lowRating = computeScore(
      { ...baseListing, avgRating: 2.0 },
      baseContext,
    );
    const highRating = computeScore(
      { ...baseListing, avgRating: 5.0 },
      baseContext,
    );
    expect(highRating).toBeGreaterThan(lowRating);
  });
});

describe("computeSignals", () => {
  const baseListing: RankableListing = {
    id: "test-1",
    price: 1000,
    lat: 37.7749,
    lng: -122.4194,
    recommendedScore: 50,
    avgRating: 4.0,
    reviewCount: 10,
    createdAt: new Date(),
  };

  const baseContext: RankingContext = {
    sort: "recommended",
    center: { lat: 37.7749, lng: -122.4194 },
    localMedianPrice: 1000,
  };

  it("returns all signal values", () => {
    const signals = computeSignals(baseListing, baseContext);

    expect(signals).toHaveProperty("quality");
    expect(signals).toHaveProperty("rating");
    expect(signals).toHaveProperty("price");
    expect(signals).toHaveProperty("recency");
    expect(signals).toHaveProperty("geo");
  });

  it("all signals are between 0 and 1", () => {
    const signals = computeSignals(baseListing, baseContext);

    expect(signals.quality).toBeGreaterThanOrEqual(0);
    expect(signals.quality).toBeLessThanOrEqual(1);
    expect(signals.rating).toBeGreaterThanOrEqual(0);
    expect(signals.rating).toBeLessThanOrEqual(1);
    expect(signals.price).toBeGreaterThanOrEqual(0);
    expect(signals.price).toBeLessThanOrEqual(1);
    expect(signals.recency).toBeGreaterThanOrEqual(0);
    expect(signals.recency).toBeLessThanOrEqual(1);
    expect(signals.geo).toBeGreaterThanOrEqual(0);
    expect(signals.geo).toBeLessThanOrEqual(1);
  });
});
