import { NextResponse } from "next/server";

jest.mock("@/lib/public-cache/state", () => ({
  getPublicCacheStatePayload: jest.fn(),
}));

jest.mock("@/lib/with-rate-limit", () => ({
  withRateLimit: jest.fn(),
}));

import { getPublicCacheStatePayload } from "@/lib/public-cache/state";
import { withRateLimit } from "@/lib/with-rate-limit";

const getPublicCacheStatePayloadMock = getPublicCacheStatePayload as jest.Mock;
const withRateLimitMock = withRateLimit as jest.Mock;

describe("GET /api/public-cache/state", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    withRateLimitMock.mockResolvedValue(null);
    getPublicCacheStatePayloadMock.mockResolvedValue({
      cacheFloorToken: "v1:2026-04-22T17:00:00.000Z:abc123",
      latestCursor: "cursor-1",
      projectionEpochFloor: "8",
      generatedAt: "2026-04-22T17:00:01.000Z",
    });
  });

  it("returns the public cache state with no-store caching", async () => {
    const { GET } = await import("@/app/api/public-cache/state/route");

    const response = await GET(
      new Request("https://roomshare.app/api/public-cache/state")
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(getPublicCacheStatePayloadMock).toHaveBeenCalledTimes(1);
  });

  it("preserves no-store on rate-limited responses", async () => {
    withRateLimitMock.mockResolvedValue(
      NextResponse.json(
        { error: "Too many requests" },
        { status: 429 }
      )
    );

    const { GET } = await import("@/app/api/public-cache/state/route");
    const response = await GET(
      new Request("https://roomshare.app/api/public-cache/state")
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(getPublicCacheStatePayloadMock).not.toHaveBeenCalled();
  });
});
