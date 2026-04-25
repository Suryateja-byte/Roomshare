import {
  buildPublicUnitCacheKey,
  buildPublicCacheFloorToken,
  isDynamicPublicNavigationPath,
  parsePublicCacheCursorToken,
  shouldBypassServiceWorkerCache,
  signPublicCacheCursor,
} from "@/lib/public-cache/cache-policy";

describe("public cache policy helpers", () => {
  it('returns "none" when no invalidation rows exist', () => {
    expect(buildPublicCacheFloorToken(null)).toBe("none");
  });

  it("builds a stable token from the latest row", () => {
    const first = buildPublicCacheFloorToken({
      id: "cache-row-1",
      enqueuedAt: new Date("2026-04-22T12:00:00.000Z"),
    });
    const second = buildPublicCacheFloorToken({
      id: "cache-row-1",
      enqueuedAt: new Date("2026-04-22T12:00:00.000Z"),
    });
    const newer = buildPublicCacheFloorToken({
      id: "cache-row-2",
      enqueuedAt: new Date("2026-04-22T12:05:00.000Z"),
    });

    expect(first).toBe(second);
    expect(first).toContain("2026-04-22T12:00:00.000Z");
    expect(newer).not.toBe(first);
  });

  it("round-trips signed invalidation cursors without exposing raw row ids", () => {
    const cursor = signPublicCacheCursor({
      id: "cache-row-123",
      enqueuedAt: new Date("2026-04-22T12:00:00.000Z"),
    });

    expect(cursor).toEqual(expect.stringMatching(/^v1\./));
    expect(cursor).not.toContain("cache-row-123");
    expect(parsePublicCacheCursorToken(cursor)).toEqual({
      id: "cache-row-123",
      enqueuedAt: new Date("2026-04-22T12:00:00.000Z"),
    });

    const tampered =
      cursor!.slice(0, -1) + (cursor!.endsWith("x") ? "y" : "x");
    expect(() => parsePublicCacheCursorToken(tampered)).toThrow();
  });

  it("builds stable opaque unit cache keys", () => {
    const first = buildPublicUnitCacheKey("unit-123", 3);
    const second = buildPublicUnitCacheKey("unit-123", 3);
    const nextEpoch = buildPublicUnitCacheKey("unit-123", 4);

    expect(first).toBe(second);
    expect(first).toEqual(expect.stringMatching(/^u1:/));
    expect(first).not.toContain("unit-123");
    expect(nextEpoch).not.toBe(first);
  });

  it("refuses to cache private or no-store responses", () => {
    expect(shouldBypassServiceWorkerCache("private, no-store")).toBe(true);
    expect(shouldBypassServiceWorkerCache("no-store")).toBe(true);
    expect(
      shouldBypassServiceWorkerCache("public, s-maxage=15, stale-while-revalidate=30")
    ).toBe(false);
  });

  it("identifies dynamic public search/detail navigation paths", () => {
    expect(isDynamicPublicNavigationPath("/search")).toBe(true);
    expect(isDynamicPublicNavigationPath("/listings/listing-1")).toBe(true);
    expect(isDynamicPublicNavigationPath("/offline")).toBe(false);
  });
});
