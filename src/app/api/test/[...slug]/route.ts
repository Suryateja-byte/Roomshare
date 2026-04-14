import crypto from "crypto";

import { type BookingStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { GET as reconcileSlotsCron } from "@/app/api/cron/reconcile-slots/route";
import { GET as sweepExpiredHoldsCron } from "@/app/api/cron/sweep-expired-holds/route";
import { applyInventoryDeltas, getAvailability } from "@/lib/availability";
import { prisma } from "@/lib/prisma";
import {
  disableTestBarrier,
  enableTestBarrier,
  resetTestBarriers,
} from "@/lib/test-barriers";
import { upsertSearchDocSync } from "@/lib/search/search-doc-sync";

const TEST_LISTING_PREFIX = "__E2E_MULTI_SLOT__";
const DEFAULT_PASSWORD = "TestPassword123!";
const HOST_EMAIL = process.env.E2E_TEST_EMAIL || "e2e-test@roomshare.dev";
const TENANT_A_EMAIL =
  process.env.E2E_TEST_OTHER_EMAIL || "e2e-other@roomshare.dev";
const TENANT_B_EMAIL = "e2e-reviewer@roomshare.dev";

type RouteContext = {
  params: Promise<{
    slug?: string[];
  }>;
};

type SetupBookingPayload = {
  listingId: string;
  tenantId: string;
  range: {
    startDate: string;
    endDate: string;
  };
  slotsRequested?: number;
  status: BookingStatus;
  ttlMinutes?: number;
  heldUntilIso?: string;
};

function isEnabled(): boolean {
  if (process.env.VERCEL_ENV === "production") {
    return false;
  }

  return process.env.E2E_TEST_HELPERS === "true";
}

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.E2E_TEST_SECRET;
  if (!secret || secret.length < 16) {
    return false;
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return false;
  }

  const token = authHeader.slice(7);
  if (token.length !== secret.length) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(secret));
  } catch {
    return false;
  }
}

function notFound(): NextResponse {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

function parseDateParam(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseIsoDate(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getEffectiveSlotsRequested(
  listing: {
    totalSlots: number;
    bookingMode: string;
  },
  slotsRequested: number
): number {
  return listing.bookingMode === "WHOLE_UNIT"
    ? listing.totalSlots
    : Math.max(1, Math.trunc(slotsRequested));
}

async function assertAccess(request: NextRequest): Promise<NextResponse | null> {
  if (!isEnabled()) {
    return notFound();
  }

  if (!isAuthorized(request)) {
    return notFound();
  }

  return null;
}

async function findUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true },
  });
}

async function syncListingSearchState(listingId: string): Promise<void> {
  await upsertSearchDocSync(listingId);
}

async function createTestListing(body: {
  hostId: string;
  title?: string;
  totalSlots: number;
  bookingMode?: string;
  availableSlots?: number;
}) {
  const listingCount = await prisma.listing.count({
    where: {
      title: {
        startsWith: TEST_LISTING_PREFIX,
      },
    },
  });

  const listingIndex = listingCount + 1;
  const lat = 37.77 + (listingIndex % 5) * 0.002;
  const lng = -122.42 + (listingIndex % 5) * 0.002;
  const title =
    body.title?.trim() ||
    `${TEST_LISTING_PREFIX} Listing ${String(listingIndex).padStart(2, "0")}`;

  const listing = await prisma.$transaction(async (tx) => {
    const created = await tx.listing.create({
      data: {
        ownerId: body.hostId,
        title,
        description: `${TEST_LISTING_PREFIX} contract listing`,
        price: 1500,
        images: [],
        amenities: ["Wifi", "Kitchen"],
        houseRules: ["No Smoking"],
        householdLanguages: ["en"],
        totalSlots: Math.max(1, Math.trunc(body.totalSlots)),
        availableSlots:
          body.availableSlots != null
            ? Math.max(0, Math.trunc(body.availableSlots))
            : Math.max(1, Math.trunc(body.totalSlots)),
        moveInDate: new Date("2026-01-01T00:00:00.000Z"),
        status: "ACTIVE",
        bookingMode: body.bookingMode === "WHOLE_UNIT" ? "WHOLE_UNIT" : "SHARED",
        leaseDuration: "6 months",
        roomType:
          body.bookingMode === "WHOLE_UNIT" ? "Entire Place" : "Shared Room",
      },
    });

    const location = await tx.location.create({
      data: {
        listingId: created.id,
        address: `${listingIndex} Multi Slot Way`,
        city: "San Francisco",
        state: "CA",
        zip: "94110",
      },
    });

    await tx.$executeRaw`
      UPDATE "Location"
      SET coords = ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326)
      WHERE id = ${location.id}
    `;

    return created;
  });

  await syncListingSearchState(listing.id);

  return {
    id: listing.id,
    slug: listing.id,
    title: listing.title,
    totalSlots: listing.totalSlots,
    bookingMode: listing.bookingMode as "SHARED" | "WHOLE_UNIT",
  };
}

async function createSeedBooking(body: SetupBookingPayload) {
  const listing = await prisma.listing.findUnique({
    where: { id: body.listingId },
    select: {
      id: true,
      totalSlots: true,
      availableSlots: true,
      bookingMode: true,
      price: true,
    },
  });

  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  const startDate = parseDateParam(body.range?.startDate);
  const endDate = parseDateParam(body.range?.endDate);
  if (!startDate || !endDate || endDate <= startDate) {
    return NextResponse.json(
      { error: "Invalid booking range" },
      { status: 400 }
    );
  }

  const slotsRequested = getEffectiveSlotsRequested(
    listing,
    body.slotsRequested ?? 1
  );

  const heldUntil =
    body.status === "HELD"
      ? parseIsoDate(body.heldUntilIso) ??
        new Date(Date.now() + (body.ttlMinutes ?? 15) * 60 * 1000)
      : null;

  const booking = await prisma.$transaction(async (tx) => {
    if (body.status === "ACCEPTED" || body.status === "HELD") {
      await tx.$executeRaw`
        UPDATE "Listing"
        SET "availableSlots" = GREATEST("availableSlots" - ${slotsRequested}, 0)
        WHERE id = ${body.listingId}
      `;
    }

    const created = await tx.booking.create({
      data: {
        listingId: body.listingId,
        tenantId: body.tenantId,
        startDate,
        endDate,
        totalPrice: Number(listing.price),
        status: body.status,
        slotsRequested,
        heldUntil,
        heldAt: body.status === "HELD" ? new Date() : null,
      },
    });

    if (body.status === "ACCEPTED") {
      await applyInventoryDeltas(tx, {
        listingId: body.listingId,
        startDate,
        endDate,
        totalSlots: listing.totalSlots,
        acceptedDelta: slotsRequested,
      });
    }

    if (body.status === "HELD") {
      await applyInventoryDeltas(tx, {
        listingId: body.listingId,
        startDate,
        endDate,
        totalSlots: listing.totalSlots,
        heldDelta: slotsRequested,
      });
    }

    return created;
  });

  await syncListingSearchState(body.listingId);

  return NextResponse.json({
    id: booking.id,
    status: booking.status,
  });
}

async function expireHoldNow(bookingId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      listing: {
        select: {
          id: true,
          totalSlots: true,
        },
      },
    },
  });

  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  if (booking.status !== "HELD") {
    return NextResponse.json({ success: true, expired: false });
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.booking.updateMany({
      where: {
        id: booking.id,
        status: "HELD",
      },
      data: {
        status: "EXPIRED",
        heldUntil: null,
        version: { increment: 1 },
      },
    });

    if (updated.count === 0) {
      return;
    }

    await tx.$executeRaw`
      UPDATE "Listing"
      SET "availableSlots" = LEAST("availableSlots" + ${booking.slotsRequested}, "totalSlots")
      WHERE id = ${booking.listingId}
    `;

    await applyInventoryDeltas(tx, {
      listingId: booking.listingId,
      startDate: booking.startDate,
      endDate: booking.endDate,
      totalSlots: booking.listing.totalSlots,
      heldDelta: -booking.slotsRequested,
    });
  });

  await syncListingSearchState(booking.listingId);

  return NextResponse.json({ success: true, expired: true });
}

async function resetTestData() {
  resetTestBarriers();

  const listings = await prisma.listing.findMany({
    where: {
      title: {
        startsWith: TEST_LISTING_PREFIX,
      },
    },
    select: { id: true },
  });

  const listingIds = listings.map((listing) => listing.id);
  if (listingIds.length === 0) {
    return NextResponse.json({ success: true, deletedListings: 0 });
  }

  const bookings = await prisma.booking.findMany({
    where: {
      listingId: {
        in: listingIds,
      },
    },
    select: { id: true },
  });

  const bookingIds = bookings.map((booking) => booking.id);

  await prisma.$transaction(async (tx) => {
    if (bookingIds.length > 0) {
      await tx.bookingAuditLog.deleteMany({
        where: {
          bookingId: {
            in: bookingIds,
          },
        },
      });
    }

    await tx.$executeRaw`
      DELETE FROM listing_search_doc_dirty
      WHERE listing_id = ANY(${listingIds})
    `;

    await tx.$executeRaw`
      DELETE FROM listing_search_docs
      WHERE id = ANY(${listingIds})
    `;

    await tx.$executeRaw`
      DELETE FROM listing_day_inventory
      WHERE listing_id = ANY(${listingIds})
    `;

    await tx.booking.deleteMany({
      where: {
        listingId: {
          in: listingIds,
        },
      },
    });

    await tx.location.deleteMany({
      where: {
        listingId: {
          in: listingIds,
        },
      },
    });

    await tx.listing.deleteMany({
      where: {
        id: {
          in: listingIds,
        },
      },
    });
  });

  return NextResponse.json({
    success: true,
    deletedListings: listingIds.length,
    deletedBookings: bookingIds.length,
  });
}

async function proxyCronRequest(
  request: NextRequest,
  handler: (request: NextRequest) => Promise<Response>
) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 500 }
    );
  }

  const forwarded = new NextRequest(new URL(request.url), {
    method: "GET",
    headers: {
      authorization: `Bearer ${cronSecret}`,
    },
  });

  return handler(forwarded);
}

export async function GET(request: NextRequest, context: RouteContext) {
  const accessError = await assertAccess(request);
  if (accessError) {
    return accessError;
  }

  const slug = (await context.params).slug ?? [];

  if (slug.length === 1 && slug[0] === "availability") {
    const url = new URL(request.url);
    const listingId = url.searchParams.get("listingId");
    const startDate = parseDateParam(url.searchParams.get("startDate"));
    const endDate = parseDateParam(url.searchParams.get("endDate"));

    if (!listingId || !startDate || !endDate || endDate <= startDate) {
      return NextResponse.json(
        { error: "listingId, startDate, and endDate are required" },
        { status: 400 }
      );
    }

    const availability = await getAvailability(listingId, {
      startDate,
      endDate,
    });

    if (!availability) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    return NextResponse.json({
      listingId: availability.listingId,
      totalSlots: availability.totalSlots,
      effectiveAvailableSlots: availability.effectiveAvailableSlots,
      heldSlots: availability.heldSlots,
      acceptedSlots: availability.acceptedSlots,
      availabilityVersion: availability.rangeVersion,
      asOf: availability.asOf,
    });
  }

  return notFound();
}

export async function POST(request: NextRequest, context: RouteContext) {
  const accessError = await assertAccess(request);
  if (accessError) {
    return accessError;
  }

  const slug = (await context.params).slug ?? [];
  const body =
    request.method === "POST" && request.headers.get("content-length") !== "0"
      ? await request.json().catch(() => ({}))
      : {};

  if (slug[0] === "setup" && slug[1] === "users") {
    const [host, tenantA, tenantB] = await Promise.all([
      findUserByEmail(HOST_EMAIL),
      findUserByEmail(TENANT_A_EMAIL),
      findUserByEmail(TENANT_B_EMAIL),
    ]);

    if (!host || !tenantA || !tenantB) {
      return NextResponse.json(
        { error: "Seed users are missing. Run the E2E seed first." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      host: {
        id: host.id,
        email: host.email,
        password: DEFAULT_PASSWORD,
        storageStatePath: "playwright/.auth/user.json",
      },
      tenantA: {
        id: tenantA.id,
        email: tenantA.email,
        password: DEFAULT_PASSWORD,
        storageStatePath: "playwright/.auth/user2.json",
      },
      tenantB: {
        id: tenantB.id,
        email: tenantB.email,
        password: DEFAULT_PASSWORD,
        storageStatePath: "playwright/.auth/reviewer.json",
      },
    });
  }

  if (slug[0] === "setup" && slug[1] === "listing") {
    if (!body.hostId || !body.totalSlots) {
      return NextResponse.json(
        { error: "hostId and totalSlots are required" },
        { status: 400 }
      );
    }

    const listing = await createTestListing({
      hostId: String(body.hostId),
      title: typeof body.title === "string" ? body.title : undefined,
      totalSlots: Number(body.totalSlots),
      bookingMode:
        body.bookingMode === "WHOLE_UNIT" ? "WHOLE_UNIT" : "SHARED",
      availableSlots:
        typeof body.availableSlots === "number"
          ? body.availableSlots
          : undefined,
    });

    return NextResponse.json(listing);
  }

  if (slug[0] === "setup" && slug[1] === "booking") {
    if (!body.listingId || !body.tenantId || !body.range || !body.status) {
      return NextResponse.json(
        { error: "listingId, tenantId, range, and status are required" },
        { status: 400 }
      );
    }

    return createSeedBooking({
      listingId: String(body.listingId),
      tenantId: String(body.tenantId),
      range: {
        startDate: String(body.range.startDate),
        endDate: String(body.range.endDate),
      },
      slotsRequested:
        typeof body.slotsRequested === "number" ? body.slotsRequested : 1,
      status: body.status as BookingStatus,
      ttlMinutes:
        typeof body.ttlMinutes === "number" ? body.ttlMinutes : undefined,
      heldUntilIso:
        typeof body.heldUntilIso === "string" ? body.heldUntilIso : undefined,
    });
  }

  if (slug.length === 3 && slug[0] === "holds" && slug[2] === "expire-now") {
    return expireHoldNow(slug[1]);
  }

  if (slug[0] === "cron" && slug[1] === "sweep-expired-holds") {
    return proxyCronRequest(request, sweepExpiredHoldsCron);
  }

  if (
    slug[0] === "cron" &&
    (slug[1] === "reconcile-slots" || slug[1] === "reconcile-inventory")
  ) {
    return proxyCronRequest(request, reconcileSlotsCron);
  }

  if (slug[0] === "bookings" && slug[1] === "count") {
    if (!body.listingId) {
      return NextResponse.json(
        { error: "listingId is required" },
        { status: 400 }
      );
    }

    const count = await prisma.booking.count({
      where: {
        listingId: String(body.listingId),
        tenantId:
          typeof body.tenantId === "string" ? String(body.tenantId) : undefined,
        status: typeof body.status === "string" ? (body.status as BookingStatus) : undefined,
      },
    });

    return NextResponse.json({ count });
  }

  if (slug[0] === "barriers" && slug.length === 1) {
    if (typeof body.name !== "string" || typeof body.parties !== "number") {
      return NextResponse.json(
        { error: "name and parties are required" },
        { status: 400 }
      );
    }

    enableTestBarrier(body.name, body.parties);
    return NextResponse.json({ success: true });
  }

  return notFound();
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const accessError = await assertAccess(request);
  if (accessError) {
    return accessError;
  }

  const slug = (await context.params).slug ?? [];

  if (slug.length === 1 && slug[0] === "reset") {
    return resetTestData();
  }

  if (slug[0] === "barriers" && slug[1]) {
    disableTestBarrier(slug[1]);
    return NextResponse.json({ success: true });
  }

  return notFound();
}
