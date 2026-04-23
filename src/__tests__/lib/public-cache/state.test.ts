jest.mock("@/lib/prisma", () => ({
  prisma: {
    cacheInvalidation: {
      findFirst: jest.fn(),
    },
  },
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
    expect(new Date(payload.generatedAt).toISOString()).toBe(payload.generatedAt);
  });

  it("serializes only the coarse cache-floor token and generatedAt", async () => {
    findFirstMock.mockResolvedValue({
      id: "cache-row-123",
      enqueuedAt: new Date("2026-04-22T16:40:00.000Z"),
    });

    const payload = await getPublicCacheStatePayload();

    expect(payload).toEqual({
      cacheFloorToken: expect.stringContaining("2026-04-22T16:40:00.000Z"),
      generatedAt: expect.any(String),
    });
    expect(payload.cacheFloorToken).not.toContain("cache-row-123");
  });
});
