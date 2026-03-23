import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIP, RATE_LIMITS } from "@/lib/rate-limit";
import { logger, sanitizeErrorMessage } from "@/lib/logger";
import { markListingDirty } from "@/lib/search/search-doc-dirty";

// NOTE: No CSRF validation on this endpoint by design.
// ListingViewTracker uses navigator.sendBeacon() which cannot set custom headers
// or reliably send the Origin header. CSRF is not needed here — this endpoint
// only increments a view counter and is rate-limited per IP/user.

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteContext) {
  const { id } = await params;
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
