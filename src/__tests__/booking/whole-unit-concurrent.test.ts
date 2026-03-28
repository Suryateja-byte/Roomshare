/**
 * CONCURRENCY NOTE: These tests verify application-layer error handling
 * when an overlap condition is detected. They do NOT prove atomicity under
 * true concurrent load. DB-level race safety is enforced by:
 *   1. FOR UPDATE lock on the Listing row
 *   2. The check_whole_unit_overlap() trigger (migration SQL)
 * Those require integration tests against a real PostgreSQL instance.
 * See: prisma/migrations/20260310100000_phase3_whole_unit_booking_mode/migration.sql
 */

// Mock @prisma/client FIRST to avoid SWC binary loading issues in WSL2
jest.mock("@prisma/client", () => ({
  Prisma: {
    TransactionIsolationLevel: {
      Serializable: "Serializable",
      ReadCommitted: "ReadCommitted",
      RepeatableRead: "RepeatableRead",
      ReadUncommitted: "ReadUncommitted",
    },
  },
}));

// Mock dependencies before imports
jest.mock("@/lib/prisma", () => ({
  prisma: {
    listing: {
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    booking: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
    },
    idempotencyKey: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
  },
}));

jest.mock("@/lib/rate-limit", () => ({
  checkRateLimit: jest
    .fn()
    .mockResolvedValue({ success: true, remaining: 9, resetAt: new Date() }),
  getClientIPFromHeaders: jest.fn().mockReturnValue("127.0.0.1"),
  RATE_LIMITS: {
    bookingStatus: { maxRequests: 10, windowMs: 60000 },
    createBooking: { limit: 10, windowMs: 3600000 },
    createBookingByIp: { limit: 30, windowMs: 3600000 },
  },
}));

jest.mock("next/headers", () => ({
  headers: jest.fn().mockResolvedValue(new Headers()),
}));

jest.mock("@/lib/booking-state-machine", () => ({
  validateTransition: jest.fn(),
  isInvalidStateTransitionError: jest.fn().mockReturnValue(false),
}));

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

jest.mock("@/lib/notifications", () => ({
  createInternalNotification: jest.fn(),
}));

jest.mock("@/lib/email", () => ({
  sendNotificationEmailWithPreference: jest.fn(),
}));

jest.mock("@/app/actions/block", () => ({
  checkBlockBeforeAction: jest.fn().mockResolvedValue({ allowed: true }),
}));

jest.mock("@/app/actions/suspension", () => ({
  checkSuspension: jest.fn().mockResolvedValue({ suspended: false }),
  checkEmailVerified: jest.fn().mockResolvedValue({ verified: true }),
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

import { updateBookingStatus } from "@/app/actions/manage-booking";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { createInternalNotification } from "@/lib/notifications";
import { sendNotificationEmailWithPreference } from "@/lib/email";

describe("WHOLE_UNIT concurrent race conditions (Phase 3)", () => {
  const ownerSession = {
    user: { id: "owner-456", email: "owner@example.com" },
  };

  const mockWholeUnitListing = {
    id: "listing-wu",
    title: "Whole Unit Apartment",
    ownerId: "owner-456",
    availableSlots: 4,
    totalSlots: 4,
    owner: { name: "Owner Name" },
  };

  const mockTenant = {
    id: "tenant-123",
    name: "Tenant Name",
    email: "tenant@example.com",
  };

  // Two overlapping WHOLE_UNIT bookings
  const overlappingBookingA = {
    id: "booking-wu-a",
    listingId: "listing-wu",
    tenantId: "tenant-123",
    status: "PENDING",
    slotsRequested: 4, // Correctly set at creation
    version: 1,
    startDate: new Date("2026-06-01"),
    endDate: new Date("2026-09-01"),
    totalPrice: 2400,
    listing: mockWholeUnitListing,
    tenant: mockTenant,
  };

  const overlappingBookingB = {
    id: "booking-wu-b",
    listingId: "listing-wu",
    tenantId: "tenant-456",
    status: "PENDING",
    slotsRequested: 4,
    version: 1,
    startDate: new Date("2026-07-01"), // Overlaps with A (June-Sept)
    endDate: new Date("2026-10-01"),
    totalPrice: 2400,
    listing: mockWholeUnitListing,
    tenant: {
      id: "tenant-456",
      name: "Tenant Two",
      email: "tenant2@example.com",
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue(ownerSession);
    // Mock user.findUnique for suspension check
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "owner-456",
      isSuspended: false,
      emailVerified: new Date(),
    });
    (createInternalNotification as jest.Mock).mockResolvedValue({
      success: true,
    });
    (sendNotificationEmailWithPreference as jest.Mock).mockResolvedValue({
      success: true,
    });
  });

  describe("double-accept race — overlapping WHOLE_UNIT bookings", () => {
    it("first accept succeeds, second fails with CAPACITY_EXCEEDED", async () => {
      // --- First ACCEPT: booking A ---
      (prisma.booking.findUnique as jest.Mock).mockResolvedValue(
        overlappingBookingA
      );

      (prisma.$transaction as jest.Mock).mockImplementationOnce(
        async (callback: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            $queryRaw: jest
              .fn()
              .mockResolvedValueOnce([
                {
                  availableSlots: 4,
                  totalSlots: 4,
                  id: "listing-wu",
                  ownerId: "owner-456",
                  bookingMode: "WHOLE_UNIT",
                  status: "ACTIVE",
                },
              ])
              .mockResolvedValueOnce([{ total: BigInt(0) }]), // No prior accepted bookings
            $executeRaw: jest.fn().mockResolvedValue(1),
            booking: {
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            bookingAuditLog: { create: jest.fn().mockResolvedValue({}) },
          };
          return callback(tx);
        }
      );

      const result1 = await updateBookingStatus("booking-wu-a", "ACCEPTED");
      expect(result1.success).toBe(true);

      // --- Second ACCEPT: booking B (overlapping dates) ---
      (prisma.booking.findUnique as jest.Mock).mockResolvedValue(
        overlappingBookingB
      );

      (prisma.$transaction as jest.Mock).mockImplementationOnce(
        async (callback: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            $queryRaw: jest
              .fn()
              .mockResolvedValueOnce([
                // After first accept: availableSlots decremented to 0
                {
                  availableSlots: 0,
                  totalSlots: 4,
                  id: "listing-wu",
                  ownerId: "owner-456",
                  bookingMode: "WHOLE_UNIT",
                  status: "ACTIVE",
                },
              ])
              .mockResolvedValueOnce([{ total: BigInt(4) }]), // 4 slots used by booking A
            bookingAuditLog: { create: jest.fn().mockResolvedValue({}) },
          };
          return callback(tx);
        }
      );

      const result2 = await updateBookingStatus("booking-wu-b", "ACCEPTED");
      expect(result2.success).toBeUndefined();
      // WHOLE_UNIT: slotsNeeded = totalSlots = 4, availableSlots = 0 → NO_SLOTS_AVAILABLE
      expect(result2.error).toBe("No available slots for this listing");
    });
  });

  describe("serial non-overlapping accepts", () => {
    it("both succeed when date ranges do not overlap", async () => {
      const nonOverlappingBookingA = {
        ...overlappingBookingA,
        startDate: new Date("2026-06-01"),
        endDate: new Date("2026-08-31"),
      };

      const nonOverlappingBookingB = {
        ...overlappingBookingB,
        id: "booking-wu-c",
        startDate: new Date("2026-10-01"), // Well after A ends
        endDate: new Date("2026-12-31"),
      };

      // --- First ACCEPT ---
      (prisma.booking.findUnique as jest.Mock).mockResolvedValue(
        nonOverlappingBookingA
      );

      (prisma.$transaction as jest.Mock).mockImplementationOnce(
        async (callback: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            $queryRaw: jest
              .fn()
              .mockResolvedValueOnce([
                {
                  availableSlots: 4,
                  totalSlots: 4,
                  id: "listing-wu",
                  ownerId: "owner-456",
                  bookingMode: "WHOLE_UNIT",
                  status: "ACTIVE",
                },
              ])
              .mockResolvedValueOnce([{ total: BigInt(0) }]),
            $executeRaw: jest.fn().mockResolvedValue(1),
            booking: {
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            bookingAuditLog: { create: jest.fn().mockResolvedValue({}) },
          };
          return callback(tx);
        }
      );

      const result1 = await updateBookingStatus("booking-wu-a", "ACCEPTED");
      expect(result1.success).toBe(true);

      // --- Second ACCEPT (non-overlapping) ---
      (prisma.booking.findUnique as jest.Mock).mockResolvedValue(
        nonOverlappingBookingB
      );

      (prisma.$transaction as jest.Mock).mockImplementationOnce(
        async (callback: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            $queryRaw: jest
              .fn()
              .mockResolvedValueOnce([
                // For non-overlapping future dates, availableSlots reflects current state.
                // The SUM capacity check (date-range aware) is the true guard.
                {
                  availableSlots: 4,
                  totalSlots: 4,
                  id: "listing-wu",
                  ownerId: "owner-456",
                  bookingMode: "WHOLE_UNIT",
                  status: "ACTIVE",
                },
              ])
              .mockResolvedValueOnce([{ total: BigInt(0) }]), // No overlapping accepted in Oct-Dec
            $executeRaw: jest.fn().mockResolvedValue(1),
            booking: {
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            bookingAuditLog: { create: jest.fn().mockResolvedValue({}) },
          };
          return callback(tx);
        }
      );

      const result2 = await updateBookingStatus("booking-wu-c", "ACCEPTED");
      expect(result2.success).toBe(true);
    });
  });

  describe("DB trigger error handling", () => {
    it("WHOLE_UNIT_OVERLAP trigger error returns user-friendly message", async () => {
      (prisma.booking.findUnique as jest.Mock).mockResolvedValue(
        overlappingBookingA
      );

      // Simulate the DB trigger raising an exception with 'WHOLE_UNIT_OVERLAP' in the message.
      // Prisma wraps PG RAISE EXCEPTION in the error message string.
      (prisma.$transaction as jest.Mock).mockImplementationOnce(async () => {
        throw new Error(
          "Raw query failed. Code: `P0001`. Message: `WHOLE_UNIT_OVERLAP: Cannot accept overlapping booking for WHOLE_UNIT listing`"
        );
      });

      const result = await updateBookingStatus("booking-wu-a", "ACCEPTED");

      expect(result.error).toBe(
        "Cannot accept: overlapping booking exists for this whole-unit listing"
      );
    });
  });
});
