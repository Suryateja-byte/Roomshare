import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIP, RATE_LIMITS } from "@/lib/rate-limit";
import { logger, sanitizeErrorMessage } from "@/lib/logger";
import { markListingDirty } from "@/lib/search/search-doc-dirty";
import { validateViewToken } from "@/app/api/metrics/hmac";

// NOTE: No CSRF validation on this endpoint by design.
// ListingViewTracker uses navigator.sendBeacon() which cannot set custom headers
// or reliably send the Origin header. HMAC view tokens provide request authenticity.

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteContext) {
  const { id } = await params;

  // API-003 FIX: Validate HMAC view token (defense-in-depth, not replacement for rate limiting)
  try {
    const body = await request.clone().json();
    const vt = typeof body?.vt === "string" ? body.vt : undefined;
    if (!validateViewToken(id, vt)) {
      return new NextResponse(null, { status: 204 });
    }
  } catch {
    // Malformed JSON — silently accept (graceful degradation for older clients)
  }

  const session = await auth();
  const identifier = session?.user?.id ?? getClientIP(request);
  const rateLimit = await checkRateLimit(
    identifier,
    "viewCount",
    RATE_LIMITS.viewCount
  );

  if (!rateLimit.success) {
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Cache-Control": "private, no-store",
      },
    });
  }

  try {
    await prisma.listing.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    });

    markListingDirty(id, "view_count").catch((err) => {
      logger.sync.warn("markListingDirty failed", {
        route: "/api/listings/[id]/view",
        listingId: id,
        reason: "view_count",
        error: err instanceof Error ? err.message : String(err),
      });
    });

    if (session?.user?.id) {
      await prisma.recentlyViewed.upsert({
        where: {
          userId_listingId: {
            userId: session.user.id,
            listingId: id,
          },
        },
        update: {
          viewedAt: new Date(),
        },
        create: {
          userId: session.user.id,
          listingId: id,
          viewedAt: new Date(),
        },
      });

      const viewedListings = await prisma.recentlyViewed.findMany({
        where: { userId: session.user.id },
        orderBy: { viewedAt: "desc" },
        skip: 20,
        select: { id: true },
      });

      if (viewedListings.length > 0) {
        await prisma.recentlyViewed.deleteMany({
          where: {
            id: { in: viewedListings.map((viewedListing) => viewedListing.id) },
          },
        });
      }
    }
  } catch (error) {
    logger.sync.warn("Failed to record listing view asynchronously", {
      listingId: id,
      error: sanitizeErrorMessage(error),
    });
  }

  return new NextResponse(null, {
    status: 204,
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}
