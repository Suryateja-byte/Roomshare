/**
 * Tests for manage-booking server actions
 */

jest.mock("@/lib/booking-audit", () => ({ logBookingAudit: jest.fn() }));

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

import {
  updateBookingStatus,
  getMyBookings,
} from "@/app/actions/manage-booking";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { createInternalNotification } from "@/lib/notifications";
import { sendNotificationEmailWithPreference } from "@/lib/email";
import { checkSuspension } from "@/app/actions/suspension";
import { validateTransition } from "@/lib/booking-state-machine";
import { checkRateLimit } from "@/lib/rate-limit";
import { logBookingAudit } from "@/lib/booking-audit";

describe("manage-booking actions", () => {
  const mockSession = {
    user: {
      id: "user-123",
      name: "Test User",
      email: "test@example.com",
    },
  };

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

  const mockBooking = {
    id: "booking-123",
    listingId: "listing-123",
    tenantId: "tenant-123",
    startDate: new Date("2025-02-01"),
    endDate: new Date("2025-05-01"),
    totalPrice: 2400,
    status: "PENDING",
    slotsRequested: 1,
    version: 1,
    listing: mockListing,
    tenant: mockTenant,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue(mockSession);
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
    // Mock user.findUnique for suspension check
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "user-123",
      isSuspended: false,
    });
  });

  describe("updateBookingStatus", () => {
    describe("authentication", () => {
      it("returns error when not authenticated", async () => {
        (auth as jest.Mock).mockResolvedValue(null);

        const result = await updateBookingStatus("booking-123", "ACCEPTED");

        expect(result.error).toBe("Unauthorized");
        expect(result.code).toBe("SESSION_EXPIRED");
      });

      it("returns error when session user id is missing", async () => {
        (auth as jest.Mock).mockResolvedValue({ user: {} });

        const result = await updateBookingStatus("booking-123", "ACCEPTED");

        expect(result.error).toBe("Unauthorized");
        expect(result.code).toBe("SESSION_EXPIRED");
      });

      it("returns error when session has no user", async () => {
        (auth as jest.Mock).mockResolvedValue({});

        const result = await updateBookingStatus("booking-123", "ACCEPTED");

        expect(result.error).toBe("Unauthorized");
      });

      it("returns error when rate limited", async () => {
        (auth as jest.Mock).mockResolvedValue(mockOwnerSession);
        (checkRateLimit as jest.Mock).mockResolvedValue({
          success: false,
          remaining: 0,
          resetAt: new Date(),
        });

        const result = await updateBookingStatus("booking-123", "ACCEPTED");

        expect(result.error).toBe("Too many requests. Please wait.");
      });
    });

    describe("booking not found", () => {
      it("returns error when booking does not exist", async () => {
        (auth as jest.Mock).mockResolvedValue(mockOwnerSession);
        (prisma.booking.findUnique as jest.Mock).mockResolvedValue(null);

        const result = await updateBookingStatus("invalid-booking", "ACCEPTED");

        expect(result.error).toBe("Booking not found");
      });
    });

    describe("authorization", () => {
      beforeEach(() => {
        (prisma.booking.findUnique as jest.Mock).mockResolvedValue(mockBooking);
      });

      it("only owner can ACCEPT bookings", async () => {
        (auth as jest.Mock).mockResolvedValue(mockTenantSession);

        const result = await updateBookingStatus("booking-123", "ACCEPTED");

        expect(result.error).toBe(
          "Only the listing owner can accept or reject bookings"
        );
      });

      it("only owner can REJECT bookings", async () => {
        (auth as jest.Mock).mockResolvedValue(mockTenantSession);

        const result = await updateBookingStatus("booking-123", "REJECTED");

        expect(result.error).toBe(
          "Only the listing owner can accept or reject bookings"
        );
      });

      it("only tenant can CANCEL bookings", async () => {
        (auth as jest.Mock).mockResolvedValue(mockOwnerSession);

        const result = await updateBookingStatus("booking-123", "CANCELLED");

        expect(result.error).toBe("Only the tenant can cancel a booking");
      });

      it("allows owner to accept booking", async () => {
        (auth as jest.Mock).mockResolvedValue(mockOwnerSession);
        (prisma.$transaction as jest.Mock).mockImplementation(
          async (callback) => {
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
          }
        );

        const result = await updateBookingStatus("booking-123", "ACCEPTED");

        expect(result.success).toBe(true);
      });

      it("calls logBookingAudit with ACCEPTED action on accept", async () => {
        (auth as jest.Mock).mockResolvedValue(mockOwnerSession);
        (prisma.$transaction as jest.Mock).mockImplementation(
          async (callback) => {
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
          }
        );

        await updateBookingStatus("booking-123", "ACCEPTED");

        expect(logBookingAudit).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            action: "ACCEPTED",
            previousStatus: "PENDING",
          })
        );
      });

      it("allows tenant to cancel booking", async () => {
        (auth as jest.Mock).mockResolvedValue(mockTenantSession);
        (prisma.$transaction as jest.Mock).mockImplementation(
          async (callback) => {
            const tx = {
              booking: {
                updateMany: jest.fn().mockResolvedValue({ count: 1 }),
              },
            };
            return callback(tx);
          }
        );

        const result = await updateBookingStatus("booking-123", "CANCELLED");

        expect(result.success).toBe(true);
      });
    });

    describe("ACCEPT flow", () => {
      beforeEach(() => {
        (auth as jest.Mock).mockResolvedValue(mockOwnerSession);
        (prisma.booking.findUnique as jest.Mock).mockResolvedValue(mockBooking);
      });

      it("decrements availableSlots via conditional UPDATE when accepting", async () => {
        const mockTx = {
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
        (prisma.$transaction as jest.Mock).mockImplementation(
          async (callback) => callback(mockTx)
        );

        await updateBookingStatus("booking-123", "ACCEPTED");

        // C2 FIX: Uses conditional $executeRaw instead of Prisma decrement
        expect(mockTx.$executeRaw).toHaveBeenCalled();
      });

      it("returns error when no slots available", async () => {
        (prisma.$transaction as jest.Mock).mockImplementation(
          async (callback) => {
            const tx = {
              $queryRaw: jest.fn().mockResolvedValue([
                {
                  availableSlots: 0,
                  totalSlots: 2,
                  id: "listing-123",
                  ownerId: "owner-123",
                  bookingMode: "SHARED",
                  status: "ACTIVE",
                },
              ]),
            };
            return callback(tx);
          }
        );

        const result = await updateBookingStatus("booking-123", "ACCEPTED");

        expect(result.error).toBe("No available slots for this listing");
      });

      it("returns error when capacity exceeded", async () => {
        (prisma.$transaction as jest.Mock).mockImplementation(
          async (callback) => {
            const tx = {
              $queryRaw: jest
                .fn()
                .mockResolvedValueOnce([
                  {
                    availableSlots: 1,
                    totalSlots: 2,
                    id: "listing-123",
                    ownerId: "owner-123",
                    bookingMode: "SHARED",
                    status: "ACTIVE",
                  },
                ])
                .mockResolvedValueOnce([{ total: BigInt(2) }]), // SUM=2 slots used = capacity exceeded
            };
            return callback(tx);
          }
        );

        const result = await updateBookingStatus("booking-123", "ACCEPTED");

        expect(result.error).toBe(
          "Cannot accept: all slots for these dates are already booked"
        );
      });

      it("creates notification for tenant on acceptance", async () => {
        (prisma.$transaction as jest.Mock).mockImplementation(
          async (callback) => {
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
          }
        );

        await updateBookingStatus("booking-123", "ACCEPTED");

        expect(createInternalNotification).toHaveBeenCalledWith({
          userId: "tenant-123",
          type: "BOOKING_ACCEPTED",
          title: "Booking Accepted!",
          message: expect.stringContaining("Cozy Room"),
          link: "/bookings",
        });
      });

      it("sends email to tenant on acceptance", async () => {
        (prisma.$transaction as jest.Mock).mockImplementation(
          async (callback) => {
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
          }
        );

        await updateBookingStatus("booking-123", "ACCEPTED");

        expect(sendNotificationEmailWithPreference).toHaveBeenCalledWith(
          "bookingAccepted",
          "tenant-123",
          "tenant@example.com",
          expect.objectContaining({
            tenantName: "Tenant User",
            listingTitle: "Cozy Room",
          })
        );
      });

      it("uses transaction for atomic slot management", async () => {
        (prisma.$transaction as jest.Mock).mockImplementation(
          async (callback) => {
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
          }
        );

        await updateBookingStatus("booking-123", "ACCEPTED");

        expect(prisma.$transaction).toHaveBeenCalled();
      });

      it("returns SLOT_UNDERFLOW when conditional UPDATE fails (double-accept race)", async () => {
        (prisma.$transaction as jest.Mock).mockImplementation(
          async (callback) => {
            const tx = {
              $queryRaw: jest
                .fn()
                .mockResolvedValueOnce([
                  {
                    availableSlots: 1,
                    totalSlots: 3,
                    id: "listing-123",
                    ownerId: "owner-123",
                    bookingMode: "SHARED",
                    status: "ACTIVE",
                  },
                ])
                .mockResolvedValueOnce([{ total: BigInt(0) }]),
              $executeRaw: jest.fn().mockResolvedValue(0), // WHERE guard failed — no rows updated
              booking: {
                updateMany: jest.fn().mockResolvedValue({ count: 1 }),
              },
            };
            return callback(tx);
          }
        );

        const result = await updateBookingStatus("booking-123", "ACCEPTED");

        expect(result.error).toBe("No available slots for this listing");
      });
    });

    describe("REJECT flow", () => {
      let mockTxUpdateMany: jest.Mock;

      beforeEach(() => {
        (auth as jest.Mock).mockResolvedValue(mockOwnerSession);
        (prisma.booking.findUnique as jest.Mock).mockResolvedValue(mockBooking);
        mockTxUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
        // P0-3: REJECTED path now uses $transaction with FOR UPDATE ownership check
        (prisma.$transaction as jest.Mock).mockImplementation(
          async (callback) => {
            const tx = {
              $queryRaw: jest
                .fn()
                .mockResolvedValue([
                  { ownerId: "owner-123", status: "ACTIVE" },
                ]),
              booking: {
                updateMany: mockTxUpdateMany,
              },
            };
            return callback(tx);
          }
        );
      });

      it("updates booking status to REJECTED", async () => {
        await updateBookingStatus("booking-123", "REJECTED");

        expect(mockTxUpdateMany).toHaveBeenCalledWith({
          where: { id: "booking-123", version: 1 },
          data: {
            status: "REJECTED",
            rejectionReason: null,
            heldUntil: null,
            version: { increment: 1 },
          },
        });
      });

      it("calls logBookingAudit with REJECTED action on reject", async () => {
        await updateBookingStatus("booking-123", "REJECTED");

        expect(logBookingAudit).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ action: "REJECTED" })
        );
      });

      it("creates notification for tenant on rejection", async () => {
        await updateBookingStatus("booking-123", "REJECTED");

        expect(createInternalNotification).toHaveBeenCalledWith({
          userId: "tenant-123",
          type: "BOOKING_REJECTED",
          title: "Booking Not Accepted",
          message: expect.stringContaining("Cozy Room"),
          link: "/bookings",
        });
      });

      it("sends email to tenant on rejection", async () => {
        await updateBookingStatus("booking-123", "REJECTED");

        expect(sendNotificationEmailWithPreference).toHaveBeenCalledWith(
          "bookingRejected",
          "tenant-123",
          "tenant@example.com",
          expect.objectContaining({
            tenantName: "Tenant User",
            listingTitle: "Cozy Room",
          })
        );
      });
    });

    describe("CANCEL flow", () => {
      beforeEach(() => {
        (auth as jest.Mock).mockResolvedValue(mockTenantSession);
      });

      it("increments slots (clamped to totalSlots) when cancelling accepted booking", async () => {
        const acceptedBooking = { ...mockBooking, status: "ACCEPTED" };
        (prisma.booking.findUnique as jest.Mock).mockResolvedValue(
          acceptedBooking
        );

        const mockTx = {
          booking: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
          $queryRaw: jest.fn().mockResolvedValue([]), // FOR UPDATE lock on Listing
          $executeRaw: jest.fn().mockResolvedValue(1),
        };
        (prisma.$transaction as jest.Mock).mockImplementation(
          async (callback) => callback(mockTx)
        );

        await updateBookingStatus("booking-123", "CANCELLED");

        // BIZ-07: Uses raw SQL with LEAST to clamp availableSlots <= totalSlots
        expect(mockTx.$executeRaw).toHaveBeenCalled();
      });

      it("does not increment slots when cancelling pending booking", async () => {
        (prisma.booking.findUnique as jest.Mock).mockResolvedValue(mockBooking); // status: PENDING
        const mockTxUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
        (prisma.$transaction as jest.Mock).mockImplementation(
          async (callback) => {
            const tx = {
              booking: {
                updateMany: mockTxUpdateMany,
              },
            };
            return callback(tx);
          }
        );

        await updateBookingStatus("booking-123", "CANCELLED");

        expect(mockTxUpdateMany).toHaveBeenCalledWith({
          where: { id: "booking-123", version: 1 },
          data: { status: "CANCELLED", version: { increment: 1 } },
        });
        // No $executeRaw for slot restore on PENDING cancel
      });

      it("calls logBookingAudit with CANCELLED action on pending cancel", async () => {
        (prisma.booking.findUnique as jest.Mock).mockResolvedValue(mockBooking); // status: PENDING
        (prisma.$transaction as jest.Mock).mockImplementation(
          async (callback) => {
            const tx = {
              booking: {
                updateMany: jest.fn().mockResolvedValue({ count: 1 }),
              },
            };
            return callback(tx);
          }
        );

        await updateBookingStatus("booking-123", "CANCELLED");

        expect(logBookingAudit).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            action: "CANCELLED",
            previousStatus: "PENDING",
          })
        );
      });

      it("creates notification for host on cancellation", async () => {
        (prisma.booking.findUnique as jest.Mock).mockResolvedValue(mockBooking);
        (prisma.$transaction as jest.Mock).mockImplementation(
          async (callback) => {
            const tx = {
              booking: {
                updateMany: jest.fn().mockResolvedValue({ count: 1 }),
              },
            };
            return callback(tx);
          }
        );

        await updateBookingStatus("booking-123", "CANCELLED");

        expect(createInternalNotification).toHaveBeenCalledWith({
          userId: "owner-123",
          type: "BOOKING_CANCELLED",
          title: "Booking Cancelled",
          message: expect.stringContaining("Tenant User"),
          link: "/bookings",
        });
      });

      it("uses transaction for atomic slot increment on accepted booking", async () => {
        const acceptedBooking = { ...mockBooking, status: "ACCEPTED" };
        (prisma.booking.findUnique as jest.Mock).mockResolvedValue(
          acceptedBooking
        );
        (prisma.$transaction as jest.Mock).mockImplementation(
          async (callback) => {
            const tx = {
              booking: {
                updateMany: jest.fn().mockResolvedValue({ count: 1 }),
              },
              $executeRaw: jest.fn().mockResolvedValue(1),
            };
            return callback(tx);
          }
        );

        await updateBookingStatus("booking-123", "CANCELLED");

        expect(prisma.$transaction).toHaveBeenCalled();
      });
    });

    describe("path revalidation", () => {
      beforeEach(() => {
        (auth as jest.Mock).mockResolvedValue(mockOwnerSession);
        (prisma.booking.findUnique as jest.Mock).mockResolvedValue(mockBooking);
        // P0-3: REJECTED path now uses $transaction with FOR UPDATE
        (prisma.$transaction as jest.Mock).mockImplementation(
          async (callback) => {
            const tx = {
              $queryRaw: jest
                .fn()
                .mockResolvedValue([
                  { ownerId: "owner-123", status: "ACTIVE" },
                ]),
              booking: {
                updateMany: jest.fn().mockResolvedValue({ count: 1 }),
              },
            };
            return callback(tx);
          }
        );
      });

      it("revalidates /bookings path", async () => {
        await updateBookingStatus("booking-123", "REJECTED");

        expect(revalidatePath).toHaveBeenCalledWith("/bookings");
      });

      it("revalidates listing path", async () => {
        await updateBookingStatus("booking-123", "REJECTED");

        expect(revalidatePath).toHaveBeenCalledWith("/listings/listing-123");
      });
    });

    describe("error handling", () => {
      it("returns error on database failure", async () => {
        (auth as jest.Mock).mockResolvedValue(mockOwnerSession);
        (prisma.booking.findUnique as jest.Mock).mockRejectedValue(
          new Error("DB Error")
        );

        const result = await updateBookingStatus("booking-123", "ACCEPTED");

        expect(result.error).toBe("Failed to update booking status");
      });

      it("returns error when transaction fails", async () => {
        (auth as jest.Mock).mockResolvedValue(mockOwnerSession);
        (prisma.booking.findUnique as jest.Mock).mockResolvedValue(mockBooking);
        (prisma.$transaction as jest.Mock).mockRejectedValue(
          new Error("Transaction failed")
        );

        const result = await updateBookingStatus("booking-123", "ACCEPTED");

        expect(result.error).toBe("Failed to update booking status");
      });
    });

    describe("suspension checks (F3.4)", () => {
      beforeEach(() => {
        (checkSuspension as jest.Mock).mockResolvedValue({
          suspended: true,
          error: "Account suspended",
        });
      });

      it("blocks suspended user from accepting booking", async () => {
        (auth as jest.Mock).mockResolvedValue(mockOwnerSession);
        const result = await updateBookingStatus("booking-123", "ACCEPTED");
        expect(result.error).toBe("Account suspended");
        expect(prisma.booking.findUnique).not.toHaveBeenCalled();
        expect(prisma.$transaction).not.toHaveBeenCalled();
      });

      it("blocks suspended user from rejecting booking", async () => {
        (auth as jest.Mock).mockResolvedValue(mockOwnerSession);
        const result = await updateBookingStatus("booking-123", "REJECTED");
        expect(result.error).toBe("Account suspended");
        expect(prisma.booking.findUnique).not.toHaveBeenCalled();
        expect(prisma.$transaction).not.toHaveBeenCalled();
      });

      it("blocks suspended user from cancelling booking", async () => {
        (auth as jest.Mock).mockResolvedValue(mockTenantSession);
        const result = await updateBookingStatus("booking-123", "CANCELLED");
        expect(result.error).toBe("Account suspended");
        expect(prisma.booking.findUnique).not.toHaveBeenCalled();
        expect(prisma.$transaction).not.toHaveBeenCalled();
      });
    });

    describe("email failure resilience (D2.2)", () => {
      it("booking ACCEPT succeeds even when email notification fails", async () => {
        (auth as jest.Mock).mockResolvedValue(mockOwnerSession);
        (prisma.booking.findUnique as jest.Mock).mockResolvedValue(mockBooking);
        (prisma.$transaction as jest.Mock).mockImplementation(
          async (callback) => {
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
          }
        );
        (sendNotificationEmailWithPreference as jest.Mock).mockRejectedValue(
          new Error("Resend API down")
        );

        const result = await updateBookingStatus("booking-123", "ACCEPTED");
        expect(result.success).toBe(true);
        expect(result).not.toHaveProperty("error");
        expect(prisma.$transaction).toHaveBeenCalled();
      });

      it("booking ACCEPT succeeds even when in-app notification fails", async () => {
        (auth as jest.Mock).mockResolvedValue(mockOwnerSession);
        (prisma.booking.findUnique as jest.Mock).mockResolvedValue(mockBooking);
        (prisma.$transaction as jest.Mock).mockImplementation(
          async (callback) => {
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
          }
        );
        (createInternalNotification as jest.Mock).mockRejectedValue(
          new Error("DB timeout")
        );

        const result = await updateBookingStatus("booking-123", "ACCEPTED");
        expect(result.success).toBe(true);
        expect(result).not.toHaveProperty("error");
        expect(prisma.$transaction).toHaveBeenCalled();
      });

      it("booking REJECT succeeds even when email notification fails", async () => {
        (auth as jest.Mock).mockResolvedValue(mockOwnerSession);
        (prisma.booking.findUnique as jest.Mock).mockResolvedValue(mockBooking);
        (prisma.$transaction as jest.Mock).mockImplementation(
          async (callback) => {
            const tx = {
              $queryRaw: jest
                .fn()
                .mockResolvedValue([
                  { ownerId: "owner-123", status: "ACTIVE" },
                ]),
              booking: {
                updateMany: jest.fn().mockResolvedValue({ count: 1 }),
              },
            };
            return callback(tx);
          }
        );
        (sendNotificationEmailWithPreference as jest.Mock).mockRejectedValue(
          new Error("Resend API down")
        );

        const result = await updateBookingStatus("booking-123", "REJECTED");
        expect(result.success).toBe(true);
        expect(result).not.toHaveProperty("error");
        expect(prisma.$transaction).toHaveBeenCalled();
      });
    });
  });

  describe("getMyBookings", () => {
    describe("authentication", () => {
      it("returns error when not authenticated", async () => {
        (auth as jest.Mock).mockResolvedValue(null);

        const result = await getMyBookings();

        expect(result.error).toBe("Unauthorized");
        expect(result.code).toBe("SESSION_EXPIRED");
        expect(result.bookings).toEqual([]);
      });

      it("returns error when user id is missing", async () => {
        (auth as jest.Mock).mockResolvedValue({ user: {} });

        const result = await getMyBookings();

        expect(result.error).toBe("Unauthorized");
      });
    });

    describe("successful retrieval", () => {
      const mockSentBookings = [
        {
          id: "booking-1",
          tenantId: "user-123",
          listingId: "listing-1",
          status: "PENDING",
          listing: {
            id: "listing-1",
            title: "Room 1",
            location: { city: "NYC" },
            owner: { id: "owner-1", name: "Owner 1", image: null },
          },
        },
      ];

      const mockReceivedBookings = [
        {
          id: "booking-2",
          tenantId: "other-user",
          listingId: "listing-2",
          status: "ACCEPTED",
          listing: {
            id: "listing-2",
            title: "Room 2",
            ownerId: "user-123",
            location: { city: "LA" },
          },
          tenant: {
            id: "other-user",
            name: "Other User",
            image: null,
            email: "other@example.com",
          },
        },
      ];

      beforeEach(() => {
        (prisma.booking.findMany as jest.Mock)
          .mockResolvedValueOnce(mockSentBookings)
          .mockResolvedValueOnce(mockReceivedBookings);
      });

      it("returns sent bookings for tenant", async () => {
        const result = await getMyBookings();

        expect(result.sentBookings).toEqual(mockSentBookings);
      });

      it("returns received bookings for owner", async () => {
        const result = await getMyBookings();

        expect(result.receivedBookings).toEqual(mockReceivedBookings);
      });

      it("includes listing and location data", async () => {
        const result = await getMyBookings();

        expect(result.sentBookings?.[0]?.listing?.location).toBeDefined();
        expect(result.receivedBookings?.[0]?.listing?.location).toBeDefined();
      });

      it("orders bookings by createdAt descending", async () => {
        await getMyBookings();

        expect(prisma.booking.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            orderBy: { createdAt: "desc" },
          })
        );
      });
    });

    describe("error handling", () => {
      it("returns error on database failure", async () => {
        (prisma.booking.findMany as jest.Mock).mockRejectedValue(
          new Error("DB Error")
        );

        const result = await getMyBookings();

        expect(result.error).toBe("Failed to fetch bookings");
        expect(result.sentBookings).toEqual([]);
        expect(result.receivedBookings).toEqual([]);
      });
    });
  });
});
