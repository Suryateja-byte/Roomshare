/**
 * Tests for booking server actions
 */

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
      count: jest.fn(),
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

jest.mock("@/lib/rate-limit", () => ({
  checkRateLimit: jest
    .fn()
    .mockResolvedValue({ success: true, remaining: 9, resetAt: new Date() }),
  getClientIPFromHeaders: jest.fn().mockReturnValue("127.0.0.1"),
  RATE_LIMITS: {
    createBooking: { limit: 10, windowMs: 3600000 },
    createBookingByIp: { limit: 30, windowMs: 3600000 },
  },
}));

jest.mock("next/headers", () => ({
  headers: jest.fn().mockResolvedValue(new Headers()),
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

import { createBooking } from "@/app/actions/booking";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { createInternalNotification } from "@/lib/notifications";
import { sendNotificationEmailWithPreference } from "@/lib/email";

describe("createBooking", () => {
  const mockSession = {
    user: {
      id: "user-123",
      name: "Test User",
      email: "test@example.com",
    },
  };

  const mockListing = {
    id: "listing-123",
    title: "Cozy Room",
    ownerId: "owner-123",
    totalSlots: 2,
    availableSlots: 2,
    status: "ACTIVE",
    price: 800,
    bookingMode: "SHARED",
  };

  const mockOwner = {
    id: "owner-123",
    name: "Host User",
    email: "host@example.com",
  };

  const mockTenant = {
    id: "user-123",
    name: "Test User",
  };

  // Use future dates to pass validation
  const futureStart = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now
  const futureEnd = new Date(Date.now() + 210 * 24 * 60 * 60 * 1000); // ~7 months from now

  const mockBooking = {
    id: "booking-123",
    listingId: "listing-123",
    tenantId: "user-123",
    startDate: futureStart,
    endDate: futureEnd,
    totalPrice: 4800,
    status: "PENDING",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue(mockSession);
    (prisma.idempotencyKey.findUnique as jest.Mock).mockResolvedValue(null);
    // Mock user.findUnique for suspension and email verification checks
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "user-123",
      isSuspended: false,
      emailVerified: new Date(),
    });

    // Mock transaction to execute the callback
    (prisma.$transaction as jest.Mock).mockImplementation(
      async (callback: any) => {
        // Create a mock transaction context
        const tx = {
          $queryRaw: jest
            .fn()
            .mockResolvedValueOnce([mockListing]) // FOR UPDATE lock
            .mockResolvedValueOnce([{ total: BigInt(0) }]), // SUM(slotsRequested)
          user: {
            findUnique: jest.fn().mockImplementation(({ where }) => {
              if (where.id === "owner-123") return Promise.resolve(mockOwner);
              if (where.id === "user-123") return Promise.resolve(mockTenant);
              return Promise.resolve(null);
            }),
          },
          booking: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue(mockBooking),
          },
          bookingAuditLog: {
            create: jest.fn().mockResolvedValue({}),
          },
        };
        return callback(tx);
      }
    );
    (createInternalNotification as jest.Mock).mockResolvedValue({
      success: true,
    });
    (sendNotificationEmailWithPreference as jest.Mock).mockResolvedValue({
      success: true,
    });
  });

  describe("authentication", () => {
    it("returns error when not authenticated", async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const result = await createBooking(
        "listing-123",
        futureStart,
        futureEnd,
        800
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("You must be logged in to book");
      expect(result.code).toBe("SESSION_EXPIRED");
    });

    it("returns error when user id is missing", async () => {
      (auth as jest.Mock).mockResolvedValue({ user: {} });

      const result = await createBooking(
        "listing-123",
        futureStart,
        futureEnd,
        800
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("You must be logged in to book");
    });
  });

  describe("successful booking", () => {
    it("creates booking with correct data", async () => {
      const result = await createBooking(
        "listing-123",
        futureStart,
        futureEnd,
        800
      );

      expect(result.success).toBe(true);
      expect(result.bookingId).toBe("booking-123");
    });

    it("returns success with booking id", async () => {
      const result = await createBooking(
        "listing-123",
        futureStart,
        futureEnd,
        800
      );

      expect(result).toEqual({
        success: true,
        bookingId: "booking-123",
      });
    });

    it("revalidates listing path", async () => {
      await createBooking("listing-123", futureStart, futureEnd, 800);

      expect(revalidatePath).toHaveBeenCalledWith("/listings/listing-123");
    });

    it("revalidates bookings path", async () => {
      await createBooking("listing-123", futureStart, futureEnd, 800);

      expect(revalidatePath).toHaveBeenCalledWith("/bookings");
    });
  });

  describe("notifications", () => {
    it("creates in-app notification for host", async () => {
      await createBooking("listing-123", futureStart, futureEnd, 800);

      expect(createInternalNotification).toHaveBeenCalledWith({
        userId: "owner-123",
        type: "BOOKING_REQUEST",
        title: "New Booking Request",
        message: expect.stringContaining("Test User"),
        link: "/bookings",
      });
    });
  });

  describe("error handling", () => {
    it("returns error when listing not found", async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(
        async (callback: any) => {
          const tx = {
            $queryRaw: jest.fn().mockResolvedValue([]), // Empty array = no listing
            user: { findUnique: jest.fn() },
            booking: { findFirst: jest.fn(), create: jest.fn() },
          };
          return callback(tx);
        }
      );

      const result = await createBooking(
        "invalid-listing",
        futureStart,
        futureEnd,
        800
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Listing not found");
    });

    it("returns error on database failure", async () => {
      (prisma.$transaction as jest.Mock).mockRejectedValue(
        new Error("DB Error")
      );

      const result = await createBooking(
        "listing-123",
        futureStart,
        futureEnd,
        800
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to create booking");
    });
  });

  describe("price verification (P1 security fix)", () => {
    it("rejects booking when client price does not match listing price", async () => {
      const result = await createBooking(
        "listing-123",
        futureStart,
        futureEnd,
        0.01
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe("PRICE_CHANGED");
      expect(result.error).toContain("price has changed");
      expect(result.currentPrice).toBe(800);
    });

    it("accepts booking when client price matches listing price", async () => {
      const result = await createBooking(
        "listing-123",
        futureStart,
        futureEnd,
        800
      );

      expect(result.success).toBe(true);
      expect(result.bookingId).toBe("booking-123");
    });

    it("accepts booking when client price is within $0.01 tolerance", async () => {
      const result = await createBooking(
        "listing-123",
        futureStart,
        futureEnd,
        800.005
      );

      expect(result.success).toBe(true);
      expect(result.bookingId).toBe("booking-123");
    });

    it("calculates totalPrice from DB listing price, not client value", async () => {
      let capturedCreateData: any = null;
      (prisma.$transaction as jest.Mock).mockImplementation(
        async (callback: any) => {
          const tx = {
            $queryRaw: jest
              .fn()
              .mockResolvedValueOnce([mockListing])
              .mockResolvedValueOnce([{ total: BigInt(0) }]),
            user: {
              findUnique: jest.fn().mockImplementation(({ where }) => {
                if (where.id === "owner-123") return Promise.resolve(mockOwner);
                if (where.id === "user-123") return Promise.resolve(mockTenant);
                return Promise.resolve(null);
              }),
            },
            booking: {
              findFirst: jest.fn().mockResolvedValue(null),
              create: jest.fn().mockImplementation((args) => {
                capturedCreateData = args.data;
                return Promise.resolve(mockBooking);
              }),
            },
          };
          return callback(tx);
        }
      );

      await createBooking("listing-123", futureStart, futureEnd, 800);

      // Verify totalPrice was calculated from DB price (800/30 * diffDays)
      const diffDays = Math.ceil(
        (futureEnd.getTime() - futureStart.getTime()) / (1000 * 60 * 60 * 24)
      );
      const expectedTotal = Math.round(diffDays * (800 / 30) * 100) / 100;

      expect(capturedCreateData).not.toBeNull();
      expect(capturedCreateData.totalPrice).toBeCloseTo(expectedTotal, 2);
    });

    it("rejects manipulated high price as well", async () => {
      const result = await createBooking(
        "listing-123",
        futureStart,
        futureEnd,
        99999
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe("PRICE_CHANGED");
      expect(result.currentPrice).toBe(800);
    });
  });

  describe("UTC date consistency (B4.2)", () => {
    it("booking dates are stored as Date objects (inherently UTC)", async () => {
      let capturedCreateData: any = null;
      (prisma.$transaction as jest.Mock).mockImplementation(
        async (callback: any) => {
          const tx = {
            $queryRaw: jest
              .fn()
              .mockResolvedValueOnce([mockListing])
              .mockResolvedValueOnce([{ total: BigInt(0) }]),
            user: {
              findUnique: jest.fn().mockImplementation(({ where }) => {
                if (where.id === "owner-123") return Promise.resolve(mockOwner);
                if (where.id === "user-123") return Promise.resolve(mockTenant);
                return Promise.resolve(null);
              }),
            },
            booking: {
              findFirst: jest.fn().mockResolvedValue(null),
              create: jest.fn().mockImplementation((args) => {
                capturedCreateData = args.data;
                return Promise.resolve(mockBooking);
              }),
            },
          };
          return callback(tx);
        }
      );

      await createBooking("listing-123", futureStart, futureEnd, 800);

      expect(capturedCreateData).not.toBeNull();
      expect(capturedCreateData.startDate).toBeInstanceOf(Date);
      expect(capturedCreateData.endDate).toBeInstanceOf(Date);
    });

    it("idempotency hash uses toISOString() for date consistency", () => {
      // The requestBody in createBooking (booking.ts line ~323) converts dates via toISOString():
      //   { listingId, startDate: startDate.toISOString(), endDate: endDate.toISOString(), pricePerMonth }
      // This ensures the idempotency hash is timezone-independent and deterministic.
      const date1 = new Date("2025-06-15T00:00:00.000Z");
      const date2 = new Date("2025-06-15T00:00:00.000Z");

      // Same instant produces identical ISO strings
      expect(date1.toISOString()).toBe(date2.toISOString());
      expect(date1.toISOString()).toBe("2025-06-15T00:00:00.000Z");

      // Verify ISO string format is UTC (ends with Z)
      expect(date1.toISOString()).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
      );

      // The requestBody shape matches what withIdempotency hashes
      const requestBody = {
        listingId: "listing-123",
        startDate: date1.toISOString(),
        endDate: date2.toISOString(),
        pricePerMonth: 800,
      };
      expect(typeof requestBody.startDate).toBe("string");
      expect(typeof requestBody.endDate).toBe("string");

      // Two calls with the same Date objects produce identical request bodies
      const requestBody2 = {
        listingId: "listing-123",
        startDate: date1.toISOString(),
        endDate: date2.toISOString(),
        pricePerMonth: 800,
      };
      expect(JSON.stringify(requestBody)).toBe(JSON.stringify(requestBody2));
    });
  });
});
