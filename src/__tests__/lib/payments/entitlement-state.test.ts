jest.mock("@/lib/env", () => ({
  features: {
    get entitlementState() {
      return process.env.ENABLE_ENTITLEMENT_STATE === "true";
    },
  },
}));

jest.mock("@/lib/logger", () => ({
  logger: {
    sync: {
      error: jest.fn(),
    },
  },
  sanitizeErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : String(error),
}));

jest.mock("@/lib/payments/telemetry", () => ({
  recordEntitlementStateRebuild: jest.fn(),
  recordEntitlementStateShadowMismatch: jest.fn(),
}));

jest.mock("@/lib/prisma", () => {
  const prisma: Record<string, any> = {
    entitlementState: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    entitlementGrant: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    contactConsumption: {
      count: jest.fn(),
      groupBy: jest.fn(),
    },
  };

  return { prisma };
});

import {
  buildEntitlementStateSnapshot,
  getFreshEntitlementState,
  recomputeEntitlementState,
} from "@/lib/payments/entitlement-state";
import { prisma } from "@/lib/prisma";

describe("entitlement-state", () => {
  const originalFlag = process.env.ENABLE_ENTITLEMENT_STATE;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ENABLE_ENTITLEMENT_STATE = "true";

    (prisma.contactConsumption.count as jest.Mock).mockResolvedValue(1);
    (prisma.contactConsumption.groupBy as jest.Mock).mockResolvedValue([
      { entitlementGrantId: "grant-pack-1", _count: { _all: 2 } },
    ]);
    (prisma.entitlementGrant.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.entitlementGrant.findMany as jest.Mock)
      .mockResolvedValueOnce([
        { id: "grant-pack-1", creditCount: 3 },
        { id: "grant-pack-2", creditCount: 2 },
      ])
      .mockResolvedValueOnce([
        {
          activeFrom: new Date("2026-04-01T00:00:00.000Z"),
          activeUntil: new Date("2026-05-01T00:00:00.000Z"),
        },
        {
          activeFrom: new Date("2026-05-01T00:00:00.000Z"),
          activeUntil: new Date("2026-05-31T00:00:00.000Z"),
        },
      ]);
    (prisma.entitlementState.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.entitlementState.upsert as jest.Mock).mockResolvedValue(undefined);
  });

  afterAll(() => {
    if (originalFlag === undefined) {
      delete process.env.ENABLE_ENTITLEMENT_STATE;
    } else {
      process.env.ENABLE_ENTITLEMENT_STATE = originalFlag;
    }
  });

  it("recomputes free credits, pack credits, and a stacked active pass window", async () => {
    const now = new Date("2026-04-22T00:00:00.000Z");

    const snapshot = await buildEntitlementStateSnapshot(
      prisma as any,
      "user-123",
      now
    );

    expect(snapshot.creditsFreeRemaining).toBe(1);
    expect(snapshot.creditsPaidRemaining).toBe(3);
    expect(snapshot.activePassWindowStart?.toISOString()).toBe(
      "2026-04-01T00:00:00.000Z"
    );
    expect(snapshot.activePassWindowEnd?.toISOString()).toBe(
      "2026-05-31T00:00:00.000Z"
    );
    expect(snapshot.freezeReason).toBe("NONE");
  });

  it("rebuilds missing state and increments sourceVersion", async () => {
    (prisma.entitlementState.findUnique as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        creditsFreeRemaining: 2,
        creditsPaidRemaining: 0,
        activePassWindowStart: null,
        activePassWindowEnd: null,
        freezeReason: "NONE",
        fraudFlag: false,
        sourceVersion: BigInt(7),
      });
    (prisma.entitlementGrant.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    (prisma.contactConsumption.count as jest.Mock).mockResolvedValue(0);
    (prisma.contactConsumption.groupBy as jest.Mock).mockResolvedValue([]);

    const result = await getFreshEntitlementState(prisma as any, "user-123");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rebuilt).toBe(true);
      expect(result.state.sourceVersion).toBe(BigInt(8));
      expect(prisma.entitlementState.upsert).toHaveBeenCalled();
    }
  });

  it("fails closed when rebuild throws", async () => {
    (prisma.entitlementState.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.entitlementGrant.findMany as jest.Mock).mockReset();
    (prisma.entitlementGrant.findMany as jest.Mock).mockRejectedValue(
      new Error("db unavailable")
    );

    const result = await getFreshEntitlementState(prisma as any, "user-123");

    expect(result).toEqual({
      ok: false,
      code: "PAYWALL_UNAVAILABLE",
    });
  });

  it("increments sourceVersion during explicit recompute", async () => {
    (prisma.entitlementState.findUnique as jest.Mock).mockResolvedValue({
      creditsFreeRemaining: 2,
      creditsPaidRemaining: 0,
      activePassWindowStart: null,
      activePassWindowEnd: null,
      freezeReason: "NONE",
      fraudFlag: false,
      sourceVersion: BigInt(3),
    });
    (prisma.entitlementGrant.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    (prisma.contactConsumption.count as jest.Mock).mockResolvedValue(0);
    (prisma.contactConsumption.groupBy as jest.Mock).mockResolvedValue([]);

    const snapshot = await recomputeEntitlementState(prisma as any, "user-123");

    expect(snapshot.sourceVersion).toBe(BigInt(4));
    expect(prisma.entitlementState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-123" },
        update: expect.objectContaining({
          sourceVersion: BigInt(4),
        }),
      })
    );
  });
});
