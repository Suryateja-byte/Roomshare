"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { checkSuspension } from "./suspension";
import { logger } from "@/lib/logger";
import { markListingDirty } from "@/lib/search/search-doc-dirty";
import { z } from "zod";
import {
  checkRateLimit,
  RATE_LIMITS,
  getClientIPFromHeaders,
} from "@/lib/rate-limit";
// Basic listingId format check — rejects empty/absurdly long strings
// without being as strict as CUID/UUID validation (allows test IDs)
const isReasonableId = (id: string) =>
  typeof id === "string" && id.length >= 1 && id.length <= 100 && /^[\w-]+$/.test(id);

export type ListingStatus = "ACTIVE" | "PAUSED" | "RENTED";

const statusSchema = z.enum(["ACTIVE", "PAUSED", "RENTED"]);

export async function updateListingStatus(
  listingId: string,
  status: ListingStatus
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

  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  const suspension = await checkSuspension();
  if (suspension.suspended) {
    return { error: suspension.error || "Account suspended" };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Lock listing row to prevent concurrent modifications
      const rows = await tx.$queryRaw<{ ownerId: string }[]>`
        SELECT "ownerId" FROM "Listing"
        WHERE id = ${listingId}
        FOR UPDATE
      `;

      if (rows.length === 0) {
        return { error: "Listing not found" } as const;
      }

      if (rows[0].ownerId !== session.user.id) {
        return { error: "You can only update your own listings" } as const;
      }

      if (status === "PAUSED") {
        const activeBookings = await tx.booking.count({
          where: {
            listingId,
            status: { in: ["ACCEPTED", "PENDING", "HELD"] },
          },
        });
        if (activeBookings > 0) {
          return {
            error:
              "Cannot pause a listing with active, pending, or held bookings. Please resolve them first.",
          } as const;
        }
      }

      await tx.listing.update({
        where: { id: listingId },
        data: { status },
      });

      return { success: true } as const;
    }, { timeout: 10000 });

    if ("error" in result) {
      return result;
    }

    // Side effects OUTSIDE transaction (no locks held)
    markListingDirty(listingId, "status_changed").catch((err) => {
      logger.sync.warn("markListingDirty failed", {
        action: "updateListingStatus",
        listingId,
        reason: "status_changed",
        error: err instanceof Error ? err.message : String(err),
      });
    });

    revalidatePath(`/listings/${listingId}`);
    revalidatePath("/profile");
    revalidatePath("/search");

    return { success: true };
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
    await prisma.listing.update({
      where: { id: listingId },
      data: { viewCount: { increment: 1 } },
    });
    // Fire-and-forget: mark listing dirty for search doc refresh
    markListingDirty(listingId, "view_count").catch((err) => {
      logger.sync.warn("markListingDirty failed", {
        action: "incrementViewCount",
        listingId,
        reason: "view_count",
        error: err instanceof Error ? err.message : String(err),
      });
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
      .filter((rv) => rv.listing.status === "ACTIVE")
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
