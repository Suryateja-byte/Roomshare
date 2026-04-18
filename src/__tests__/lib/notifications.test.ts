/**
 * Tests for notifications utility
 * Validates internal notification creation and error handling
 */

import { prisma } from "@/lib/prisma";

jest.mock("@/lib/env", () => ({
  features: {
    bookingNotifications: true,
    contactFirstListings: false,
  },
}));

// Mock the logger before importing the module under test
jest.mock("@/lib/logger", () => ({
  logger: {
    sync: {
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
    },
    error: jest.fn(),
    info: jest.fn(),
  },
}));

jest.mock("@/lib/messaging/cfm-messaging-telemetry", () => ({
  hashIdForLog: jest.fn(() => "a1b2c3d4e5f6a7b8"),
}));

import {
  BOOKING_NOTIFICATION_TYPES,
  createInternalNotification,
  type NotificationType,
  type CreateNotificationInput,
} from "@/lib/notifications";
import { features } from "@/lib/env";
import { logger } from "@/lib/logger";

const mockNotificationCreate = prisma.notification.create as jest.Mock;
const mockedFeatures = features as {
  bookingNotifications: boolean;
  contactFirstListings: boolean;
};

describe("notifications", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedFeatures.bookingNotifications = true;
    mockedFeatures.contactFirstListings = false;
  });

  describe("createInternalNotification", () => {
    const baseInput: CreateNotificationInput = {
      userId: "user-123",
      type: "BOOKING_REQUEST",
      title: "New Booking Request",
      message: "You have a new booking request for your listing.",
    };

    it("creates a notification in the database", async () => {
      mockNotificationCreate.mockResolvedValue({
        id: "notif-1",
        ...baseInput,
        createdAt: new Date(),
      });

      const result = await createInternalNotification(baseInput);

      expect(result).toEqual({ success: true });
      expect(mockNotificationCreate).toHaveBeenCalledWith({
        data: {
          userId: "user-123",
          type: "BOOKING_REQUEST",
          title: "New Booking Request",
          message: "You have a new booking request for your listing.",
          link: undefined,
        },
      });
    });

    it("passes optional link to database", async () => {
      mockNotificationCreate.mockResolvedValue({});

      const inputWithLink: CreateNotificationInput = {
        ...baseInput,
        link: "/bookings/booking-456",
      };

      await createInternalNotification(inputWithLink);

      expect(mockNotificationCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          link: "/bookings/booking-456",
        }),
      });
    });

    it("handles database error gracefully", async () => {
      mockNotificationCreate.mockRejectedValue(
        new Error("DB connection failed")
      );

      const result = await createInternalNotification(baseInput);

      expect(result).toEqual({ error: "Failed to create notification" });
    });

    it("logs error details on failure without PII", async () => {
      mockNotificationCreate.mockRejectedValue(
        new Error("Unique constraint violation")
      );

      await createInternalNotification(baseInput);

      expect(logger.sync.error as jest.Mock).toHaveBeenCalledWith(
        "Failed to create notification",
        expect.objectContaining({
          action: "createInternalNotification",
          userIdHash: "a1b2c3d4e5f6a7b8",
          type: "BOOKING_REQUEST",
          error: "Unique constraint violation",
        })
      );
    });

    it("handles non-Error thrown objects", async () => {
      mockNotificationCreate.mockRejectedValue("string error");

      const result = await createInternalNotification(baseInput);

      expect(result).toEqual({ error: "Failed to create notification" });
      expect(logger.sync.error as jest.Mock).toHaveBeenCalledWith(
        "Failed to create notification",
        expect.objectContaining({
          error: "Unknown error",
        })
      );
    });

    describe("booking emission gate", () => {
      it("emits BOOKING_REQUEST when booking notifications are on by default", async () => {
        mockNotificationCreate.mockResolvedValue({});

        const result = await createInternalNotification(baseInput);

        expect(result).toEqual({ success: true });
        expect(mockNotificationCreate).toHaveBeenCalledTimes(1);
        expect(logger.sync.info as jest.Mock).not.toHaveBeenCalled();
      });

      it("short-circuits BOOKING_REQUEST when booking notifications are off", async () => {
        mockedFeatures.bookingNotifications = false;

        const result = await createInternalNotification(baseInput);

        expect(result).toEqual({ success: true });
        expect(mockNotificationCreate).not.toHaveBeenCalled();
        expect(logger.sync.info as jest.Mock).toHaveBeenCalledWith(
          "cfm.notifications.booking_emission_blocked_count",
          {
            type: "BOOKING_REQUEST",
            kind: "inapp",
          }
        );
      });

      it.each(BOOKING_NOTIFICATION_TYPES)(
        "short-circuits %s when booking notifications are off",
        async (type) => {
          mockedFeatures.bookingNotifications = false;

          const result = await createInternalNotification({
            ...baseInput,
            type,
          });

          expect(result).toEqual({ success: true });
          expect(mockNotificationCreate).not.toHaveBeenCalled();
          expect(logger.sync.info as jest.Mock).toHaveBeenCalledWith(
            "cfm.notifications.booking_emission_blocked_count",
            {
              type,
              kind: "inapp",
            }
          );
        }
      );

      it("does not gate NEW_MESSAGE when booking notifications are off", async () => {
        mockedFeatures.bookingNotifications = false;
        mockNotificationCreate.mockResolvedValue({});

        const result = await createInternalNotification({
          ...baseInput,
          type: "NEW_MESSAGE",
        });

        expect(result).toEqual({ success: true });
        expect(mockNotificationCreate).toHaveBeenCalledTimes(1);
        expect(logger.sync.info as jest.Mock).not.toHaveBeenCalled();
      });

      it("does not gate LISTING_STALE_WARNING when booking notifications are off", async () => {
        mockedFeatures.bookingNotifications = false;
        mockNotificationCreate.mockResolvedValue({});

        const result = await createInternalNotification({
          ...baseInput,
          type: "LISTING_STALE_WARNING",
        });

        expect(result).toEqual({ success: true });
        expect(mockNotificationCreate).toHaveBeenCalledTimes(1);
        expect(logger.sync.info as jest.Mock).not.toHaveBeenCalled();
      });

      it("emits bypass teeth when BOOKING_REQUEST reaches the helper with contact-first enabled", async () => {
        mockNotificationCreate.mockResolvedValue({});
        mockedFeatures.contactFirstListings = true;

        const result = await createInternalNotification(baseInput);

        expect(result).toEqual({ success: true });
        expect(mockNotificationCreate).toHaveBeenCalledTimes(1);
        expect(logger.sync.info as jest.Mock).toHaveBeenCalledWith(
          "cfm.notifications.booking_emission_bypass_count",
          {
            type: "BOOKING_REQUEST",
            userIdHash: "a1b2c3d4e5f6a7b8",
          }
        );
      });

      it("does not emit bypass teeth for BOOKING_ACCEPTED", async () => {
        mockNotificationCreate.mockResolvedValue({});
        mockedFeatures.contactFirstListings = true;

        const result = await createInternalNotification({
          ...baseInput,
          type: "BOOKING_ACCEPTED",
        });

        expect(result).toEqual({ success: true });
        expect(mockNotificationCreate).toHaveBeenCalledTimes(1);
        expect(logger.sync.info as jest.Mock).not.toHaveBeenCalledWith(
          "cfm.notifications.booking_emission_bypass_count",
          expect.anything()
        );
      });

      it("never logs a raw userId in the bypass signal", async () => {
        mockNotificationCreate.mockResolvedValue({});
        mockedFeatures.contactFirstListings = true;

        await createInternalNotification(baseInput);

        const bypassCall = (logger.sync.info as jest.Mock).mock.calls.find(
          ([event]) => event === "cfm.notifications.booking_emission_bypass_count"
        );

        expect(bypassCall).toBeDefined();
        expect(bypassCall?.[1]).toEqual({
          type: "BOOKING_REQUEST",
          userIdHash: "a1b2c3d4e5f6a7b8",
        });
        expect(bypassCall?.[1]).not.toHaveProperty("userId");
        expect(JSON.stringify(bypassCall?.[1])).not.toContain("user-123");
      });
    });

    describe("notification types", () => {
      const allTypes: NotificationType[] = [
        "BOOKING_REQUEST",
        "BOOKING_ACCEPTED",
        "BOOKING_REJECTED",
        "BOOKING_CANCELLED",
        "BOOKING_HOLD_REQUEST",
        "BOOKING_EXPIRED",
        "BOOKING_HOLD_EXPIRED",
        "NEW_MESSAGE",
        "NEW_REVIEW",
        "LISTING_SAVED",
        "SEARCH_ALERT",
        "LISTING_FRESHNESS_REMINDER",
        "LISTING_STALE_WARNING",
        "LISTING_AUTO_PAUSED",
      ];

      it.each(allTypes)("creates notification with type %s", async (type) => {
        mockNotificationCreate.mockResolvedValue({});

        const input: CreateNotificationInput = {
          ...baseInput,
          type,
        };

        const result = await createInternalNotification(input);

        expect(result).toEqual({ success: true });
        expect(mockNotificationCreate).toHaveBeenCalledWith({
          data: expect.objectContaining({ type }),
        });
      });
    });
  });
});
