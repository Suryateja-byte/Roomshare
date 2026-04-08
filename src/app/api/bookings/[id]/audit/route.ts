import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { features } from "@/lib/env";
import { withRateLimit } from "@/lib/with-rate-limit";
import { logger, sanitizeErrorMessage } from "@/lib/logger";
import * as Sentry from "@sentry/nextjs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // API-008 FIX: Rate limit to prevent audit log enumeration
  const rateLimitResponse = await withRateLimit(request, {
    type: "bookingAudit",
  });
  if (rateLimitResponse) return rateLimitResponse;

  if (!features.bookingAudit) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Input validation
  if (!id || id.length > 30) {
    return NextResponse.json({ error: "Invalid booking ID" }, { status: 400 });
  }

  try {
    const booking = await prisma.booking.findUnique({
      where: { id },
      include: { listing: { select: { ownerId: true } } },
    });

    if (!booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    // Authorization: tenant, host, or admin
    const userId = session.user.id;
    const isAuthorized =
      userId === booking.tenantId ||
      userId === booking.listing.ownerId ||
      session.user.isAdmin;

    if (!isAuthorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const auditLogs = await prisma.bookingAuditLog.findMany({
      where: { bookingId: id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        action: true,
        previousStatus: true,
        newStatus: true,
        actorType: true,
        details: true,
        createdAt: true,
        // actorId intentionally excluded — PII protection
      },
    });

    return NextResponse.json({
      bookingId: id,
      entries: auditLogs,
    });
  } catch (error) {
    logger.sync.error("Booking audit log error", {
      error: sanitizeErrorMessage(error),
      route: "/api/bookings/[id]/audit",
    });
    Sentry.captureException(error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
