"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { checkSuspension } from "./suspension";
import { logger } from "@/lib/logger";
import { headers } from "next/headers";
import {
  checkRateLimit,
  getClientIPFromHeaders,
  RATE_LIMITS,
} from "@/lib/rate-limit";
// Basic listingId format check — rejects empty/absurdly long strings
const isReasonableId = (id: string) =>
  typeof id === "string" && id.length >= 1 && id.length <= 100 && /^[\w-]+$/.test(id);

export async function toggleSaveListing(listingId: string) {
  if (!isReasonableId(listingId)) {
    return { error: "Invalid listing ID format", saved: false };
  }

  const session = await auth();

  if (!session?.user?.id) {
    return { error: "You must be logged in to save listings", saved: false };
  }

  // Rate limiting
  const headersList = await headers();
  const ip = getClientIPFromHeaders(headersList);
  const rl = await checkRateLimit(
    `${ip}:${session.user.id}`,
    "toggleSaveListing",
    RATE_LIMITS.savedListings
  );
  if (!rl.success)
    return { error: "Too many attempts. Please wait.", saved: false };

  const suspension = await checkSuspension();
  if (suspension.suspended) {
    return { error: suspension.error || "Account suspended", saved: false };
  }

  try {
    // Atomic toggle via transaction — prevents race condition on double-click
    // where two concurrent requests both see count=0 and both try to create
    const saved = await prisma.$transaction(async (tx) => {
      const existing = await tx.savedListing.findUnique({
        where: {
          userId_listingId: {
            userId: session.user.id,
            listingId,
          },
        },
      });

      if (existing) {
        await tx.savedListing.delete({
          where: { id: existing.id },
        });
        return false; // was saved, now removed
      } else {
        await tx.savedListing.create({
          data: {
            userId: session.user.id,
            listingId,
          },
        });
        return true; // newly saved
      }
    });

    revalidatePath(`/listings/${listingId}`);
    revalidatePath("/saved");
    return { saved };
  } catch (_error) {
    logger.sync.error("Failed to toggle saved listing", {
      action: "toggleSaveListing",
      listingId,
      error: _error instanceof Error ? _error.message : "Unknown error",
    });
    return { error: "Failed to save listing", saved: false };
  }
}

export async function isListingSaved(listingId: string) {
  if (!isReasonableId(listingId)) {
    return { saved: false };
  }

  const session = await auth();

  if (!session?.user?.id) {
    return { saved: false };
  }

  try {
    const existing = await prisma.savedListing.findUnique({
      where: {
        userId_listingId: {
          userId: session.user.id,
          listingId,
        },
      },
    });

    return { saved: !!existing };
  } catch (_error) {
    return { saved: false };
  }
}

export async function getSavedListings() {
  const session = await auth();

  if (!session?.user?.id) {
    return [];
  }

  try {
    const saved = await prisma.savedListing.findMany({
      where: { userId: session.user.id },
      select: {
        createdAt: true,
        listing: {
          select: {
            id: true,
            title: true,
            description: true,
            price: true,
            images: true,
            location: {
              select: {
                city: true,
                state: true,
              },
            },
            owner: {
              select: { id: true, name: true, image: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return saved.map((s) => ({
      id: s.listing.id,
      title: s.listing.title,
      description: s.listing.description,
      price: s.listing.price,
      images: s.listing.images || [],
      location: s.listing.location,
      owner: s.listing.owner,
      savedAt: s.createdAt,
    }));
  } catch (_error) {
    logger.sync.error("Failed to get saved listings", {
      action: "getSavedListings",
      userId: session.user.id.slice(0, 8) + "...",
      error: _error instanceof Error ? _error.message : "Unknown error",
    });
    return [];
  }
}

export async function removeSavedListing(listingId: string) {
  if (!isReasonableId(listingId)) {
    return { error: "Invalid listing ID format" };
  }

  const session = await auth();

  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  try {
    await prisma.savedListing.delete({
      where: {
        userId_listingId: {
          userId: session.user.id,
          listingId,
        },
      },
    });

    revalidatePath("/saved");
    return { success: true };
  } catch (_error) {
    return { error: "Failed to remove listing" };
  }
}
