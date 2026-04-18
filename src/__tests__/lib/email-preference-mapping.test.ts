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

jest.mock("@/lib/env", () => ({
  features: {
    bookingNotifications: true,
  },
}));

jest.mock("@/lib/logger", () => ({
  logger: { sync: { error: jest.fn(), info: jest.fn(), warn: jest.fn() } },
}));

process.env.RESEND_API_KEY = "test-key-123";

import {
  BOOKING_EMAIL_TEMPLATE_KEYS,
  sendNotificationEmailWithPreference,
} from "@/lib/email";
import { features } from "@/lib/env";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const mockFindUnique = prisma.user.findUnique as jest.Mock;
const mockedFeatures = features as {
  bookingNotifications: boolean;
};

const bookingTemplateDataByType: Record<string, unknown> = {
  bookingRequest: {
    hostName: "H",
    tenantName: "T",
    listingTitle: "L",
    startDate: "2026-05-01",
    endDate: "2026-06-01",
    listingId: "listing-1",
  },
  bookingAccepted: {
    tenantName: "T",
    listingTitle: "L",
    hostName: "H",
    startDate: "2026-05-01",
    listingId: "listing-1",
  },
  bookingRejected: {
    tenantName: "T",
    listingTitle: "L",
    hostName: "H",
    rejectionReason: "No longer available",
  },
  bookingCancelled: {
    tenantName: "T",
    listingTitle: "L",
  },
  bookingHoldRequest: {
    hostName: "H",
    tenantName: "T",
    listingTitle: "L",
    holdExpiresAt: "2026-05-01",
  },
  bookingExpired: {
    tenantName: "T",
    listingTitle: "L",
  },
  bookingHoldExpired: {
    tenantName: "T",
    listingTitle: "L",
  },
};

async function sendBookingTemplateWithPreference(type: string) {
  return sendNotificationEmailWithPreference(
    type as Parameters<typeof sendNotificationEmailWithPreference>[0],
    "user-1",
    "test@test.com",
    bookingTemplateDataByType[type] as never
  );
}

describe("email preference mapping for new types", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAllowingRequests.mockReturnValue(true);
    mockExecute.mockImplementation((fn: () => any) => fn());
    mockedFeatures.bookingNotifications = true;
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

  it("listingFreshnessReminder respects emailBookingUpdates=false", async () => {
    mockFindUnique.mockResolvedValue({
      notificationPreferences: { emailBookingUpdates: false },
    });
    const result = await sendNotificationEmailWithPreference(
      "listingFreshnessReminder",
      "user-1",
      "test@test.com",
      { hostName: "H", listingTitle: "L", listingId: "listing-1" }
    );
    expect(result.skipped).toBe(true);
  });

  it("listingStaleWarning is not preference-gated", async () => {
    mockFindUnique.mockResolvedValue({
      notificationPreferences: { emailBookingUpdates: false },
    });
    mockFetchWithTimeout.mockResolvedValue({ ok: true });

    const result = await sendNotificationEmailWithPreference(
      "listingStaleWarning",
      "user-1",
      "test@test.com",
      { hostName: "H", listingTitle: "L", listingId: "listing-1" }
    );

    expect(result.success).toBe(true);
    expect(result.skipped).toBeUndefined();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("listingAutoPaused is not preference-gated", async () => {
    mockFindUnique.mockResolvedValue({
      notificationPreferences: { emailBookingUpdates: false },
    });
    mockFetchWithTimeout.mockResolvedValue({ ok: true });

    const result = await sendNotificationEmailWithPreference(
      "listingAutoPaused",
      "user-1",
      "test@test.com",
      { hostName: "H", listingTitle: "L", listingId: "listing-1" }
    );

    expect(result.success).toBe(true);
    expect(result.skipped).toBeUndefined();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  describe("booking email gate", () => {
    it.each(Array.from(BOOKING_EMAIL_TEMPLATE_KEYS))(
      "skips %s when booking notifications are off, without checking preference",
      async (type) => {
        mockedFeatures.bookingNotifications = false;

        const result = await sendBookingTemplateWithPreference(type);

        expect(result).toEqual({ success: true, skipped: true });
        expect(mockFindUnique).not.toHaveBeenCalled();
        expect(mockExecute).not.toHaveBeenCalled();
        expect(mockFetchWithTimeout).not.toHaveBeenCalled();
        expect(logger.sync.info as jest.Mock).toHaveBeenCalledWith(
          "cfm.notifications.booking_emission_blocked_count",
          {
            type,
            kind: "email",
          }
        );
      }
    );

    it("still sends listingFreshnessReminder when booking notifications are off", async () => {
      mockedFeatures.bookingNotifications = false;
      mockFindUnique.mockResolvedValue({
        notificationPreferences: {},
      });
      mockFetchWithTimeout.mockResolvedValue({ ok: true });

      const result = await sendNotificationEmailWithPreference(
        "listingFreshnessReminder",
        "user-1",
        "test@test.com",
        { hostName: "H", listingTitle: "L", listingId: "listing-1" }
      );

      expect(result).toEqual({ success: true });
      expect(mockFindUnique).toHaveBeenCalledTimes(1);
      expect(mockExecute).toHaveBeenCalledTimes(1);
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
      expect(logger.sync.info as jest.Mock).not.toHaveBeenCalledWith(
        "cfm.notifications.booking_emission_blocked_count",
        expect.anything()
      );
    });

    it("still sends newMessage when booking notifications are off", async () => {
      mockedFeatures.bookingNotifications = false;
      mockFindUnique.mockResolvedValue({
        notificationPreferences: {},
      });
      mockFetchWithTimeout.mockResolvedValue({ ok: true });

      const result = await sendNotificationEmailWithPreference(
        "newMessage",
        "user-1",
        "test@test.com",
        {
          recipientName: "Recipient",
          senderName: "Sender",
          conversationId: "conversation-1",
        }
      );

      expect(result).toEqual({ success: true });
      expect(mockFindUnique).toHaveBeenCalledTimes(1);
      expect(mockExecute).toHaveBeenCalledTimes(1);
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
      expect(logger.sync.info as jest.Mock).not.toHaveBeenCalledWith(
        "cfm.notifications.booking_emission_blocked_count",
        expect.anything()
      );
    });
  });
});
