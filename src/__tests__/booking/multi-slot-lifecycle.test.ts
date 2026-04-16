/**
 * Multi-slot booking lifecycle tests
 *
 * Verifies the current lifecycle contract against range-aware availability
 * helpers instead of legacy overlap SUM mocks:
 * - PENDING does not reserve inventory
 * - HELD reserves inventory until transition or expiry
 * - ACCEPTED reserves inventory
 * - WHOLE_UNIT coerces to totalSlots
 * - active HELD inventory affects later acceptance checks
 * - expired HELD bookings are swept or excluded before capacity checks
 */

// Mock @prisma/client FIRST to avoid SWC binary loading issues in WSL2.
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
jest.mock("@/lib/search/search-doc-dirty", () => ({
  markListingDirty: jest.fn().mockResolvedValue(undefined),
  markListingsDirty: jest.fn().mockResolvedValue(undefined),
  markListingDirtyInTx: jest.fn().mockResolvedValue(undefined),
  markListingsDirtyInTx: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/test-barriers", () => ({
  waitForTestBarrier: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/availability", () => ({
  getAvailability: jest.fn(),
  expireOverlappingExpiredHolds: jest.fn().mockResolvedValue(0),
  applyInventoryDeltas: jest.fn().mockResolvedValue(undefined),
}));

import { createBooking, createHold } from "@/app/actions/booking";
import { updateBookingStatus } from "@/app/actions/manage-booking";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { createInternalNotification } from "@/lib/notifications";
import { sendNotificationEmailWithPreference } from "@/lib/email";
import {
  getAvailability,
  expireOverlappingExpiredHolds,
  applyInventoryDeltas,
} from "@/lib/availability";

const tenantSession = {
  user: { id: "tenant-001", email: "tenant@example.com" },
};
const secondTenantSession = {
  user: { id: "tenant-002", email: "tenant2@example.com" },
};
const ownerSession = {
  user: { id: "owner-999", email: "owner@example.com" },
};

const futureStart = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
const futureEnd = new Date(Date.now() + 210 * 24 * 60 * 60 * 1000);

const LISTING_ID = "listing-shared";
const WHOLE_UNIT_LISTING_ID = "listing-whole-unit";
const OWNER_ID = "owner-999";

const sharedListing = {
  id: LISTING_ID,
  title: "Shared Listing",
  ownerId: OWNER_ID,
  totalSlots: 5,
  availableSlots: 5,
  status: "ACTIVE",
  price: 1000,
  bookingMode: "SHARED",
  holdTtlMinutes: 60,
};

const wholeUnitListing = {
  id: WHOLE_UNIT_LISTING_ID,
  title: "Whole Unit Listing",
  ownerId: OWNER_ID,
  totalSlots: 4,
  availableSlots: 4,
  status: "ACTIVE",
  price: 2000,
  bookingMode: "WHOLE_UNIT",
  holdTtlMinutes: 60,
};

const mockOwner = {
  id: OWNER_ID,
  name: "Owner Name",
  email: "owner@example.com",
};

const mockTenant = {
  id: "tenant-001",
  name: "Tenant Name",
};

const mockTenantTwo = {
  id: "tenant-002",
  name: "Tenant Two",
};

function makeAvailabilitySnapshot(overrides: {
  listingId?: string;
  totalSlots?: number;
  effectiveAvailableSlots?: number;
  heldSlots?: number;
  acceptedSlots?: number;
  rangeVersion?: number;
} = {}) {
  const totalSlots = overrides.totalSlots ?? sharedListing.totalSlots;
  const acceptedSlots = overrides.acceptedSlots ?? 0;
  const heldSlots = overrides.heldSlots ?? 0;

  return {
    listingId: overrides.listingId ?? LISTING_ID,
    totalSlots,
    effectiveAvailableSlots:
      overrides.effectiveAvailableSlots ?? totalSlots - acceptedSlots - heldSlots,
    heldSlots,
    acceptedSlots,
    rangeVersion: overrides.rangeVersion ?? 1,
    asOf: new Date().toISOString(),
  };
}

function buildCreateBookingTx(options: {
  listing?: typeof sharedListing | typeof wholeUnitListing;
  createdBooking?: { id: string; status: string; slotsRequested: number };
  duplicateExact?: object | null;
  duplicateOverlap?: object | null;
  tenantRecord?: typeof mockTenant | typeof mockTenantTwo;
}) {
  const listing = options.listing ?? sharedListing;
  const createdBooking =
    options.createdBooking ?? {
      id: "booking-pending-1",
      status: "PENDING",
      slotsRequested: 3,
    };
  const duplicateExact = options.duplicateExact ?? null;
  const duplicateOverlap = options.duplicateOverlap ?? null;
  const tenantRecord = options.tenantRecord ?? mockTenant;
  let findFirstCallCount = 0;

  return {
    $queryRaw: jest.fn().mockResolvedValueOnce([listing]),
    booking: {
      findFirst: jest.fn().mockImplementation(() => {
        findFirstCallCount += 1;
        if (findFirstCallCount === 1) {
          return Promise.resolve(duplicateExact);
        }
        return Promise.resolve(duplicateOverlap);
      }),
      create: jest.fn().mockResolvedValue(createdBooking),
    },
    user: {
      findUnique: jest
        .fn()
        .mockImplementation(({ where }: { where: { id: string } }) => {
          if (where.id === listing.ownerId) {
            return Promise.resolve(mockOwner);
          }
          return Promise.resolve(tenantRecord);
        }),
    },
  };
}

function buildCreateHoldTx(options: {
  listing?: typeof sharedListing | typeof wholeUnitListing;
  createdHold?: {
    id: string;
    status: string;
    slotsRequested: number;
    heldUntil: Date;
  };
  holdCount?: number;
  duplicateHold?: object | null;
  decrementResult?: number;
  tenantRecord?: typeof mockTenant | typeof mockTenantTwo;
}) {
  const listing = options.listing ?? sharedListing;
  const createdHold =
    options.createdHold ?? {
      id: "hold-1",
      status: "HELD",
      slotsRequested: 3,
      heldUntil: new Date(Date.now() + 60 * 60 * 1000),
    };
  const holdCount = options.holdCount ?? 0;
  const duplicateHold = options.duplicateHold ?? null;
  const decrementResult = options.decrementResult ?? 1;
  const tenantRecord = options.tenantRecord ?? mockTenant;

  return {
    $queryRaw: jest
      .fn()
      .mockResolvedValueOnce([{ count: BigInt(holdCount) }])
      .mockResolvedValueOnce([listing]),
    $executeRaw: jest.fn().mockResolvedValue(decrementResult),
    booking: {
      findFirst: jest.fn().mockResolvedValue(duplicateHold),
      create: jest.fn().mockResolvedValue(createdHold),
    },
    user: {
      findUnique: jest
        .fn()
        .mockImplementation(({ where }: { where: { id: string } }) => {
          if (where.id === listing.ownerId) {
            return Promise.resolve(mockOwner);
          }
          return Promise.resolve(tenantRecord);
        }),
    },
  };
}

function buildPendingAcceptTx(options: {
  listingRow?: {
    availableSlots: number;
    totalSlots: number;
    id: string;
    ownerId: string;
    bookingMode: string;
    status: string;
  };
  updateManyCount?: number;
  executeRawResult?: number;
} = {}) {
  const listingRow =
    options.listingRow ??
    ({
      availableSlots: 5,
      totalSlots: 5,
      id: LISTING_ID,
      ownerId: OWNER_ID,
      bookingMode: "SHARED",
      status: "ACTIVE",
    } as const);

  return {
    $queryRaw: jest.fn().mockResolvedValueOnce([listingRow]),
    $executeRaw: jest.fn().mockResolvedValue(options.executeRawResult ?? 1),
    booking: {
      updateMany: jest
        .fn()
        .mockResolvedValue({ count: options.updateManyCount ?? 1 }),
    },
  };
}

function buildHeldAcceptTx(updateManyCount = 1) {
  return {
    $queryRaw: jest
      .fn()
      .mockResolvedValue([{ ownerId: OWNER_ID, status: "ACTIVE" }]),
    $executeRaw: jest.fn(),
    booking: {
      updateMany: jest.fn().mockResolvedValue({ count: updateManyCount }),
    },
  };
}

function buildRestoreTx(options: {
  queryRow?: unknown[];
  updateManyCount?: number;
  executeRawResult?: number;
} = {}) {
  return {
    $queryRaw: jest
      .fn()
      .mockResolvedValue(options.queryRow ?? [{ id: LISTING_ID }]),
    $executeRaw: jest.fn().mockResolvedValue(options.executeRawResult ?? 1),
    booking: {
      updateMany: jest
        .fn()
        .mockResolvedValue({ count: options.updateManyCount ?? 1 }),
    },
  };
}

function makeBookingForStatus(overrides: {
  id?: string;
  listingId?: string;
  status?: string;
  slotsRequested?: number;
  version?: number;
  heldUntil?: Date | null;
  listingTitle?: string;
  listingAvailableSlots?: number;
  listingTotalSlots?: number;
} = {}) {
  return {
    id: overrides.id ?? "booking-1",
    listingId: overrides.listingId ?? LISTING_ID,
    tenantId: "tenant-001",
    status: overrides.status ?? "PENDING",
    slotsRequested: overrides.slotsRequested ?? 3,
    version: overrides.version ?? 1,
    startDate: futureStart,
    endDate: futureEnd,
    totalPrice: 4800,
    heldUntil: overrides.heldUntil ?? null,
    listing: {
      id: overrides.listingId ?? LISTING_ID,
      title: overrides.listingTitle ?? "Multi-Slot Listing",
      ownerId: OWNER_ID,
      availableSlots: overrides.listingAvailableSlots ?? 5,
      totalSlots: overrides.listingTotalSlots ?? 5,
      owner: { name: "Owner Name" },
    },
    tenant: {
      id: "tenant-001",
      name: "Tenant Name",
      email: "tenant@example.com",
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();

  (auth as jest.Mock).mockResolvedValue(tenantSession);
  (getAvailability as jest.Mock).mockResolvedValue(makeAvailabilitySnapshot());
  (expireOverlappingExpiredHolds as jest.Mock).mockResolvedValue(0);
  (applyInventoryDeltas as jest.Mock).mockResolvedValue(undefined);
  (createInternalNotification as jest.Mock).mockResolvedValue({
    success: true,
  });
  (sendNotificationEmailWithPreference as jest.Mock).mockResolvedValue({
    success: true,
  });
});

describe("Create flows", () => {
  it("PENDING creation checks live availability without reserving inventory", async () => {
    const tx = buildCreateBookingTx({
      createdBooking: {
        id: "booking-pending-1",
        status: "PENDING",
        slotsRequested: 3,
      },
    });

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) =>
      callback(tx)
    );

    const result = await createBooking(
      LISTING_ID,
      futureStart,
      futureEnd,
      1000,
      3
    );

    expect(result).toEqual({
      success: true,
      bookingId: "booking-pending-1",
    });
    expect(expireOverlappingExpiredHolds).toHaveBeenCalledWith(tx, {
      listingId: LISTING_ID,
      startDate: futureStart,
      endDate: futureEnd,
    });
    expect(getAvailability).toHaveBeenCalledWith(
      LISTING_ID,
      expect.objectContaining({
        startDate: futureStart,
        endDate: futureEnd,
        now: expect.any(Date),
        tx,
      })
    );
    expect(tx.booking.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "PENDING",
        slotsRequested: 3,
      }),
    });
    expect(applyInventoryDeltas).not.toHaveBeenCalled();
  });

  it("HELD creation reserves inventory through applyInventoryDeltas", async () => {
    const heldUntil = new Date(Date.now() + 60 * 60 * 1000);
    const tx = buildCreateHoldTx({
      createdHold: {
        id: "hold-1",
        status: "HELD",
        slotsRequested: 3,
        heldUntil,
      },
    });

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) =>
      callback(tx)
    );

    const result = await createHold(
      LISTING_ID,
      futureStart,
      futureEnd,
      1000,
      3
    );

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        bookingId: "hold-1",
        heldUntil: expect.any(String),
      })
    );
    expect(expireOverlappingExpiredHolds).toHaveBeenCalledWith(tx, {
      listingId: LISTING_ID,
      startDate: futureStart,
      endDate: futureEnd,
    });
    expect(getAvailability).toHaveBeenCalledWith(
      LISTING_ID,
      expect.objectContaining({
        startDate: futureStart,
        endDate: futureEnd,
        now: expect.any(Date),
        tx,
      })
    );
    expect(tx.booking.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "HELD",
        slotsRequested: 3,
      }),
    });
    expect(applyInventoryDeltas).toHaveBeenCalledWith(tx, {
      listingId: LISTING_ID,
      startDate: futureStart,
      endDate: futureEnd,
      totalSlots: sharedListing.totalSlots,
      heldDelta: 3,
    });
  });
});

describe("Status transitions", () => {
  it("PENDING -> ACCEPTED rechecks availability and reserves accepted inventory", async () => {
    (auth as jest.Mock).mockResolvedValue(ownerSession);

    const booking = makeBookingForStatus({
      id: "booking-pending-accept",
      status: "PENDING",
      slotsRequested: 3,
    });
    const tx = buildPendingAcceptTx();

    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(booking);
    (getAvailability as jest.Mock).mockResolvedValueOnce(
      makeAvailabilitySnapshot({
        effectiveAvailableSlots: 3,
        heldSlots: 0,
        acceptedSlots: 2,
      })
    );
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) =>
      callback(tx)
    );

    const result = await updateBookingStatus(
      "booking-pending-accept",
      "ACCEPTED"
    );

    expect(result).toEqual({ success: true });
    expect(expireOverlappingExpiredHolds).toHaveBeenCalledWith(tx, {
      listingId: booking.listingId,
      startDate: booking.startDate,
      endDate: booking.endDate,
    });
    expect(getAvailability).toHaveBeenCalledWith(
      booking.listingId,
      expect.objectContaining({
        startDate: booking.startDate,
        endDate: booking.endDate,
        tx,
      })
    );
    expect(applyInventoryDeltas).toHaveBeenCalledWith(tx, {
      listingId: booking.listingId,
      startDate: booking.startDate,
      endDate: booking.endDate,
      totalSlots: booking.listing.totalSlots,
      acceptedDelta: 3,
    });
  });

  it("ACCEPTED -> CANCELLED releases accepted inventory", async () => {
    (auth as jest.Mock).mockResolvedValue(tenantSession);

    const booking = makeBookingForStatus({
      id: "booking-accepted-cancel",
      status: "ACCEPTED",
      slotsRequested: 3,
      listingAvailableSlots: 2,
    });
    const tx = buildRestoreTx();

    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(booking);
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) =>
      callback(tx)
    );

    const result = await updateBookingStatus(
      "booking-accepted-cancel",
      "CANCELLED"
    );

    expect(result).toEqual({ success: true });
    expect(applyInventoryDeltas).toHaveBeenCalledWith(tx, {
      listingId: booking.listingId,
      startDate: booking.startDate,
      endDate: booking.endDate,
      totalSlots: booking.listing.totalSlots,
      acceptedDelta: -3,
    });
  });

  it("HELD -> ACCEPTED transfers held inventory without a second decrement", async () => {
    (auth as jest.Mock).mockResolvedValue(ownerSession);

    const booking = makeBookingForStatus({
      id: "booking-held-accept",
      status: "HELD",
      slotsRequested: 3,
      heldUntil: new Date(Date.now() + 60 * 60 * 1000),
      listingAvailableSlots: 2,
    });
    const tx = buildHeldAcceptTx();

    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(booking);
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) =>
      callback(tx)
    );

    const result = await updateBookingStatus("booking-held-accept", "ACCEPTED");

    expect(result).toEqual({ success: true });
    expect(getAvailability).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(applyInventoryDeltas).toHaveBeenCalledWith(tx, {
      listingId: booking.listingId,
      startDate: booking.startDate,
      endDate: booking.endDate,
      totalSlots: booking.listing.totalSlots,
      heldDelta: -3,
      acceptedDelta: 3,
    });
  });

  it("HELD -> CANCELLED releases held inventory", async () => {
    (auth as jest.Mock).mockResolvedValue(tenantSession);

    const booking = makeBookingForStatus({
      id: "booking-held-cancel",
      status: "HELD",
      slotsRequested: 3,
      heldUntil: new Date(Date.now() + 60 * 60 * 1000),
      listingAvailableSlots: 2,
    });
    const tx = buildRestoreTx();

    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(booking);
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) =>
      callback(tx)
    );

    const result = await updateBookingStatus(
      "booking-held-cancel",
      "CANCELLED"
    );

    expect(result).toEqual({ success: true });
    expect(applyInventoryDeltas).toHaveBeenCalledWith(tx, {
      listingId: booking.listingId,
      startDate: booking.startDate,
      endDate: booking.endDate,
      totalSlots: booking.listing.totalSlots,
      heldDelta: -3,
    });
  });

  it("HELD -> REJECTED releases held inventory", async () => {
    (auth as jest.Mock).mockResolvedValue(ownerSession);

    const booking = makeBookingForStatus({
      id: "booking-held-reject",
      status: "HELD",
      slotsRequested: 3,
      heldUntil: new Date(Date.now() + 60 * 60 * 1000),
      listingAvailableSlots: 2,
    });
    const tx = buildRestoreTx({
      queryRow: [{ ownerId: OWNER_ID }],
    });

    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(booking);
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) =>
      callback(tx)
    );

    const result = await updateBookingStatus("booking-held-reject", "REJECTED");

    expect(result).toEqual({ success: true });
    expect(applyInventoryDeltas).toHaveBeenCalledWith(tx, {
      listingId: booking.listingId,
      startDate: booking.startDate,
      endDate: booking.endDate,
      totalSlots: booking.listing.totalSlots,
      heldDelta: -3,
    });
  });

  it("maps inventory helper drift to INVENTORY_DELTA_CONFLICT instead of a generic error", async () => {
    (auth as jest.Mock).mockResolvedValue(ownerSession);

    const booking = makeBookingForStatus({
      id: "booking-held-drift",
      status: "HELD",
      slotsRequested: 3,
      heldUntil: new Date(Date.now() + 60 * 60 * 1000),
    });
    const tx = buildHeldAcceptTx();

    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(booking);
    (applyInventoryDeltas as jest.Mock).mockRejectedValueOnce(
      new Error("INVENTORY_DELTA_CONFLICT")
    );
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) =>
      callback(tx)
    );

    const result = await updateBookingStatus("booking-held-drift", "ACCEPTED");

    expect(result).toEqual({
      success: false,
      error:
        "This booking could not be updated because availability changed. Please refresh and try again.",
      code: "INVENTORY_DELTA_CONFLICT",
    });
  });

  it("expired HELD bookings trigger inline expiry cleanup and return the hold-expired error", async () => {
    (auth as jest.Mock).mockResolvedValue(ownerSession);

    const booking = makeBookingForStatus({
      id: "booking-held-expired",
      status: "HELD",
      slotsRequested: 3,
      heldUntil: new Date(Date.now() - 5 * 60 * 1000),
    });
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: LISTING_ID }]),
      $executeRaw: jest.fn().mockResolvedValue(1),
      booking: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(booking);
    (expireOverlappingExpiredHolds as jest.Mock).mockResolvedValueOnce(1);
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) =>
      callback(tx)
    );

    const result = await updateBookingStatus("booking-held-expired", "ACCEPTED");

    expect(result).toEqual({
      success: false,
      error: "This hold has expired.",
    });
    expect(expireOverlappingExpiredHolds).toHaveBeenCalledWith(tx, {
      listingId: booking.listingId,
      startDate: booking.startDate,
      endDate: booking.endDate,
    });
  });
});

describe("WHOLE_UNIT coercion", () => {
  it("createBooking coerces slotsRequested to totalSlots", async () => {
    const tx = buildCreateBookingTx({
      listing: wholeUnitListing,
      createdBooking: {
        id: "booking-wu-pending",
        status: "PENDING",
        slotsRequested: 4,
      },
    });

    (getAvailability as jest.Mock).mockResolvedValueOnce(
      makeAvailabilitySnapshot({
        listingId: WHOLE_UNIT_LISTING_ID,
        totalSlots: 4,
        effectiveAvailableSlots: 4,
      })
    );
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) =>
      callback(tx)
    );

    const result = await createBooking(
      WHOLE_UNIT_LISTING_ID,
      futureStart,
      futureEnd,
      2000,
      1
    );

    expect(result).toEqual({
      success: true,
      bookingId: "booking-wu-pending",
    });
    expect(tx.booking.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "PENDING",
        slotsRequested: 4,
      }),
    });
    expect(applyInventoryDeltas).not.toHaveBeenCalled();
  });

  it("createHold coerces slotsRequested to totalSlots and reserves all slots", async () => {
    const heldUntil = new Date(Date.now() + 60 * 60 * 1000);
    const tx = buildCreateHoldTx({
      listing: wholeUnitListing,
      createdHold: {
        id: "hold-wu",
        status: "HELD",
        slotsRequested: 4,
        heldUntil,
      },
    });

    (getAvailability as jest.Mock).mockResolvedValueOnce(
      makeAvailabilitySnapshot({
        listingId: WHOLE_UNIT_LISTING_ID,
        totalSlots: 4,
        effectiveAvailableSlots: 4,
      })
    );
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) =>
      callback(tx)
    );

    const result = await createHold(
      WHOLE_UNIT_LISTING_ID,
      futureStart,
      futureEnd,
      2000,
      1
    );

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        bookingId: "hold-wu",
      })
    );
    expect(tx.booking.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "HELD",
        slotsRequested: 4,
      }),
    });
    expect(applyInventoryDeltas).toHaveBeenCalledWith(tx, {
      listingId: WHOLE_UNIT_LISTING_ID,
      startDate: futureStart,
      endDate: futureEnd,
      totalSlots: wholeUnitListing.totalSlots,
      heldDelta: 4,
    });
  });

  it("PENDING -> ACCEPTED uses totalSlots for WHOLE_UNIT even if the booking record is stale", async () => {
    (auth as jest.Mock).mockResolvedValue(ownerSession);

    const booking = makeBookingForStatus({
      id: "booking-wu-accept",
      listingId: WHOLE_UNIT_LISTING_ID,
      status: "PENDING",
      slotsRequested: 1,
      listingTitle: "Whole Unit Listing",
      listingAvailableSlots: 4,
      listingTotalSlots: 4,
    });
    const tx = buildPendingAcceptTx({
      listingRow: {
        availableSlots: 4,
        totalSlots: 4,
        id: WHOLE_UNIT_LISTING_ID,
        ownerId: OWNER_ID,
        bookingMode: "WHOLE_UNIT",
        status: "ACTIVE",
      },
    });

    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(booking);
    (getAvailability as jest.Mock).mockResolvedValueOnce(
      makeAvailabilitySnapshot({
        listingId: WHOLE_UNIT_LISTING_ID,
        totalSlots: 4,
        effectiveAvailableSlots: 4,
      })
    );
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) =>
      callback(tx)
    );

    const result = await updateBookingStatus("booking-wu-accept", "ACCEPTED");

    expect(result).toEqual({ success: true });
    expect(applyInventoryDeltas).toHaveBeenCalledWith(tx, {
      listingId: WHOLE_UNIT_LISTING_ID,
      startDate: booking.startDate,
      endDate: booking.endDate,
      totalSlots: 4,
      acceptedDelta: 4,
    });
  });
});

describe("Mixed HELD and PENDING behavior", () => {
  it("active HELD inventory blocks accepting a PENDING booking when effective availability is too low", async () => {
    (auth as jest.Mock).mockResolvedValue(ownerSession);

    const booking = makeBookingForStatus({
      id: "booking-pending-blocked",
      status: "PENDING",
      slotsRequested: 3,
    });
    const tx = buildPendingAcceptTx();

    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(booking);
    (getAvailability as jest.Mock).mockResolvedValueOnce(
      makeAvailabilitySnapshot({
        effectiveAvailableSlots: 2,
        heldSlots: 3,
        acceptedSlots: 0,
      })
    );
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) =>
      callback(tx)
    );

    const result = await updateBookingStatus(
      "booking-pending-blocked",
      "ACCEPTED"
    );

    expect(result).toEqual({
      success: false,
      error: "Cannot accept: all slots for these dates are already booked",
    });
    expect(applyInventoryDeltas).not.toHaveBeenCalled();
  });

  it("HELD plus PENDING can be accepted when the remaining effective availability fits exactly", async () => {
    (auth as jest.Mock).mockResolvedValue(ownerSession);

    const booking = makeBookingForStatus({
      id: "booking-pending-exact-fit",
      status: "PENDING",
      slotsRequested: 2,
      listingAvailableSlots: 2,
    });
    const tx = buildPendingAcceptTx({
      listingRow: {
        availableSlots: 2,
        totalSlots: 5,
        id: LISTING_ID,
        ownerId: OWNER_ID,
        bookingMode: "SHARED",
        status: "ACTIVE",
      },
    });

    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(booking);
    (getAvailability as jest.Mock).mockResolvedValueOnce(
      makeAvailabilitySnapshot({
        effectiveAvailableSlots: 2,
        heldSlots: 3,
        acceptedSlots: 0,
      })
    );
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) =>
      callback(tx)
    );

    const result = await updateBookingStatus(
      "booking-pending-exact-fit",
      "ACCEPTED"
    );

    expect(result).toEqual({ success: true });
    expect(applyInventoryDeltas).toHaveBeenCalledWith(tx, {
      listingId: booking.listingId,
      startDate: booking.startDate,
      endDate: booking.endDate,
      totalSlots: 5,
      acceptedDelta: 2,
    });
  });

  it("expired HELD bookings are swept or excluded before a new PENDING booking is created", async () => {
    (auth as jest.Mock).mockResolvedValue(secondTenantSession);

    const tx = buildCreateBookingTx({
      createdBooking: {
        id: "booking-after-expired-hold",
        status: "PENDING",
        slotsRequested: 3,
      },
      tenantRecord: mockTenantTwo,
    });

    (expireOverlappingExpiredHolds as jest.Mock).mockResolvedValueOnce(1);
    (getAvailability as jest.Mock).mockResolvedValueOnce(
      makeAvailabilitySnapshot({
        effectiveAvailableSlots: 5,
        heldSlots: 0,
        acceptedSlots: 0,
      })
    );
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) =>
      callback(tx)
    );

    const result = await createBooking(
      LISTING_ID,
      futureStart,
      futureEnd,
      1000,
      3
    );

    expect(result).toEqual({
      success: true,
      bookingId: "booking-after-expired-hold",
    });
    expect(expireOverlappingExpiredHolds).toHaveBeenCalledWith(tx, {
      listingId: LISTING_ID,
      startDate: futureStart,
      endDate: futureEnd,
    });
    expect(getAvailability).toHaveBeenCalledWith(
      LISTING_ID,
      expect.objectContaining({
        startDate: futureStart,
        endDate: futureEnd,
        now: expect.any(Date),
        tx,
      })
    );
  });
});
