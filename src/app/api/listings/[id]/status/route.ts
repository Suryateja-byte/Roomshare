import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  resolvePublicListingVisibilityState,
  type ListingAvailabilityGateReason,
} from "@/lib/listings/public-contact-contract";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";
import { logger, sanitizeErrorMessage } from "@/lib/logger";
import * as Sentry from "@sentry/nextjs";

// Public endpoint - no auth required
// Used by ListingFreshnessCheck to verify listing availability for all viewers

type PublicContactDisabledReason =
  | ListingAvailabilityGateReason
  | null;

function jsonNoStore(data: unknown, init?: { status?: number }) {
  const response = NextResponse.json(data, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Rate limit to prevent polling abuse
  const rateLimitResponse = await withRateLimit(request, {
    type: "listingStatus",
  });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const { id } = await params;

    const session = await auth();

    const listing = await prisma.listing.findUnique({
      where: { id },
      select: {
        id: true,
        ownerId: true,
        version: true,
        status: true,
        statusReason: true,
        availableSlots: true,
        totalSlots: true,
        openSlots: true,
        moveInDate: true,
        availableUntil: true,
        minStayMonths: true,
        lastConfirmedAt: true,
      },
    });

    if (!listing) {
      return jsonNoStore({ error: "Listing not found" }, { status: 404 });
    }

    const visibility = resolvePublicListingVisibilityState(listing);
    const publicAvailability = visibility.publicAvailability;
    const isOwner = session?.user?.id === listing.ownerId;
    const isAdmin = session?.user?.isAdmin === true;
    const canManage = isOwner || isAdmin;
    const contactDisabledReason: PublicContactDisabledReason =
      visibility.availabilityGateReason;

    if (!publicAvailability) {
      return jsonNoStore(
        { error: "Listing not found" },
        { status: 404 }
      );
    }

    if (!canManage) {
      return jsonNoStore({
        id: listing.id,
        canManage: false,
        availabilitySource: visibility.availabilitySource,
        publicStatus: publicAvailability.publicStatus,
        searchEligible: visibility.isSearchEligible,
        contactDisabledReason,
      });
    }

    return jsonNoStore({
      id: listing.id,
      canManage: true,
      version: listing.version,
      availabilitySource: visibility.availabilitySource,
      status: listing.status,
      statusReason: listing.statusReason,
      publicStatus: publicAvailability.publicStatus,
      searchEligible: visibility.isSearchEligible,
      freshnessBucket: publicAvailability.freshnessBucket,
      lastConfirmedAt: publicAvailability.lastConfirmedAt,
      staleAt: publicAvailability.staleAt,
      autoPauseAt: publicAvailability.autoPauseAt,
      contactDisabledReason,
    });
  } catch (error) {
    logger.sync.error("Error checking listing status", {
      error: sanitizeErrorMessage(error),
      route: "/api/listings/[id]/status",
    });
    Sentry.captureException(error);
    return jsonNoStore(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
