/**
 * E2E-only helpers for tests that need deterministic database fixtures.
 *
 * Phase 09 retired booking helpers, but listing/search/collision E2E helpers
 * still use this route. Keep it gated and non-production, and return 410 for
 * legacy booking actions instead of reintroducing Booking model reads.
 */

import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeAddress } from "@/lib/search/normalize-address";

const LEGACY_BOOKING_ACTIONS = new Set([
  "getBooking",
  "createExpiredHold",
  "cleanupTestBookings",
  "createPendingBooking",
  "createAcceptedBooking",
  "createHeldBooking",
  "setListingBookingMode",
]);

function isEnabled(): boolean {
  if (process.env.VERCEL_ENV === "production") return false;
  return process.env.E2E_TEST_HELPERS === "true";
}

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.E2E_TEST_SECRET;
  if (!secret || secret.length < 16) return false;

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;

  const token = authHeader.slice(7);
  if (token.length !== secret.length) return false;

  try {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(secret));
  } catch {
    return false;
  }
}

function toStringParam(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function toNumberParam(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function setListingCoords(listingId: string, lng: number, lat: number) {
  await prisma.$executeRaw`
    UPDATE "Location"
    SET coords = ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326)
    WHERE "listingId" = ${listingId}
  `;
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}

export async function DELETE() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}

export async function POST(request: NextRequest) {
  if (!isEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const action = toStringParam(body?.action);
    const params = body?.params && typeof body.params === "object" ? body.params : {};

    if (LEGACY_BOOKING_ACTIONS.has(action)) {
      return NextResponse.json(
        { error: "Legacy booking test helper retired in Phase 09" },
        { status: 410 }
      );
    }

      switch (action) {
      case "findUserByEmail": {
        const email = toStringParam(params.email, "").toLowerCase();
        if (!email) {
          return NextResponse.json(
            { error: "email is required" },
            { status: 400 }
          );
        }

        const user = await prisma.user.findUnique({
          where: { email },
          select: { id: true },
        });

        if (!user) {
          return NextResponse.json(
            { error: "User not found" },
            { status: 404 }
          );
        }

        return NextResponse.json({ id: user.id });
      }

      case "getListingSlots": {
        const listing = await prisma.listing.findUnique({
          where: { id: toStringParam(params.listingId) },
          select: {
            id: true,
            totalSlots: true,
            availableSlots: true,
            openSlots: true,
            title: true,
            ownerId: true,
          },
        });

        if (!listing) {
          return NextResponse.json(
            { error: "Listing not found" },
            { status: 404 }
          );
        }

        return NextResponse.json(listing);
      }

      case "findTestListing": {
        const ownerEmail = toStringParam(
          params.ownerEmail,
          process.env.E2E_TEST_EMAIL || "e2e-test@roomshare.dev"
        );
        const owner = await prisma.user.findUnique({
          where: { email: ownerEmail },
          select: { id: true },
        });
        if (!owner) {
          return NextResponse.json(
            { error: "Owner not found" },
            { status: 404 }
          );
        }

        const minSlots = Math.max(1, toNumberParam(params.minSlots, 1));
        const listing = await prisma.listing.findFirst({
          where: {
            ownerId: owner.id,
            status: "ACTIVE",
            totalSlots: { gte: minSlots },
          },
          select: {
            id: true,
            title: true,
            totalSlots: true,
            availableSlots: true,
            openSlots: true,
            price: true,
          },
          orderBy: { totalSlots: "desc" },
        });

        if (!listing) {
          return NextResponse.json(
            { error: "No suitable listing found" },
            { status: 404 }
          );
        }

        return NextResponse.json({ ...listing, price: Number(listing.price) });
      }

      case "getGroundTruthSlots": {
        const listing = await prisma.listing.findUnique({
          where: { id: toStringParam(params.listingId) },
          select: { availableSlots: true, openSlots: true },
        });

        if (!listing) {
          return NextResponse.json(
            { error: "Listing not found" },
            { status: 404 }
          );
        }

        return NextResponse.json({
          expected: listing.openSlots ?? listing.availableSlots,
        });
      }

      case "updateListingPrice": {
        const listingId = toStringParam(params.listingId);
        const listing = await prisma.listing.findUnique({
          where: { id: listingId },
          select: { price: true },
        });
        if (!listing) {
          return NextResponse.json(
            { error: "Listing not found" },
            { status: 404 }
          );
        }

        const newPrice = toNumberParam(params.newPrice, Number(listing.price));
        await prisma.listing.update({
          where: { id: listingId },
          data: { price: newPrice },
        });

        return NextResponse.json({
          oldPrice: Number(listing.price),
          newPrice,
        });
      }

      case "setListingStatus": {
        const status = toStringParam(params.status);
        if (!["ACTIVE", "PAUSED", "RENTED"].includes(status)) {
          return NextResponse.json({ error: "Invalid status" }, { status: 400 });
        }

        await prisma.listing.update({
          where: { id: toStringParam(params.listingId) },
          data: { status: status as "ACTIVE" | "PAUSED" | "RENTED" },
        });

        return NextResponse.json({ success: true, status });
      }

      case "seedCollisionListings": {
        const ownerEmail = toStringParam(
          params.ownerEmail,
          process.env.E2E_TEST_EMAIL || "e2e-test@roomshare.dev"
        );
        const owner = await prisma.user.findUnique({
          where: { email: ownerEmail },
          select: { id: true },
        });
        if (!owner) {
          return NextResponse.json(
            { error: "Owner not found" },
            { status: 404 }
          );
        }

        const count = Math.max(1, toNumberParam(params.count, 1));
        const address = toStringParam(params.address);
        const city = toStringParam(params.city, "San Francisco");
        const state = toStringParam(params.state, "CA");
        const zip = toStringParam(params.zip, "94103");
        const title = toStringParam(params.title, "E2E Collision Seed");
        const description = toStringParam(
          params.description,
          "Seed listing for collision-flow e2e coverage."
        );
        const price = toNumberParam(params.price, 1200);
        const totalSlots = Math.max(1, toNumberParam(params.totalSlots, 2));
        const availableSlots = Math.max(
          0,
          Math.min(totalSlots, toNumberParam(params.availableSlots, 1))
        );
        const roomType = toStringParam(params.roomType, "Private Room");
        const createdAtOffsetsHours = Array.isArray(params.createdAtOffsetsHours)
          ? params.createdAtOffsetsHours
          : [];
        const moveInDateOffsetsDays = Array.isArray(params.moveInDateOffsetsDays)
          ? params.moveInDateOffsetsDays
          : [];
        const normalizedAddress = normalizeAddress({
          address,
          city,
          state,
          zip,
        });

        const listingIds: string[] = [];
        for (let index = 0; index < count; index += 1) {
          const createdAtOffsetHours = toNumberParam(
            createdAtOffsetsHours[index],
            index
          );
          const moveInOffsetDays = toNumberParam(
            moveInDateOffsetsDays[index],
            -1
          );
          const createdAt = new Date(
            Date.now() - createdAtOffsetHours * 60 * 60 * 1000
          );
          const moveInDate = new Date();
          moveInDate.setUTCHours(12, 0, 0, 0);
          moveInDate.setUTCDate(moveInDate.getUTCDate() + moveInOffsetDays);

          const listing = await prisma.listing.create({
            data: {
              id: `e2e-collision-${crypto.randomUUID()}`,
              ownerId: owner.id,
              title,
              description,
              price,
              roomType,
              amenities: ["Wifi", "Kitchen"],
              houseRules: ["No Smoking"],
              householdLanguages: ["en"],
              totalSlots,
              availableSlots,
              openSlots: availableSlots,
              moveInDate,
              createdAt,
              normalizedAddress,
              images: [
                "https://qolpgfdmkqvxraafucvu.supabase.co/storage/v1/object/public/images/listings/e2e-collision-seed.jpg",
              ],
              location: {
                create: {
                  address,
                  city,
                  state,
                  zip,
                },
              },
            },
            select: { id: true },
          });

          await setListingCoords(listing.id, -122.4094, 37.7861);
          listingIds.push(listing.id);
        }

        return NextResponse.json({ listingIds });
      }

      case "deleteListings": {
        const listingIds = Array.isArray(params.listingIds)
          ? params.listingIds.filter(
              (value: unknown): value is string => typeof value === "string"
            )
          : [];

        if (listingIds.length === 0) {
          return NextResponse.json(
            { error: "listingIds is required" },
            { status: 400 }
          );
        }

        const result = await prisma.listing.deleteMany({
          where: { id: { in: listingIds } },
        });

        return NextResponse.json({ deleted: result.count });
      }

      case "getListingCollisionState": {
        const listing = await prisma.listing.findUnique({
          where: { id: toStringParam(params.listingId) },
          select: {
            id: true,
            normalizedAddress: true,
          },
        });

        if (!listing) {
          return NextResponse.json(
            { error: "Listing not found" },
            { status: 404 }
          );
        }

        return NextResponse.json({
          id: listing.id,
          normalizedAddress: listing.normalizedAddress,
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
