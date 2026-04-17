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

jest.mock("@/lib/rate-limit", () => ({
  checkRateLimit: jest.fn(),
  getClientIPFromHeaders: jest.fn().mockReturnValue("127.0.0.1"),
  RATE_LIMITS: {
    createBooking: {},
    createBookingByIp: {},
    createHold: {},
    createHoldByIp: {},
    createHoldPerListing: {},
  },
}));

jest.mock("@/lib/env", () => ({
  features: {
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
import { checkRateLimit } from "@/lib/rate-limit";
import { features } from "@/lib/env";

const mockedFeatures = features as {
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

describe("booking freeze gate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue(mockSession);
    (checkRateLimit as jest.Mock).mockResolvedValue({
      success: true,
      remaining: 10,
      resetAt: new Date(),
    });
    mockedFeatures.contactFirstListings = false;
    mockedFeatures.multiSlotBooking = true;
    mockedFeatures.softHoldsEnabled = true;
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
    expect(checkRateLimit).not.toHaveBeenCalled();
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
    expect(checkRateLimit).not.toHaveBeenCalled();
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
    expect(sendNotificationEmailWithPreference).not.toHaveBeenCalled();
  });

  it("returns CONTACT_ONLY for createHold before auth when freeze is on and no session exists", async () => {
    mockedFeatures.contactFirstListings = true;
    (auth as jest.Mock).mockResolvedValue(null);

    const result = await createHold("listing-123", futureStart, futureEnd, 1200);

    expect(result).toEqual(contactOnlyResult);
    expect(auth).not.toHaveBeenCalled();
    expect(checkSuspension).not.toHaveBeenCalled();
    expect(checkEmailVerified).not.toHaveBeenCalled();
    expect(checkRateLimit).not.toHaveBeenCalled();
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
    expect(checkRateLimit).not.toHaveBeenCalled();
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
    expect(sendNotificationEmailWithPreference).not.toHaveBeenCalled();
  });
});
