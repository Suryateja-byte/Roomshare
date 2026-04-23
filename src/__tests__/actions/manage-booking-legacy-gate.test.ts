jest.mock("@/lib/booking-audit", () => ({ logBookingAudit: jest.fn() }));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    booking: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    listing: {
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  },
}));

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

jest.mock("@/lib/notifications", () => ({
  createInternalNotification: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock("@/lib/email", () => ({
  sendNotificationEmailWithPreference: jest
    .fn()
    .mockResolvedValue({ success: true }),
}));

jest.mock("@/app/actions/suspension", () => ({
  checkSuspension: jest.fn(),
}));

jest.mock("@/lib/logger", () => ({
  logger: {
    sync: {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
  },
}));

jest.mock("@/lib/rate-limit", () => ({
  checkRateLimit: jest.fn(),
  RATE_LIMITS: {
    bookingStatus: { limit: 30, windowMs: 60 * 1000 },
  },
}));

jest.mock("@/lib/availability", () => ({
  getAvailability: jest.fn(),
  expireOverlappingExpiredHolds: jest.fn().mockResolvedValue(0),
  applyInventoryDeltas: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/search/search-doc-dirty", () => ({
  markListingsDirtyInTx: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/test-barriers", () => ({
  waitForTestBarrier: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/booking-state-machine", () => ({
  validateTransition: jest.fn(),
  isInvalidStateTransitionError: jest.fn(() => false),
}));

jest.mock("@/lib/env", () => ({
  features: {
    bookingRetirementFreeze: false,
  },
}));

jest.mock("@/lib/messaging/cfm-messaging-telemetry", () => ({
  hashIdForLog: jest.fn((id: string) => {
    if (id === "booking-123") return "hash-booking-id";
    if (id === "owner-123") return "hash-owner-id";
    if (id === "tenant-123") return "hash-tenant-id";
    return "hash-generic-id";
  }),
}));

import { updateBookingStatus } from "@/app/actions/manage-booking";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { checkSuspension } from "@/app/actions/suspension";
import { validateTransition } from "@/lib/booking-state-machine";
import { applyInventoryDeltas, getAvailability } from "@/lib/availability";

describe("updateBookingStatus legacy mutations gate (CFM-902)", () => {
  const ownerSession = {
    user: {
      id: "owner-123",
      email: "owner@example.com",
      isAdmin: false,
    },
  };

  const tenantSession = {
    user: {
      id: "tenant-123",
      email: "tenant@example.com",
      isAdmin: false,
    },
  };

  const adminOwnerSession = {
    user: {
      id: "owner-123",
      email: "owner@example.com",
      isAdmin: true,
    },
  };

  const adminTenantSession = {
    user: {
      id: "tenant-123",
      email: "tenant@example.com",
      isAdmin: true,
    },
  };

  const baseBooking = {
    id: "booking-123",
    listingId: "listing-123",
    tenantId: "tenant-123",
    startDate: new Date("2025-02-01T00:00:00.000Z"),
    endDate: new Date("2025-05-01T00:00:00.000Z"),
    totalPrice: 2400,
    status: "PENDING" as const,
    slotsRequested: 1,
    version: 1,
    heldUntil: null,
    listing: {
      id: "listing-123",
      title: "Cozy Room",
      ownerId: "owner-123",
      availableSlots: 2,
      totalSlots: 3,
      availabilitySource: "HOST_MANAGED",
      owner: {
        name: "Owner User",
      },
    },
    tenant: {
      id: "tenant-123",
      name: "Tenant User",
      email: "tenant@example.com",
    },
  };

  function mockAcceptedTransaction() {
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce([
            {
              availableSlots: 2,
              totalSlots: 3,
              id: "listing-123",
              ownerId: "owner-123",
              bookingMode: "SHARED",
              status: "ACTIVE",
            },
          ])
          .mockResolvedValueOnce([{ total: BigInt(0) }]),
        $executeRaw: jest.fn().mockResolvedValue(1),
        booking: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      return callback(tx);
    });
  }

  function mockRejectedTransaction() {
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: jest
          .fn()
          .mockResolvedValue([{ ownerId: "owner-123", status: "ACTIVE" }]),
        booking: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      return callback(tx);
    });
  }

  function mockCancelledTransaction() {
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        booking: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      return callback(tx);
    });
  }

  function expectBlockedMetricLog(options: {
    action: "accept" | "reject" | "cancel" | "other";
    role: "admin" | "non_admin";
    reason: "flag_off" | "admin_bypass";
    userId: string;
    code:
      | "CFM_LEGACY_MUTATION_BLOCKED"
      | "CFM_LEGACY_MUTATION_ADMIN_BYPASS";
  }) {
    expect(logger.sync.info).toHaveBeenCalledWith(
      "cfm.booking.legacy_mutation_blocked_count",
      expect.objectContaining({
        action: options.action,
        role: options.role,
        reason: options.reason,
        bookingIdHash: "hash-booking-id",
        userIdHash:
          options.userId === "owner-123" ? "hash-owner-id" : "hash-tenant-id",
        code: options.code,
      })
    );

    const metricCall = (logger.sync.info as jest.Mock).mock.calls.find(
      ([message]) => message === "cfm.booking.legacy_mutation_blocked_count"
    );

    expect(metricCall).toBeDefined();
    const [, payload] = metricCall as [string, Record<string, string>];
    expect(JSON.stringify(payload)).not.toContain("booking-123");
    expect(JSON.stringify(payload)).not.toContain(options.userId);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue(ownerSession);
    (checkRateLimit as jest.Mock).mockResolvedValue({
      success: true,
      remaining: 29,
      resetAt: new Date(),
    });
    (checkSuspension as jest.Mock).mockResolvedValue({ suspended: false });
    (validateTransition as jest.Mock).mockImplementation(() => {});
    (applyInventoryDeltas as jest.Mock).mockResolvedValue(undefined);
    (getAvailability as jest.Mock).mockResolvedValue({
      listingId: "listing-123",
      totalSlots: 3,
      effectiveAvailableSlots: 3,
      heldSlots: 0,
      acceptedSlots: 0,
      rangeVersion: 1,
      asOf: new Date().toISOString(),
    });
  });

  it.each([
    {
      label: "blocks non-admin host ACCEPTED",
      session: ownerSession,
      status: "ACCEPTED" as const,
      action: "accept" as const,
      userId: "owner-123",
    },
    {
      label: "blocks non-admin host REJECTED",
      session: ownerSession,
      status: "REJECTED" as const,
      action: "reject" as const,
      userId: "owner-123",
    },
    {
      label: "blocks non-admin tenant CANCELLED",
      session: tenantSession,
      status: "CANCELLED" as const,
      action: "cancel" as const,
      userId: "tenant-123",
    },
    {
      label: "blocks non-admin EXPIRED",
      session: ownerSession,
      status: "EXPIRED" as const,
      action: "other" as const,
      userId: "owner-123",
    },
  ])("$label", async ({ session, status, action, userId }) => {
    (auth as jest.Mock).mockResolvedValue(session);

    const result = await updateBookingStatus("booking-123", status);

    expect(result).toEqual({
      success: false,
      error: "Booking actions are disabled.",
      code: "LEGACY_DRAIN_COMPLETE",
    });
    expectBlockedMetricLog({
      action,
      role: "non_admin",
      reason: "flag_off",
      userId,
      code: "CFM_LEGACY_MUTATION_BLOCKED",
    });
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(checkSuspension).not.toHaveBeenCalled();
    expect(prisma.booking.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "allows admin-owner ACCEPTED through",
      session: adminOwnerSession,
      status: "ACCEPTED" as const,
      action: "accept" as const,
      booking: baseBooking,
      setupTransaction: mockAcceptedTransaction,
    },
    {
      label: "allows admin-owner REJECTED through",
      session: adminOwnerSession,
      status: "REJECTED" as const,
      action: "reject" as const,
      booking: baseBooking,
      setupTransaction: mockRejectedTransaction,
    },
    {
      label: "allows admin-tenant CANCELLED through",
      session: adminTenantSession,
      status: "CANCELLED" as const,
      action: "cancel" as const,
      booking: baseBooking,
      setupTransaction: mockCancelledTransaction,
    },
  ])("$label", async ({ session, status, action, booking, setupTransaction }) => {
    (auth as jest.Mock).mockResolvedValue(session);
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(booking);
    setupTransaction();

    const result = await updateBookingStatus("booking-123", status);

    expect(result).toEqual({ success: true });
    expectBlockedMetricLog({
      action,
      role: "admin",
      reason: "admin_bypass",
      userId: session.user.id,
      code: "CFM_LEGACY_MUTATION_ADMIN_BYPASS",
    });
    expect(checkRateLimit).toHaveBeenCalledWith(
      session.user.id,
      "updateBookingStatus",
      { limit: 30, windowMs: 60 * 1000 }
    );
    expect(checkSuspension).toHaveBeenCalled();
    expect(prisma.booking.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "booking-123" } })
    );
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it("lets admin-owner reach the existing EXPIRED guard", async () => {
    (auth as jest.Mock).mockResolvedValue(adminOwnerSession);

    const result = await updateBookingStatus("booking-123", "EXPIRED");

    expect(result).toEqual({
      success: false,
      error: "Cannot manually expire bookings",
      code: "INVALID_TARGET_STATUS",
    });
    expectBlockedMetricLog({
      action: "other",
      role: "admin",
      reason: "admin_bypass",
      userId: "owner-123",
      code: "CFM_LEGACY_MUTATION_ADMIN_BYPASS",
    });
    expect(checkRateLimit).toHaveBeenCalledWith(
      "owner-123",
      "updateBookingStatus",
      { limit: 30, windowMs: 60 * 1000 }
    );
    expect(checkSuspension).toHaveBeenCalled();
    expect(prisma.booking.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
