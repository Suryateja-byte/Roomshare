import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { features } from "@/lib/env";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
}
