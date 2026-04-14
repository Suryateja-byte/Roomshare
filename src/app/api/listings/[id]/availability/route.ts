import { NextResponse } from "next/server";

import { getAvailability } from "@/lib/availability";
import { logger, sanitizeErrorMessage } from "@/lib/logger";
import { withRateLimit } from "@/lib/with-rate-limit";

function parseDateParam(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const rateLimitResponse = await withRateLimit(request, {
    type: "listingStatus",
  });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const { id } = await params;
    const url = new URL(request.url);
    const startDate = parseDateParam(url.searchParams.get("startDate"));
    const endDate = parseDateParam(url.searchParams.get("endDate"));

    if (Boolean(startDate) !== Boolean(endDate)) {
      return NextResponse.json(
        { error: "startDate and endDate must be provided together" },
        { status: 400 }
      );
    }

    if (startDate && endDate && endDate <= startDate) {
      return NextResponse.json(
        { error: "endDate must be after startDate" },
        { status: 400 }
      );
    }

    const availability = await getAvailability(id, {
      startDate,
      endDate,
    });

    if (!availability) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    return NextResponse.json(availability, {
      headers: {
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    logger.sync.error("Failed to fetch listing availability", {
      route: "/api/listings/[id]/availability",
      error: sanitizeErrorMessage(error),
    });

    return NextResponse.json(
      { error: "Failed to fetch availability" },
      { status: 500 }
    );
  }
}
