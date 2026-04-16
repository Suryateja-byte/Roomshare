import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";
import { logger, sanitizeErrorMessage } from "@/lib/logger";
import * as Sentry from "@sentry/nextjs";
import { buildFreshnessReadModel } from "@/lib/search/public-availability";

// Public endpoint - no auth required
// Used by ListingFreshnessCheck to verify listing availability for all viewers
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

    const listing = await prisma.listing.findUnique({
      where: { id },
      select: {
        id: true,
        version: true,
        availabilitySource: true,
        status: true,
        statusReason: true,
        lastConfirmedAt: true,
        updatedAt: true,
      },
    });

    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    const freshnessSnapshot = buildFreshnessReadModel(listing);

    return NextResponse.json({
      id: listing.id,
      version: listing.version,
      availabilitySource: listing.availabilitySource,
      status: listing.status,
      statusReason: listing.statusReason,
      updatedAt: listing.updatedAt,
      publicStatus: freshnessSnapshot.publicStatus,
      searchEligible: freshnessSnapshot.searchEligible,
      freshnessBucket: freshnessSnapshot.freshnessBucket,
      lastConfirmedAt: listing.lastConfirmedAt?.toISOString() ?? null,
      staleAt: freshnessSnapshot.staleAt,
      autoPauseAt: freshnessSnapshot.autoPauseAt,
    });
  } catch (error) {
    logger.sync.error("Error checking listing status", {
      error: sanitizeErrorMessage(error),
      route: "/api/listings/[id]/status",
    });
    Sentry.captureException(error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
