jest.mock("@/lib/prisma", () => ({
  prisma: {
    entitlementGrant: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

import {
  evaluateSavedSearchAlertPaywall,
  getUsersWithUnlockedSearchAlerts,
  resolveSavedSearchEffectiveAlertState,
} from "@/lib/payments/search-alert-paywall";
import { prisma } from "@/lib/prisma";

describe("search-alert-paywall", () => {
  const originalFlag = process.env.ENABLE_SEARCH_ALERT_PAYWALL;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ENABLE_SEARCH_ALERT_PAYWALL = "true";
  });

  afterAll(() => {
    process.env.ENABLE_SEARCH_ALERT_PAYWALL = originalFlag;
  });

  it("returns PASS_ACTIVE only for an active mover's pass", async () => {
    (prisma.entitlementGrant.findFirst as jest.Mock).mockResolvedValue({
      activeUntil: new Date("2026-05-22T00:00:00.000Z"),
    });

    const result = await evaluateSavedSearchAlertPaywall({
      userId: "user-123",
    });

    expect(result).toMatchObject({
      enabled: true,
      mode: "PASS_ACTIVE",
      requiresPurchase: false,
      offers: [
        expect.objectContaining({
          productCode: "MOVERS_PASS_30D",
        }),
      ],
    });
  });

  it("returns PAYWALL_REQUIRED when no active pass exists", async () => {
    (prisma.entitlementGrant.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await evaluateSavedSearchAlertPaywall({
      userId: "user-123",
    });

    expect(result).toMatchObject({
      enabled: true,
      mode: "PAYWALL_REQUIRED",
      requiresPurchase: true,
    });
  });

  it("treats the feature as open when the alerts paywall flag is disabled", async () => {
    process.env.ENABLE_SEARCH_ALERT_PAYWALL = "false";

    const result = await evaluateSavedSearchAlertPaywall({
      userId: "user-123",
    });

    expect(result).toMatchObject({
      enabled: false,
      mode: "PASS_ACTIVE",
      requiresPurchase: false,
    });
    expect(prisma.entitlementGrant.findFirst).not.toHaveBeenCalled();
  });

  it("marks users as unlocked only when they have an active pass", async () => {
    (prisma.entitlementGrant.findMany as jest.Mock).mockResolvedValue([
      { userId: "user-123" },
    ]);

    const result = await getUsersWithUnlockedSearchAlerts([
      "user-123",
      "user-456",
    ]);

    expect(result.has("user-123")).toBe(true);
    expect(result.has("user-456")).toBe(false);
  });

  it("derives DISABLED, ACTIVE, and LOCKED alert states from paywall state", () => {
    expect(
      resolveSavedSearchEffectiveAlertState({
        alertEnabled: false,
        paywallSummary: { enabled: true, requiresPurchase: true },
      })
    ).toBe("DISABLED");

    expect(
      resolveSavedSearchEffectiveAlertState({
        alertEnabled: true,
        paywallSummary: { enabled: true, requiresPurchase: false },
      })
    ).toBe("ACTIVE");

    expect(
      resolveSavedSearchEffectiveAlertState({
        alertEnabled: true,
        paywallSummary: { enabled: true, requiresPurchase: true },
      })
    ).toBe("LOCKED");
  });
});
