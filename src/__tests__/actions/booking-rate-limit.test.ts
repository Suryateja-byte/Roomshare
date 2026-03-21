/**
 * Tests for booking rate limiting (Phase 2, C4 fix)
 *
 * Verifies that createBooking enforces per-user and per-IP rate limits
 * BEFORE entering the transaction/validation path.
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

jest.mock("@/lib/logger", () => ({
  logger: {
    sync: {
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
  },
}));

jest.mock("@/lib/rate-limit", () => ({
  checkRateLimit: jest.fn(),
  getClientIPFromHeaders: jest.fn().mockReturnValue("192.168.1.100"),
  RATE_LIMITS: {
    createBooking: { limit: 10, windowMs: 60 * 60 * 1000 },
    createBookingByIp: { limit: 30, windowMs: 60 * 60 * 1000 },
  },
}));

jest.mock("next/headers", () => ({
  headers: jest.fn().mockResolvedValue(new Headers()),
}));

import { createBooking } from "@/app/actions/booking";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { createInternalNotification } from "@/lib/notifications";
import { sendNotificationEmailWithPreference } from "@/lib/email";

describe("createBooking rate limiting", () => {
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

  const rateLimitSuccess = {
    success: true,
    remaining: 9,
    resetAt: new Date(Date.now() + 3600000),
  };
  const rateLimitDenied = {
    success: false,
    remaining: 0,
    resetAt: new Date(Date.now() + 3600000),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue(mockSession);

    // Default: rate limits pass
    (checkRateLimit as jest.Mock).mockResolvedValue(rateLimitSuccess);

    // Mock transaction to execute the callback
    (prisma.$transaction as jest.Mock).mockImplementation(
      async (callback: any) => {
        const tx = {
          $queryRaw: jest
            .fn()
            .mockResolvedValueOnce([mockListing]) // FOR UPDATE lock
            .mockResolvedValueOnce([{ total: BigInt(0) }]), // SUM(slotsRequested)
          user: {
            findUnique: jest
              .fn()
              .mockImplementation(({ where }: { where: { id: string } }) => {
                if (where.id === "owner-123") return Promise.resolve(mockOwner);
                if (where.id === "user-123") return Promise.resolve(mockTenant);
                return Promise.resolve(null);
              }),
          },
          booking: {
            findFirst: jest.fn().mockResolvedValue(null),
            count: jest.fn().mockResolvedValue(0),
            create: jest.fn().mockResolvedValue(mockBooking),
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

  it("returns RATE_LIMITED when user exceeds per-user rate limit", async () => {
    // First call (per-user) returns denied
    (checkRateLimit as jest.Mock).mockResolvedValueOnce(rateLimitDenied);

    const result = await createBooking(
      "listing-123",
      futureStart,
      futureEnd,
      800
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe("RATE_LIMITED");
    expect(result.error).toBe(
      "Too many booking requests. Please wait before trying again."
    );
  });

  it("returns RATE_LIMITED when IP exceeds per-IP rate limit", async () => {
    // First call (per-user) succeeds, second call (per-IP) denied
    (checkRateLimit as jest.Mock)
      .mockResolvedValueOnce(rateLimitSuccess)
      .mockResolvedValueOnce(rateLimitDenied);

    const result = await createBooking(
      "listing-123",
      futureStart,
      futureEnd,
      800
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe("RATE_LIMITED");
    expect(result.error).toBe(
      "Too many booking requests. Please wait before trying again."
    );
  });

  it("checks rate limit BEFORE transaction (transaction never called when rate limited)", async () => {
    (checkRateLimit as jest.Mock).mockResolvedValueOnce(rateLimitDenied);

    await createBooking("listing-123", futureStart, futureEnd, 800);

    expect(checkRateLimit).toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("allows booking when both rate limits pass (smoke test)", async () => {
    (checkRateLimit as jest.Mock).mockResolvedValue(rateLimitSuccess);

    const result = await createBooking(
      "listing-123",
      futureStart,
      futureEnd,
      800
    );

    expect(result.success).toBe(true);
    expect(result.bookingId).toBe("booking-123");
    expect(checkRateLimit).toHaveBeenCalledTimes(2);
  });
});
