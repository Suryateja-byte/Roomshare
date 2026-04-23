// Mock @prisma/client first to avoid runtime binary loading in tests
jest.mock("@prisma/client", () => ({
  Prisma: {
    TransactionIsolationLevel: {
      Serializable: "Serializable",
    },
  },
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    booking: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

jest.mock("next/headers", () => ({
  headers: jest.fn().mockResolvedValue(new Headers()),
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

jest.mock("@/lib/booking-audit", () => ({
  logBookingAudit: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/availability", () => ({
  applyInventoryDeltas: jest.fn().mockResolvedValue(undefined),
  expireOverlappingExpiredHolds: jest.fn().mockResolvedValue(0),
  getAvailability: jest.fn().mockResolvedValue({
    effectiveAvailableSlots: 2,
  }),
}));

jest.mock("@/lib/search/search-doc-dirty", () => ({
  markListingsDirtyInTx: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/idempotency", () => ({
  withIdempotency: jest.fn(),
}));

jest.mock("@/lib/test-barriers", () => ({
  waitForTestBarrier: jest.fn().mockResolvedValue(undefined),
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
  getClientIPFromHeaders: jest.fn().mockReturnValue("127.0.0.1"),
  RATE_LIMITS: {
    createPreAuthByIp: {},
    createBooking: {},
    createBookingByIp: {},
    createHold: {},
    createHoldByIp: {},
    createHoldPerListing: {},
  },
}));

jest.mock("@/lib/env", () => ({
  features: {
    bookingRetirementFreeze: false,
    contactFirstListings: false,
    multiSlotBooking: true,
    softHoldsEnabled: true,
  },
}));

import { createBooking, createHold } from "@/app/actions/booking";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sendNotificationEmailWithPreference } from "@/lib/email";
import { checkSuspension, checkEmailVerified } from "@/app/actions/suspension";
import { logBookingAudit } from "@/lib/booking-audit";
import {
  expireOverlappingExpiredHolds,
  getAvailability,
} from "@/lib/availability";
import { withIdempotency } from "@/lib/idempotency";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { markListingsDirtyInTx } from "@/lib/search/search-doc-dirty";
import { features } from "@/lib/env";

const mockedFeatures = features as {
  bookingRetirementFreeze: boolean;
  contactFirstListings: boolean;
  multiSlotBooking: boolean;
  softHoldsEnabled: boolean;
};

const mockSession = {
  user: {
    id: "user-123",
    name: "Test User",
    email: "test@example.com",
  },
};

const futureStart = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
const futureEnd = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

const contactOnlyResult = {
  success: false,
  error: "This listing accepts messages only. Contact the host instead.",
  code: "CONTACT_ONLY",
};

const hostManagedResult = {
  success: false,
  error:
    "This listing now uses host-managed availability. Contact the host instead.",
  code: "HOST_MANAGED_BOOKING_FORBIDDEN",
};

function mockBookingHostManagedTransaction() {
  (prisma.$transaction as jest.Mock).mockImplementation(async (callback: any) =>
    callback({
      $queryRaw: jest.fn().mockResolvedValueOnce([
        {
          id: "listing-123",
          title: "Host managed room",
          ownerId: "owner-456",
          totalSlots: 2,
          availableSlots: 1,
          status: "ACTIVE",
          price: 1200,
          bookingMode: "REQUEST",
          availabilitySource: "HOST_MANAGED",
        },
      ]),
    })
  );
}

function mockHoldHostManagedTransaction() {
  (prisma.$transaction as jest.Mock).mockImplementation(async (callback: any) =>
    callback({
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ count: BigInt(0) }])
        .mockResolvedValueOnce([
          {
            id: "listing-123",
            title: "Host managed room",
            ownerId: "owner-456",
            totalSlots: 2,
            availableSlots: 1,
            status: "ACTIVE",
            price: 1200,
            bookingMode: "REQUEST",
            holdTtlMinutes: 15,
            availabilitySource: "HOST_MANAGED",
          },
      ]),
    })
  );
}

function mockLegacyBookingTransaction() {
  (prisma.$transaction as jest.Mock).mockImplementation(async (callback: any) =>
    callback({
      $queryRaw: jest.fn().mockResolvedValueOnce([
        {
          id: "listing-123",
          title: "Legacy booking room",
          ownerId: "owner-456",
          totalSlots: 2,
          availableSlots: 2,
          status: "ACTIVE",
          price: 1200,
          bookingMode: "REQUEST",
          availabilitySource: "LEGACY_BOOKING",
        },
      ]),
      user: {
        findUnique: jest
          .fn()
          .mockImplementation(({ where }: { where: { id: string } }) => {
            if (where.id === "owner-456") {
              return Promise.resolve({
                id: "owner-456",
                name: "Host User",
                email: "host@example.com",
              });
            }

            if (where.id === "user-123") {
              return Promise.resolve({
                id: "user-123",
                name: "Test User",
              });
            }

            return Promise.resolve(null);
          }),
      },
      booking: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: "booking-123",
          slotsRequested: 1,
        }),
      },
    })
  );
}

describe("booking freeze gate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue(mockSession);
    (checkRateLimit as jest.Mock).mockResolvedValue({
      success: true,
      remaining: 10,
      resetAt: new Date(),
    });
    (expireOverlappingExpiredHolds as jest.Mock).mockResolvedValue(0);
    (getAvailability as jest.Mock).mockResolvedValue({
      effectiveAvailableSlots: 2,
    });
    (logBookingAudit as jest.Mock).mockResolvedValue(undefined);
    (markListingsDirtyInTx as jest.Mock).mockResolvedValue(undefined);
    mockedFeatures.bookingRetirementFreeze = false;
    mockedFeatures.contactFirstListings = false;
    mockedFeatures.multiSlotBooking = true;
    mockedFeatures.softHoldsEnabled = true;
  });

  it("returns LEGACY_DRAIN_COMPLETE for createBooking before auth when retirement freeze is on", async () => {
    mockedFeatures.bookingRetirementFreeze = true;
    mockedFeatures.contactFirstListings = true;
    (auth as jest.Mock).mockResolvedValue(null);

    const result = await createBooking(
      "listing-123",
      futureStart,
      futureEnd,
      1200
    );

    expect(result).toEqual({
      success: false,
      error: "Booking requests are disabled. Contact the host instead.",
      code: "LEGACY_DRAIN_COMPLETE",
    });
    expect(auth).not.toHaveBeenCalled();
    expect(checkSuspension).not.toHaveBeenCalled();
    expect(checkEmailVerified).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(logger.sync.info).toHaveBeenCalledWith(
      "cfm.booking.create_blocked_count",
      { reason: "retirement_freeze", kind: "booking" }
    );
  });

  it("returns LEGACY_DRAIN_COMPLETE for createHold before auth when retirement freeze is on", async () => {
    mockedFeatures.bookingRetirementFreeze = true;
    mockedFeatures.contactFirstListings = true;
    (auth as jest.Mock).mockResolvedValue(null);

    const result = await createHold("listing-123", futureStart, futureEnd, 1200);

    expect(result).toEqual({
      success: false,
      error: "Booking requests are disabled. Contact the host instead.",
      code: "LEGACY_DRAIN_COMPLETE",
    });
    expect(auth).not.toHaveBeenCalled();
    expect(checkSuspension).not.toHaveBeenCalled();
    expect(checkEmailVerified).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(logger.sync.info).toHaveBeenCalledWith(
      "cfm.booking.create_blocked_count",
      { reason: "retirement_freeze", kind: "hold" }
    );
  });

  it("returns CONTACT_ONLY for createBooking before auth when freeze is on and no session exists", async () => {
    mockedFeatures.contactFirstListings = true;
    (auth as jest.Mock).mockResolvedValue(null);

    const result = await createBooking(
      "listing-123",
      futureStart,
      futureEnd,
      1200
    );

    expect(result).toEqual(contactOnlyResult);
    expect(auth).not.toHaveBeenCalled();
    expect(checkSuspension).not.toHaveBeenCalled();
    expect(checkEmailVerified).not.toHaveBeenCalled();
    expect(checkRateLimit).toHaveBeenCalledTimes(1);
    expect(checkRateLimit).toHaveBeenCalledWith(
      "127.0.0.1",
      "createPreAuth",
      {}
    );
    expect(logger.sync.info).toHaveBeenCalledWith(
      "cfm.booking.create_blocked_count",
      { reason: "contact_only", kind: "booking" }
    );
    expect(sendNotificationEmailWithPreference).not.toHaveBeenCalled();
    expect(prisma.booking.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns CONTACT_ONLY for createBooking before auth when freeze is on and a session would otherwise be valid", async () => {
    mockedFeatures.contactFirstListings = true;

    const result = await createBooking(
      "listing-123",
      futureStart,
      futureEnd,
      1200
    );

    expect(result).toEqual(contactOnlyResult);
    expect(auth).not.toHaveBeenCalled();
    expect(checkSuspension).not.toHaveBeenCalled();
    expect(checkEmailVerified).not.toHaveBeenCalled();
    expect(checkRateLimit).toHaveBeenCalledTimes(1);
    expect(checkRateLimit).toHaveBeenCalledWith(
      "127.0.0.1",
      "createPreAuth",
      {}
    );
    expect(logger.sync.info).toHaveBeenCalledWith(
      "cfm.booking.create_blocked_count",
      { reason: "contact_only", kind: "booking" }
    );
    expect(sendNotificationEmailWithPreference).not.toHaveBeenCalled();
    expect(prisma.booking.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("still returns HOST_MANAGED_BOOKING_FORBIDDEN for createBooking when freeze is off", async () => {
    mockBookingHostManagedTransaction();

    const result = await createBooking(
      "listing-123",
      futureStart,
      futureEnd,
      1200
    );

    expect(result).toEqual(hostManagedResult);
    expect(auth).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.booking.create).not.toHaveBeenCalled();
    expect(logger.sync.info).toHaveBeenCalledWith(
      "cfm.booking.create_blocked_count",
      { reason: "host_managed", kind: "booking" }
    );
    expect(sendNotificationEmailWithPreference).not.toHaveBeenCalled();
  });

  it("returns RATE_LIMITED for createBooking before auth when the pre-gate limit is exhausted", async () => {
    mockedFeatures.contactFirstListings = true;
    (checkRateLimit as jest.Mock).mockResolvedValueOnce({
      success: false,
      remaining: 0,
      resetAt: new Date(),
    });

    const result = await createBooking(
      "listing-123",
      futureStart,
      futureEnd,
      1200
    );

    expect(result).toEqual({
      success: false,
      error: "Too many requests. Please wait.",
      code: "RATE_LIMITED",
    });
    expect(auth).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("does not emit post_freeze_write_count when createBooking rolls back after the row is created", async () => {
    mockLegacyBookingTransaction();
    (markListingsDirtyInTx as jest.Mock).mockRejectedValueOnce(
      new Error("dirty write failed")
    );

    const result = await createBooking(
      "listing-123",
      futureStart,
      futureEnd,
      1200
    );

    expect(result).toEqual({
      success: false,
      error: "Failed to create booking. Please try again.",
    });
    expect(logger.sync.info).not.toHaveBeenCalledWith(
      "cfm.booking.post_freeze_write_count",
      expect.anything()
    );
  });

  it("does not emit post_freeze_write_count when createBooking rolls back via logBookingAudit failure", async () => {
    mockLegacyBookingTransaction();
    (logBookingAudit as jest.Mock).mockRejectedValueOnce(
      new Error("audit log failed")
    );

    const result = await createBooking(
      "listing-123",
      futureStart,
      futureEnd,
      1200
    );

    expect(result).toEqual({
      success: false,
      error: "Failed to create booking. Please try again.",
    });
    expect(logger.sync.info).not.toHaveBeenCalledWith(
      "cfm.booking.post_freeze_write_count",
      expect.anything()
    );
  });

  it("emits post_freeze_write_count exactly once after createBooking commits", async () => {
    mockLegacyBookingTransaction();

    const result = await createBooking(
      "listing-123",
      futureStart,
      futureEnd,
      1200
    );

    expect(result).toEqual({
      success: true,
      bookingId: "booking-123",
    });
    expect(logger.sync.info).toHaveBeenCalledWith(
      "cfm.booking.post_freeze_write_count",
      expect.objectContaining({
        kind: "booking",
        availabilitySource: "LEGACY_BOOKING",
        contactFirstFlag: false,
        bookingIdHash: expect.any(String),
      })
    );
    expect(
      (logger.sync.info as jest.Mock).mock.calls.filter(
        ([eventName]) => eventName === "cfm.booking.post_freeze_write_count"
      )
    ).toHaveLength(1);
  });

  it("does not re-emit post_freeze_write_count for cached idempotent createBooking replies", async () => {
    (withIdempotency as jest.Mock).mockResolvedValue({
      success: true,
      cached: true,
      result: {
        success: true,
        bookingId: "booking-123",
      },
    });

    const result = await createBooking(
      "listing-123",
      futureStart,
      futureEnd,
      1200,
      1,
      "idem-123"
    );

    expect(result).toEqual({
      success: true,
      bookingId: "booking-123",
    });
    expect(logger.sync.info).not.toHaveBeenCalledWith(
      "cfm.booking.post_freeze_write_count",
      expect.anything()
    );
  });

  it("returns CONTACT_ONLY for createHold before auth when freeze is on and no session exists", async () => {
    mockedFeatures.contactFirstListings = true;
    (auth as jest.Mock).mockResolvedValue(null);

    const result = await createHold("listing-123", futureStart, futureEnd, 1200);

    expect(result).toEqual(contactOnlyResult);
    expect(auth).not.toHaveBeenCalled();
    expect(checkSuspension).not.toHaveBeenCalled();
    expect(checkEmailVerified).not.toHaveBeenCalled();
    expect(checkRateLimit).toHaveBeenCalledTimes(1);
    expect(checkRateLimit).toHaveBeenCalledWith(
      "127.0.0.1",
      "createPreAuth",
      {}
    );
    expect(logger.sync.info).toHaveBeenCalledWith(
      "cfm.booking.create_blocked_count",
      { reason: "contact_only", kind: "hold" }
    );
    expect(sendNotificationEmailWithPreference).not.toHaveBeenCalled();
    expect(prisma.booking.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns CONTACT_ONLY for createHold before auth when freeze is on and a session would otherwise be valid", async () => {
    mockedFeatures.contactFirstListings = true;

    const result = await createHold("listing-123", futureStart, futureEnd, 1200);

    expect(result).toEqual(contactOnlyResult);
    expect(auth).not.toHaveBeenCalled();
    expect(checkSuspension).not.toHaveBeenCalled();
    expect(checkEmailVerified).not.toHaveBeenCalled();
    expect(checkRateLimit).toHaveBeenCalledTimes(1);
    expect(checkRateLimit).toHaveBeenCalledWith(
      "127.0.0.1",
      "createPreAuth",
      {}
    );
    expect(logger.sync.info).toHaveBeenCalledWith(
      "cfm.booking.create_blocked_count",
      { reason: "contact_only", kind: "hold" }
    );
    expect(sendNotificationEmailWithPreference).not.toHaveBeenCalled();
    expect(prisma.booking.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("still returns HOST_MANAGED_BOOKING_FORBIDDEN for createHold when freeze is off", async () => {
    mockHoldHostManagedTransaction();

    const result = await createHold("listing-123", futureStart, futureEnd, 1200);

    expect(result).toEqual(hostManagedResult);
    expect(auth).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.booking.create).not.toHaveBeenCalled();
    expect(logger.sync.info).toHaveBeenCalledWith(
      "cfm.booking.create_blocked_count",
      { reason: "host_managed", kind: "hold" }
    );
    expect(sendNotificationEmailWithPreference).not.toHaveBeenCalled();
  });

  it("returns RATE_LIMITED for createHold before auth when the pre-gate limit is exhausted", async () => {
    mockedFeatures.contactFirstListings = true;
    (checkRateLimit as jest.Mock).mockResolvedValueOnce({
      success: false,
      remaining: 0,
      resetAt: new Date(),
    });

    const result = await createHold("listing-123", futureStart, futureEnd, 1200);

    expect(result).toEqual({
      success: false,
      error: "Too many requests. Please wait.",
      code: "RATE_LIMITED",
    });
    expect(auth).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
