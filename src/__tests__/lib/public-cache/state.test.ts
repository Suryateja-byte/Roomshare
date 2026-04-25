jest.mock("@/lib/prisma", () => ({
  prisma: {
    cacheInvalidation: {
      findFirst: jest.fn(),
    },
  },
}));

jest.mock("@/lib/public-cache/push", () => ({
  getPublicCacheVapidPublicKey: jest.fn(() => null),
}));

import { prisma } from "@/lib/prisma";
import { getPublicCacheStatePayload } from "@/lib/public-cache/state";

const findFirstMock = prisma.cacheInvalidation.findFirst as jest.Mock;

describe("getPublicCacheStatePayload", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns token "none" when no invalidations exist', async () => {
    findFirstMock.mockResolvedValue(null);

    const payload = await getPublicCacheStatePayload();

    expect(payload.cacheFloorToken).toBe("none");
    expect(payload.latestCursor).toBeNull();
    expect(payload.projectionEpochFloor).toBe("1");
    expect(new Date(payload.generatedAt).toISOString()).toBe(payload.generatedAt);
  });

  it("serializes only coarse public cache state and an opaque signed cursor", async () => {
    findFirstMock.mockResolvedValue({
      id: "cache-row-123",
      enqueuedAt: new Date("2026-04-22T16:40:00.000Z"),
    });

    const payload = await getPublicCacheStatePayload();

    expect(payload.cacheFloorToken).toEqual(
      expect.stringContaining("2026-04-22T16:40:00.000Z")
    );
    expect(payload.latestCursor).toEqual(expect.stringMatching(/^v1\./));
    expect(payload.projectionEpochFloor).toBe("1");
    expect(payload.generatedAt).toEqual(expect.any(String));
    expect(payload.cacheFloorToken).not.toContain("cache-row-123");
    expect(payload.latestCursor).not.toContain("cache-row-123");
  });
});
