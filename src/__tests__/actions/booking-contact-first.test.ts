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
    contactFirstListings: true,
    multiSlotBooking: true,
    softHoldsEnabled: true,
  },
}));

import { createBooking, createHold } from "@/app/actions/booking";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { features } from "@/lib/env";

const mockedFeatures = features as {
  contactFirstListings: boolean;
  multiSlotBooking: boolean;
  softHoldsEnabled: boolean;
};

describe("booking actions when contact-first listings are enabled", () => {
  const mockSession = {
    user: {
      id: "user-123",
      name: "Test User",
      email: "test@example.com",
    },
  };

  const futureStart = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const futureEnd = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue(mockSession);
    mockedFeatures.contactFirstListings = true;
    mockedFeatures.multiSlotBooking = true;
    mockedFeatures.softHoldsEnabled = true;
    (checkRateLimit as jest.Mock).mockResolvedValue({
      success: true,
      remaining: 10,
      resetAt: new Date(),
    });
  });

  it("blocks createBooking with a stable CONTACT_ONLY response before DB work", async () => {
    const result = await createBooking(
      "listing-123",
      futureStart,
      futureEnd,
      1200
    );

    expect(result).toEqual({
      success: false,
      error: "This listing accepts messages only. Contact the host instead.",
      code: "CONTACT_ONLY",
    });
    expect(checkRateLimit).toHaveBeenCalledTimes(1);
    expect(checkRateLimit).toHaveBeenCalledWith(
      "127.0.0.1",
      "createPreAuth",
      {}
    );
    expect(auth).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("blocks createHold with a stable CONTACT_ONLY response before DB work", async () => {
    const result = await createHold(
      "listing-123",
      futureStart,
      futureEnd,
      1200
    );

    expect(result).toEqual({
      success: false,
      error: "This listing accepts messages only. Contact the host instead.",
      code: "CONTACT_ONLY",
    });
    expect(checkRateLimit).toHaveBeenCalledTimes(1);
    expect(checkRateLimit).toHaveBeenCalledWith(
      "127.0.0.1",
      "createPreAuth",
      {}
    );
    expect(auth).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
