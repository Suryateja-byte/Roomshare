"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { checkSuspension } from "./suspension";
import { logger } from "@/lib/logger";
import { markListingDirtyInTx } from "@/lib/search/search-doc-dirty";
import { z } from "zod";
import {
  checkRateLimit,
  RATE_LIMITS,
  getClientIPFromHeaders,
} from "@/lib/rate-limit";
import { features } from "@/lib/env";
import { getHostModerationWriteLockResult } from "@/lib/listings/moderation-write-lock";
import { recordFreshnessRecovered } from "@/lib/metrics/cfm-ops-telemetry";
import { syncListingLifecycleProjectionInTx } from "@/lib/listings/canonical-lifecycle";
// Basic listingId format check — rejects empty/absurdly long strings
// without being as strict as CUID/UUID validation (allows test IDs)
const isReasonableId = (id: string) =>
  typeof id === "string" &&
  id.length >= 1 &&
  id.length <= 100 &&
  /^[\w-]+$/.test(id);

export type ListingStatus = "ACTIVE" | "PAUSED" | "RENTED";
export type HostManagedRecoveryMode = "RECONFIRM" | "REOPEN";

const statusSchema = z.enum(["ACTIVE", "PAUSED", "RENTED"]);
const versionSchema = z.number().int().min(0);
const recoveryModeSchema = z.enum(["RECONFIRM", "REOPEN"]);
type LockedListingRow = {
  id: string;
  ownerId: string;
  version: number;
  status: ListingStatus;
  statusReason: string | null;
  openSlots: number;
  availableSlots: number;
  totalSlots: number;
  moveInDate: Date | null;
  availableUntil: Date | null;
  minStayMonths: number | null;
  lastConfirmedAt: Date | null;
  freshnessReminderSentAt: Date | null;
  freshnessWarningSentAt: Date | null;
  autoPausedAt: Date | null;
};

function isFreshnessRecoveryReason(statusReason: string | null | undefined) {
  return (
    statusReason === "STALE_AUTO_PAUSE" ||
    statusReason === "FRESHNESS_WARNING"
  );
}

function resolveHostStatusReason(input: {
  status: ListingStatus;
  currentStatusReason: string | null;
}): string | null {
  if (input.status === "PAUSED") {
    return "HOST_PAUSED";
  }

  if (input.status === "ACTIVE" && input.currentStatusReason === "HOST_PAUSED") {
    return null;
  }

  return input.currentStatusReason;
}

export async function updateListingStatus(
  listingId: string,
  status: ListingStatus,
  expectedVersion: number
) {
  // Validate listingId format to avoid unnecessary DB round-trips
  if (!isReasonableId(listingId)) {
    return { error: "Invalid listing ID format" };
  }

  // Runtime Zod validation for defense-in-depth
  const parsed = statusSchema.safeParse(status);
  if (!parsed.success) {
    return { error: "Invalid status value" };
  }
  if (!versionSchema.safeParse(expectedVersion).success) {
    return { error: "Invalid listing version", code: "INVALID_VERSION" };
  }

  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  const suspension = await checkSuspension();
  if (suspension.suspended) {
    return { error: suspension.error || "Account suspended" };
  }

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        // Lock listing row to prevent concurrent modifications
        const rows = await tx.$queryRaw<LockedListingRow[]>`
        SELECT
          "id",
          "ownerId",
          "version",
          "status",
          "statusReason",
          "openSlots",
          "availableSlots",
          "totalSlots",
          "moveInDate",
          "availableUntil",
          "minStayMonths",
          "lastConfirmedAt",
          "freshnessReminderSentAt",
          "freshnessWarningSentAt",
          "autoPausedAt"
        FROM "Listing"
        WHERE id = ${listingId}
        FOR UPDATE
      `;

        if (rows.length === 0) {
          return { error: "Listing not found" } as const;
        }

        if (rows[0].ownerId !== session.user.id) {
          return { error: "You can only update your own listings" } as const;
        }

        const currentListing = rows[0];
        const writeLock = getHostModerationWriteLockResult({
          statusReason: currentListing.statusReason,
          moderationWriteLocksEnabled: features.moderationWriteLocks,
        });

        if (writeLock) {
          return {
            error: writeLock.error,
            code: writeLock.code,
            lockReason: writeLock.lockReason,
          } as const;
        }

        if (currentListing.version !== expectedVersion) {
          return {
            error:
              "This listing changed while you were editing it. Refresh and try again.",
            code: "VERSION_CONFLICT",
          } as const;
        }

        if (
          status === "ACTIVE" &&
          isFreshnessRecoveryReason(currentListing.statusReason)
        ) {
          return {
            error:
              "This listing needs availability reconfirmation before it can be reopened.",
            code: "LISTING_REQUIRES_RECONFIRMATION",
          } as const;
        }

        const nextStatusReason = resolveHostStatusReason({
          status,
          currentStatusReason: currentListing.statusReason,
        });

        await tx.listing.update({
          where: { id: listingId },
          data: {
            status,
            statusReason: nextStatusReason,
            version: currentListing.version + 1,
          },
        });

        await markListingDirtyInTx(tx, listingId, "status_changed");
        await syncListingLifecycleProjectionInTx(tx, listingId, {
          role: "host",
          id: session.user.id,
        });

        return {
          success: true,
          status,
          version: currentListing.version + 1,
          statusReason: nextStatusReason,
        } as const;
      },
      { timeout: 10000 }
    );

    if ("error" in result) {
      return result;
    }

    revalidatePath(`/listings/${listingId}`);
    revalidatePath("/profile");
    revalidatePath("/search");

    return {
      success: true,
      status: result.status,
      statusReason: result.statusReason,
      version: result.version,
    };
  } catch (error) {
    logger.sync.error("Failed to update listing status", {
      action: "updateListingStatus",
      listingId,
      status,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { error: "Failed to update listing status" };
  }
}

export async function reviewListingMigration(
  listingId: string,
  expectedVersion: number
) {
  if (!isReasonableId(listingId)) {
    return { error: "Invalid listing ID format" };
  }

  if (!versionSchema.safeParse(expectedVersion).success) {
    return { error: "Invalid listing version", code: "INVALID_VERSION" };
  }

  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  const suspension = await checkSuspension();
  if (suspension.suspended) {
    return { error: suspension.error || "Account suspended" };
  }

  void listingId;
  void expectedVersion;
  return {
    error: "Listing migration review was retired with the contact-first cutover.",
    code: "MIGRATION_REVIEW_RETIRED",
  };
}

export async function recoverHostManagedListing(
  listingId: string,
  expectedVersion: number,
  mode: HostManagedRecoveryMode
) {
  if (!isReasonableId(listingId)) {
    return { error: "Invalid listing ID format" };
  }

  if (!versionSchema.safeParse(expectedVersion).success) {
    return { error: "Invalid listing version", code: "INVALID_VERSION" };
  }

  if (!recoveryModeSchema.safeParse(mode).success) {
    return { error: "Invalid recovery mode" };
  }

  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  const suspension = await checkSuspension();
  if (suspension.suspended) {
    return { error: suspension.error || "Account suspended" };
  }

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<LockedListingRow[]>`
        SELECT
          "id",
          "ownerId",
          "version",
          "status",
          "statusReason",
          "openSlots",
          "availableSlots",
          "totalSlots",
          "moveInDate",
          "availableUntil",
          "minStayMonths",
          "lastConfirmedAt",
          "freshnessReminderSentAt",
          "freshnessWarningSentAt",
          "autoPausedAt"
        FROM "Listing"
        WHERE id = ${listingId}
        FOR UPDATE
      `;

        if (rows.length === 0) {
          return { error: "Listing not found" } as const;
        }

        if (rows[0].ownerId !== session.user.id) {
          return { error: "You can only update your own listings" } as const;
        }

        const currentListing = rows[0];
        const writeLock = getHostModerationWriteLockResult({
          statusReason: currentListing.statusReason,
          moderationWriteLocksEnabled: features.moderationWriteLocks,
        });

        if (writeLock) {
          return {
            error: writeLock.error,
            code: writeLock.code,
            lockReason: writeLock.lockReason,
          } as const;
        }

        if (currentListing.version !== expectedVersion) {
          return {
            error:
              "This listing changed while you were editing it. Refresh and try again.",
            code: "VERSION_CONFLICT",
          } as const;
        }

        const nextStatus = mode === "REOPEN" ? "ACTIVE" : currentListing.status;
        const nextStatusReason = isFreshnessRecoveryReason(
          currentListing.statusReason
        )
          ? null
          : currentListing.statusReason;
        const nextVersion = currentListing.version + 1;

        if (nextStatus === "ACTIVE" && (currentListing.openSlots ?? 0) <= 0) {
          return {
            error: "Active host-managed listings require at least one open slot.",
            code: "HOST_MANAGED_ACTIVE_REQUIRES_OPEN_SLOTS",
          } as const;
        }

        await tx.listing.update({
          where: { id: listingId },
          data: {
            status: nextStatus,
            statusReason: nextStatusReason,
            version: nextVersion,
            lastConfirmedAt: new Date(),
            freshnessReminderSentAt: null,
            freshnessWarningSentAt: null,
            autoPausedAt: null,
          },
        });

        await markListingDirtyInTx(tx, listingId, "status_changed");
        await syncListingLifecycleProjectionInTx(tx, listingId, {
          role: "host",
          id: session.user.id,
        });

        return {
          success: true,
          status: nextStatus,
          statusReason: nextStatusReason,
          version: nextVersion,
        } as const;
      },
      { timeout: 10000 }
    );

    if ("error" in result) {
      return result;
    }

    recordFreshnessRecovered({
      listingId,
      ownerId: session.user.id,
      mode,
    });

    revalidatePath(`/listings/${listingId}`);
    revalidatePath(`/listings/${listingId}/edit`);
    revalidatePath("/profile");
    revalidatePath("/search");

    return {
      success: true,
      status: result.status,
      statusReason: result.statusReason,
      version: result.version,
    };
  } catch (error) {
    logger.sync.error("Failed to recover host-managed listing", {
      action: "recoverHostManagedListing",
      listingId,
      mode,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { error: "Failed to recover listing availability" };
  }
}

export async function incrementViewCount(listingId: string) {
  if (!isReasonableId(listingId)) {
    return { error: "Invalid listing ID format" };
  }

  const session = await auth();
  let identifier: string;
  if (session?.user?.id) {
    identifier = session.user.id;
  } else {
    const { headers: getHeaders } = await import("next/headers");
    const headersList = await getHeaders();
    identifier = getClientIPFromHeaders(headersList);
  }

  // Rate limit: prevent view count gaming
  const rl = await checkRateLimit(
    identifier,
    "viewCount",
    RATE_LIMITS.viewCount
  );
  if (!rl.success) {
    return { success: true }; // Silently succeed — don't reveal rate limiting for views
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.listing.update({
        where: { id: listingId },
        data: { viewCount: { increment: 1 } },
      });
      await markListingDirtyInTx(tx, listingId, "view_count");
    });
    return { success: true };
  } catch (error) {
    logger.sync.error("Failed to increment view count", {
      action: "incrementViewCount",
      listingId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { error: "Failed to increment view count" };
  }
}

export async function trackListingView(listingId: string) {
  try {
    const session = await auth();

    // Increment view count regardless of authentication
    await incrementViewCount(listingId);

    // Track recently viewed for authenticated users
    if (session?.user?.id) {
      await trackRecentlyViewed(listingId);
    }

    return { success: true };
  } catch (error) {
    logger.sync.warn("trackListingView failed silently", {
      error: error instanceof Error ? error.name : "Unknown",
    });
    return { success: false };
  }
}

export async function trackRecentlyViewed(listingId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Not authenticated" };
  }

  try {
    // Upsert recently viewed record
    await prisma.recentlyViewed.upsert({
      where: {
        userId_listingId: {
          userId: session.user.id,
          listingId,
        },
      },
      update: {
        viewedAt: new Date(),
      },
      create: {
        userId: session.user.id,
        listingId,
        viewedAt: new Date(),
      },
    });

    // Keep only last 20 viewed listings per user
    const viewedListings = await prisma.recentlyViewed.findMany({
      where: { userId: session.user.id },
      orderBy: { viewedAt: "desc" },
      skip: 20,
    });

    if (viewedListings.length > 0) {
      await prisma.recentlyViewed.deleteMany({
        where: {
          id: { in: viewedListings.map((v) => v.id) },
        },
      });
    }

    return { success: true };
  } catch (error) {
    logger.sync.error("Failed to track recently viewed", {
      action: "trackRecentlyViewed",
      listingId,
      userId: session.user.id.slice(0, 8) + "...",
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { error: "Failed to track recently viewed" };
  }
}

export async function getRecentlyViewed(limit: number = 10) {
  const session = await auth();
  if (!session?.user?.id) {
    return [];
  }

  try {
    const recentlyViewed = await prisma.recentlyViewed.findMany({
      where: { userId: session.user.id },
      orderBy: { viewedAt: "desc" },
      take: limit,
      select: {
        viewedAt: true,
        listing: {
          select: {
            id: true,
            title: true,
            description: true,
            price: true,
            images: true,
            status: true,
            location: {
              select: {
                city: true,
                state: true,
              },
            },
            owner: {
              select: { id: true, name: true, image: true, isVerified: true },
            },
          },
        },
      },
    });

    return recentlyViewed
      .filter(
        (rv) =>
          rv.listing.status === "ACTIVE" &&
          rv.listing.title != null &&
          rv.listing.price != null
      )
      .map((rv) => ({
        id: rv.listing.id,
        title: rv.listing.title,
        description: rv.listing.description,
        price: rv.listing.price,
        images: rv.listing.images || [],
        location: rv.listing.location,
        owner: rv.listing.owner,
        viewedAt: rv.viewedAt,
      }));
  } catch (error) {
    logger.sync.error("Failed to fetch recently viewed", {
      action: "getRecentlyViewed",
      userId: session.user.id.slice(0, 8) + "...",
      limit,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return [];
  }
}
