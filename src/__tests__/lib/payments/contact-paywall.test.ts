jest.mock("@/lib/env", () => ({
  features: {
    get contactPaywall() {
      return process.env.ENABLE_CONTACT_PAYWALL === "true";
    },
    get contactPaywallEnforcement() {
      return process.env.ENABLE_CONTACT_PAYWALL_ENFORCEMENT === "true";
    },
    get entitlementState() {
      return process.env.ENABLE_ENTITLEMENT_STATE === "true";
    },
    get emergencyOpenPaywall() {
      return process.env.KILL_SWITCH_EMERGENCY_OPEN_PAYWALL === "true";
    },
  },
}));

jest.mock("@/lib/prisma", () => {
  const mockPrisma: Record<string, any> = {
    physicalUnit: {
      findUnique: jest.fn(),
    },
    contactConsumption: {
      count: jest.fn(),
      groupBy: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    entitlementGrant: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    entitlementState: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    auditEvent: {
      create: jest.fn(),
    },
    fraudAuditJob: {
      create: jest.fn(),
    },
    $executeRaw: jest.fn().mockResolvedValue(undefined),
  };

  return { prisma: mockPrisma };
});

jest.mock("@/lib/payments/telemetry", () => ({
  recordContactConsumptionCreated: jest.fn(),
  recordPaywallBypassMissingUnitId: jest.fn(),
}));

import {
  consumeContactEntitlement,
  consumeMessageStartEntitlement,
  evaluateContactPaywall,
  evaluateMessageStartPaywall,
} from "@/lib/payments/contact-paywall";
import { prisma } from "@/lib/prisma";

describe("contact paywall evaluator", () => {
  const originalPaywall = process.env.ENABLE_CONTACT_PAYWALL;
  const originalEnforcement = process.env.ENABLE_CONTACT_PAYWALL_ENFORCEMENT;
  const originalEmergency = process.env.KILL_SWITCH_EMERGENCY_OPEN_PAYWALL;
  const originalEntitlementState = process.env.ENABLE_ENTITLEMENT_STATE;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ENABLE_CONTACT_PAYWALL = "true";
    process.env.ENABLE_CONTACT_PAYWALL_ENFORCEMENT = "true";
    process.env.ENABLE_ENTITLEMENT_STATE = "false";
    process.env.KILL_SWITCH_EMERGENCY_OPEN_PAYWALL = "false";
    (prisma.physicalUnit.findUnique as jest.Mock).mockResolvedValue({
      id: "unit-123",
      unitIdentityEpoch: 4,
    });
    (prisma.contactConsumption.count as jest.Mock).mockResolvedValue(0);
    (prisma.contactConsumption.groupBy as jest.Mock).mockResolvedValue([]);
    (prisma.contactConsumption.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.contactConsumption.create as jest.Mock).mockResolvedValue({
      id: "consumption-123",
    });
    (prisma.auditEvent.create as jest.Mock).mockResolvedValue({
      id: "audit-123",
    });
    (prisma.fraudAuditJob.create as jest.Mock).mockResolvedValue({
      id: "fraud-audit-123",
    });
    (prisma.entitlementGrant.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.entitlementGrant.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.entitlementState.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.entitlementState.upsert as jest.Mock).mockResolvedValue(undefined);
  });

  afterAll(() => {
    if (originalPaywall === undefined) {
      delete process.env.ENABLE_CONTACT_PAYWALL;
    } else {
      process.env.ENABLE_CONTACT_PAYWALL = originalPaywall;
    }
    if (originalEnforcement === undefined) {
      delete process.env.ENABLE_CONTACT_PAYWALL_ENFORCEMENT;
    } else {
      process.env.ENABLE_CONTACT_PAYWALL_ENFORCEMENT = originalEnforcement;
    }
    if (originalEmergency === undefined) {
      delete process.env.KILL_SWITCH_EMERGENCY_OPEN_PAYWALL;
    } else {
      process.env.KILL_SWITCH_EMERGENCY_OPEN_PAYWALL = originalEmergency;
    }
    if (originalEntitlementState === undefined) {
      delete process.env.ENABLE_ENTITLEMENT_STATE;
    } else {
      process.env.ENABLE_ENTITLEMENT_STATE = originalEntitlementState;
    }
  });

  it("returns migration bypass when physicalUnitId is missing", async () => {
    const result = await evaluateMessageStartPaywall({
      userId: "user-123",
      physicalUnitId: null,
    });

    expect(result.summary.mode).toBe("MIGRATION_BYPASS");
    expect(result.summary.requiresPurchase).toBe(false);
    expect(result.unitId).toBeNull();
    expect(result.unitIdentityEpoch).toBeNull();
  });

  it("returns PASS_ACTIVE when an active pass exists", async () => {
    (prisma.entitlementGrant.findFirst as jest.Mock).mockResolvedValue({
      id: "grant-pass",
      activeUntil: new Date("2026-06-01T00:00:00.000Z"),
    });

    const result = await evaluateMessageStartPaywall({
      userId: "user-123",
      physicalUnitId: "unit-123",
    });

    expect(result.summary.mode).toBe("PASS_ACTIVE");
    expect(result.summary.requiresPurchase).toBe(false);
    expect(result.summary.activePassExpiresAt).toBe(
      "2026-06-01T00:00:00.000Z"
    );
  });

  it("returns PAYWALL_REQUIRED after free contacts are exhausted with no pack or pass", async () => {
    (prisma.contactConsumption.count as jest.Mock).mockResolvedValue(2);

    const result = await evaluateMessageStartPaywall({
      userId: "user-123",
      physicalUnitId: "unit-123",
    });

    expect(result.summary.mode).toBe("PAYWALL_REQUIRED");
    expect(result.summary.requiresPurchase).toBe(true);
    expect(result.summary.freeContactsRemaining).toBe(0);
  });

  it("evaluates REVEAL_PHONE independently from MESSAGE_START", async () => {
    await evaluateContactPaywall({
      userId: "user-123",
      physicalUnitId: "unit-123",
      contactKind: "REVEAL_PHONE",
    });

    expect(prisma.contactConsumption.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        contactKind: "REVEAL_PHONE",
        source: "FREE",
      }),
    });
    expect(prisma.entitlementGrant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          contactKind: "REVEAL_PHONE",
          grantType: "PASS",
        }),
      })
    );
  });

  it("reads entitlement state with the requested contact kind", async () => {
    process.env.ENABLE_ENTITLEMENT_STATE = "true";
    (prisma.entitlementState.findUnique as jest.Mock).mockResolvedValue({
      userId: "user-123",
      contactKind: "REVEAL_PHONE",
      creditsFreeRemaining: 0,
      creditsPaidRemaining: 1,
      activePassWindowStart: null,
      activePassWindowEnd: null,
      freezeReason: "NONE",
      fraudFlag: false,
      sourceVersion: BigInt(2),
      lastRecomputedAt: new Date(),
    });

    const result = await evaluateContactPaywall({
      userId: "user-123",
      physicalUnitId: "unit-123",
      contactKind: "REVEAL_PHONE",
    });

    expect(result.summary.requiresPurchase).toBe(false);
    expect(prisma.entitlementState.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_contactKind: {
            userId: "user-123",
            contactKind: "REVEAL_PHONE",
          },
        },
      })
    );
  });

  it("does not consume twice for the same unit identity", async () => {
    (prisma.contactConsumption.findUnique as jest.Mock).mockResolvedValue({
      id: "consumption-existing",
    });

    const result = await consumeMessageStartEntitlement(prisma as any, {
      userId: "user-123",
      listingId: "listing-123",
      physicalUnitId: "unit-123",
    });

    expect(result).toMatchObject({
      ok: true,
      source: "EXISTING_CONSUMPTION",
      consumptionId: "consumption-existing",
    });
    expect(prisma.contactConsumption.create).not.toHaveBeenCalled();
  });

  it("records an emergency-open audit instead of consuming a credit", async () => {
    process.env.KILL_SWITCH_EMERGENCY_OPEN_PAYWALL = "true";

    const result = await consumeContactEntitlement(prisma as any, {
      userId: "user-123",
      listingId: "listing-123",
      physicalUnitId: "unit-123",
      clientIdempotencyKey: "idem-emergency",
      contactKind: "REVEAL_PHONE",
    });

    expect(result).toMatchObject({
      ok: true,
      source: "EMERGENCY_OPEN",
      consumptionId: null,
    });
    expect(prisma.contactConsumption.create).not.toHaveBeenCalled();
    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: "EMERGENCY_GRANT",
        aggregateType: "contact_consumption",
      }),
      select: { id: true },
    });
    expect(prisma.fraudAuditJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "SCHEDULED",
        reason: "fraud_audit_after_emergency_open_paywall",
      }),
    });
  });

  it("emergency-open bypasses entitlement state outages after unit resolution", async () => {
    process.env.ENABLE_ENTITLEMENT_STATE = "true";
    process.env.KILL_SWITCH_EMERGENCY_OPEN_PAYWALL = "true";
    (prisma.entitlementState.upsert as jest.Mock).mockRejectedValueOnce(
      new Error("state projection unavailable")
    );

    const result = await consumeContactEntitlement(prisma as any, {
      userId: "user-123",
      listingId: "listing-123",
      physicalUnitId: "unit-123",
      clientIdempotencyKey: "idem-emergency-state-down",
      contactKind: "MESSAGE_START",
    });

    expect(result).toMatchObject({
      ok: true,
      source: "EMERGENCY_OPEN",
      consumptionId: null,
      unitId: "unit-123",
      unitIdentityEpoch: 4,
    });
    expect(prisma.entitlementState.upsert).not.toHaveBeenCalled();
    expect(prisma.contactConsumption.create).not.toHaveBeenCalled();
    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: "EMERGENCY_GRANT",
        aggregateType: "contact_consumption",
      }),
      select: { id: true },
    });
    expect(prisma.fraudAuditJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "SCHEDULED",
        reason: "fraud_audit_after_emergency_open_paywall",
      }),
    });
  });

  it("emergency-open does not bypass missing unit identity", async () => {
    process.env.KILL_SWITCH_EMERGENCY_OPEN_PAYWALL = "true";

    const result = await consumeContactEntitlement(prisma as any, {
      userId: "user-123",
      listingId: "listing-123",
      physicalUnitId: null,
      clientIdempotencyKey: "idem-missing-unit",
      contactKind: "MESSAGE_START",
    });

    expect(result).toMatchObject({
      ok: true,
      source: "MIGRATION_BYPASS",
      consumptionId: null,
      unitId: null,
      unitIdentityEpoch: null,
    });
    expect(prisma.auditEvent.create).not.toHaveBeenCalled();
    expect(prisma.fraudAuditJob.create).not.toHaveBeenCalled();
    expect(prisma.contactConsumption.create).not.toHaveBeenCalled();
  });
});
