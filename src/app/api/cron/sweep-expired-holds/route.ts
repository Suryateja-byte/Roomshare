/**
 * Sweep Expired Holds Cron Route (Phase 4 - Soft Holds)
 *
 * Finds HELD bookings past their heldUntil time, transitions them to EXPIRED,
 * restores listing slots, and sends notifications to tenant + host.
 *
 * Safety features:
 * - pg_try_advisory_xact_lock prevents concurrent sweeper runs
 * - FOR UPDATE SKIP LOCKED avoids row contention
 * - LEAST clamp prevents availableSlots > totalSlots
 * - Notifications sent OUTSIDE transaction to avoid holding locks
 *
 * Schedule: Every 1-2 minutes (recommended)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { validateCronAuth } from "@/lib/cron-auth";
import { features } from "@/lib/env";
import { createInternalNotification } from "@/lib/notifications";
import { markListingsDirty } from "@/lib/search/search-doc-dirty";
import { SWEEPER_BATCH_SIZE, SWEEPER_ADVISORY_LOCK_KEY } from "@/lib/hold-constants";
import { logBookingAudit } from '@/lib/booking-audit';

interface ExpiredHoldInfo {
  bookingId: string;
  tenantId: string;
  tenantEmail: string | null;
  tenantName: string | null;
  listingTitle: string;
  listingId: string;
  hostId: string;
  hostEmail: string | null;
  hostName: string | null;
  heldUntil: Date;
}

export async function GET(request: NextRequest) {
  try {
    const authError = validateCronAuth(request);
    if (authError) return authError;

    // Feature flag: skip if OFF (run in ON or DRAIN mode)
    if (!features.softHoldsEnabled && !features.softHoldsDraining) {
      return NextResponse.json({
        success: true,
        expired: 0,
        skipped: true,
        reason: "soft_holds_disabled",
      });
    }

    const startTime = Date.now();
    let expiredHolds: ExpiredHoldInfo[] = [];
    let expiredCount = 0;

    const result = await prisma.$transaction(async (tx) => {
      // Try to acquire advisory lock (transaction-level, auto-releases on commit)
      const [lockResult] = await tx.$queryRaw<[{ locked: boolean }]>`
        SELECT pg_try_advisory_xact_lock(hashtext(${SWEEPER_ADVISORY_LOCK_KEY})) as locked
      `;

      if (!lockResult.locked) {
        return { skipped: true, reason: "lock_held" } as const;
      }

      // Find expired HELD bookings with joins for notification data
      const expiredBookings = await tx.$queryRaw<
        Array<{
          id: string;
          listingId: string;
          tenantId: string;
          slotsRequested: number;
          version: number;
          heldUntil: Date;
          tenantEmail: string | null;
          tenantName: string | null;
          listingTitle: string;
          hostId: string;
          hostEmail: string | null;
          hostName: string | null;
        }>
      >`
        SELECT b.id, b."listingId", b."tenantId", b."slotsRequested", b.version,
               b."heldUntil",
               t.email as "tenantEmail", t.name as "tenantName",
               l.title as "listingTitle", l."ownerId" as "hostId",
               o.email as "hostEmail", o.name as "hostName"
        FROM "Booking" b
        JOIN "User" t ON t.id = b."tenantId"
        JOIN "Listing" l ON l.id = b."listingId"
        JOIN "User" o ON o.id = l."ownerId"
        WHERE b.status = 'HELD'
          AND b."heldUntil" <= NOW()
        ORDER BY b."heldUntil" ASC
        FOR UPDATE OF b SKIP LOCKED
        LIMIT ${SWEEPER_BATCH_SIZE}
      `;

      if (expiredBookings.length === 0) {
        return { skipped: false, expired: 0, holds: [] } as const;
      }

      // Expire each hold and restore slots
      for (const hold of expiredBookings) {
        // Update booking status to EXPIRED, bump version
        await tx.$executeRaw`
          UPDATE "Booking"
          SET status = 'EXPIRED'::"BookingStatus",
              "heldUntil" = NULL,
              version = version + 1,
              "updatedAt" = NOW()
          WHERE id = ${hold.id}
            AND status = 'HELD'::"BookingStatus"
        `;

        // Restore slots with LEAST clamp to prevent availableSlots > totalSlots
        await tx.$executeRaw`
          UPDATE "Listing"
          SET "availableSlots" = LEAST("availableSlots" + ${hold.slotsRequested}, "totalSlots")
          WHERE id = ${hold.listingId}
        `;

        await logBookingAudit(tx, {
          bookingId: hold.id,
          action: 'EXPIRED',
          previousStatus: 'HELD',
          newStatus: 'EXPIRED',
          actorId: null,
          actorType: 'SYSTEM',
          details: { slotsRequested: hold.slotsRequested, heldUntil: hold.heldUntil },
        });
      }

      return { skipped: false, expired: expiredBookings.length, holds: expiredBookings } as const;
    });

    if (result.skipped) {
      return NextResponse.json({
        success: true,
        expired: 0,
        skipped: true,
        reason: result.reason,
      });
    }

    expiredCount = result.expired || 0;
    expiredHolds = (result.holds || []).map((h) => ({
      bookingId: h.id,
      tenantId: h.tenantId,
      tenantEmail: h.tenantEmail,
      tenantName: h.tenantName,
      listingTitle: h.listingTitle,
      listingId: h.listingId,
      hostId: h.hostId,
      hostEmail: h.hostEmail,
      hostName: h.hostName,
      heldUntil: h.heldUntil,
    }));

    // Send notifications OUTSIDE the transaction to avoid holding locks
    for (const hold of expiredHolds) {
      try {
        // Notify tenant that their hold expired
        await createInternalNotification({
          userId: hold.tenantId,
          type: "BOOKING_HOLD_EXPIRED",
          title: "Hold Expired",
          message: `Your hold on "${hold.listingTitle}" has expired`,
          link: "/bookings",
        });

        // Notify host that a hold expired and slot is available again
        await createInternalNotification({
          userId: hold.hostId,
          type: "BOOKING_EXPIRED",
          title: "Hold Expired",
          message: `A hold on "${hold.listingTitle}" has expired. The slot is now available.`,
          link: "/bookings",
        });
      } catch (notifError) {
        // Log but do not fail the sweep for notification errors
        logger.sync.error("[sweep-expired-holds] Notification failed", {
          bookingId: hold.bookingId,
          error: notifError instanceof Error ? notifError.message : "Unknown error",
        });
      }
    }

    // Mark affected listings dirty for search doc refresh (availableSlots changed)
    if (expiredHolds.length > 0) {
      const affectedListingIds = [...new Set(expiredHolds.map(h => h.listingId))];
      await markListingsDirty(affectedListingIds, 'booking_hold_expired');
    }

    const durationMs = Date.now() - startTime;

    logger.sync.info("[sweep-expired-holds] Sweep complete", {
      event: "sweep_expired_holds_complete",
      expired: expiredCount,
      durationMs,
    });

    return NextResponse.json({
      success: true,
      expired: expiredCount,
      skipped: false,
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.sync.error("[sweep-expired-holds] Transaction failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json(
      { error: "Sweeper failed" },
      { status: 500 },
    );
  }
}
