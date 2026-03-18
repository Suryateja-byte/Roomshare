import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logger, sanitizeErrorMessage } from "@/lib/logger";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const session = await auth();

  if (!session?.user?.id) {
    const response = NextResponse.json({
      isLoggedIn: false,
      hasBookingHistory: false,
      existingReview: null,
    });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }

  try {
    const [existingReview, bookingExists] = await Promise.all([
      prisma.review.findFirst({
        where: {
          listingId: id,
          authorId: session.user.id,
        },
        select: {
          id: true,
          rating: true,
          comment: true,
          createdAt: true,
        },
      }),
      prisma.booking.findFirst({
        where: {
          listingId: id,
          tenantId: session.user.id,
          status: "ACCEPTED",
        },
        select: {
          id: true,
        },
      }),
    ]);

    const response = NextResponse.json({
      isLoggedIn: true,
      hasBookingHistory: !!bookingExists,
      existingReview: existingReview
        ? {
            id: existingReview.id,
            rating: existingReview.rating,
            comment: existingReview.comment,
            createdAt: existingReview.createdAt.toISOString(),
          }
        : null,
    });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    logger.sync.warn("Failed to load listing viewer state", {
      listingId: id,
      userId: session.user.id,
      error: sanitizeErrorMessage(error),
    });

    return NextResponse.json(
      {
        isLoggedIn: true,
        hasBookingHistory: false,
        existingReview: null,
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      }
    );
  }
}
