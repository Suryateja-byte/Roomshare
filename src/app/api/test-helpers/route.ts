/**
 * Test Helpers API — E2E-only route for stability test DB operations.
 *
 * Gated by E2E_TEST_HELPERS=true. Returns 404 in production or when disabled.
 * Provides read queries and test-specific mutations that cannot be done through UI
 * (e.g., creating an already-expired hold for expiry tests).
 */

import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function isEnabled(): boolean {
  return (
    process.env.E2E_TEST_HELPERS === "true" &&
    process.env.NODE_ENV !== "production"
  );
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
