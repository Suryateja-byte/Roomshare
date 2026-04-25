import {
  buildPublicCacheHeaders,
  buildPublicCacheHeadersForListings,
  PUBLIC_CACHE_HEADERS,
} from "@/lib/public-cache/headers";
import { __setProjectionEpochForTesting } from "@/lib/projections/epoch";

describe("public cache metadata headers", () => {
  afterEach(() => {
    __setProjectionEpochForTesting(null);
  });

  it("adds projection metadata and a weak etag to cacheable responses", () => {
    __setProjectionEpochForTesting(BigInt(8));

    const headers = buildPublicCacheHeaders({
      embeddingVersion: "gemini-embedding-001",
    });

    expect(headers).toMatchObject({
      [PUBLIC_CACHE_HEADERS.projectionEpoch]: "8",
      [PUBLIC_CACHE_HEADERS.embeddingVersion]: "gemini-embedding-001",
      ETag: 'W/"projection-epoch-8-embed-gemini-embedding-001"',
    });
  });

  it("publishes opaque unit cache keys for grouped projection results", () => {
    const headers = buildPublicCacheHeadersForListings({
      listings: [
        {
          id: "listing-1",
          groupKey: "unit-1:2",
        },
        {
          id: "listing-2",
          groupKey: "unit-1:2",
        },
        {
          id: "listing-3",
          groupKey: "unit-2:4",
        },
      ] as never,
      projectionEpoch: "8",
    });

    const unitKeys = headers[PUBLIC_CACHE_HEADERS.unitCacheKeys].split(",");
    expect(unitKeys).toHaveLength(2);
    expect(unitKeys[0]).toMatch(/^u1:/);
    expect(headers[PUBLIC_CACHE_HEADERS.unitCacheKeys]).not.toContain("unit-1");
    expect(headers[PUBLIC_CACHE_HEADERS.unitCacheKeys]).not.toContain("unit-2");
  });
});
