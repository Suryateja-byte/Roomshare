/**
 * Test Helpers API — E2E-only route for stability test DB operations.
 *
 * Gated by E2E_TEST_HELPERS=true + E2E_TEST_SECRET auth header. Returns 404 when disabled.
 * Provides read queries and test-specific mutations that cannot be done through UI
 * (e.g., creating an already-expired hold for expiry tests).
 */

import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeAddress } from "@/lib/search/normalize-address";

function isEnabled(): boolean {
  // Block in actual Vercel production deployments, not CI production builds.
  // CI runs `next start` which sets NODE_ENV=production, but VERCEL_ENV is
  // only set by Vercel itself. E2E_TEST_HELPERS + secret auth remain primary gates.
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

export async function POST(request: NextRequest) {
  if (!isEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const { action, params } = body;

    switch (action) {
      case "getListingSlots": {
        const listing = await prisma.listing.findUnique({
          where: { id: params.listingId },
          select: {
            id: true,
            totalSlots: true,
            availableSlots: true,
            bookingMode: true,
            title: true,
            ownerId: true,
          },
        });
        if (!listing)
          return NextResponse.json(
            { error: "Listing not found" },
            { status: 404 }
          );
        return NextResponse.json(listing);
      }

      case "findTestListing": {
        const owner = await prisma.user.findUnique({
          where: { email: params.ownerEmail },
          select: { id: true },
        });
        if (!owner)
          return NextResponse.json(
            { error: "Owner not found" },
            { status: 404 }
          );

        const listing = await prisma.listing.findFirst({
          where: {
            ownerId: owner.id,
            status: "ACTIVE",
            totalSlots: { gte: params.minSlots || 1 },
          },
          select: {
            id: true,
            title: true,
            totalSlots: true,
            availableSlots: true,
            bookingMode: true,
            price: true,
          },
          orderBy: { totalSlots: "desc" },
        });
        if (!listing)
          return NextResponse.json(
            { error: "No suitable listing found" },
            { status: 404 }
          );
        return NextResponse.json({ ...listing, price: Number(listing.price) });
      }

      case "getBooking": {
        const booking = await prisma.booking.findUnique({
          where: { id: params.bookingId },
          select: {
            id: true,
            status: true,
            version: true,
            slotsRequested: true,
            heldUntil: true,
            listingId: true,
            tenantId: true,
          },
        });
        if (!booking)
          return NextResponse.json(
            { error: "Booking not found" },
            { status: 404 }
          );
        return NextResponse.json(booking);
      }

      case "createExpiredHold": {
        const tenant = await prisma.user.findUnique({
          where: { email: params.tenantEmail },
          select: { id: true },
        });
        if (!tenant)
          return NextResponse.json(
            { error: "Tenant not found" },
            { status: 404 }
          );

        const listing = await prisma.listing.findUnique({
          where: { id: params.listingId },
          select: {
            id: true,
            totalSlots: true,
            availableSlots: true,
            price: true,
          },
        });
        if (!listing)
          return NextResponse.json(
            { error: "Listing not found" },
            { status: 404 }
          );

        const slotsRequested = params.slotsRequested || 1;
        const minutesAgo = params.minutesAgo || 5;
        const heldUntil = new Date(Date.now() - minutesAgo * 60 * 1000);
        const startDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
        const endDate = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000);

        const booking = await prisma.$transaction(async (tx) => {
          await tx.$executeRaw`
            UPDATE "Listing"
            SET "availableSlots" = GREATEST("availableSlots" - ${slotsRequested}, 0)
            WHERE id = ${params.listingId}
          `;

          return tx.booking.create({
            data: {
              listingId: params.listingId,
              tenantId: tenant.id,
              startDate,
              endDate,
              totalPrice: Number(listing.price) * 2,
              status: "HELD",
              slotsRequested,
              heldUntil,
              heldAt: new Date(heldUntil.getTime() - 15 * 60 * 1000),
            },
          });
        });

        return NextResponse.json({
          bookingId: booking.id,
          heldUntil: booking.heldUntil,
          slotsRequested,
        });
      }

      case "cleanupTestBookings": {
        if (!params.listingId && !params.bookingIds) {
          return NextResponse.json(
            { error: "At least one of listingId or bookingIds is required" },
            { status: 400 }
          );
        }

        const where: Record<string, unknown> = {};
        if (params.listingId) where.listingId = params.listingId;
        if (params.bookingIds) {
          where.id = { in: params.bookingIds };
          await prisma.bookingAuditLog.deleteMany({
            where: { bookingId: { in: params.bookingIds } },
          });
        }

        const result = await prisma.booking.deleteMany({ where });

        if (params.listingId && params.resetSlots) {
          const listing = await prisma.listing.findUnique({
            where: { id: params.listingId },
            select: { totalSlots: true },
          });
          if (listing) {
            await prisma.listing.update({
              where: { id: params.listingId },
              data: { availableSlots: listing.totalSlots },
            });
          }
        }

        return NextResponse.json({ deleted: result.count });
      }

      case "getGroundTruthSlots": {
        const [result] = await prisma.$queryRaw<[{ expected: number }]>`
          SELECT
            l."totalSlots" - COALESCE(SUM(b."slotsRequested") FILTER (
              WHERE b.status = 'ACCEPTED'
              OR (b.status = 'HELD' AND b."heldUntil" > NOW())
            ), 0) AS expected
          FROM "Listing" l
          LEFT JOIN "Booking" b ON b."listingId" = l.id
          WHERE l.id = ${params.listingId}
          GROUP BY l.id
        `;
        return NextResponse.json({ expected: Number(result.expected) });
      }

      case "updateListingPrice": {
        const listing = await prisma.listing.findUnique({
          where: { id: params.listingId },
          select: { price: true },
        });
        if (!listing)
          return NextResponse.json(
            { error: "Listing not found" },
            { status: 404 }
          );
        const oldPrice = Number(listing.price);
        await prisma.listing.update({
          where: { id: params.listingId },
          data: { price: params.newPrice },
        });
        return NextResponse.json({ oldPrice, newPrice: params.newPrice });
      }

      case "createPendingBooking": {
        const tenant = await prisma.user.findUnique({
          where: { email: params.tenantEmail },
          select: { id: true },
        });
        if (!tenant)
          return NextResponse.json(
            { error: "Tenant not found" },
            { status: 404 }
          );
        const listing = await prisma.listing.findUnique({
          where: { id: params.listingId },
          select: { price: true },
        });
        if (!listing)
          return NextResponse.json(
            { error: "Listing not found" },
            { status: 404 }
          );
        const startDate = params.startDate
          ? new Date(params.startDate)
          : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
        const endDate = params.endDate
          ? new Date(params.endDate)
          : new Date(Date.now() + 150 * 24 * 60 * 60 * 1000);
        const booking = await prisma.booking.create({
          data: {
            listingId: params.listingId,
            tenantId: tenant.id,
            startDate,
            endDate,
            totalPrice: Number(listing.price) * 2,
            status: "PENDING",
            slotsRequested: params.slotsRequested || 1,
          },
        });
        return NextResponse.json({ bookingId: booking.id });
      }

      case "createAcceptedBooking": {
        const tenant = await prisma.user.findUnique({
          where: { email: params.tenantEmail },
          select: { id: true },
        });
        if (!tenant)
          return NextResponse.json(
            { error: "Tenant not found" },
            { status: 404 }
          );
        const listing = await prisma.listing.findUnique({
          where: { id: params.listingId },
          select: { price: true, availableSlots: true },
        });
        if (!listing)
          return NextResponse.json(
            { error: "Listing not found" },
            { status: 404 }
          );
        const slotsRequested = params.slotsRequested || 1;
        const startDate = params.startDate
          ? new Date(params.startDate)
          : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
        const endDate = params.endDate
          ? new Date(params.endDate)
          : new Date(Date.now() + 150 * 24 * 60 * 60 * 1000);
        const booking = await prisma.$transaction(async (tx) => {
          await tx.$executeRaw`
            UPDATE "Listing"
            SET "availableSlots" = GREATEST("availableSlots" - ${slotsRequested}, 0)
            WHERE id = ${params.listingId}
          `;
          return tx.booking.create({
            data: {
              listingId: params.listingId,
              tenantId: tenant.id,
              startDate,
              endDate,
              totalPrice: Number(listing.price) * 2,
              status: "ACCEPTED",
              slotsRequested,
            },
          });
        });
        return NextResponse.json({ bookingId: booking.id, slotsRequested });
      }

      case "setListingBookingMode": {
        await prisma.listing.update({
          where: { id: params.listingId },
          data: { bookingMode: params.mode },
        });
        return NextResponse.json({ success: true, mode: params.mode });
      }

      case "setListingStatus": {
        await prisma.listing.update({
          where: { id: params.listingId },
          data: { status: params.status },
        });
        return NextResponse.json({
          success: true,
          status: params.status,
        });
      }

      case "createHeldBooking": {
        // Create a HELD booking with a FUTURE heldUntil (for HoldCountdown tests)
        const tenant = await prisma.user.findUnique({
          where: { email: params.tenantEmail },
          select: { id: true },
        });
        if (!tenant)
          return NextResponse.json(
            { error: "Tenant not found" },
            { status: 404 }
          );
        const listing = await prisma.listing.findUnique({
          where: { id: params.listingId },
          select: { price: true },
        });
        if (!listing)
          return NextResponse.json(
            { error: "Listing not found" },
            { status: 404 }
          );
        const ttlMinutes = params.ttlMinutes || 15;
        const heldUntil = new Date(Date.now() + ttlMinutes * 60 * 1000);
        const startDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
        const endDate = new Date(Date.now() + 150 * 24 * 60 * 60 * 1000);
        const slotsRequested = params.slotsRequested || 1;
        const booking = await prisma.$transaction(async (tx) => {
          await tx.$executeRaw`
            UPDATE "Listing"
            SET "availableSlots" = GREATEST("availableSlots" - ${slotsRequested}, 0)
            WHERE id = ${params.listingId}
          `;
          return tx.booking.create({
            data: {
              listingId: params.listingId,
              tenantId: tenant.id,
              startDate,
              endDate,
              totalPrice: Number(listing.price) * 2,
              status: "HELD",
              slotsRequested,
              heldUntil,
              heldAt: new Date(),
            },
          });
        });
        return NextResponse.json({
          bookingId: booking.id,
          heldUntil: heldUntil.toISOString(),
          slotsRequested,
        });
      }

      case "seedCollisionListings": {
        const owner = await prisma.user.findUnique({
          where: { email: params.ownerEmail },
          select: { id: true },
        });
        if (!owner) {
          return NextResponse.json(
            { error: "Owner not found" },
            { status: 404 }
          );
        }

        const count = Math.max(1, Number(params.count) || 1);
        const address = String(params.address || "");
        const city = String(params.city || "");
        const state = String(params.state || "");
        const zip = String(params.zip || "");
        const title = String(params.title || "E2E Collision Seed");
        const description = String(
          params.description || "Seed listing for collision-flow e2e coverage."
        );
        const price = Number(params.price) || 1200;
        const totalSlots = Math.max(1, Number(params.totalSlots) || 2);
        const availableSlots = Math.max(
          0,
          Math.min(totalSlots, Number(params.availableSlots) || 1)
        );
        const roomType = String(params.roomType || "Private Room");
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
          const createdAtOffsetHours = Number(createdAtOffsetsHours[index] ?? index);
          const moveInOffsetDays = Number(moveInDateOffsetsDays[index] ?? -1);

          const createdAt = new Date(Date.now() - createdAtOffsetHours * 60 * 60 * 1000);
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
              moveInDate,
              createdAt,
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

          await prisma.$executeRaw`
            UPDATE "Listing"
            SET "normalizedAddress" = ${normalizedAddress}
            WHERE id = ${listing.id}
          `;

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
          where: {
            id: { in: listingIds },
          },
        });

        return NextResponse.json({ deleted: result.count });
      }

      case "getListingCollisionState": {
        const [listing] = await prisma.$queryRaw<
          Array<{
            id: string;
            normalizedAddress: string | null;
            needsMigrationReview: boolean | null;
          }>
        >`
          SELECT
            id,
            "normalizedAddress",
            "needsMigrationReview"
          FROM "Listing"
          WHERE id = ${params.listingId}
          LIMIT 1
        `;

        if (!listing) {
          return NextResponse.json(
            { error: "Listing not found" },
            { status: 404 }
          );
        }

        return NextResponse.json({
          id: listing.id,
          normalizedAddress: listing.normalizedAddress,
          needsMigrationReview: listing.needsMigrationReview === true,
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
