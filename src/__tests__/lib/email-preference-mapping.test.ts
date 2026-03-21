/**
 * Tests: email preference mapping for new notification types (Phase 0)
 *
 * Validates that bookingHoldRequest, bookingExpired, bookingHoldExpired
 * correctly map to their respective preference keys by testing via
 * sendNotificationEmailWithPreference behavior.
 */

// Use var for hoisting compatibility with jest.mock factories
/* eslint-disable no-var */
var mockFetchWithTimeout: jest.Mock;
var mockIsAllowingRequests: jest.Mock;
var mockExecute: jest.Mock;
/* eslint-enable no-var */

mockFetchWithTimeout = jest.fn();
mockIsAllowingRequests = jest.fn().mockReturnValue(true);
mockExecute = jest.fn().mockImplementation((fn: () => any) => fn());

jest.mock("@/lib/fetch-with-timeout", () => {
  class FetchTimeoutError extends Error {
    url: string;
    timeout: number;
    constructor(url: string, timeout: number) {
      super(`Request to ${url} timed out after ${timeout}ms`);
      this.name = "FetchTimeoutError";
      this.url = url;
      this.timeout = timeout;
    }
  }
  return {
    fetchWithTimeout: (...args: any[]) => mockFetchWithTimeout(...args),
    FetchTimeoutError,
  };
});

jest.mock("@/lib/circuit-breaker", () => ({
  circuitBreakers: {
    email: {
      isAllowingRequests: (...args: any[]) => mockIsAllowingRequests(...args),
      execute: (...args: any[]) => mockExecute(...args),
    },
  },
  isCircuitOpenError: jest.fn().mockReturnValue(false),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
  },
}));

jest.mock("@/lib/logger", () => ({
  logger: { sync: { error: jest.fn(), info: jest.fn(), warn: jest.fn() } },
}));

process.env.RESEND_API_KEY = "test-key-123";

import { sendNotificationEmailWithPreference } from "@/lib/email";
import { prisma } from "@/lib/prisma";

const mockFindUnique = prisma.user.findUnique as jest.Mock;

describe("email preference mapping for new types", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAllowingRequests.mockReturnValue(true);
    mockExecute.mockImplementation((fn: () => any) => fn());
  });

  it("bookingHoldRequest respects emailBookingRequests=false", async () => {
    mockFindUnique.mockResolvedValue({
      notificationPreferences: { emailBookingRequests: false },
    });
    const result = await sendNotificationEmailWithPreference(
      "bookingHoldRequest",
      "user-1",
      "test@test.com",
      { hostName: "H", tenantName: "T", listingTitle: "L", holdExpiresAt: "D" }
    );
    expect(result.skipped).toBe(true);
  });

  it("bookingExpired respects emailBookingUpdates=false", async () => {
    mockFindUnique.mockResolvedValue({
      notificationPreferences: { emailBookingUpdates: false },
    });
    const result = await sendNotificationEmailWithPreference(
      "bookingExpired",
      "user-1",
      "test@test.com",
      { tenantName: "T", listingTitle: "L" }
    );
    expect(result.skipped).toBe(true);
  });

  it("bookingHoldExpired respects emailBookingUpdates=false", async () => {
    mockFindUnique.mockResolvedValue({
      notificationPreferences: { emailBookingUpdates: false },
    });
    const result = await sendNotificationEmailWithPreference(
      "bookingHoldExpired",
      "user-1",
      "test@test.com",
      { tenantName: "T", listingTitle: "L" }
    );
    expect(result.skipped).toBe(true);
  });
});
