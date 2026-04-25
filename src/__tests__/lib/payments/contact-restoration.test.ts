jest.mock("@/lib/env", () => ({
  features: {
    get entitlementState() {
      return process.env.ENABLE_ENTITLEMENT_STATE === "true";
    },
    get contactRestorationAutomation() {
      return process.env.ENABLE_CONTACT_RESTORATION_AUTOMATION === "true";
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
  recordBanRestoreApplied: jest.fn(),
  recordContactRestorationApplied: jest.fn(),
  recordContactRestorationReplayIgnored: jest.fn(),
  recordGhostSlaRestoreApplied: jest.fn(),
  recordHostBounceRestoreApplied: jest.fn(),
  recordMassDeactivationRestoreApplied: jest.fn(),
}));

jest.mock("@/lib/prisma", () => {
  const prisma: Record<string, any> = {
    listing: {
      findMany: jest.fn(),
    },
    contactConsumption: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    contactRestoration: {
      create: jest.fn(),
    },
    message: {
      findMany: jest.fn(),
    },
    auditEvent: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((fn: any) => fn(prisma));
  return { prisma };
});

import {
  restoreContactConsumptionBySupport,
  restoreConsumptionsForHostBounce,
  restoreConsumptionsForHostBan,
  runGhostSlaRestoration,
  runMassDeactivationRestoration,
} from "@/lib/payments/contact-restoration";
import { prisma } from "@/lib/prisma";

describe("contact-restoration", () => {
  const originalEntitlementFlag = process.env.ENABLE_ENTITLEMENT_STATE;
  const originalAutomationFlag = process.env.ENABLE_CONTACT_RESTORATION_AUTOMATION;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ENABLE_ENTITLEMENT_STATE = "false";
    process.env.ENABLE_CONTACT_RESTORATION_AUTOMATION = "true";
    (prisma.contactConsumption.updateMany as jest.Mock).mockResolvedValue({
      count: 1,
    });
    (prisma.contactRestoration.create as jest.Mock).mockResolvedValue({
      id: "restoration-1",
    });
    (prisma.auditEvent.create as jest.Mock).mockResolvedValue({
      id: "audit-1",
    });
  });

  afterAll(() => {
    if (originalEntitlementFlag === undefined) {
      delete process.env.ENABLE_ENTITLEMENT_STATE;
    } else {
      process.env.ENABLE_ENTITLEMENT_STATE = originalEntitlementFlag;
    }
    if (originalAutomationFlag === undefined) {
      delete process.env.ENABLE_CONTACT_RESTORATION_AUTOMATION;
    } else {
      process.env.ENABLE_CONTACT_RESTORATION_AUTOMATION =
        originalAutomationFlag;
    }
  });

  it("restores recent contacts when a host bounces", async () => {
    (prisma.contactConsumption.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: "consumption-bounce",
        userId: "renter-1",
        listingId: "listing-1",
        conversationId: "conv-1",
        source: "PACK",
        consumedAt: new Date("2026-04-20T00:00:00.000Z"),
        restorationEligibleUntil: new Date("2026-04-22T00:00:00.000Z"),
      },
    ]);

    const result = await restoreConsumptionsForHostBounce({
      listingId: "listing-1",
      hostUserId: "host-1",
    });

    expect(result).toEqual({ restored: 1 });
    expect(prisma.contactConsumption.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          listingId: { in: ["listing-1"] },
        }),
      })
    );
    expect(prisma.contactRestoration.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        contactConsumptionId: "consumption-bounce",
        userId: "renter-1",
        reason: "HOST_BOUNCE",
      }),
    });
  });

  it("restores a contact exactly once from support", async () => {
    (prisma.contactConsumption.findUnique as jest.Mock).mockResolvedValueOnce({
      id: "consumption-support",
      userId: "renter-1",
      listingId: "listing-1",
      source: "FREE",
      restorationState: "NONE",
    });

    const result = await restoreContactConsumptionBySupport({
      contactConsumptionId: "consumption-support",
      supportActorId: "support-1",
      reasonCode: "manual_review",
    });

    expect(result).toEqual({ restored: 1 });
    expect(prisma.contactRestoration.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        contactConsumptionId: "consumption-support",
        reason: "SUPPORT",
        details: expect.objectContaining({
          supportActorId: "support-1",
          reasonCode: "manual_review",
        }),
      }),
    });
  });

  it("ignores replayed support restoration after the consumption is already restored", async () => {
    (prisma.contactConsumption.findUnique as jest.Mock).mockResolvedValueOnce({
      id: "consumption-support",
      userId: "renter-1",
      listingId: "listing-1",
      source: "FREE",
      restorationState: "RESTORED_SUPPORT",
    });

    const result = await restoreContactConsumptionBySupport({
      contactConsumptionId: "consumption-support",
      supportActorId: "support-1",
    });

    expect(result).toEqual({ restored: 0 });
    expect(prisma.contactRestoration.create).not.toHaveBeenCalled();
  });

  it("restores recent pack/free contacts when a host is banned", async () => {
    (prisma.listing.findMany as jest.Mock).mockResolvedValueOnce([
      { id: "listing-1" },
    ]);
    (prisma.contactConsumption.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: "consumption-1",
        userId: "renter-1",
        listingId: "listing-1",
        conversationId: "conv-1",
        source: "FREE",
        consumedAt: new Date("2026-04-20T00:00:00.000Z"),
        restorationEligibleUntil: new Date("2026-04-22T00:00:00.000Z"),
      },
    ]);

    const result = await restoreConsumptionsForHostBan("host-1");

    expect(result).toEqual({ restored: 1 });
    expect(prisma.contactRestoration.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        contactConsumptionId: "consumption-1",
        userId: "renter-1",
        reason: "HOST_BAN",
      }),
    });
  });

  it("restores contact after the ghost SLA when the host neither replies nor reads", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-04-23T00:00:00.000Z"));
    (prisma.contactConsumption.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: "consumption-ghost",
        userId: "renter-1",
        listingId: "listing-1",
        conversationId: "conv-1",
        source: "PACK",
        consumedAt: new Date("2026-04-20T00:00:00.000Z"),
        restorationEligibleUntil: new Date("2026-04-22T00:00:00.000Z"),
      },
    ]);
    (prisma.listing.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: "listing-1",
        ownerId: "host-1",
        status: "ACTIVE",
        statusReason: null,
        needsMigrationReview: false,
        availabilitySource: "LEGACY_BOOKING",
        availableSlots: 1,
        totalSlots: 1,
        openSlots: 1,
        moveInDate: null,
        availableUntil: null,
        minStayMonths: 1,
        lastConfirmedAt: new Date("2026-04-20T00:00:00.000Z"),
        updatedAt: new Date("2026-04-20T00:00:00.000Z"),
      },
    ]);
    (prisma.message.findMany as jest.Mock).mockResolvedValueOnce([
      {
        conversationId: "conv-1",
        senderId: "renter-1",
        read: false,
        createdAt: new Date("2026-04-20T01:00:00.000Z"),
      },
    ]);

    const result = await runGhostSlaRestoration();

    expect(result).toEqual({ restored: 1 });
    expect(prisma.contactConsumption.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          restorationEligibleUntil: { lte: new Date("2026-04-23T00:00:00.000Z") },
        }),
      })
    );
    expect(prisma.contactRestoration.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        contactConsumptionId: "consumption-ghost",
        reason: "HOST_GHOST_SLA",
      }),
    });
    jest.useRealTimers();
  });

  it("does not restore ghost SLA when the host replied after consumption", async () => {
    (prisma.contactConsumption.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: "consumption-replied",
        userId: "renter-1",
        listingId: "listing-1",
        conversationId: "conv-1",
        source: "PACK",
        consumedAt: new Date("2026-04-20T00:00:00.000Z"),
        restorationEligibleUntil: new Date("2026-04-22T00:00:00.000Z"),
      },
    ]);
    (prisma.listing.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: "listing-1",
        ownerId: "host-1",
        status: "ACTIVE",
        statusReason: null,
        needsMigrationReview: false,
        availabilitySource: "LEGACY_BOOKING",
        availableSlots: 1,
        totalSlots: 1,
        openSlots: 1,
        moveInDate: null,
        availableUntil: null,
        minStayMonths: 1,
        lastConfirmedAt: new Date("2026-04-20T00:00:00.000Z"),
        updatedAt: new Date("2026-04-20T00:00:00.000Z"),
      },
    ]);
    (prisma.message.findMany as jest.Mock).mockResolvedValueOnce([
      {
        conversationId: "conv-1",
        senderId: "host-1",
        read: false,
        createdAt: new Date("2026-04-20T01:00:00.000Z"),
      },
    ]);

    const result = await runGhostSlaRestoration();

    expect(result).toEqual({ restored: 0 });
    expect(prisma.contactRestoration.create).not.toHaveBeenCalled();
  });

  it("does not restore ghost SLA when the host read the renter message", async () => {
    (prisma.contactConsumption.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: "consumption-read",
        userId: "renter-1",
        listingId: "listing-1",
        conversationId: "conv-1",
        source: "FREE",
        consumedAt: new Date("2026-04-20T00:00:00.000Z"),
        restorationEligibleUntil: new Date("2026-04-22T00:00:00.000Z"),
      },
    ]);
    (prisma.listing.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: "listing-1",
        ownerId: "host-1",
        status: "ACTIVE",
        statusReason: null,
        needsMigrationReview: false,
        availabilitySource: "LEGACY_BOOKING",
        availableSlots: 1,
        totalSlots: 1,
        openSlots: 1,
        moveInDate: null,
        availableUntil: null,
        minStayMonths: 1,
        lastConfirmedAt: new Date("2026-04-20T00:00:00.000Z"),
        updatedAt: new Date("2026-04-20T00:00:00.000Z"),
      },
    ]);
    (prisma.message.findMany as jest.Mock).mockResolvedValueOnce([
      {
        conversationId: "conv-1",
        senderId: "renter-1",
        read: true,
        createdAt: new Date("2026-04-20T01:00:00.000Z"),
      },
    ]);

    const result = await runGhostSlaRestoration();

    expect(result).toEqual({ restored: 0 });
    expect(prisma.contactRestoration.create).not.toHaveBeenCalled();
  });

  it("restores contact when the host deactivates all public listings within the window", async () => {
    (prisma.contactConsumption.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: "consumption-mass",
        userId: "renter-1",
        listingId: "listing-1",
        conversationId: "conv-1",
        source: "FREE",
        consumedAt: new Date("2026-04-20T00:00:00.000Z"),
        restorationEligibleUntil: new Date("2026-04-22T00:00:00.000Z"),
      },
    ]);
    (prisma.listing.findMany as jest.Mock)
      .mockResolvedValueOnce([
        {
          id: "listing-1",
          ownerId: "host-1",
          status: "PAUSED",
          statusReason: "ADMIN_PAUSED",
          needsMigrationReview: false,
          availabilitySource: "HOST_MANAGED",
          availableSlots: 0,
          totalSlots: 1,
          openSlots: 0,
          moveInDate: null,
          availableUntil: null,
          minStayMonths: 1,
          lastConfirmedAt: new Date("2026-04-20T00:00:00.000Z"),
          updatedAt: new Date("2026-04-20T12:00:00.000Z"),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "listing-1",
          ownerId: "host-1",
          status: "PAUSED",
          statusReason: "ADMIN_PAUSED",
          needsMigrationReview: false,
          availabilitySource: "HOST_MANAGED",
          availableSlots: 0,
          totalSlots: 1,
          openSlots: 0,
          moveInDate: null,
          availableUntil: null,
          minStayMonths: 1,
          lastConfirmedAt: new Date("2026-04-20T00:00:00.000Z"),
          updatedAt: new Date("2026-04-20T12:00:00.000Z"),
        },
      ]);

    const result = await runMassDeactivationRestoration();

    expect(result).toEqual({ restored: 1 });
    expect(prisma.contactRestoration.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        contactConsumptionId: "consumption-mass",
        reason: "HOST_MASS_DEACTIVATED",
      }),
    });
  });
});
