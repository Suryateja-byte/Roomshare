import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { logger, sanitizeErrorMessage } from "@/lib/logger";
import { withRateLimit } from "@/lib/with-rate-limit";
import * as Sentry from "@sentry/nextjs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const rateLimitResponse = await withRateLimit(request, {
    type: "canDeleteCheck",
  });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const session = await auth();
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Check if listing exists and user is the owner
    const listing = await prisma.listing.findUnique({
      where: { id },
      select: { ownerId: true },
    });

    if (!listing || listing.ownerId !== session.user.id) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    // Count active conversations (warning - will be deleted)
    const activeConversations = await prisma.conversation.count({
      where: {
        listingId: id,
      },
    });

    return NextResponse.json({
      canDelete: true,
      activeBookings: 0,
      pendingBookings: 0,
      activeConversations,
    });
  } catch (error) {
    logger.sync.error("Error checking deletability", {
      error: sanitizeErrorMessage(error),
      route: "/api/listings/[id]/can-delete",
    });
    Sentry.captureException(error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
