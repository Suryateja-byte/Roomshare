import "server-only";

import type { NotificationType as PrismaNotificationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { hashIdForLog } from "@/lib/messaging/cfm-messaging-telemetry";

export type NotificationType = PrismaNotificationType;

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
export async function createInternalNotification(
  input: CreateNotificationInput
) {
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
      userIdHash: hashIdForLog(input.userId),
      type: input.type,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { error: "Failed to create notification" as const };
  }
}
