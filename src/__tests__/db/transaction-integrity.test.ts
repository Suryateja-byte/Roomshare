/**
 * Database transaction integrity tests for booking operations.
 *
 * Covers:
 * - Transaction rollback on internal validation failures
 * - Constraint violation handling (Prisma error codes)
 * - Concurrent booking safety at the mock level
 * - Duplicate booking detection (all active statuses)
 * - Slot availability edge cases and boundaries
 * - Empty/missing data handling
 * - Price validation tolerance
 *
 * All tests exercise createBooking WITHOUT an idempotencyKey so they
 * take the direct prisma.$transaction() path (lines 520-590 of booking.ts).
 */

// Mock @prisma/client FIRST — avoids SWC binary loading issues in WSL2
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

jest.mock("@/lib/prisma", () => ({
  prisma: {
    listing: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
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

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
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
jest.mock("@/lib/idempotency", () => ({
  withIdempotency: jest.fn((_key, _userId, _action, _body, fn) => fn()),
}));
jest.mock("@/lib/hold-constants", () => ({
  HOLD_TTL_MINUTES: 15,
  MAX_HOLDS_PER_USER: 3,
}));
jest.mock("@/lib/booking-audit", () => ({
  logBookingAudit: jest.fn(),
}));
jest.mock("@/lib/env", () => ({
  features: { multiSlotBooking: true, wholeUnitMode: true },
  getServerEnv: jest.fn(() => ({})),
}));

import { createBooking } from "@/app/actions/booking";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

// ─── Shared fixtures ───────────────────────────────────────────────────────

const mockSession = {
  user: { id: "user-123", email: "test@example.com", name: "Test User" },
};

const BASE_LISTING = {
  id: "listing-123",
  title: "Test Room",
  ownerId: "owner-456",
  totalSlots: 3,
  availableSlots: 3,
  status: "ACTIVE",
  price: 1000,
  bookingMode: "SHARED",
};

const BASE_OWNER = {
  id: "owner-456",
  name: "Host User",
  email: "host@example.com",
};

const BASE_TENANT = { id: "user-123", name: "Test User" };

// Use dates well in the future to pass Zod date validation.
const futureStart = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
const futureEnd = new Date(Date.now() + 210 * 24 * 60 * 60 * 1000);

const BASE_BOOKING = {
  id: "booking-789",
  listingId: "listing-123",
  tenantId: "user-123",
  startDate: futureStart,
  endDate: futureEnd,
  totalPrice: 6000,
  status: "PENDING",
  slotsRequested: 1,
};

/**
 * Build a standard passing tx mock.
 * Callers can override individual fields via the options object.
 */
function buildTxMock(opts: {
  listing?: object | null;
  usedSlots?: number;
  duplicateBooking?: object | null;
  overlapBooking?: object | null;
  owner?: object | null;
  tenant?: object | null;
  createdBooking?: object;
  onBookingCreate?: (args: { data: Record<string, unknown> }) => object;
}) {
  const {
    listing = BASE_LISTING,
    usedSlots = 0,
    duplicateBooking = null,
    overlapBooking = null,
    owner = BASE_OWNER,
    tenant = BASE_TENANT,
    createdBooking = BASE_BOOKING,
    onBookingCreate,
  } = opts;

  return {
    $queryRaw: jest
      .fn()
      // First call: listing FOR UPDATE lock
      .mockResolvedValueOnce(listing ? [listing] : [])
      // Second call: SUM of overlapping accepted slots
      .mockResolvedValueOnce([{ total: BigInt(usedSlots) }]),
    user: {
      findUnique: jest
        .fn()
        .mockImplementation(({ where }: { where: { id: string } }) => {
          if (where.id === "owner-456") return Promise.resolve(owner);
          if (where.id === "user-123") return Promise.resolve(tenant);
          return Promise.resolve(null);
        }),
    },
    booking: {
      findFirst: jest
        .fn()
        // First call: duplicate exact-date check
        .mockResolvedValueOnce(duplicateBooking)
        // Second call: overlapping date range check
        .mockResolvedValueOnce(overlapBooking),
      create: jest
        .fn()
        .mockImplementation((args: { data: Record<string, unknown> }) => {
          if (onBookingCreate) return Promise.resolve(onBookingCreate(args));
          return Promise.resolve(createdBooking);
        }),
    },
  };
}

/**
 * Wire up prisma.$transaction to invoke the callback with a given tx object.
 */
function setupTransaction(tx: object) {
  (prisma.$transaction as jest.Mock).mockImplementation(
    async (callback: (tx: object) => Promise<unknown>) => callback(tx)
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe("Booking transaction integrity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue(mockSession);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 1. Transaction rollback on failure
  // ═══════════════════════════════════════════════════════════════════════

  describe("transaction rollback on failure", () => {
    it("does not create booking when listing is not found (FOR UPDATE returns empty)", async () => {
      const tx = buildTxMock({ listing: null });
      setupTransaction(tx);

      const result = await createBooking(
        "listing-123",
        futureStart,
        futureEnd,
        1000
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Listing not found");
      expect(tx.booking.create).not.toHaveBeenCalled();
    });

    it("does not create booking when price has changed (stale client price)", async () => {
      const tx = buildTxMock({});
      setupTransaction(tx);

      // Client sends $1 but DB price is $1000
      const result = await createBooking(
        "listing-123",
        futureStart,
        futureEnd,
        1.0
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe("PRICE_CHANGED");
      expect(tx.booking.create).not.toHaveBeenCalled();
    });

    it("does not create booking when no available slots", async () => {
      // All 3 slots already used, requesting 1 more → 3+1 > 3
      const tx = buildTxMock({ usedSlots: 3 });
      setupTransaction(tx);

      const result = await createBooking(
        "listing-123",
        futureStart,
        futureEnd,
        1000
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Not enough available slots");
      expect(tx.booking.create).not.toHaveBeenCalled();
    });

    it("does not create booking when user already has overlapping booking", async () => {
      // The second booking.findFirst (overlap check) returns an existing booking
      const tx = buildTxMock({
        duplicateBooking: null,
        overlapBooking: { id: "existing-booking", status: "PENDING" },
      });
      setupTransaction(tx);

      const result = await createBooking(
        "listing-123",
        futureStart,
        futureEnd,
        1000
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("already have a booking request");
      expect(tx.booking.create).not.toHaveBeenCalled();
    });

    it("does not create booking when listing status is not ACTIVE", async () => {
      const inactiveListing = { ...BASE_LISTING, status: "INACTIVE" };
      const tx = buildTxMock({ listing: inactiveListing });
      setupTransaction(tx);

      const result = await createBooking(
        "listing-123",
        futureStart,
        futureEnd,
        1000
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("not currently available");
      expect(tx.booking.create).not.toHaveBeenCalled();
    });

    it("does not create booking when user is the listing owner", async () => {
      // Listing ownerId matches the session userId
      const ownedListing = { ...BASE_LISTING, ownerId: "user-123" };
      const tx = {
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce([ownedListing])
          .mockResolvedValueOnce([{ total: BigInt(0) }]),
        user: {
          findUnique: jest
            .fn()
            .mockImplementation(({ where }: { where: { id: string } }) => {
              if (where.id === "user-123")
                return Promise.resolve({
                  id: "user-123",
                  name: "Owner",
                  email: "owner@example.com",
                });
              return Promise.resolve(null);
            }),
        },
        booking: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn(),
        },
      };
      setupTransaction(tx);

      const result = await createBooking(
        "listing-123",
        futureStart,
        futureEnd,
        1000
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("cannot book your own listing");
      expect(tx.booking.create).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 2. Constraint violation handling
  // ═══════════════════════════════════════════════════════════════════════

  describe("constraint violation handling", () => {
    it("handles Prisma unique constraint error (P2002) gracefully", async () => {
      const p2002 = Object.assign(new Error("Unique constraint failed"), {
        code: "P2002",
      });
      (prisma.$transaction as jest.Mock).mockRejectedValue(p2002);

      const result = await createBooking(
        "listing-123",
        futureStart,
        futureEnd,
        1000
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to create booking");
    });

    it("handles Prisma foreign key constraint error (P2003) gracefully", async () => {
      const p2003 = Object.assign(new Error("Foreign key constraint failed"), {
        code: "P2003",
      });
      (prisma.$transaction as jest.Mock).mockRejectedValue(p2003);

      const result = await createBooking(
        "listing-123",
        futureStart,
        futureEnd,
        1000
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to create booking");
    });

    it("handles database connection errors gracefully", async () => {
      (prisma.$transaction as jest.Mock).mockRejectedValue(
        new Error("Connection refused")
      );

      const result = await createBooking(
        "listing-123",
        futureStart,
        futureEnd,
        1000
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to create booking");
    });

    it("returns structured error on transaction failure", async () => {
      (prisma.$transaction as jest.Mock).mockRejectedValue(
        new Error("DB timeout")
      );

      const result = await createBooking(
        "listing-123",
        futureStart,
        futureEnd,
        1000
      );

      expect(result).toMatchObject({
        success: false,
        error: expect.any(String),
      });
      // bookingId must not be present on failure
      expect(result.bookingId).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 3. Concurrent booking safety (mock-level)
  // ═══════════════════════════════════════════════════════════════════════

  describe("concurrent booking safety (mock-level)", () => {
    it("uses $transaction to ensure atomicity", async () => {
      const tx = buildTxMock({});
      setupTransaction(tx);

      await createBooking("listing-123", futureStart, futureEnd, 1000);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it("passes transaction client (tx) to all operations within transaction", async () => {
      const tx = buildTxMock({});
      setupTransaction(tx);

      const result = await createBooking(
        "listing-123",
        futureStart,
        futureEnd,
        1000
      );

      expect(result.success).toBe(true);
      // All booking operations must go through the tx client, not the top-level prisma
      expect(tx.booking.findFirst).toHaveBeenCalled();
      expect(tx.$queryRaw).toHaveBeenCalled();
      expect(tx.booking.create).toHaveBeenCalled();
      // Top-level prisma.booking.create must NOT be called directly
      expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    it("calls $queryRaw with FOR UPDATE lock for listing fetch", async () => {
      const tx = buildTxMock({});
      setupTransaction(tx);

      await createBooking("listing-123", futureStart, futureEnd, 1000);

      // The first $queryRaw call is the FOR UPDATE listing fetch.
      // We verify it was called (the SQL template contains FOR UPDATE).
      expect(tx.$queryRaw).toHaveBeenCalled();
      const firstCallArgs = (tx.$queryRaw as jest.Mock).mock.calls[0];
      // Tagged template literals pass a TemplateStringsArray as the first argument.
      // We check that the raw SQL strings array contains "FOR UPDATE".
      const templateParts: string[] = firstCallArgs[0];
      const fullSql = templateParts.join("");
      expect(fullSql).toContain("FOR UPDATE");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 4. Duplicate booking detection
  // ═══════════════════════════════════════════════════════════════════════

  describe("duplicate booking detection", () => {
    it("detects existing PENDING booking for same dates", async () => {
      const existingBooking = {
        id: "existing-1",
        status: "PENDING",
        startDate: futureStart,
        endDate: futureEnd,
      };
      const tx = buildTxMock({ duplicateBooking: existingBooking });
      setupTransaction(tx);

      const result = await createBooking(
        "listing-123",
        futureStart,
        futureEnd,
        1000
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("already have a booking request");
    });

    it("detects existing ACCEPTED booking for same dates", async () => {
      const existingBooking = {
        id: "existing-2",
        status: "ACCEPTED",
        startDate: futureStart,
        endDate: futureEnd,
      };
      const tx = buildTxMock({ duplicateBooking: existingBooking });
      setupTransaction(tx);

      const result = await createBooking(
        "listing-123",
        futureStart,
        futureEnd,
        1000
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("already have a booking request");
    });

    it("detects existing HELD booking for same dates", async () => {
      const existingBooking = {
        id: "existing-3",
        status: "HELD",
        startDate: futureStart,
        endDate: futureEnd,
      };
      const tx = buildTxMock({ duplicateBooking: existingBooking });
      setupTransaction(tx);

      const result = await createBooking(
        "listing-123",
        futureStart,
        futureEnd,
        1000
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("already have a booking request");
    });

    it("allows booking when existing booking is CANCELLED", async () => {
      // A CANCELLED booking must not block a new one: booking.findFirst
      // filters only PENDING/ACCEPTED/HELD, so it returns null for CANCELLED.
      const tx = buildTxMock({ duplicateBooking: null, overlapBooking: null });
      setupTransaction(tx);

      const result = await createBooking(
        "listing-123",
        futureStart,
        futureEnd,
        1000
      );

      expect(result.success).toBe(true);
      expect(result.bookingId).toBe("booking-789");
    });

    it("allows booking when existing booking is REJECTED", async () => {
      // Same as CANCELLED: REJECTED status is excluded from the findFirst filter.
      const tx = buildTxMock({ duplicateBooking: null, overlapBooking: null });
      setupTransaction(tx);

      const result = await createBooking(
        "listing-123",
        futureStart,
        futureEnd,
        1000
      );

      expect(result.success).toBe(true);
      expect(result.bookingId).toBe("booking-789");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 5. Slot availability edge cases
  // ═══════════════════════════════════════════════════════════════════════

  describe("slot availability edge cases", () => {
    it("allows booking when exactly enough slots available (boundary)", async () => {
      // totalSlots=3, usedSlots=2, requesting 1 → 2+1=3 === 3 → pass (not >)
      const tx = buildTxMock({ usedSlots: 2 });
      setupTransaction(tx);

      const result = await createBooking(
        "listing-123",
        futureStart,
        futureEnd,
        1000,
        1
      );

      expect(result.success).toBe(true);
    });

    it("rejects booking when slots would be exceeded by 1", async () => {
      // totalSlots=3, usedSlots=3, requesting 1 → 3+1=4 > 3 → fail
      const tx = buildTxMock({ usedSlots: 3 });
      setupTransaction(tx);

      const result = await createBooking(
        "listing-123",
        futureStart,
        futureEnd,
        1000,
        1
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Not enough available slots");
      // Error message should tell the user how many are left
      expect(result.error).toContain("0 of 3 slots available");
    });

    it("handles WHOLE_UNIT mode by forcing slotsRequested to totalSlots", async () => {
      const wholeUnitListing = {
        ...BASE_LISTING,
        bookingMode: "WHOLE_UNIT",
        totalSlots: 4,
        availableSlots: 4,
      };
      let capturedSlotsRequested: number | undefined;

      const tx = {
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce([wholeUnitListing])
          .mockResolvedValueOnce([{ total: BigInt(0) }]),
        user: {
          findUnique: jest
            .fn()
            .mockImplementation(({ where }: { where: { id: string } }) => {
              if (where.id === "owner-456") return Promise.resolve(BASE_OWNER);
              if (where.id === "user-123") return Promise.resolve(BASE_TENANT);
              return Promise.resolve(null);
            }),
        },
        booking: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest
            .fn()
            .mockImplementation((args: { data: Record<string, unknown> }) => {
              capturedSlotsRequested = args.data.slotsRequested as number;
              return Promise.resolve({
                ...BASE_BOOKING,
                slotsRequested: args.data.slotsRequested,
              });
            }),
        },
      };
      setupTransaction(tx);

      // Client sends slotsRequested=1 but WHOLE_UNIT should force it to totalSlots=4
      const result = await createBooking(
        "listing-123",
        futureStart,
        futureEnd,
        1000,
        1
      );

      expect(result.success).toBe(true);
      expect(capturedSlotsRequested).toBe(4);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 6. Empty result handling
  // ═══════════════════════════════════════════════════════════════════════

  describe("empty result handling", () => {
    it("handles empty listing query result", async () => {
      // $queryRaw returns [] for the listing fetch (simulates no row)
      const tx = buildTxMock({ listing: null });
      setupTransaction(tx);

      const result = await createBooking(
        "nonexistent-listing",
        futureStart,
        futureEnd,
        1000
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Listing not found");
    });

    it("handles missing owner for listing", async () => {
      // owner is null in the DB (orphaned listing)
      const tx = buildTxMock({ owner: null });
      setupTransaction(tx);

      const result = await createBooking(
        "listing-123",
        futureStart,
        futureEnd,
        1000
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Listing owner not found");
    });

    it("handles missing tenant info (no name)", async () => {
      // Tenant has no name — booking should still succeed with null name
      const namelessTenant = { id: "user-123", name: null };
      const tx = buildTxMock({ tenant: namelessTenant });
      setupTransaction(tx);

      const result = await createBooking(
        "listing-123",
        futureStart,
        futureEnd,
        1000
      );

      // Booking succeeds; notifications fall back to "Someone"
      expect(result.success).toBe(true);
      expect(result.bookingId).toBe("booking-789");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 7. Price validation
  // ═══════════════════════════════════════════════════════════════════════

  describe("price validation", () => {
    it("accepts price within $0.01 tolerance", async () => {
      const tx = buildTxMock({});
      setupTransaction(tx);

      // DB price is 1000; client sends 1000.005 → diff = 0.005 ≤ 0.01 → pass
      const result = await createBooking(
        "listing-123",
        futureStart,
        futureEnd,
        1000.005
      );

      expect(result.success).toBe(true);
    });

    it("rejects price that differs by more than $0.01", async () => {
      const tx = buildTxMock({});
      setupTransaction(tx);

      // DB price is 1000; client sends 1000.02 → diff = 0.02 > 0.01 → reject
      const result = await createBooking(
        "listing-123",
        futureStart,
        futureEnd,
        1000.02
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe("PRICE_CHANGED");
    });

    it("returns PRICE_CHANGED code with current price", async () => {
      const tx = buildTxMock({});
      setupTransaction(tx);

      // DB price is 1000; client sends a manipulated low value
      const result = await createBooking(
        "listing-123",
        futureStart,
        futureEnd,
        500
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe("PRICE_CHANGED");
      // currentPrice must reflect the authoritative DB value, not the client value
      expect(result.currentPrice).toBe(1000);
      expect(result.error).toContain("price has changed");
    });
  });
});
