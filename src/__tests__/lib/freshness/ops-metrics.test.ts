jest.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: jest.fn(),
    $queryRawUnsafe: jest.fn(),
  },
}));

import { getFreshnessOpsMetricsSnapshot } from "@/lib/freshness/ops-metrics";
import { prisma } from "@/lib/prisma";

describe("getFreshnessOpsMetricsSnapshot", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns normalized aggregate counts", async () => {
    (prisma.$queryRaw as jest.Mock)
      .mockResolvedValueOnce([
        {
          normalCount: BigInt(4),
          reminderCount: BigInt(2),
          warningCount: BigInt(1),
          autoPausedCount: BigInt(3),
          staleStillActiveCount: BigInt(2),
        },
      ])
      .mockResolvedValueOnce([{ count: BigInt(6) }]);
    (prisma.$queryRawUnsafe as jest.Mock).mockResolvedValue([{ count: BigInt(0) }]);

    await expect(getFreshnessOpsMetricsSnapshot()).resolves.toEqual({
      freshnessBucketCounts: {
        normal: 4,
        reminder: 2,
        warning: 1,
        auto_paused: 3,
      },
      staleInSearchCount: 0,
      staleStillActiveCount: 2,
      legacyEligibleCount: 0,
    });
  });

  it("uses the shared public-search predicate for stale-in-search tripwires", async () => {
    (prisma.$queryRaw as jest.Mock)
      .mockResolvedValueOnce([
        {
          normalCount: BigInt(0),
          reminderCount: BigInt(0),
          warningCount: BigInt(0),
          autoPausedCount: BigInt(0),
          staleStillActiveCount: BigInt(0),
        },
      ])
      .mockResolvedValueOnce([{ count: BigInt(0) }]);
    (prisma.$queryRawUnsafe as jest.Mock).mockResolvedValue([{ count: BigInt(1) }]);

    await getFreshnessOpsMetricsSnapshot();

    const [query, ...params] = (prisma.$queryRawUnsafe as jest.Mock).mock.calls[0];

    expect(query).toContain(`COALESCE(FALSE, FALSE) = FALSE`);
    expect(query).toContain(`l."statusReason" IS DISTINCT FROM 'MIGRATION_REVIEW'`);
    expect(query).toContain(`'HOST_MANAGED' = 'HOST_MANAGED'`);
    expect(query).toContain(`l."lastConfirmedAt" <= NOW() - make_interval(days => $3)`);
    expect(params).toContain(1);
    expect(params.at(-1)).toBe(21);
  });
});
