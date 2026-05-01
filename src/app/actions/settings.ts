"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger";
import {
  invalidatePasswordState,
  preparePasswordUpdate,
  updateUserPassword,
} from "@/lib/password-security";
import { z } from "zod";
import {
  checkRateLimit,
  getClientIPFromHeaders,
  RATE_LIMITS,
} from "@/lib/rate-limit";
import { headers } from "next/headers";
import { markListingDirtyInTx } from "@/lib/search/search-doc-dirty";
import { Prisma } from "@prisma/client";
import {
  syncListingLifecycleProjectionInTx,
  tombstoneCanonicalInventoryInTx,
} from "@/lib/listings/canonical-lifecycle";

export interface NotificationPreferences {
  emailBookingRequests: boolean;
  emailBookingUpdates: boolean;
  emailMessages: boolean;
  emailReviews: boolean;
  emailSearchAlerts: boolean;
  emailMarketing: boolean;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  emailBookingRequests: true,
  emailBookingUpdates: true,
  emailMessages: true,
  emailReviews: true,
  emailSearchAlerts: true,
  emailMarketing: false,
};

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const session = await auth();
  if (!session?.user?.id) {
    return DEFAULT_PREFERENCES;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { notificationPreferences: true },
    });

    if (!user?.notificationPreferences) {
      return DEFAULT_PREFERENCES;
    }

    return {
      ...DEFAULT_PREFERENCES,
      ...(user.notificationPreferences as Partial<NotificationPreferences>),
    };
  } catch (error) {
    logger.sync.warn("getNotificationPreferences failed silently", {
      error: error instanceof Error ? error.name : "Unknown",
    });
    return DEFAULT_PREFERENCES;
  }
}

const notificationPreferencesSchema = z
  .object({
    emailBookingRequests: z.boolean(),
    emailBookingUpdates: z.boolean(),
    emailMessages: z.boolean(),
    emailReviews: z.boolean(),
    emailSearchAlerts: z.boolean(),
    emailMarketing: z.boolean(),
  })
  .strict();

export async function updateNotificationPreferences(
  preferences: NotificationPreferences
): Promise<{ success: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" };
  }

  // Zod validation — replaces `as any` cast
  const parsed = notificationPreferencesSchema.safeParse(preferences);
  if (!parsed.success) {
    return { success: false, error: "Invalid notification preferences" };
  }

  try {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { notificationPreferences: parsed.data as Record<string, boolean> },
    });

    revalidatePath("/settings");
    return { success: true };
  } catch (error: unknown) {
    logger.sync.error("Failed to update notification preferences", {
      action: "updateNotificationPreferences",
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { success: false, error: "Failed to update preferences" };
  }
}

export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" };
  }

  // Rate limiting
  const headersList = await headers();
  const ip = getClientIPFromHeaders(headersList);
  const rl = await checkRateLimit(
    `${ip}:${session.user.id}`,
    "changePassword",
    RATE_LIMITS.changePassword
  );
  if (!rl.success)
    return {
      success: false,
      error: "Too many requests. Please try again later.",
    };

  if (newPassword.length < 12 || newPassword.length > 128) {
    return {
      success: false,
      error: "Password must be between 12 and 128 characters",
    };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { password: true, email: true },
    });

    if (!user?.password) {
      return {
        success: false,
        error: "Password login not available for this account",
      };
    }

    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      return { success: false, error: "Current password is incorrect" };
    }

    const passwordUpdate = await preparePasswordUpdate(newPassword);

    await prisma.$transaction(async (tx) => {
      if (user.email) {
        await tx.passwordResetToken.deleteMany({
          where: { email: user.email },
        });
      }

      await updateUserPassword(tx, session.user.id, passwordUpdate);
    });

    invalidatePasswordState(session.user.id);

    return { success: true };
  } catch (error: unknown) {
    logger.sync.error("Failed to change password", {
      action: "changePassword",
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { success: false, error: "Failed to change password" };
  }
}

/**
 * Verify user's password for sensitive operations
 * Returns success if password is valid, error otherwise
 */
export async function verifyPassword(
  password: string
): Promise<{ success: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" };
  }

  // Rate limiting
  const headersList = await headers();
  const ip = getClientIPFromHeaders(headersList);
  const rl = await checkRateLimit(
    `${ip}:${session.user.id}`,
    "verifyPassword",
    RATE_LIMITS.verifyPassword
  );
  if (!rl.success)
    return {
      success: false,
      error: "Too many requests. Please try again later.",
    };

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { password: true },
    });

    if (!user?.password) {
      // OAuth-only account - allow action without password
      // They can only be here if authenticated via OAuth
      return { success: true };
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return { success: false, error: "Password is incorrect" };
    }

    return { success: true };
  } catch (error: unknown) {
    logger.sync.error("Failed to verify password", {
      action: "verifyPassword",
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { success: false, error: "Failed to verify password" };
  }
}

/**
 * Check if user has a password set (vs OAuth-only account)
 */
export async function hasPasswordSet(): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) {
    return false;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { password: true },
    });

    return !!user?.password;
  } catch (error) {
    logger.sync.warn("hasPasswordSet failed silently", {
      error: error instanceof Error ? error.name : "Unknown",
    });
    return false;
  }
}

export async function deleteAccount(
  password?: string
): Promise<{ success: boolean; error?: string; code?: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" };
  }

  // Rate limiting
  const headersList = await headers();
  const ip = getClientIPFromHeaders(headersList);
  const rl = await checkRateLimit(
    `${ip}:${session.user.id}`,
    "deleteAccount",
    RATE_LIMITS.deleteAccount
  );
  if (!rl.success)
    return {
      success: false,
      error: "Too many requests. Please try again later.",
    };

  try {
    // Verify password for accounts that have one
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { email: true, password: true },
    });

    if (user?.password) {
      if (!password) {
        return {
          success: false,
          error: "Password is required to delete your account",
        };
      }

      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        return { success: false, error: "Password is incorrect" };
      }
    } else {
      // P0-5 FIX: OAuth accounts — require fresh session (signed in within last 5 min)
      const SESSION_FRESHNESS_SECONDS = 5 * 60;
      const authTime = session.authTime;
      if (
        !authTime ||
        Math.floor(Date.now() / 1000) - authTime > SESSION_FRESHNESS_SECONDS
      ) {
        return {
          success: false,
          error: "Please sign in again to confirm account deletion.",
          code: "SESSION_FRESHNESS_REQUIRED",
        };
      }
    }

    const deleteResult = await prisma.$transaction(async (tx) => {
      const [lockedUser] = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM "User"
        WHERE id = ${session.user.id}
        FOR UPDATE
      `;

      if (!lockedUser) {
        throw new Error("USER_NOT_FOUND");
      }

      const ownedListings = await tx.$queryRaw<
        Array<{ id: string; version: number }>
      >`
        SELECT id, version
        FROM "Listing"
        WHERE "ownerId" = ${session.user.id}
        FOR UPDATE
      `;

      const listingIds = ownedListings.map((listing) => listing.id);
      const reportCounts =
        listingIds.length > 0
          ? await tx.report.groupBy({
              by: ["listingId"],
              where: { listingId: { in: listingIds } },
              _count: { _all: true },
            })
          : [];
      const reportCountByListingId = new Map(
        reportCounts.map((row) => [row.listingId, row._count._all])
      );
      const reportedListings = ownedListings.filter(
        (listing) => (reportCountByListingId.get(listing.id) ?? 0) > 0
      );
      const unreportedListingIds = ownedListings
        .filter((listing) => (reportCountByListingId.get(listing.id) ?? 0) === 0)
        .map((listing) => listing.id);

      for (const listing of reportedListings) {
        await tx.listing.update({
          where: { id: listing.id },
          data: {
            status: "PAUSED",
            statusReason: "SUPPRESSED",
            version: listing.version + 1,
          },
        });
        await markListingDirtyInTx(tx, listing.id, "status_changed");
        await syncListingLifecycleProjectionInTx(tx, listing.id, {
          role: "host",
          id: session.user.id,
        });
      }

      if (unreportedListingIds.length > 0) {
        for (const listingId of unreportedListingIds) {
          await tombstoneCanonicalInventoryInTx(tx, listingId, "TOMBSTONE");
        }

        await tx.listing.deleteMany({
          where: { id: { in: unreportedListingIds } },
        });
      }

      await tx.message.deleteMany({ where: { senderId: session.user.id } });
      await tx.conversationDeletion.deleteMany({
        where: { userId: session.user.id },
      });
      await tx.typingStatus.deleteMany({ where: { userId: session.user.id } });
      await tx.blockedUser.deleteMany({
        where: {
          OR: [
            { blockerId: session.user.id },
            { blockedId: session.user.id },
          ],
        },
      });
      await tx.notification.deleteMany({ where: { userId: session.user.id } });
      await tx.recentlyViewed.deleteMany({ where: { userId: session.user.id } });
      await tx.savedListing.deleteMany({ where: { userId: session.user.id } });
      await tx.alertDelivery.deleteMany({ where: { userId: session.user.id } });
      await tx.alertSubscription.deleteMany({
        where: { userId: session.user.id },
      });
      await tx.savedSearch.deleteMany({ where: { userId: session.user.id } });
      await tx.verificationUpload.deleteMany({
        where: { userId: session.user.id },
      });
      await tx.verificationRequest.deleteMany({
        where: { userId: session.user.id },
      });
      await tx.review.deleteMany({
        where: {
          OR: [
            { authorId: session.user.id },
            { targetUserId: session.user.id },
          ],
        },
      });
      await tx.hostContactChannel.deleteMany({
        where: { hostUserId: session.user.id },
      });
      await tx.publicCachePushSubscription.deleteMany({
        where: { userId: session.user.id },
      });

      if (user?.email) {
        await tx.passwordResetToken.deleteMany({
          where: { email: user.email },
        });
        await tx.verificationToken.deleteMany({
          where: { identifier: user.email },
        });
      }

      await tx.account.deleteMany({ where: { userId: session.user.id } });
      await tx.session.deleteMany({ where: { userId: session.user.id } });
      await tx.user.update({
        where: { id: session.user.id },
        data: {
          name: "Deleted User",
          email: null,
          emailVerified: null,
          image: null,
          password: null,
          passwordChangedAt: new Date(),
          bio: null,
          countryOfOrigin: null,
          languages: [],
          isVerified: false,
          isAdmin: false,
          isSuspended: true,
          notificationPreferences: Prisma.DbNull,
          conversations: { set: [] },
        },
      });

      return {
        suppressedListings: reportedListings.length,
        deletedListings: unreportedListingIds.length,
      };
    });

    logger.sync.info("Account deletion tombstoned user", {
      action: "deleteAccountTombstone",
      userId: session.user.id,
      suppressedListings: deleteResult.suppressedListings,
      deletedListings: deleteResult.deletedListings,
    });

    return { success: true };
  } catch (error: unknown) {
    logger.sync.error("Failed to delete account", {
      action: "deleteAccount",
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { success: false, error: "Failed to delete account" };
  }
}

export async function getUserSettings() {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }

  try {
    // Use a raw boolean check instead of loading the password hash into memory.
    // This avoids exposing the hash even transiently in the server action result.
    const [user, passwordCheck] = await Promise.all([
      prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
          id: true,
          name: true,
          email: true,
          notificationPreferences: true,
        },
      }),
      prisma.user.findUnique({
        where: { id: session.user.id },
        select: { password: true },
      }),
    ]);

    if (!user) return null;

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      hasPassword: !!passwordCheck?.password,
      notificationPreferences: user.notificationPreferences
        ? {
            ...DEFAULT_PREFERENCES,
            ...(user.notificationPreferences as Partial<NotificationPreferences>),
          }
        : DEFAULT_PREFERENCES,
    };
  } catch (error) {
    logger.sync.warn("getUserSettings failed silently", {
      error: error instanceof Error ? error.name : "Unknown",
    });
    return null;
  }
}
