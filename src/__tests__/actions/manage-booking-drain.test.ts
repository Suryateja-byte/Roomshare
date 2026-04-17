import { readFileSync } from "fs";

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
  },
}));

jest.mock("@/lib/booking-audit", () => ({
  logBookingAudit: jest.fn(),
}));

jest.mock("@/lib/rate-limit", () => ({
  checkRateLimit: jest.fn(),
  RATE_LIMITS: {
    bookingStatus: { limit: 30, windowMs: 60 * 1000 },
  },
}));

jest.mock("@/lib/availability", () => ({
  getAvailability: jest.fn(),
  expireOverlappingExpiredHolds: jest.fn(),
  applyInventoryDeltas: jest.fn(),
}));

jest.mock("@/lib/search/search-doc-dirty", () => ({
  markListingsDirtyInTx: jest.fn(),
}));

jest.mock("@/lib/test-barriers", () => ({
  waitForTestBarrier: jest.fn(),
}));

jest.mock("@/lib/booking-state-machine", () => ({
  validateTransition: jest.fn(),
  isInvalidStateTransitionError: jest.fn(),
}));

jest.mock("@/lib/messaging/cfm-messaging-telemetry", () => ({
  hashIdForLog: jest.fn((id: string) => `hashed-${id}`),
}));

import * as manageBooking from "@/app/actions/manage-booking";

describe("manage-booking drain guards", () => {
  it("exports only non-creator actions", () => {
    const exportNames = Object.keys(manageBooking).sort();

    expect(exportNames).toEqual(["getMyBookings", "updateBookingStatus"]);
  });

  it("does not call prisma.booking.create", () => {
    const source = readFileSync(
      require.resolve("@/app/actions/manage-booking"),
      "utf8"
    );

    expect(source).not.toMatch(/prisma\.booking\.create\b/);
  });
});
