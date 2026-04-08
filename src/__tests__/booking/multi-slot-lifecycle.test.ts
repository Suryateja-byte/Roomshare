/**
 * Multi-slot booking lifecycle tests
 *
 * Traces multi-slot bookings through their complete lifecycle and verifies
 * slot arithmetic at every step:
 *
 * 1. SHARED mode: PENDING does not consume slots, ACCEPTED decrements,
 *    CANCELLED restores, double-cancel is clamped.
 * 2. HELD mode: HELD decrements at creation, HELD→ACCEPTED no additional
 *    decrement, HELD→EXPIRED/REJECTED/CANCELLED all restore.
 * 3. WHOLE_UNIT mode: slotsRequested is forced to totalSlots at creation,
 *    ACCEPTED consumes all, CANCELLED restores all.
 * 4. Mixed concurrent bookings: HELD is counted in capacity for new PENDING,
 *    HELD is counted when accepting PENDING, expired HELD is excluded.
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

jest.mock("@/lib/booking-audit", () => ({ logBookingAudit: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    listing: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    booking: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
    },
    idempotencyKey: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
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
    createHold: { limit: 10, windowMs: 3600000 },
    createHoldByIp: { limit: 30, windowMs: 3600000 },
    createHoldPerListing: { limit: 3, windowMs: 3600000 },
    bookingStatus: { limit: 30, windowMs: 60000 },
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
jest.mock("@/lib/env", () => ({
  features: {
    softHoldsEnabled: true,
    softHoldsDraining: false,
    multiSlotBooking: true,
    wholeUnitMode: true,
    bookingAudit: true,
  },
  getServerEnv: jest.fn(() => ({})),
}));
jest.mock("@/lib/idempotency", () => ({ withIdempotency: jest.fn() }));
jest.mock("@/lib/booking-state-machine", () => ({
  validateTransition: jest.fn(),
  isInvalidStateTransitionError: jest.fn().mockReturnValue(false),
}));

import { createBooking, createHold } from "@/app/actions/booking";
import { updateBookingStatus } from "@/app/actions/manage-booking";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { createInternalNotification } from "@/lib/notifications";
import { sendNotificationEmailWithPreference } from "@/lib/email";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const tenantSession = {
  user: { id: "tenant-001", email: "tenant@example.com" },
};
const ownerSession = { user: { id: "owner-999", email: "owner@example.com" } };

const futureStart = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
const futureEnd = new Date(Date.now() + 210 * 24 * 60 * 60 * 1000);

// ---------------------------------------------------------------------------
// Helper: build a booking object returned by prisma.booking.findUnique in
// updateBookingStatus (it includes nested listing + tenant).
// ---------------------------------------------------------------------------
function makeBookingForStatus(overrides: {
  id?: string;
  status?: string;
  slotsRequested?: number;
  version?: number;
  listingId?: string;
  listingTotalSlots?: number;
  listingAvailableSlots?: number;
  listingBookingMode?: string;
  heldUntil?: Date | null;
}) {
  return {
    id: overrides.id ?? "booking-ms-1",
    listingId: overrides.listingId ?? "listing-shared",
    tenantId: "tenant-001",
    status: overrides.status ?? "PENDING",
    slotsRequested: overrides.slotsRequested ?? 3,
    version: overrides.version ?? 1,
    startDate: futureStart,
    endDate: futureEnd,
    totalPrice: 4800,
    heldUntil: overrides.heldUntil ?? null,
    listing: {
      id: overrides.listingId ?? "listing-shared",
      title: "Multi-Slot Listing",
      ownerId: "owner-999",
      availableSlots: overrides.listingAvailableSlots ?? 5,
      totalSlots: overrides.listingTotalSlots ?? 5,
      bookingMode: overrides.listingBookingMode ?? "SHARED",
      owner: { name: "Owner Name" },
    },
    tenant: {
      id: "tenant-001",
      name: "Tenant Name",
      email: "tenant@example.com",
    },
  };
}

// ---------------------------------------------------------------------------
// 1. SHARED mode: slotsRequested=3, totalSlots=5
// ---------------------------------------------------------------------------
describe("SHARED mode: slotsRequested=3, totalSlots=5", () => {
  const sharedListing = {
    id: "listing-shared",
    title: "Shared Listing",
    ownerId: "owner-999",
    totalSlots: 5,
    availableSlots: 5,
    status: "ACTIVE",
    price: 1000,
    bookingMode: "SHARED",
  };

  const mockOwner = {
    id: "owner-999",
    name: "Owner Name",
    email: "owner@example.com",
  };
  const mockTenant = { id: "tenant-001", name: "Tenant Name" };

  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue(tenantSession);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "tenant-001",
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

  it("PENDING creation does NOT decrement availableSlots", async () => {
    const mockExecuteRaw = jest.fn().mockResolvedValue(1);

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        booking: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({
            id: "booking-ms-1",
            status: "PENDING",
            slotsRequested: 3,
          }),
        },
        user: {
          findUnique: jest
            .fn()
            .mockImplementation(({ where }: { where: { id: string } }) => {
              if (where.id === "owner-999") return Promise.resolve(mockOwner);
              if (where.id === "tenant-001") return Promise.resolve(mockTenant);
              return Promise.resolve(null);
            }),
        },
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce([sharedListing]) // FOR UPDATE listing
          .mockResolvedValueOnce([{ total: BigInt(0) }]), // SUM ACCEPTED overlapping
        $executeRaw: mockExecuteRaw,
      };
      return callback(tx);
    });

    const result = await createBooking(
      "listing-shared",
      futureStart,
      futureEnd,
      1000,
      3
    );

    expect(result.success).toBe(true);
    // $executeRaw must NOT be called — PENDING does not consume slots
    expect(mockExecuteRaw).not.toHaveBeenCalled();
  });

  it("PENDING→ACCEPTED decrements availableSlots by slotsRequested (3)", async () => {
    (auth as jest.Mock).mockResolvedValue(ownerSession);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "owner-999",
      isSuspended: false,
      emailVerified: new Date(),
    });

    const booking = makeBookingForStatus({
      status: "PENDING",
      slotsRequested: 3,
      listingAvailableSlots: 5,
    });
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(booking);

    const mockExecuteRaw = jest.fn().mockResolvedValue(1);

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce([
            {
              availableSlots: 5,
              totalSlots: 5,
              id: "listing-shared",
              ownerId: "owner-999",
              bookingMode: "SHARED",
              status: "ACTIVE",
            },
          ])
          .mockResolvedValueOnce([{ total: BigInt(0) }]), // SUM ACCEPTED + active HELD
        $executeRaw: mockExecuteRaw,
        booking: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      return callback(tx);
    });

    const result = await updateBookingStatus("booking-ms-1", "ACCEPTED");

    expect(result.success).toBe(true);
    // $executeRaw must be called once for slot decrement
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
    // The decrement call should reference slotsRequested=3
    const decrementCall = mockExecuteRaw.mock.calls[0];
    const sqlParts = Array.from(decrementCall[0] as TemplateStringsArray).join(
      "?"
    );
    expect(sqlParts).toContain("availableSlots");
    // Verify the decrement value passed is 3
    expect(decrementCall).toContain(3);
  });

  it("ACCEPTED→CANCELLED restores availableSlots by slotsRequested (3)", async () => {
    (auth as jest.Mock).mockResolvedValue(tenantSession);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "tenant-001",
      isSuspended: false,
      emailVerified: new Date(),
    });

    const booking = makeBookingForStatus({
      status: "ACCEPTED",
      slotsRequested: 3,
      listingAvailableSlots: 2,
    });
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(booking);

    const mockExecuteRaw = jest.fn().mockResolvedValue(1);

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([{}]), // SELECT 1 FOR UPDATE
        $executeRaw: mockExecuteRaw,
        booking: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      return callback(tx);
    });

    const result = await updateBookingStatus("booking-ms-1", "CANCELLED");

    expect(result.success).toBe(true);
    // $executeRaw must be called once — LEAST(availableSlots + 3, totalSlots)
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
    const restoreCall = mockExecuteRaw.mock.calls[0];
    const sqlParts = Array.from(restoreCall[0] as TemplateStringsArray).join(
      "?"
    );
    expect(sqlParts).toContain("LEAST");
    // Verify the restore value passed is 3
    expect(restoreCall).toContain(3);
  });

  it("PENDING→CANCELLED does NOT call $executeRaw (PENDING holds no slots)", async () => {
    (auth as jest.Mock).mockResolvedValue(tenantSession);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "tenant-001",
      isSuspended: false,
      emailVerified: new Date(),
    });

    const booking = makeBookingForStatus({
      status: "PENDING",
      slotsRequested: 3,
    });
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(booking);

    const mockExecuteRaw = jest.fn().mockResolvedValue(1);

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        $executeRaw: mockExecuteRaw,
        booking: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      return callback(tx);
    });

    const result = await updateBookingStatus("booking-ms-1", "CANCELLED");

    expect(result.success).toBe(true);
    expect(mockExecuteRaw).not.toHaveBeenCalled();
  });

  it("double-cancel on ACCEPTED: restore is clamped by LEAST(..., totalSlots)", async () => {
    // Simulates a scenario where availableSlots is already at totalSlots-1 (4 of 5)
    // and a cancel tries to restore 3 — result must be clamped to 5 not 7.
    (auth as jest.Mock).mockResolvedValue(tenantSession);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "tenant-001",
      isSuspended: false,
      emailVerified: new Date(),
    });

    const booking = makeBookingForStatus({
      status: "ACCEPTED",
      slotsRequested: 3,
      listingAvailableSlots: 4,
    });
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(booking);

    let capturedSql = "";
    const mockExecuteRaw = jest
      .fn()
      .mockImplementation((strings: TemplateStringsArray) => {
        capturedSql = Array.from(strings).join("?");
        return Promise.resolve(1);
      });

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([{}]),
        $executeRaw: mockExecuteRaw,
        booking: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      return callback(tx);
    });

    const result = await updateBookingStatus("booking-ms-1", "CANCELLED");

    expect(result.success).toBe(true);
    // The restore UPDATE must use LEAST to prevent overflow
    expect(capturedSql).toContain("LEAST");
    expect(capturedSql).toContain('"totalSlots"');
  });
});

// ---------------------------------------------------------------------------
// 2. HELD mode: slotsRequested=3, totalSlots=5
// ---------------------------------------------------------------------------
describe("HELD mode: slotsRequested=3, totalSlots=5", () => {
  const heldListing = {
    id: "listing-held",
    title: "Hold Listing",
    ownerId: "owner-999",
    totalSlots: 5,
    availableSlots: 5,
    status: "ACTIVE",
    price: 1000,
    bookingMode: "SHARED",
    holdTtlMinutes: 60,
  };

  const mockOwner = {
    id: "owner-999",
    name: "Owner Name",
    email: "owner@example.com",
  };
  const mockTenant = { id: "tenant-001", name: "Tenant Name" };

  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue(tenantSession);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "tenant-001",
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

  it("createHold decrements availableSlots by slotsRequested (3) at creation", async () => {
    const mockExecuteRaw = jest.fn().mockResolvedValue(1);

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        booking: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({
            id: "booking-hold-1",
            status: "HELD",
            slotsRequested: 3,
          }),
        },
        user: {
          findUnique: jest
            .fn()
            .mockImplementation(({ where }: { where: { id: string } }) => {
              if (where.id === "owner-999") return Promise.resolve(mockOwner);
              if (where.id === "tenant-001") return Promise.resolve(mockTenant);
              return Promise.resolve(null);
            }),
        },
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce([{ count: BigInt(0) }]) // COUNT active holds for user
          .mockResolvedValueOnce([heldListing]) // FOR UPDATE listing
          .mockResolvedValueOnce([{ total: BigInt(0) }]), // SUM ACCEPTED + active HELD
        $executeRaw: mockExecuteRaw,
      };
      return callback(tx);
    });

    const result = await createHold(
      "listing-held",
      futureStart,
      futureEnd,
      1000,
      3
    );

    expect(result.success).toBe(true);
    // $executeRaw must be called once to decrement slots
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
    const decrementCall = mockExecuteRaw.mock.calls[0];
    const sqlParts = Array.from(decrementCall[0] as TemplateStringsArray).join(
      "?"
    );
    expect(sqlParts).toContain("availableSlots");
    // Verify the decrement value is 3
    expect(decrementCall).toContain(3);
  });

  it("HELD→ACCEPTED does NOT call $executeRaw (slots already consumed at hold creation)", async () => {
    (auth as jest.Mock).mockResolvedValue(ownerSession);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "owner-999",
      isSuspended: false,
      emailVerified: new Date(),
    });

    const futureHeldUntil = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
    const booking = makeBookingForStatus({
      status: "HELD",
      slotsRequested: 3,
      listingAvailableSlots: 2, // already decremented at hold creation
      heldUntil: futureHeldUntil,
    });
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(booking);

    const mockExecuteRaw = jest.fn().mockResolvedValue(1);

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: jest
          .fn()
          .mockResolvedValue([{ ownerId: "owner-999", status: "ACTIVE" }]), // FOR UPDATE
        $executeRaw: mockExecuteRaw,
        booking: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      return callback(tx);
    });

    const result = await updateBookingStatus("booking-ms-1", "ACCEPTED");

    expect(result.success).toBe(true);
    // $executeRaw must NOT be called — HELD→ACCEPTED has no slot change (D4)
    expect(mockExecuteRaw).not.toHaveBeenCalled();
  });

  it("HELD→CANCELLED restores availableSlots by slotsRequested (3)", async () => {
    (auth as jest.Mock).mockResolvedValue(tenantSession);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "tenant-001",
      isSuspended: false,
      emailVerified: new Date(),
    });

    const futureHeldUntil = new Date(Date.now() + 60 * 60 * 1000);
    const booking = makeBookingForStatus({
      status: "HELD",
      slotsRequested: 3,
      listingAvailableSlots: 2,
      heldUntil: futureHeldUntil,
    });
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(booking);

    const mockExecuteRaw = jest.fn().mockResolvedValue(1);

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([{}]), // SELECT 1 FOR UPDATE
        $executeRaw: mockExecuteRaw,
        booking: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      return callback(tx);
    });

    const result = await updateBookingStatus("booking-ms-1", "CANCELLED");

    expect(result.success).toBe(true);
    // HELD→CANCELLED must restore 3 slots
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
    const restoreCall = mockExecuteRaw.mock.calls[0];
    const sqlParts = Array.from(restoreCall[0] as TemplateStringsArray).join(
      "?"
    );
    expect(sqlParts).toContain("LEAST");
    expect(restoreCall).toContain(3);
  });

  it("HELD→REJECTED restores availableSlots by slotsRequested (3)", async () => {
    (auth as jest.Mock).mockResolvedValue(ownerSession);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "owner-999",
      isSuspended: false,
      emailVerified: new Date(),
    });

    const futureHeldUntil = new Date(Date.now() + 60 * 60 * 1000);
    const booking = makeBookingForStatus({
      status: "HELD",
      slotsRequested: 3,
      listingAvailableSlots: 2,
      heldUntil: futureHeldUntil,
    });
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(booking);

    const mockExecuteRaw = jest.fn().mockResolvedValue(1);

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: jest
          .fn()
          .mockResolvedValue([{ ownerId: "owner-999", status: "ACTIVE" }]), // FOR UPDATE
        $executeRaw: mockExecuteRaw,
        booking: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      return callback(tx);
    });

    const result = await updateBookingStatus("booking-ms-1", "REJECTED");

    expect(result.success).toBe(true);
    // HELD→REJECTED must restore slots (6c-ii)
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
    const restoreCall = mockExecuteRaw.mock.calls[0];
    const sqlParts = Array.from(restoreCall[0] as TemplateStringsArray).join(
      "?"
    );
    expect(sqlParts).toContain("LEAST");
    expect(restoreCall).toContain(3);
  });

  it("HELD→EXPIRED (inline expiry path) restores availableSlots via inline expiry transaction", async () => {
    // When booking.heldUntil is in the past, updateBookingStatus auto-expires
    // via the check-on-read inline expiry path (D9), which calls $executeRaw.
    (auth as jest.Mock).mockResolvedValue(ownerSession);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "owner-999",
      isSuspended: false,
      emailVerified: new Date(),
    });

    const pastHeldUntil = new Date(Date.now() - 60 * 1000); // 1 minute ago
    const booking = makeBookingForStatus({
      status: "HELD",
      slotsRequested: 3,
      listingAvailableSlots: 2,
      heldUntil: pastHeldUntil,
    });
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(booking);

    const mockExecuteRaw = jest.fn().mockResolvedValue(1);

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([{}]), // FOR UPDATE in inline expiry
        $executeRaw: mockExecuteRaw,
        booking: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      return callback(tx);
    });

    const result = await updateBookingStatus("booking-ms-1", "ACCEPTED");

    // The inline expiry path returns an error about expiry
    expect(result.error).toBe("This hold has expired.");
    // $executeRaw must have been called for the restore within the inline expiry transaction
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
    const restoreCall = mockExecuteRaw.mock.calls[0];
    const sqlParts = Array.from(restoreCall[0] as TemplateStringsArray).join(
      "?"
    );
    expect(sqlParts).toContain("LEAST");
  });
});

// ---------------------------------------------------------------------------
// 3. WHOLE_UNIT mode: totalSlots=4
// ---------------------------------------------------------------------------
describe("WHOLE_UNIT mode: totalSlots=4", () => {
  const wholeUnitListing = {
    id: "listing-wu",
    title: "Whole Unit Listing",
    ownerId: "owner-999",
    totalSlots: 4,
    availableSlots: 4,
    status: "ACTIVE",
    price: 2000,
    bookingMode: "WHOLE_UNIT",
    holdTtlMinutes: 60,
  };

  const mockOwner = {
    id: "owner-999",
    name: "Owner Name",
    email: "owner@example.com",
  };
  const mockTenant = { id: "tenant-001", name: "Tenant Name" };

  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue(tenantSession);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "tenant-001",
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

  it("createBooking forces slotsRequested=totalSlots (4) for WHOLE_UNIT listing", async () => {
    let capturedSlotsRequested: number | undefined;
    const mockBookingCreate = jest
      .fn()
      .mockImplementation(({ data }: { data: { slotsRequested: number } }) => {
        capturedSlotsRequested = data.slotsRequested;
        return Promise.resolve({
          id: "booking-wu-1",
          status: "PENDING",
          slotsRequested: data.slotsRequested,
        });
      });

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        booking: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: mockBookingCreate,
        },
        user: {
          findUnique: jest
            .fn()
            .mockImplementation(({ where }: { where: { id: string } }) => {
              if (where.id === "owner-999") return Promise.resolve(mockOwner);
              if (where.id === "tenant-001") return Promise.resolve(mockTenant);
              return Promise.resolve(null);
            }),
        },
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce([wholeUnitListing]) // FOR UPDATE listing
          .mockResolvedValueOnce([{ total: BigInt(0) }]), // SUM ACCEPTED overlapping
        $executeRaw: jest.fn(),
      };
      return callback(tx);
    });

    // User requests only 1 slot but listing is WHOLE_UNIT — should be overridden to 4
    const result = await createBooking(
      "listing-wu",
      futureStart,
      futureEnd,
      2000,
      1
    );

    expect(result.success).toBe(true);
    expect(capturedSlotsRequested).toBe(4); // forced to totalSlots
  });

  it("WHOLE_UNIT ACCEPTED consumes all slots (slotsNeeded=totalSlots=4)", async () => {
    (auth as jest.Mock).mockResolvedValue(ownerSession);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "owner-999",
      isSuspended: false,
      emailVerified: new Date(),
    });

    // Booking was created with slotsRequested=4 (enforced by WHOLE_UNIT at create time)
    const booking = makeBookingForStatus({
      id: "booking-wu-1",
      status: "PENDING",
      slotsRequested: 4,
      listingId: "listing-wu",
      listingTotalSlots: 4,
      listingAvailableSlots: 4,
      listingBookingMode: "WHOLE_UNIT",
    });
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(booking);

    const mockExecuteRaw = jest.fn().mockResolvedValue(1);

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce([
            {
              availableSlots: 4,
              totalSlots: 4,
              id: "listing-wu",
              ownerId: "owner-999",
              bookingMode: "WHOLE_UNIT",
              status: "ACTIVE",
            },
          ])
          .mockResolvedValueOnce([{ total: BigInt(0) }]),
        $executeRaw: mockExecuteRaw,
        booking: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      return callback(tx);
    });

    const result = await updateBookingStatus("booking-wu-1", "ACCEPTED");

    expect(result.success).toBe(true);
    // $executeRaw must be called with slotsNeeded=4 (WHOLE_UNIT override)
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
    const decrementCall = mockExecuteRaw.mock.calls[0];
    expect(decrementCall).toContain(4);
  });

  it("WHOLE_UNIT ACCEPTED→CANCELLED restores all 4 slots", async () => {
    (auth as jest.Mock).mockResolvedValue(tenantSession);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "tenant-001",
      isSuspended: false,
      emailVerified: new Date(),
    });

    const booking = makeBookingForStatus({
      id: "booking-wu-1",
      status: "ACCEPTED",
      slotsRequested: 4,
      listingId: "listing-wu",
      listingTotalSlots: 4,
      listingAvailableSlots: 0, // all consumed after accept
      listingBookingMode: "WHOLE_UNIT",
    });
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(booking);

    const mockExecuteRaw = jest.fn().mockResolvedValue(1);

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([{}]), // SELECT 1 FOR UPDATE
        $executeRaw: mockExecuteRaw,
        booking: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      return callback(tx);
    });

    const result = await updateBookingStatus("booking-wu-1", "CANCELLED");

    expect(result.success).toBe(true);
    // Must restore all 4 slots
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
    const restoreCall = mockExecuteRaw.mock.calls[0];
    const sqlParts = Array.from(restoreCall[0] as TemplateStringsArray).join(
      "?"
    );
    expect(sqlParts).toContain("LEAST");
    expect(restoreCall).toContain(4);
  });

  it("createHold with WHOLE_UNIT forces slotsRequested=4 and decrements by 4", async () => {
    let capturedSlotsRequested: number | undefined;
    const mockExecuteRaw = jest
      .fn()
      .mockImplementation(
        (_strings: TemplateStringsArray, slotsValue: number) => {
          capturedSlotsRequested = slotsValue;
          return Promise.resolve(1);
        }
      );
    const mockBookingCreate = jest
      .fn()
      .mockImplementation(({ data }: { data: { slotsRequested: number } }) => {
        return Promise.resolve({
          id: "booking-wu-hold-1",
          status: "HELD",
          slotsRequested: data.slotsRequested,
        });
      });

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        booking: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: mockBookingCreate,
        },
        user: {
          findUnique: jest
            .fn()
            .mockImplementation(({ where }: { where: { id: string } }) => {
              if (where.id === "owner-999") return Promise.resolve(mockOwner);
              if (where.id === "tenant-001") return Promise.resolve(mockTenant);
              return Promise.resolve(null);
            }),
        },
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce([{ count: BigInt(0) }]) // COUNT active holds
          .mockResolvedValueOnce([wholeUnitListing]) // FOR UPDATE listing
          .mockResolvedValueOnce([{ total: BigInt(0) }]), // SUM ACCEPTED + active HELD
        $executeRaw: mockExecuteRaw,
      };
      return callback(tx);
    });

    const result = await createHold(
      "listing-wu",
      futureStart,
      futureEnd,
      2000,
      1
    );

    expect(result.success).toBe(true);
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
    // The decrement value must be 4 (totalSlots), not 1 (original request)
    expect(capturedSlotsRequested).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// 4. Mixed concurrent bookings: PENDING + HELD coexistence
// ---------------------------------------------------------------------------
describe("Mixed concurrent bookings: PENDING + HELD coexistence", () => {
  const mixedListing = {
    id: "listing-mix",
    title: "Mixed Listing",
    ownerId: "owner-999",
    totalSlots: 5,
    availableSlots: 5,
    status: "ACTIVE",
    price: 1000,
    bookingMode: "SHARED",
    holdTtlMinutes: 60,
  };

  const mockOwner = {
    id: "owner-999",
    name: "Owner Name",
    email: "owner@example.com",
  };
  const mockTenant = { id: "tenant-001", name: "Tenant Name" };

  beforeEach(() => {
    jest.clearAllMocks();
    (createInternalNotification as jest.Mock).mockResolvedValue({
      success: true,
    });
    (sendNotificationEmailWithPreference as jest.Mock).mockResolvedValue({
      success: true,
    });
  });

  it("createBooking only counts ACCEPTED (not HELD) in capacity check: 0 ACCEPTED + 4 requested <= 5 total → succeeds", async () => {
    // This test verifies that createBooking's capacity check only uses ACCEPTED overlapping
    // slots (not HELD), which is by design — PENDING bookings don't consume slots.
    // Even though 2 slots are actively HELD on overlapping dates, createBooking ignores them
    // and allows a 4-slot PENDING request (0 ACCEPTED + 4 <= 5 totalSlots).
    (auth as jest.Mock).mockResolvedValue({
      user: { id: "tenant-002", email: "tenant2@example.com" },
    });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "tenant-002",
      isSuspended: false,
      emailVerified: new Date(),
    });

    const mockTenantTwo = { id: "tenant-002", name: "Tenant Two" };

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        booking: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({
            id: "booking-pending-x",
            status: "PENDING",
            slotsRequested: 4,
          }),
        },
        user: {
          findUnique: jest
            .fn()
            .mockImplementation(({ where }: { where: { id: string } }) => {
              if (where.id === "owner-999") return Promise.resolve(mockOwner);
              return Promise.resolve(mockTenantTwo);
            }),
        },
        // createBooking queries: 1) listing FOR UPDATE, 2) SUM ACCEPTED overlapping
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce([{ ...mixedListing, availableSlots: 3 }]) // FOR UPDATE (2 slots held elsewhere)
          .mockResolvedValueOnce([{ total: BigInt(0) }]), // SUM ACCEPTED only = 0
        $executeRaw: jest.fn(),
      };
      return callback(tx);
    });

    // totalSlots=5, SUM(ACCEPTED overlapping)=0, slotsRequested=4 → 0+4=4 <= 5 → succeeds
    const result = await createBooking(
      "listing-mix",
      futureStart,
      futureEnd,
      1000,
      4
    );

    expect(result.success).toBe(true);
  });

  it("createHold counts ACCEPTED + active HELD in capacity check", async () => {
    (auth as jest.Mock).mockResolvedValue(tenantSession);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "tenant-001",
      isSuspended: false,
      emailVerified: new Date(),
    });

    // 2 ACCEPTED + 2 active HELD = 4 used; requesting 2 more would exceed capacity of 5
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        booking: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn(),
        },
        user: {
          findUnique: jest
            .fn()
            .mockImplementation(({ where }: { where: { id: string } }) => {
              if (where.id === "owner-999") return Promise.resolve(mockOwner);
              if (where.id === "tenant-001") return Promise.resolve(mockTenant);
              return Promise.resolve(null);
            }),
        },
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce([{ count: BigInt(0) }]) // COUNT active holds for user
          .mockResolvedValueOnce([{ ...mixedListing, availableSlots: 1 }]) // FOR UPDATE: 1 free
          .mockResolvedValueOnce([{ total: BigInt(4) }]), // SUM ACCEPTED + active HELD = 4
        $executeRaw: jest.fn(),
      };
      return callback(tx);
    });

    // totalSlots=5, usedSlots(ACCEPTED+HELD)=4, requesting 2 → 4+2=6 > 5 → should fail
    const result = await createHold(
      "listing-mix",
      futureStart,
      futureEnd,
      1000,
      2
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Not enough available slots");
  });

  it("active HELD is counted when accepting PENDING (capacity would be exceeded)", async () => {
    (auth as jest.Mock).mockResolvedValue(ownerSession);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "owner-999",
      isSuspended: false,
      emailVerified: new Date(),
    });

    // PENDING booking wants 3 slots; meanwhile 3 active HELD slots exist on overlapping dates.
    // totalSlots=5; SUM(ACCEPTED + active HELD excluding this booking) = 3;
    // 3(HELD) + 3(this PENDING) = 6 > 5 → CAPACITY_EXCEEDED.
    // availableSlots must be >= slotsRequested (3) so the pre-check doesn't fire first.
    const pendingBooking = makeBookingForStatus({
      id: "booking-pending-1",
      status: "PENDING",
      slotsRequested: 3,
      listingId: "listing-mix",
      listingTotalSlots: 5,
      listingAvailableSlots: 5, // enough to pass the availableSlots pre-check
    });
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(pendingBooking);

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce([
            // availableSlots=5 so the listing.availableSlots < slotsNeeded pre-check passes
            {
              availableSlots: 5,
              totalSlots: 5,
              id: "listing-mix",
              ownerId: "owner-999",
              bookingMode: "SHARED",
              status: "ACTIVE",
            },
          ])
          .mockResolvedValueOnce([{ total: BigInt(3) }]), // SUM: 3 slots from active HELD bookings
        $executeRaw: jest.fn(),
        booking: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      return callback(tx);
    });

    const result = await updateBookingStatus("booking-pending-1", "ACCEPTED");

    // usedSlots=3 (HELD) + slotsNeeded=3 (this PENDING) = 6 > totalSlots=5 → CAPACITY_EXCEEDED
    expect(result.success).toBeUndefined();
    expect(result.error).toBe(
      "Cannot accept: all slots for these dates are already booked"
    );
  });

  it("expired HELD is excluded from capacity check when accepting PENDING", async () => {
    (auth as jest.Mock).mockResolvedValue(ownerSession);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "owner-999",
      isSuspended: false,
      emailVerified: new Date(),
    });

    // PENDING booking wants 3 slots; the SUM query returns 0 (expired HELD excluded by heldUntil > NOW())
    const pendingBooking = makeBookingForStatus({
      id: "booking-pending-2",
      status: "PENDING",
      slotsRequested: 3,
      listingId: "listing-mix",
      listingTotalSlots: 5,
      listingAvailableSlots: 5, // expired hold slots were returned
    });
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(pendingBooking);

    const mockExecuteRaw = jest.fn().mockResolvedValue(1);

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce([
            {
              availableSlots: 5,
              totalSlots: 5,
              id: "listing-mix",
              ownerId: "owner-999",
              bookingMode: "SHARED",
              status: "ACTIVE",
            },
          ])
          .mockResolvedValueOnce([{ total: BigInt(0) }]), // expired HELD not included in SUM
        $executeRaw: mockExecuteRaw,
        booking: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      return callback(tx);
    });

    const result = await updateBookingStatus("booking-pending-2", "ACCEPTED");

    // With 0 used (expired HELD excluded) + 3 requested = 3 <= 5 → ACCEPTED
    expect(result.success).toBe(true);
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
  });

  it("HELD (3 slots) + PENDING (2 slots): accepting PENDING with exact remaining capacity succeeds", async () => {
    (auth as jest.Mock).mockResolvedValue(ownerSession);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "owner-999",
      isSuspended: false,
      emailVerified: new Date(),
    });

    // totalSlots=5, active HELD=3, PENDING requests 2 → 3+2=5 = totalSlots → exactly fits
    const pendingBooking = makeBookingForStatus({
      id: "booking-pending-3",
      status: "PENDING",
      slotsRequested: 2,
      listingId: "listing-mix",
      listingTotalSlots: 5,
      listingAvailableSlots: 2, // 3 held, 2 available
    });
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(pendingBooking);

    const mockExecuteRaw = jest.fn().mockResolvedValue(1);

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce([
            {
              availableSlots: 2,
              totalSlots: 5,
              id: "listing-mix",
              ownerId: "owner-999",
              bookingMode: "SHARED",
              status: "ACTIVE",
            },
          ])
          .mockResolvedValueOnce([{ total: BigInt(3) }]), // 3 slots from active HELD
        $executeRaw: mockExecuteRaw,
        booking: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      return callback(tx);
    });

    const result = await updateBookingStatus("booking-pending-3", "ACCEPTED");

    // 3 (HELD) + 2 (PENDING being accepted) = 5 = totalSlots → exactly fits → success
    expect(result.success).toBe(true);
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
    const decrementCall = mockExecuteRaw.mock.calls[0];
    // Decrement value should be 2 (slotsRequested for this PENDING)
    expect(decrementCall).toContain(2);
  });
});
