/**
 * Tests for concurrent multi-slot operations
 *
 * Verifies that capacity checks, slot accounting, and concurrency guards
 * behave correctly across competing createBooking, createHold, and
 * updateBookingStatus (ACCEPT) calls on shared multi-slot listings.
 *
 * CONCURRENCY NOTE: These tests simulate application-layer error handling
 * when overlap conditions are detected. True DB-level atomicity is enforced
 * by FOR UPDATE locks and SERIALIZABLE isolation on the real Postgres instance.
 */

// All mocks MUST appear before any imports per Jest hoisting rules.

jest.mock("@/lib/booking-audit", () => ({ logBookingAudit: jest.fn() }));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    listing: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    booking: {
      create: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
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

// ─── imports (after all mocks) ─────────────────────────────────────────────

import { createBooking, createHold } from "@/app/actions/booking";
import { updateBookingStatus } from "@/app/actions/manage-booking";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { createInternalNotification } from "@/lib/notifications";
import { sendNotificationEmailWithPreference } from "@/lib/email";

// ─── shared fixtures ────────────────────────────────────────────────────────

const futureStart = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
const futureEnd = new Date(Date.now() + 210 * 24 * 60 * 60 * 1000);

const LISTING_ID = "listing-1";
const OWNER_ID = "owner-1";
const TENANT_ID_A = "tenant-a";
const TENANT_ID_B = "tenant-b";

/** Shared listing fixture: 5 slots, SHARED mode */
const sharedListing = {
  id: LISTING_ID,
  title: "Test Listing",
  ownerId: OWNER_ID,
  totalSlots: 5,
  availableSlots: 5,
  status: "ACTIVE",
  price: 1000,
  bookingMode: "SHARED",
  holdTtlMinutes: 30,
};

const mockOwner = {
  id: OWNER_ID,
  name: "Host",
  email: "host@test.com",
};

const mockTenantA = { id: TENANT_ID_A, name: "Tenant A" };
const mockTenantB = { id: TENANT_ID_B, name: "Tenant B" };

/** Build a minimal tx mock for createBooking's executeBookingTransaction path. */
function makeBookingTx(opts: {
  listing?: object;
  usedSlots?: bigint;
  /** findFirst: null = no duplicate, otherwise returns an existing booking */
  duplicateBooking?: object | null;
  userOverlap?: object | null;
  ownerRecord?: object;
  tenantRecord?: object;
  createdBooking?: object;
}) {
  const {
    listing = sharedListing,
    usedSlots = BigInt(0),
    duplicateBooking = null,
    userOverlap = null,
    ownerRecord = mockOwner,
    tenantRecord = mockTenantA,
    createdBooking = {
      id: "booking-new",
      listingId: LISTING_ID,
      slotsRequested: 2,
    },
  } = opts;

  let findFirstCallCount = 0;

  return {
    $queryRaw: jest
      .fn()
      // First call: SELECT ... FOR UPDATE (listing)
      .mockResolvedValueOnce([listing])
      // Second call: SUM of ACCEPTED slots
      .mockResolvedValueOnce([{ total: usedSlots }]),
    booking: {
      findFirst: jest.fn().mockImplementation(() => {
        findFirstCallCount++;
        if (findFirstCallCount === 1) return Promise.resolve(duplicateBooking);
        // Second findFirst = userExistingBooking check
        return Promise.resolve(userOverlap);
      }),
      create: jest.fn().mockResolvedValue(createdBooking),
    },
    user: {
      findUnique: jest
        .fn()
        .mockImplementation(({ where }: { where: { id: string } }) => {
          if (where.id === OWNER_ID) return Promise.resolve(ownerRecord);
          return Promise.resolve(tenantRecord);
        }),
    },
  };
}

/** Build a minimal tx mock for updateBookingStatus PENDING→ACCEPTED path. */
function makeAcceptTx(opts: {
  listingRow?: object;
  usedSlots?: bigint;
  updateManyCount?: number;
  executeRawResult?: number;
}) {
  const {
    listingRow = {
      availableSlots: 5,
      totalSlots: 5,
      id: LISTING_ID,
      ownerId: OWNER_ID,
      bookingMode: "SHARED",
      status: "ACTIVE",
    },
    usedSlots = BigInt(0),
    updateManyCount = 1,
    executeRawResult = 1,
  } = opts;

  return {
    $queryRaw: jest
      .fn()
      // First call: FOR UPDATE (listing for ACCEPT)
      .mockResolvedValueOnce([listingRow])
      // Second call: SUM(ACCEPTED + HELD excluding current)
      .mockResolvedValueOnce([{ total: usedSlots }]),
    $executeRaw: jest.fn().mockResolvedValue(executeRawResult),
    booking: {
      updateMany: jest.fn().mockResolvedValue({ count: updateManyCount }),
    },
  };
}

/** Build a booking findUnique result for updateBookingStatus tests. */
function makeBookingRecord(opts?: {
  id?: string;
  status?: string;
  slotsRequested?: number;
  version?: number;
  heldUntil?: Date | null;
  listingOverrides?: object;
}) {
  const {
    id = "booking-1",
    status = "PENDING",
    slotsRequested = 3,
    version = 1,
    heldUntil = null,
    listingOverrides = {},
  } = opts ?? {};

  return {
    id,
    listingId: LISTING_ID,
    tenantId: TENANT_ID_A,
    status,
    version,
    slotsRequested,
    startDate: futureStart,
    endDate: futureEnd,
    heldUntil,
    listing: {
      id: LISTING_ID,
      ownerId: OWNER_ID,
      title: "Test Listing",
      availableSlots: 5,
      owner: { name: "Host" },
      ...listingOverrides,
    },
    tenant: {
      id: TENANT_ID_A,
      name: "Tenant",
      email: "tenant@test.com",
    },
  };
}

// ─── 1. Two bookings competing for last slots ────────────────────────────────

describe("Two bookings competing for last slots", () => {
  /**
   * Scenario: listing has 5 slots. Two tenants each request 2 slots.
   *
   * First booking (tenant A):
   *   SUM(ACCEPTED) = 2 (pre-existing). 2 + 2 = 4 ≤ 5 → succeeds.
   *
   * Second booking (tenant B — "after" first was accepted at DB level):
   *   SUM(ACCEPTED) = 4. 4 + 2 = 6 > 5 → fails with capacity error.
   */

  const tenantASession = { user: { id: TENANT_ID_A, email: "a@test.com" } };
  const tenantBSession = { user: { id: TENANT_ID_B, email: "b@test.com" } };

  beforeEach(() => {
    jest.clearAllMocks();
    (createInternalNotification as jest.Mock).mockResolvedValue({
      success: true,
    });
    (sendNotificationEmailWithPreference as jest.Mock).mockResolvedValue({
      success: true,
    });
  });

  it("first booking succeeds when used+requested ≤ totalSlots", async () => {
    (auth as jest.Mock).mockResolvedValue(tenantASession);

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = makeBookingTx({
        // 2 slots already accepted; we request 2 more → 4 ≤ 5, ok
        usedSlots: BigInt(2),
        createdBooking: {
          id: "booking-a",
          listingId: LISTING_ID,
          slotsRequested: 2,
        },
      });
      return callback(tx);
    });

    const result = await createBooking(
      LISTING_ID,
      futureStart,
      futureEnd,
      1000,
      2
    );

    expect(result.success).toBe(true);
    expect(result.bookingId).toBe("booking-a");
  });

  it("second booking fails when used+requested > totalSlots", async () => {
    (auth as jest.Mock).mockResolvedValue(tenantBSession);

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = makeBookingTx({
        // After first booking accepted: 4 slots used; requesting 2 more → 6 > 5, fail
        usedSlots: BigInt(4),
        tenantRecord: mockTenantB,
      });
      return callback(tx);
    });

    const result = await createBooking(
      LISTING_ID,
      futureStart,
      futureEnd,
      1000,
      2
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Not enough available slots");
    // Should report 1 slot remaining (5 - 4 = 1)
    expect(result.error).toContain("1 of 5 slots available");
  });

  it("boundary: exactly at capacity succeeds (used + requested == totalSlots)", async () => {
    (auth as jest.Mock).mockResolvedValue(tenantASession);

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = makeBookingTx({
        // 3 used, requesting 2 → 3 + 2 = 5 == totalSlots = 5, should succeed
        usedSlots: BigInt(3),
        createdBooking: {
          id: "booking-boundary",
          listingId: LISTING_ID,
          slotsRequested: 2,
        },
      });
      return callback(tx);
    });

    const result = await createBooking(
      LISTING_ID,
      futureStart,
      futureEnd,
      1000,
      2
    );

    expect(result.success).toBe(true);
  });

  it("boundary: one over capacity fails (used + requested == totalSlots + 1)", async () => {
    (auth as jest.Mock).mockResolvedValue(tenantBSession);

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = makeBookingTx({
        // 4 used, requesting 2 → 4 + 2 = 6 > 5, fail
        usedSlots: BigInt(4),
        tenantRecord: mockTenantB,
      });
      return callback(tx);
    });

    const result = await createBooking(
      LISTING_ID,
      futureStart,
      futureEnd,
      1000,
      2
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Not enough available slots");
  });
});

// ─── 2. Hold + booking competing for last slots ──────────────────────────────

describe("Hold + booking competing for last slots", () => {
  /**
   * Scenario:
   *
   * createBooking now counts ACCEPTED + active HELD in its capacity SUM.
   * This means a HELD booking blocks concurrent createBooking requests,
   * preventing misleading PENDING bookings for over-committed listings.
   *
   * Expired holds (heldUntil < NOW) are excluded from the SUM, so
   * capacity becomes available again when holds expire.
   *
   * The ACCEPT gate also includes HELD, providing defense-in-depth.
   */

  const tenantSession = { user: { id: TENANT_ID_A, email: "a@test.com" } };
  const ownerSession = { user: { id: OWNER_ID, email: "host@test.com" } };

  beforeEach(() => {
    jest.clearAllMocks();
    (createInternalNotification as jest.Mock).mockResolvedValue({
      success: true,
    });
    (sendNotificationEmailWithPreference as jest.Mock).mockResolvedValue({
      success: true,
    });
  });

  it("createBooking counts active HELD slots — rejects when holds fill capacity", async () => {
    (auth as jest.Mock).mockResolvedValue(tenantSession);

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      // SUM now includes ACCEPTED + active HELD: 3 held slots.
      // Request 3 more → 3+3=6 > 5 → fails with capacity error.
      const tx = makeBookingTx({
        usedSlots: BigInt(3), // SUM of ACCEPTED + active HELD
      });
      return callback(tx);
    });

    const result = await createBooking(
      LISTING_ID,
      futureStart,
      futureEnd,
      1000,
      3
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Not enough available slots");
  });

  it("createBooking succeeds when HELD bookings have expired (heldUntil < NOW)", async () => {
    (auth as jest.Mock).mockResolvedValue(tenantSession);

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      // Expired holds are excluded from SUM by the heldUntil > NOW() filter.
      // Only ACCEPTED slots counted: 0. Request 3 → 0+3=3 ≤ 5, succeeds.
      const tx = makeBookingTx({
        usedSlots: BigInt(0), // Expired holds excluded from SUM
        createdBooking: {
          id: "booking-pending",
          listingId: LISTING_ID,
          slotsRequested: 3,
        },
      });
      return callback(tx);
    });

    const result = await createBooking(
      LISTING_ID,
      futureStart,
      futureEnd,
      1000,
      3
    );

    expect(result.success).toBe(true);
    expect(result.bookingId).toBe("booking-pending");
  });

  it("ACCEPT of PENDING booking fails when HELD booking fills remaining capacity", async () => {
    (auth as jest.Mock).mockResolvedValue(ownerSession);

    const pendingBooking = makeBookingRecord({
      id: "booking-pending",
      status: "PENDING",
      slotsRequested: 3,
      version: 1,
    });

    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(pendingBooking);

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = makeAcceptTx({
        listingRow: {
          // availableSlots must be >= slotsNeeded (3) to pass the first guard,
          // so the SUM check is what triggers the CAPACITY_EXCEEDED failure.
          // The hold consumed 3 slots but availableSlots reflects a race where
          // the slot counter was not yet decremented (or is stale).
          availableSlots: 3,
          totalSlots: 5,
          id: LISTING_ID,
          ownerId: OWNER_ID,
          bookingMode: "SHARED",
          status: "ACTIVE",
        },
        // SUM(ACCEPTED + active HELD excl. current) = 3 (the hold)
        // 3 + 3 (this booking) = 6 > 5 → CAPACITY_EXCEEDED
        usedSlots: BigInt(3),
      });
      return callback(tx);
    });

    const result = await updateBookingStatus("booking-pending", "ACCEPTED");

    // 3 (held) + 3 (this booking) = 6 > 5 → CAPACITY_EXCEEDED
    expect(result.success).toBeUndefined();
    expect(result.error).toBe(
      "Cannot accept: all slots for these dates are already booked"
    );
  });

  it("ACCEPT succeeds when HELD slots + requested slots fit within totalSlots", async () => {
    (auth as jest.Mock).mockResolvedValue(ownerSession);

    const pendingBooking = makeBookingRecord({
      id: "booking-fits",
      status: "PENDING",
      slotsRequested: 2,
      version: 1,
    });

    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(pendingBooking);

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = makeAcceptTx({
        listingRow: {
          availableSlots: 2,
          totalSlots: 5,
          id: LISTING_ID,
          ownerId: OWNER_ID,
          bookingMode: "SHARED",
          status: "ACTIVE",
        },
        // SUM(ACCEPTED + active HELD excl. current) = 3 (a hold for 3 slots)
        usedSlots: BigInt(3),
      });
      return callback(tx);
    });

    const result = await updateBookingStatus("booking-fits", "ACCEPTED");

    // 3 + 2 = 5 == totalSlots → fits exactly, should succeed
    expect(result.success).toBe(true);
  });

  it("createHold counts ACCEPTED + active HELD in capacity check", async () => {
    (auth as jest.Mock).mockResolvedValue(tenantSession);

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: jest
          .fn()
          // First call: COUNT of user's active holds
          .mockResolvedValueOnce([{ count: BigInt(0) }])
          // Second call: SELECT FOR UPDATE (listing)
          .mockResolvedValueOnce([sharedListing])
          // Third call: SUM(ACCEPTED + active HELD) — includes existing hold
          .mockResolvedValueOnce([{ total: BigInt(4) }]),
        $executeRaw: jest.fn().mockResolvedValue(1),
        booking: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({
            id: "hold-new",
            listingId: LISTING_ID,
            slotsRequested: 1,
            heldUntil: new Date(Date.now() + 30 * 60 * 1000),
          }),
        },
        user: {
          findUnique: jest
            .fn()
            .mockImplementation(({ where }: { where: { id: string } }) => {
              if (where.id === OWNER_ID) return Promise.resolve(mockOwner);
              return Promise.resolve(mockTenantA);
            }),
        },
      };
      return callback(tx);
    });

    // 4 existing slots (ACCEPTED + HELD) + 1 requested = 5 == totalSlots, succeeds
    const result = await createHold(
      LISTING_ID,
      futureStart,
      futureEnd,
      1000,
      1
    );

    expect(result.success).toBe(true);
  });

  it("createHold fails when ACCEPTED + active HELD already fill capacity", async () => {
    (auth as jest.Mock).mockResolvedValue(tenantSession);

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: jest
          .fn()
          // COUNT user holds
          .mockResolvedValueOnce([{ count: BigInt(0) }])
          // Listing FOR UPDATE
          .mockResolvedValueOnce([sharedListing])
          // SUM = 5 (capacity already full between ACCEPTED + active HELD)
          .mockResolvedValueOnce([{ total: BigInt(5) }]),
        $executeRaw: jest.fn(),
        booking: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn(),
        },
        user: {
          findUnique: jest
            .fn()
            .mockImplementation(({ where }: { where: { id: string } }) => {
              if (where.id === OWNER_ID) return Promise.resolve(mockOwner);
              return Promise.resolve(mockTenantA);
            }),
        },
      };
      return callback(tx);
    });

    const result = await createHold(
      LISTING_ID,
      futureStart,
      futureEnd,
      1000,
      1
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Not enough available slots");
  });
});

// ─── 3. Accept race for WHOLE_UNIT ───────────────────────────────────────────

describe("Accept race for WHOLE_UNIT listing", () => {
  /**
   * Scenario: WHOLE_UNIT listing with 4 slots.
   * Two PENDING bookings exist for overlapping dates.
   *
   * Owner accepts booking A first: succeeds (0 slots used).
   * Owner then tries to accept booking B (overlapping): fails because
   * the capacity check sees booking A already consumed all 4 slots.
   *
   * Also verifies that optimistic locking (version mismatch) causes
   * CONCURRENT_MODIFICATION when updateMany returns count=0.
   */

  const ownerSession = { user: { id: OWNER_ID, email: "host@test.com" } };

  const bookingA = makeBookingRecord({
    id: "booking-wu-a",
    status: "PENDING",
    slotsRequested: 4, // WHOLE_UNIT sets slotsRequested=totalSlots at creation
    version: 1,
    listingOverrides: {
      availableSlots: 4,
      bookingMode: "WHOLE_UNIT",
    },
  });

  const bookingB = {
    ...makeBookingRecord({
      id: "booking-wu-b",
      status: "PENDING",
      slotsRequested: 4,
      version: 1,
      listingOverrides: {
        availableSlots: 0, // decremented after booking A was accepted
        bookingMode: "WHOLE_UNIT",
      },
    }),
    tenantId: TENANT_ID_B,
    tenant: { id: TENANT_ID_B, name: "Tenant B", email: "tenantb@test.com" },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (createInternalNotification as jest.Mock).mockResolvedValue({
      success: true,
    });
    (sendNotificationEmailWithPreference as jest.Mock).mockResolvedValue({
      success: true,
    });
    (auth as jest.Mock).mockResolvedValue(ownerSession);
  });

  it("first ACCEPT succeeds (no prior accepted slots)", async () => {
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(bookingA);

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = makeAcceptTx({
        listingRow: {
          availableSlots: 4,
          totalSlots: 4,
          id: LISTING_ID,
          ownerId: OWNER_ID,
          bookingMode: "WHOLE_UNIT",
          status: "ACTIVE",
        },
        usedSlots: BigInt(0), // no prior accepted bookings
      });
      return callback(tx);
    });

    const result = await updateBookingStatus("booking-wu-a", "ACCEPTED");

    expect(result.success).toBe(true);
  });

  it("second ACCEPT fails with NO_SLOTS_AVAILABLE when availableSlots=0", async () => {
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(bookingB);

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = makeAcceptTx({
        listingRow: {
          // After first accept: availableSlots decremented to 0
          availableSlots: 0,
          totalSlots: 4,
          id: LISTING_ID,
          ownerId: OWNER_ID,
          bookingMode: "WHOLE_UNIT",
          status: "ACTIVE",
        },
        usedSlots: BigInt(4), // booking A now accepted
      });
      return callback(tx);
    });

    const result = await updateBookingStatus("booking-wu-b", "ACCEPTED");

    // WHOLE_UNIT: slotsNeeded=totalSlots=4; availableSlots=0 < 4 → NO_SLOTS_AVAILABLE
    expect(result.success).toBeUndefined();
    expect(result.error).toBe("No available slots for this listing");
  });

  it("ACCEPT fails with CAPACITY_EXCEEDED when availableSlots>0 but SUM blocks it", async () => {
    // Edge: availableSlots passes the first guard (>= slotsNeeded) but
    // the SUM check (ACCEPTED + active HELD) is authoritative and blocks acceptance.
    // This simulates a race where availableSlots was not yet decremented for a
    // concurrent hold, but the SUM query reflects the true committed state.
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(bookingB);

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = makeAcceptTx({
        listingRow: {
          // availableSlots >= totalSlots (4) so it passes the NO_SLOTS_AVAILABLE check.
          // The SUM check is what enforces true capacity.
          availableSlots: 4,
          totalSlots: 4,
          id: LISTING_ID,
          ownerId: OWNER_ID,
          bookingMode: "WHOLE_UNIT",
          status: "ACTIVE",
        },
        // SUM shows 4 slots already committed (accepted booking A + active hold)
        usedSlots: BigInt(4),
      });
      return callback(tx);
    });

    const result = await updateBookingStatus("booking-wu-b", "ACCEPTED");

    // 4 (used) + 4 (WHOLE_UNIT slotsNeeded) = 8 > 4 → CAPACITY_EXCEEDED
    expect(result.success).toBeUndefined();
    expect(result.error).toBe(
      "Cannot accept: all slots for these dates are already booked"
    );
  });

  it("CONCURRENT_MODIFICATION when updateMany returns count=0 (version mismatch)", async () => {
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(bookingA);

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce([
            {
              availableSlots: 4,
              totalSlots: 4,
              id: LISTING_ID,
              ownerId: OWNER_ID,
              bookingMode: "WHOLE_UNIT",
              status: "ACTIVE",
            },
          ])
          .mockResolvedValueOnce([{ total: BigInt(0) }]),
        $executeRaw: jest.fn().mockResolvedValue(1),
        booking: {
          // Version mismatch: another request already updated this booking
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
      };
      return callback(tx);
    });

    const result = await updateBookingStatus("booking-wu-a", "ACCEPTED");

    expect(result.success).toBeUndefined();
    expect(result.error).toContain("modified by another request");
    expect(result.code).toBe("CONCURRENT_MODIFICATION");
  });

  it("SLOT_UNDERFLOW when $executeRaw returns 0 (conditional UPDATE finds no row)", async () => {
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(bookingA);

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce([
            {
              availableSlots: 4,
              totalSlots: 4,
              id: LISTING_ID,
              ownerId: OWNER_ID,
              bookingMode: "WHOLE_UNIT",
              status: "ACTIVE",
            },
          ])
          .mockResolvedValueOnce([{ total: BigInt(0) }]),
        $executeRaw: jest.fn().mockResolvedValue(0), // conditional UPDATE found no matching row
        booking: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      return callback(tx);
    });

    const result = await updateBookingStatus("booking-wu-a", "ACCEPTED");

    expect(result.success).toBeUndefined();
    expect(result.error).toBe("No available slots for this listing");
  });
});

// ─── 4. Expired hold does not block subsequent booking ───────────────────────

describe("Expired hold does not block subsequent booking", () => {
  /**
   * Scenario: A hold was created but has since expired (heldUntil < NOW()).
   *
   * createHold's capacity SUM query only counts active holds
   * (heldUntil > NOW()), so the expired hold does not prevent a new hold.
   *
   * createBooking's SUM only counts ACCEPTED — expired holds (still with
   * status HELD in DB until the sweeper cleans them) are invisible too.
   */

  const tenantSession = { user: { id: TENANT_ID_A, email: "a@test.com" } };
  const ownerSession = { user: { id: OWNER_ID, email: "host@test.com" } };

  beforeEach(() => {
    jest.clearAllMocks();
    (createInternalNotification as jest.Mock).mockResolvedValue({
      success: true,
    });
    (sendNotificationEmailWithPreference as jest.Mock).mockResolvedValue({
      success: true,
    });
  });

  it("createHold succeeds even if an expired HELD booking exists for same dates", async () => {
    (auth as jest.Mock).mockResolvedValue(tenantSession);

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: jest
          .fn()
          // COUNT of active holds for this user
          .mockResolvedValueOnce([{ count: BigInt(0) }])
          // Listing FOR UPDATE — still has availableSlots (sweeper not yet run)
          .mockResolvedValueOnce([{ ...sharedListing, availableSlots: 5 }])
          // SUM(ACCEPTED + active HELD) — expired hold excluded because heldUntil ≤ NOW()
          .mockResolvedValueOnce([{ total: BigInt(0) }]),
        $executeRaw: jest.fn().mockResolvedValue(1), // slot decrement succeeds
        booking: {
          findFirst: jest.fn().mockResolvedValue(null), // no duplicate active booking
          create: jest.fn().mockResolvedValue({
            id: "hold-new",
            listingId: LISTING_ID,
            slotsRequested: 2,
            heldUntil: new Date(Date.now() + 30 * 60 * 1000),
          }),
        },
        user: {
          findUnique: jest
            .fn()
            .mockImplementation(({ where }: { where: { id: string } }) => {
              if (where.id === OWNER_ID) return Promise.resolve(mockOwner);
              return Promise.resolve(mockTenantA);
            }),
        },
      };
      return callback(tx);
    });

    const result = await createHold(
      LISTING_ID,
      futureStart,
      futureEnd,
      1000,
      2
    );

    expect(result.success).toBe(true);
    expect(result.bookingId).toBe("hold-new");
  });

  it("createBooking succeeds even if an expired HELD booking exists for same dates", async () => {
    (auth as jest.Mock).mockResolvedValue(tenantSession);

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      // The expired hold has status HELD in the DB but createBooking only
      // counts ACCEPTED → SUM returns 0 → capacity check passes.
      const tx = makeBookingTx({
        usedSlots: BigInt(0),
        duplicateBooking: null, // expired hold is excluded from duplicate check
        createdBooking: {
          id: "booking-after-expired-hold",
          listingId: LISTING_ID,
          slotsRequested: 2,
        },
      });
      return callback(tx);
    });

    const result = await createBooking(
      LISTING_ID,
      futureStart,
      futureEnd,
      1000,
      2
    );

    expect(result.success).toBe(true);
    expect(result.bookingId).toBe("booking-after-expired-hold");
  });

  it("HELD→ACCEPTED fails with HOLD_EXPIRED_OR_MODIFIED when hold expired between read and tx", async () => {
    (auth as jest.Mock).mockResolvedValue(ownerSession);

    // The booking looks valid on read (heldUntil is in the future from the non-tx fetch),
    // but by the time the tx runs, the hold has expired and updateMany finds 0 rows
    // (because the sweeper already changed its status to EXPIRED, or version changed).
    const heldBooking = makeBookingRecord({
      id: "booking-held-race",
      status: "HELD",
      slotsRequested: 2,
      version: 1,
      heldUntil: new Date(Date.now() + 15 * 60 * 1000), // appears valid on pre-tx read
    });

    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(heldBooking);

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce([{ ownerId: OWNER_ID, status: "ACTIVE" }]),
        $executeRaw: jest.fn(),
        booking: {
          // updateMany matches on status='HELD' AND version=1 — if sweeper already
          // set status=EXPIRED or incremented version, count will be 0.
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
      };
      return callback(tx);
    });

    const result = await updateBookingStatus("booking-held-race", "ACCEPTED");

    expect(result.success).toBeUndefined();
    // The code path throws 'HOLD_EXPIRED_OR_MODIFIED' which maps to CONCURRENT_MODIFICATION
    expect(result.error).toContain("expired or was modified");
    expect(result.code).toBe("CONCURRENT_MODIFICATION");
  });

  it("HELD→ACCEPTED succeeds when hold is still active and updateMany returns count=1", async () => {
    (auth as jest.Mock).mockResolvedValue(ownerSession);

    const heldBooking = makeBookingRecord({
      id: "booking-held-ok",
      status: "HELD",
      slotsRequested: 2,
      version: 1,
      heldUntil: new Date(Date.now() + 15 * 60 * 1000),
    });

    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(heldBooking);

    const mockTxExecuteRaw = jest.fn();

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce([{ ownerId: OWNER_ID, status: "ACTIVE" }]),
        $executeRaw: mockTxExecuteRaw,
        booking: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      return callback(tx);
    });

    const result = await updateBookingStatus("booking-held-ok", "ACCEPTED");

    expect(result.success).toBe(true);
    // HELD→ACCEPTED must NOT decrement slots (slots were consumed at hold creation)
    expect(mockTxExecuteRaw).not.toHaveBeenCalled();
  });
});
