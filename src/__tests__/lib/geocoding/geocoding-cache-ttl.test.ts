/**
 * Geocoding Cache TTL Tests (F1.2)
 *
 * Verifies that the geocoding cache:
 * - Uses a 24-hour TTL for cached results
 * - Expires entries after TTL elapses
 * - Returns null for expired entries
 * - Supports cache clearing
 */

// Mock Upstash Redis so the cache falls back to in-memory Map
jest.mock("@upstash/redis", () => ({
  Redis: jest.fn(),
}));

import {
  getCachedResults,
  setCachedResults,
  clearCache,
  getCacheSize,
} from "@/lib/geocoding-cache";

describe("geocoding cache TTL", () => {
  beforeEach(() => {
    clearCache();
    jest.restoreAllMocks();
  });

  afterEach(() => {
    clearCache();
  });

  it("geocoding cache uses appropriate TTL (F1.2)", async () => {
    const query = "San Francisco, CA";
    const results = [
      {
        id: "W:12345",
        place_name: "San Francisco, California, United States",
        center: [-122.4194, 37.7749] as [number, number],
        place_type: ["place"],
      },
    ];

    // Store results
    await setCachedResults(query, results);

    // Results should be available immediately
    const cached = await getCachedResults(query);
    expect(cached).toEqual(results);

    // Simulate TTL expiration by advancing time past 24 hours
    const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
    const originalDateNow = Date.now;
    const startTime = Date.now();

    // Advance past TTL
    Date.now = () => startTime + TWENTY_FOUR_HOURS_MS + 1000;

    // Expired entry should return null
    const expired = await getCachedResults(query);
    expect(expired).toBeNull();

    // Restore Date.now
    Date.now = originalDateNow;
  });

  it("returns cached results within TTL window", async () => {
    const query = "Los Angeles, CA";
    const results = [
      {
        id: "W:67890",
        place_name: "Los Angeles, California, United States",
        center: [-118.2437, 34.0522] as [number, number],
        place_type: ["place"],
      },
    ];

    await setCachedResults(query, results);

    // Simulate 23 hours (within TTL)
    const TWENTY_THREE_HOURS_MS = 23 * 60 * 60 * 1000;
    const originalDateNow = Date.now;
    const startTime = Date.now();

    Date.now = () => startTime + TWENTY_THREE_HOURS_MS;

    const cached = await getCachedResults(query);
    expect(cached).toEqual(results);

    Date.now = originalDateNow;
  });

  it("clearCache removes all entries", async () => {
    await setCachedResults("query1", [
      { id: "1", place_name: "Place 1", center: [0, 0], place_type: ["place"] },
    ]);
    await setCachedResults("query2", [
      { id: "2", place_name: "Place 2", center: [1, 1], place_type: ["place"] },
    ]);

    expect(getCacheSize()).toBe(2);

    clearCache();

    expect(getCacheSize()).toBe(0);
    expect(await getCachedResults("query1")).toBeNull();
    expect(await getCachedResults("query2")).toBeNull();
  });

  it("normalizes query case for cache lookup", async () => {
    const results = [
      {
        id: "1",
        place_name: "Test Place",
        center: [0, 0] as [number, number],
        place_type: ["place"],
      },
    ];

    await setCachedResults("San Francisco", results);

    // Same query in different case should hit cache
    const cached = await getCachedResults("san francisco");
    expect(cached).toEqual(results);
  });

  it("keys cached results by cache version", async () => {
    const results = [
      {
        id: "1",
        place_name: "Austin, TX",
        center: [-97.74, 30.27] as [number, number],
        place_type: ["place"],
      },
    ];

    await setCachedResults("Austin", results, {
      cacheVersion: "public:v1:token-a",
      ttlSeconds: 60,
    });

    expect(
      await getCachedResults("Austin", { cacheVersion: "public:v1:token-a" })
    ).toEqual(results);
    expect(
      await getCachedResults("Austin", { cacheVersion: "public:v1:token-b" })
    ).toBeNull();
  });
});
