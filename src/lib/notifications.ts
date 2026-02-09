import "server-only";

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export type NotificationType =
  | "BOOKING_REQUEST"
  | "BOOKING_ACCEPTED"
  | "BOOKING_REJECTED"
  | "BOOKING_CANCELLED"
  | "NEW_MESSAGE"
  | "NEW_REVIEW"
  | "LISTING_SAVED"
  | "SEARCH_ALERT";

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
}

/**
 * Internal-only notification creation helper.
 * Callers are responsible for authorization checks in their own flow.
 */
export async function createInternalNotification(input: CreateNotificationInput) {
  try {
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
      userId: input.userId,
      type: input.type,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { error: "Failed to create notification" as const };
  }
}
