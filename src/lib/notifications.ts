import "server-only";

import { features } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { hashIdForLog } from "@/lib/messaging/cfm-messaging-telemetry";

export type NotificationType =
  | "BOOKING_REQUEST"
  | "BOOKING_ACCEPTED"
  | "BOOKING_REJECTED"
  | "BOOKING_CANCELLED"
  | "BOOKING_HOLD_REQUEST"
  | "BOOKING_EXPIRED"
  | "BOOKING_HOLD_EXPIRED"
  | "NEW_MESSAGE"
  | "NEW_REVIEW"
  | "LISTING_SAVED"
  | "SEARCH_ALERT"
  | "LISTING_FRESHNESS_REMINDER"
  | "LISTING_STALE_WARNING"
  | "LISTING_AUTO_PAUSED";

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
}

export const BOOKING_NOTIFICATION_TYPES = [
  "BOOKING_REQUEST",
  "BOOKING_HOLD_REQUEST",
  "BOOKING_ACCEPTED",
  "BOOKING_REJECTED",
  "BOOKING_CANCELLED",
  "BOOKING_EXPIRED",
  "BOOKING_HOLD_EXPIRED",
] as const satisfies readonly NotificationType[];

const BOOKING_NOTIFICATION_TYPE_SET = new Set<NotificationType>(
  BOOKING_NOTIFICATION_TYPES
);

const CONTACT_FIRST_BYPASS_NOTIFICATION_TYPES = new Set<NotificationType>([
  "BOOKING_REQUEST",
  "BOOKING_HOLD_REQUEST",
]);

export function isBookingNotificationType(
  type: NotificationType
): type is (typeof BOOKING_NOTIFICATION_TYPES)[number] {
  return BOOKING_NOTIFICATION_TYPE_SET.has(type);
}

/**
 * Internal-only notification creation helper.
 * Callers are responsible for authorization checks in their own flow.
 */
export async function createInternalNotification(
  input: CreateNotificationInput
) {
  try {
    if (
      CONTACT_FIRST_BYPASS_NOTIFICATION_TYPES.has(input.type) &&
      features.contactFirstListings
    ) {
      logger.sync.info("cfm.notifications.booking_emission_bypass_count", {
        type: input.type,
        userIdHash: hashIdForLog(input.userId),
      });
    }

    if (
      isBookingNotificationType(input.type) &&
      !features.bookingNotifications
    ) {
      logger.sync.info("cfm.notifications.booking_emission_blocked_count", {
        type: input.type,
        kind: "inapp",
      });
      return { success: true as const };
    }

    await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        message: input.message,
        link: input.link,
      },
    });
    return { success: true as const };
  } catch (error) {
    logger.sync.error("Failed to create notification", {
      action: "createInternalNotification",
      userIdHash: hashIdForLog(input.userId),
      type: input.type,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { error: "Failed to create notification" as const };
  }
}
