/**
 * Tests for search ranking functions
 */

import { buildScoreMap, rankListings, getDebugSignals } from "../rank";
import type { RankableListing, RankingContext } from "../types";

const createListing = (
  id: string,
  overrides: Partial<RankableListing> = {},
): RankableListing => ({
  id,
  price: 1000,
  lat: 37.7749,
  lng: -122.4194,
  recommendedScore: 50,
  avgRating: 4.0,
  reviewCount: 10,
  createdAt: new Date(),
  ...overrides,
});

const baseContext: RankingContext = {
  sort: "recommended",
  center: { lat: 37.7749, lng: -122.4194 },
  localMedianPrice: 1000,
};

describe("buildScoreMap", () => {
  it("returns empty map for empty array", () => {
    const scoreMap = buildScoreMap([], baseContext);
    expect(scoreMap.size).toBe(0);
  });

  it("returns map with score for each listing", () => {
    const listings = [
      createListing("a"),
      createListing("b"),
      createListing("c"),
    ];
    const scoreMap = buildScoreMap(listings, baseContext);

    expect(scoreMap.size).toBe(3);
    expect(scoreMap.has("a")).toBe(true);
    expect(scoreMap.has("b")).toBe(true);
    expect(scoreMap.has("c")).toBe(true);
  });

  it("scores are between 0 and 1", () => {
    const listings = [
      createListing("a", { recommendedScore: 10 }),
      createListing("b", { recommendedScore: 100 }),
    ];
    const scoreMap = buildScoreMap(listings, baseContext);

    for (const score of scoreMap.values()) {
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });

  it("higher quality listings get higher scores", () => {
    const listings = [
      createListing("low", { recommendedScore: 10, avgRating: 2.0 }),
      createListing("high", { recommendedScore: 100, avgRating: 5.0 }),
    ];
    const scoreMap = buildScoreMap(listings, baseContext);

    expect(scoreMap.get("high")).toBeGreaterThan(scoreMap.get("low")!);
  });
});

describe("rankListings", () => {
  it("returns empty array for empty input", () => {
    const scoreMap = new Map<string, number>();
    const result = rankListings([], scoreMap);
    expect(result).toEqual([]);
  });

  it("sorts by score descending", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const scoreMap = new Map([
      ["a", 0.3],
      ["b", 0.9],
      ["c", 0.5],
    ]);

    const result = rankListings(items, scoreMap);

    expect(result.map((i) => i.id)).toEqual(["b", "c", "a"]);
  });

  it("uses stable tie-break by id when scores are equal", () => {
    const items = [{ id: "c" }, { id: "a" }, { id: "b" }];
    const scoreMap = new Map([
      ["a", 0.5],
      ["b", 0.5],
      ["c", 0.5],
    ]);

    const result = rankListings(items, scoreMap);

    // When scores are equal, sort by id ascending
    expect(result.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("does not modify original array", () => {
    const items = [{ id: "c" }, { id: "a" }, { id: "b" }];
    const original = [...items];
    const scoreMap = new Map([
      ["a", 0.9],
      ["b", 0.5],
      ["c", 0.1],
    ]);

    rankListings(items, scoreMap);

    expect(items).toEqual(original);
  });

  it("handles missing scores gracefully (treats as 0)", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const scoreMap = new Map([
      ["a", 0.5],
      // b and c have no score
    ]);

    const result = rankListings(items, scoreMap);

    // a has highest score (0.5), b and c have 0, tie-break by id
    expect(result[0].id).toBe("a");
  });

  it("is deterministic - same input produces same output", () => {
    const items = [{ id: "d" }, { id: "a" }, { id: "c" }, { id: "b" }];
    const scoreMap = new Map([
      ["a", 0.5],
      ["b", 0.5],
      ["c", 0.7],
      ["d", 0.3],
    ]);

    const result1 = rankListings(items, scoreMap);
    const result2 = rankListings(items, scoreMap);
    const result3 = rankListings(items, scoreMap);

    expect(result1.map((i) => i.id)).toEqual(result2.map((i) => i.id));
    expect(result2.map((i) => i.id)).toEqual(result3.map((i) => i.id));
  });
});

describe("getDebugSignals", () => {
  const listings = [
    createListing("a", { recommendedScore: 100, avgRating: 5.0 }),
    createListing("b", { recommendedScore: 80, avgRating: 4.5 }),
    createListing("c", { recommendedScore: 60, avgRating: 4.0 }),
    createListing("d", { recommendedScore: 40, avgRating: 3.5 }),
    createListing("e", { recommendedScore: 20, avgRating: 3.0 }),
    createListing("f", { recommendedScore: 10, avgRating: 2.5 }),
  ];

  it("returns debug signals for top listings", () => {
    const scoreMap = buildScoreMap(listings, baseContext);
    const signals = getDebugSignals(listings, scoreMap, baseContext, 3);

    expect(signals.length).toBe(3);
  });

  it("is capped at limit", () => {
    const scoreMap = buildScoreMap(listings, baseContext);
    const signals = getDebugSignals(listings, scoreMap, baseContext, 5);

    expect(signals.length).toBe(5);
  });

  it("returns top-ranked listings first", () => {
    const scoreMap = buildScoreMap(listings, baseContext);
    const signals = getDebugSignals(listings, scoreMap, baseContext, 3);

    // The first signal should be the highest scored listing
    expect(signals[0].id).toBe("a"); // Highest recommendedScore and rating
  });

  it("includes all signal fields", () => {
    const scoreMap = buildScoreMap(listings, baseContext);
    const signals = getDebugSignals(listings, scoreMap, baseContext, 1);

    expect(signals[0]).toHaveProperty("id");
    expect(signals[0]).toHaveProperty("quality");
    expect(signals[0]).toHaveProperty("rating");
    expect(signals[0]).toHaveProperty("price");
    expect(signals[0]).toHaveProperty("recency");
    expect(signals[0]).toHaveProperty("geo");
    expect(signals[0]).toHaveProperty("total");
  });

  it("signal values are between 0 and 1", () => {
    const scoreMap = buildScoreMap(listings, baseContext);
    const signals = getDebugSignals(listings, scoreMap, baseContext, 3);

    for (const signal of signals) {
      expect(signal.quality).toBeGreaterThanOrEqual(0);
      expect(signal.quality).toBeLessThanOrEqual(1);
      expect(signal.rating).toBeGreaterThanOrEqual(0);
      expect(signal.rating).toBeLessThanOrEqual(1);
      expect(signal.price).toBeGreaterThanOrEqual(0);
      expect(signal.price).toBeLessThanOrEqual(1);
      expect(signal.recency).toBeGreaterThanOrEqual(0);
      expect(signal.recency).toBeLessThanOrEqual(1);
      expect(signal.geo).toBeGreaterThanOrEqual(0);
      expect(signal.geo).toBeLessThanOrEqual(1);
      expect(signal.total).toBeGreaterThanOrEqual(0);
      expect(signal.total).toBeLessThanOrEqual(1);
    }
  });

  it("values are rounded to 2 decimal places", () => {
    const scoreMap = buildScoreMap(listings, baseContext);
    const signals = getDebugSignals(listings, scoreMap, baseContext, 1);

    // Check that values don't have more than 2 decimal places
    const checkDecimals = (num: number) => {
      const str = num.toString();
      const decimal = str.split(".")[1];
      return !decimal || decimal.length <= 2;
    };

    expect(checkDecimals(signals[0].quality)).toBe(true);
    expect(checkDecimals(signals[0].rating)).toBe(true);
    expect(checkDecimals(signals[0].price)).toBe(true);
    expect(checkDecimals(signals[0].recency)).toBe(true);
    expect(checkDecimals(signals[0].geo)).toBe(true);
    expect(checkDecimals(signals[0].total)).toBe(true);
  });

  it("only includes listing id, no PII", () => {
    const scoreMap = buildScoreMap(listings, baseContext);
    const signals = getDebugSignals(listings, scoreMap, baseContext, 3);

    for (const signal of signals) {
      // Should only have these keys
      const keys = Object.keys(signal);
      expect(keys).toEqual(
        expect.arrayContaining([
          "id",
          "quality",
          "rating",
          "price",
          "recency",
          "geo",
          "total",
        ]),
      );
      expect(keys.length).toBe(7);
    }
  });
});
