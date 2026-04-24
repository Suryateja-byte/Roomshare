import { NextResponse } from "next/server";

jest.mock("@/lib/env", () => ({
  features: {
    publicCacheCoherence: true,
  },
}));

jest.mock("@/lib/public-cache/events", () => ({
  listPublicCacheInvalidationEventsAfter: jest.fn(),
}));

jest.mock("@/lib/public-cache/state", () => ({
  getPublicCacheStatePayload: jest.fn(),
}));

jest.mock("@/lib/with-rate-limit", () => ({
  withRateLimit: jest.fn(),
}));

import { GET } from "@/app/api/public-cache/events/route";
import { features } from "@/lib/env";
import { PublicCacheCursorError } from "@/lib/public-cache/cache-policy";
import { listPublicCacheInvalidationEventsAfter } from "@/lib/public-cache/events";
import { getPublicCacheStatePayload } from "@/lib/public-cache/state";
import { withRateLimit } from "@/lib/with-rate-limit";

const listEventsMock = listPublicCacheInvalidationEventsAfter as jest.Mock;
const getStateMock = getPublicCacheStatePayload as jest.Mock;
const withRateLimitMock = withRateLimit as jest.Mock;
const mockFeatures = features as { publicCacheCoherence: boolean };

describe("GET /api/public-cache/events", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFeatures.publicCacheCoherence = true;
    withRateLimitMock.mockResolvedValue(null);
    getStateMock.mockResolvedValue({
      cacheFloorToken: "token-2",
      latestCursor: "cursor-2",
      projectionEpochFloor: "8",
      generatedAt: "2026-04-22T17:00:01.000Z",
    });
    listEventsMock.mockResolvedValue([
      {
        type: "public-cache.invalidate",
        cursor: "cursor-2",
        cacheFloorToken: "token-2",
        unitCacheKey: "u1:opaque",
        projectionEpoch: "8",
        unitIdentityEpoch: 2,
        reason: "TOMBSTONE",
        enqueuedAt: "2026-04-22T17:00:00.000Z",
        emittedAt: "2026-04-22T17:00:01.000Z",
      },
    ]);
  });

  it("streams invalidation events after a signed cursor with no-store headers", async () => {
    const response = await GET(
      new Request("https://roomshare.app/api/public-cache/events?cursor=cursor-1")
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/event-stream");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(listEventsMock).toHaveBeenCalledWith("cursor-1", 50);
    expect(body).toContain("event: public-cache.invalidate");
    expect(body).toContain('"unitCacheKey":"u1:opaque"');
    expect(body).toContain("event: public-cache.state");
  });

  it("returns only state when cache coherence is disabled", async () => {
    mockFeatures.publicCacheCoherence = false;

    const response = await GET(
      new Request("https://roomshare.app/api/public-cache/events?cursor=cursor-1")
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(listEventsMock).not.toHaveBeenCalled();
    expect(body).not.toContain("event: public-cache.invalidate");
    expect(body).toContain("event: public-cache.state");
  });

  it("returns a structured no-store error for malformed cursors", async () => {
    listEventsMock.mockRejectedValueOnce(new PublicCacheCursorError());

    const response = await GET(
      new Request("https://roomshare.app/api/public-cache/events?cursor=bad")
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ error: "invalid_cursor" });
  });

  it("preserves no-store on rate-limited responses", async () => {
    withRateLimitMock.mockResolvedValueOnce(
      NextResponse.json({ error: "Too many requests" }, { status: 429 })
    );

    const response = await GET(
      new Request("https://roomshare.app/api/public-cache/events")
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(listEventsMock).not.toHaveBeenCalled();
  });
});
