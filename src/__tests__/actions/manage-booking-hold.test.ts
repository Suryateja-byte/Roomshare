/**
 * Phase 4: Hold management paths in updateBookingStatus
 *
 * Tests HELD booking transitions (HELD->ACCEPTED, HELD->CANCELLED, HELD->REJECTED),
 * inline expiry defense-in-depth, authorization, whole-unit interactions,
 * blocked transitions (EXPIRED->ACCEPTED, PENDING->HELD), capacity checks
 * counting HELD bookings, and feature-flag independence.
 */

// Mock dependencies before imports
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
  createInternalNotification: jest.fn(),
}));

jest.mock("@/lib/email", () => ({
  sendNotificationEmailWithPreference: jest.fn(),
}));

jest.mock("@/app/actions/suspension", () => ({
  checkSuspension: jest.fn(),
}));

jest.mock("@/lib/booking-state-machine", () => ({
  validateTransition: jest.fn(),
  isInvalidStateTransitionError: jest.fn(() => false),
}));

jest.mock("@/lib/rate-limit", () => ({
  checkRateLimit: jest.fn(),
  RATE_LIMITS: {
    bookingStatus: { limit: 30, windowMs: 60 * 1000 },
  },
}));

jest.mock("@/lib/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    sync: {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
    child: jest.fn().mockReturnValue({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      sync: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      },
    }),
  },
}));

import { updateBookingStatus } from "@/app/actions/manage-booking";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { createInternalNotification } from "@/lib/notifications";
import { sendNotificationEmailWithPreference } from "@/lib/email";
import { checkSuspension } from "@/app/actions/suspension";
import {
  validateTransition,
  isInvalidStateTransitionError,
} from "@/lib/booking-state-machine";
import { checkRateLimit } from "@/lib/rate-limit";

describe("manage-booking-hold — Phase 4 hold management paths", () => {
  const mockOwnerSession = {
    user: {
      id: "owner-123",
      name: "Owner User",
      email: "owner@example.com",
    },
  };

  const mockTenantSession = {
    user: {
      id: "tenant-123",
      name: "Tenant User",
      email: "tenant@example.com",
    },
  };

  const mockListing = {
    id: "listing-123",
    title: "Cozy Room",
    ownerId: "owner-123",
    availableSlots: 2,
    totalSlots: 3,
    owner: {
      name: "Owner User",
    },
  };

  const mockTenant = {
    id: "tenant-123",
    name: "Tenant User",
    email: "tenant@example.com",
  };

  /** A HELD booking whose hold has NOT expired */
  const futureHeldUntil = new Date(Date.now() + 15 * 60 * 1000); // +15 min

  const mockHeldBooking = {
    id: "booking-held-1",
    listingId: "listing-123",
    tenantId: "tenant-123",
    startDate: new Date("2025-02-01"),
    endDate: new Date("2025-05-01"),
    totalPrice: 2400,
    status: "HELD" as never,
    slotsRequested: 1,
    version: 1,
    heldUntil: futureHeldUntil,
    listing: mockListing,
    tenant: mockTenant,
  };

  /** A HELD booking whose hold IS expired */
  const pastHeldUntil = new Date(Date.now() - 5 * 60 * 1000); // -5 min

  const mockExpiredHeldBooking = {
    ...mockHeldBooking,
    id: "booking-held-expired",
    heldUntil: pastHeldUntil,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue(mockOwnerSession);
    (createInternalNotification as jest.Mock).mockResolvedValue({
      success: true,
    });
    (sendNotificationEmailWithPreference as jest.Mock).mockResolvedValue({
      success: true,
    });
    (checkSuspension as jest.Mock).mockResolvedValue({ suspended: false });
    (checkRateLimit as jest.Mock).mockResolvedValue({
      success: true,
      remaining: 29,
      resetAt: new Date(),
    });
    (validateTransition as jest.Mock).mockImplementation(() => {});
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "owner-123",
      isSuspended: false,
    });
  });

  // -----------------------------------------------------------------------
  // 1. HELD->ACCEPTED — no double decrement
  // -----------------------------------------------------------------------
  it("HELD->ACCEPTED does NOT decrement slots again (slots consumed at hold creation)", async () => {
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(mockHeldBooking);

    const mockTxUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const mockTxQueryRaw = jest
      .fn()
      .mockResolvedValue([{ ownerId: "owner-123" }]);
    const mockTxExecuteRaw = jest.fn();

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: mockTxQueryRaw,
        $executeRaw: mockTxExecuteRaw,
        booking: { updateMany: mockTxUpdateMany },
      };
      return callback(tx);
    });

    const result = await updateBookingStatus("booking-held-1", "ACCEPTED");

    expect(result.success).toBe(true);

    // The HELD->ACCEPTED path should NOT call $executeRaw (no slot decrement)
    expect(mockTxExecuteRaw).not.toHaveBeenCalled();

    // But it SHOULD update booking status to ACCEPTED with heldUntil cleared
    expect(mockTxUpdateMany).toHaveBeenCalledWith({
      where: { id: "booking-held-1", status: "HELD", version: 1 },
      data: {
        status: "ACCEPTED",
        heldUntil: null,
        version: { increment: 1 },
      },
    });
  });

  // -----------------------------------------------------------------------
  // 2. HELD->ACCEPTED — expired hold rejected
  // -----------------------------------------------------------------------
  it("HELD->ACCEPTED rejects expired hold with error", async () => {
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(
      mockExpiredHeldBooking
    );

    // Inline expiry tx succeeds
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([{ id: "listing-123" }]),
        $executeRaw: jest.fn().mockResolvedValue(1),
        booking: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      };
      return callback(tx);
    });

    const result = await updateBookingStatus(
      "booking-held-expired",
      "ACCEPTED"
    );

    expect(result.error).toBe("This hold has expired.");
    expect(result).not.toHaveProperty("success");
  });

  // -----------------------------------------------------------------------
  // 3. HELD->CANCELLED — slots restored with LEAST clamp
  // -----------------------------------------------------------------------
  it("HELD->CANCELLED restores slots with LEAST clamp", async () => {
    (auth as jest.Mock).mockResolvedValue(mockTenantSession);
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(mockHeldBooking);

    const mockTxUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const mockTxExecuteRaw = jest.fn().mockResolvedValue(1);
    const mockTxQueryRaw = jest.fn().mockResolvedValue([{ id: "listing-123" }]);

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: mockTxQueryRaw,
        $executeRaw: mockTxExecuteRaw,
        booking: { updateMany: mockTxUpdateMany },
      };
      return callback(tx);
    });

    const result = await updateBookingStatus("booking-held-1", "CANCELLED");

    expect(result.success).toBe(true);

    // Transaction used for atomic slot restoration
    expect(prisma.$transaction).toHaveBeenCalled();

    // Booking updated with heldUntil cleared
    expect(mockTxUpdateMany).toHaveBeenCalledWith({
      where: { id: "booking-held-1", version: 1 },
      data: {
        status: "CANCELLED",
        heldUntil: null,
        version: { increment: 1 },
      },
    });

    // $executeRaw called to restore slots via LEAST clamp
    expect(mockTxExecuteRaw).toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 4. Inline expiry — defense-in-depth
  // -----------------------------------------------------------------------
  it("inline expiry auto-expires HELD booking when heldUntil is past and returns error", async () => {
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(
      mockExpiredHeldBooking
    );

    const mockTxUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const mockTxExecuteRaw = jest.fn().mockResolvedValue(1);

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([{ id: "listing-123" }]),
        $executeRaw: mockTxExecuteRaw,
        booking: { updateMany: mockTxUpdateMany },
      };
      return callback(tx);
    });

    const result = await updateBookingStatus(
      "booking-held-expired",
      "ACCEPTED"
    );

    expect(result.error).toBe("This hold has expired.");

    // Inline expiry should have attempted to expire the booking
    expect(prisma.$transaction).toHaveBeenCalled();

    // The inline expiry tx updates status to EXPIRED
    expect(mockTxUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "booking-held-expired",
        status: "HELD",
        version: 1,
      },
      data: {
        status: "EXPIRED",
        heldUntil: null,
        version: { increment: 1 },
      },
    });

    // Slots restored as part of inline expiry
    expect(mockTxExecuteRaw).toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 5. HELD->REJECTED — host rejects hold (slots restored)
  // -----------------------------------------------------------------------
  it("HELD->REJECTED restores slots when host rejects a hold", async () => {
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(mockHeldBooking);

    const mockTxUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const mockTxExecuteRaw = jest.fn().mockResolvedValue(1);

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: jest
          .fn()
          .mockResolvedValue([{ ownerId: "owner-123" }]),
        $executeRaw: mockTxExecuteRaw,
        booking: { updateMany: mockTxUpdateMany },
      };
      return callback(tx);
    });

    const result = await updateBookingStatus("booking-held-1", "REJECTED");

    expect(result.success).toBe(true);

    // Booking updated to REJECTED with heldUntil cleared
    expect(mockTxUpdateMany).toHaveBeenCalledWith({
      where: { id: "booking-held-1", version: 1 },
      data: {
        status: "REJECTED",
        rejectionReason: null,
        heldUntil: null,
        version: { increment: 1 },
      },
    });

    // Slots restored via $executeRaw (LEAST clamp)
    expect(mockTxExecuteRaw).toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 6. Authorization — tenant cancel
  // -----------------------------------------------------------------------
  it("tenant can cancel their own hold", async () => {
    (auth as jest.Mock).mockResolvedValue(mockTenantSession);
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(mockHeldBooking);

    const mockTxUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const mockTxExecuteRaw = jest.fn().mockResolvedValue(1);

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([{ id: "listing-123" }]),
        $executeRaw: mockTxExecuteRaw,
        booking: { updateMany: mockTxUpdateMany },
      };
      return callback(tx);
    });

    const result = await updateBookingStatus("booking-held-1", "CANCELLED");

    expect(result.success).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 7. Authorization — owner accept
  // -----------------------------------------------------------------------
  it("only owner can accept a hold — tenant is rejected", async () => {
    (auth as jest.Mock).mockResolvedValue(mockTenantSession);
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(mockHeldBooking);

    const result = await updateBookingStatus("booking-held-1", "ACCEPTED");

    expect(result.error).toBe(
      "Only the listing owner can accept or reject bookings"
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 8. WHOLE_UNIT + HELD->CANCELLED restores totalSlots (not just slotsRequested=1)
  // -----------------------------------------------------------------------
  it("WHOLE_UNIT + HELD->CANCELLED restores slotsRequested amount", async () => {
    (auth as jest.Mock).mockResolvedValue(mockTenantSession);

    const wholeUnitHeldBooking = {
      ...mockHeldBooking,
      id: "booking-whole-held",
      slotsRequested: 3, // WHOLE_UNIT consumes totalSlots at hold creation
      listing: {
        ...mockListing,
        availableSlots: 0,
        totalSlots: 3,
      },
    };

    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(
      wholeUnitHeldBooking
    );

    const mockTxUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const mockTxExecuteRaw = jest.fn().mockResolvedValue(1);

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([{ id: "listing-123" }]),
        $executeRaw: mockTxExecuteRaw,
        booking: { updateMany: mockTxUpdateMany },
      };
      return callback(tx);
    });

    const result = await updateBookingStatus("booking-whole-held", "CANCELLED");

    expect(result.success).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalled();

    // $executeRaw is called for the LEAST clamp slot restoration
    // The slotsRequested=3 will be used in the SQL (not hardcoded 1)
    expect(mockTxExecuteRaw).toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 9. EXPIRED->ACCEPTED blocked
  // -----------------------------------------------------------------------
  it("EXPIRED->ACCEPTED is blocked by state machine (INVALID_STATE_TRANSITION)", async () => {
    const expiredBooking = {
      ...mockHeldBooking,
      id: "booking-expired-1",
      status: "EXPIRED" as never,
      heldUntil: null,
    };

    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(expiredBooking);

    // State machine rejects EXPIRED->ACCEPTED
    (validateTransition as jest.Mock).mockImplementation(() => {
      throw { code: "INVALID_STATE_TRANSITION" };
    });
    (isInvalidStateTransitionError as unknown as jest.Mock).mockReturnValue(true);

    const result = await updateBookingStatus("booking-expired-1", "ACCEPTED");

    expect(result.error).toBe(
      "Cannot change booking from EXPIRED to ACCEPTED"
    );
    expect(result.code).toBe("INVALID_STATE_TRANSITION");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 10. PENDING->HELD blocked
  // -----------------------------------------------------------------------
  it("PENDING->HELD is blocked by state machine", async () => {
    const pendingBooking = {
      ...mockHeldBooking,
      id: "booking-pending-1",
      status: "PENDING" as never,
      heldUntil: null,
    };

    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(pendingBooking);

    // State machine rejects PENDING->HELD
    (validateTransition as jest.Mock).mockImplementation(() => {
      throw { code: "INVALID_STATE_TRANSITION" };
    });
    (isInvalidStateTransitionError as unknown as jest.Mock).mockReturnValue(true);

    const result = await updateBookingStatus(
      "booking-pending-1",
      "HELD" as never
    );

    expect(result.error).toBe("Cannot change booking from PENDING to HELD");
    expect(result.code).toBe("INVALID_STATE_TRANSITION");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 11. PENDING->ACCEPTED capacity includes HELD bookings
  // -----------------------------------------------------------------------
  it("PENDING->ACCEPTED capacity check counts active HELD bookings", async () => {
    const pendingBooking = {
      ...mockHeldBooking,
      id: "booking-pending-cap",
      status: "PENDING" as never,
      heldUntil: null,
      slotsRequested: 1,
    };

    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(pendingBooking);

    // The PENDING->ACCEPTED path queries overlapping slots including HELD bookings
    // totalSlots=3, already used=3 (including HELD) => capacity exceeded
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: jest
          .fn()
          // First call: FOR UPDATE on Listing
          .mockResolvedValueOnce([
            {
              availableSlots: 1,
              totalSlots: 3,
              id: "listing-123",
              ownerId: "owner-123",
              bookingMode: "SHARED",
            },
          ])
          // Second call: SUM of overlapping ACCEPTED + active HELD = 3
          .mockResolvedValueOnce([{ total: BigInt(3) }]),
        $executeRaw: jest.fn().mockResolvedValue(1),
        booking: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      return callback(tx);
    });

    const result = await updateBookingStatus(
      "booking-pending-cap",
      "ACCEPTED"
    );

    // Capacity exceeded because HELD bookings are counted
    expect(result.error).toBe(
      "Cannot accept: all slots for these dates are already booked"
    );
  });

  // -----------------------------------------------------------------------
  // 12. Inline expiry — tx fails gracefully
  // -----------------------------------------------------------------------
  it("inline expiry returns 'hold has expired' error even when tx fails", async () => {
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(
      mockExpiredHeldBooking
    );

    // The inline expiry transaction throws (e.g., deadlock)
    (prisma.$transaction as jest.Mock).mockRejectedValue(
      new Error("Deadlock detected")
    );

    const result = await updateBookingStatus(
      "booking-held-expired",
      "ACCEPTED"
    );

    // Still returns the hold-expired error (the catch block swallows tx errors)
    expect(result.error).toBe("This hold has expired.");
    expect(result).not.toHaveProperty("success");
  });

  // -----------------------------------------------------------------------
  // 13. No feature flag check on management — HELD->ACCEPTED works even when flag is OFF
  // -----------------------------------------------------------------------
  it("HELD->ACCEPTED works even when feature flag is OFF (no orphaned holds)", async () => {
    // The updateBookingStatus function does NOT check any feature flag.
    // If a HELD booking exists (created when flag was ON), it can still be
    // accepted even if the flag is later turned OFF.
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(mockHeldBooking);

    const mockTxUpdateMany = jest.fn().mockResolvedValue({ count: 1 });

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: jest
          .fn()
          .mockResolvedValue([{ ownerId: "owner-123" }]),
        $executeRaw: jest.fn(),
        booking: { updateMany: mockTxUpdateMany },
      };
      return callback(tx);
    });

    // No feature flag mock needed — the function never checks one
    const result = await updateBookingStatus("booking-held-1", "ACCEPTED");

    expect(result.success).toBe(true);

    // Verify the HELD->ACCEPTED path was taken (no $executeRaw for slot decrement)
    expect(mockTxUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "HELD" }),
        data: expect.objectContaining({
          status: "ACCEPTED",
          heldUntil: null,
        }),
      })
    );
  });
});
