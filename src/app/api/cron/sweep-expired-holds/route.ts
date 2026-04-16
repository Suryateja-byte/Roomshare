/**
 * Sweep Expired Holds Cron Route (Phase 4 - Soft Holds)
 *
 * Finds HELD bookings past their heldUntil time, transitions them to EXPIRED,
 * restores listing slots, and sends notifications to tenant + host.
 *
 * Safety features:
 * - pg_try_advisory_xact_lock prevents concurrent batch discovery
 * - FOR UPDATE SKIP LOCKED avoids row contention during discovery
 * - Per-hold transactions isolate failures so one bad hold does not roll back the batch
 * - LEAST clamp prevents availableSlots > totalSlots
 * - Notifications sent OUTSIDE transactions to avoid holding locks
 *
 * Schedule: Every 1-2 minutes (recommended)
 */

import { NextRequest, NextResponse } from "next/server";

import { applyInventoryDeltas } from "@/lib/availability";
import { logBookingAudit } from "@/lib/booking-audit";
import { validateCronAuth } from "@/lib/cron-auth";
import { features } from "@/lib/env";
import {
  SWEEPER_ADVISORY_LOCK_KEY,
  SWEEPER_BATCH_SIZE,
} from "@/lib/hold-constants";
import { logger, sanitizeErrorMessage } from "@/lib/logger";
import { createInternalNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { markListingDirtyInTx } from "@/lib/search/search-doc-dirty";

interface ExpiredHoldRow {
  id: string;
  listingId: string;
  tenantId: string;
  slotsRequested: number;
  version: number;
  heldUntil: Date;
  startDate: Date;
  endDate: Date;
  totalSlots: number;
  tenantEmail: string | null;
  tenantName: string | null;
  listingTitle: string;
  hostId: string;
  hostEmail: string | null;
  hostName: string | null;
}

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

interface SweepSummary {
  durationMs: number;
  expired: number;
  failed: number;
  notificationFailures: number;
  selected: number;
  skipped: boolean;
  stale: number;
  dirtyListings: number;
  reason?: string;
}

type DiscoveryResult =
  | { skipped: true; reason: "lock_held"; holds: [] }
  | { skipped: false; reason?: never; holds: ExpiredHoldRow[] };

type HoldProcessingResult =
  | { status: "expired" }
  | { status: "stale" };

function toExpiredHoldInfo(hold: ExpiredHoldRow): ExpiredHoldInfo {
  return {
    bookingId: hold.id,
    tenantId: hold.tenantId,
    tenantEmail: hold.tenantEmail,
    tenantName: hold.tenantName,
    listingTitle: hold.listingTitle,
    listingId: hold.listingId,
    hostId: hold.hostId,
    hostEmail: hold.hostEmail,
    hostName: hold.hostName,
    heldUntil: hold.heldUntil,
  };
}

function logSweepSummary(
  level: "info" | "warn" | "error",
  message: string,
  summary: SweepSummary
) {
  logger.sync[level](message, {
    event: "sweep_expired_holds_complete",
    ...summary,
  });
}

async function fetchExpiredHoldBatch(): Promise<DiscoveryResult> {
  return prisma.$transaction(async (tx) => {
    const [lockResult] = await tx.$queryRaw<[{ locked: boolean }]>`
      SELECT pg_try_advisory_xact_lock(hashtext(${SWEEPER_ADVISORY_LOCK_KEY})) as locked
    `;

    if (!lockResult.locked) {
      return { skipped: true, reason: "lock_held", holds: [] } as const;
    }

    const expiredBookings = await tx.$queryRaw<ExpiredHoldRow[]>`
      SELECT b.id, b."listingId", b."tenantId", b."slotsRequested", b.version,
             b."heldUntil",
             b."startDate", b."endDate",
             l."totalSlots" as "totalSlots",
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

    return {
      skipped: false,
      holds: expiredBookings,
    } as const;
  });
}

async function processExpiredHold(
  hold: ExpiredHoldRow
): Promise<HoldProcessingResult> {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.$executeRaw`
      UPDATE "Booking"
      SET status = 'EXPIRED'::"BookingStatus",
          "heldUntil" = NULL,
          version = version + 1,
          "updatedAt" = NOW()
      WHERE id = ${hold.id}
        AND status = 'HELD'::"BookingStatus"
        AND version = ${hold.version}
        AND "heldUntil" <= NOW()
    `;

    if (updated === 0) {
      return { status: "stale" } as const;
    }

    await tx.$executeRaw`
      UPDATE "Listing"
      SET "availableSlots" = LEAST("availableSlots" + ${hold.slotsRequested}, "totalSlots")
      WHERE id = ${hold.listingId}
    `;

    await applyInventoryDeltas(tx, {
      listingId: hold.listingId,
      startDate: hold.startDate,
      endDate: hold.endDate,
      totalSlots: hold.totalSlots,
      heldDelta: -hold.slotsRequested,
    });

    await logBookingAudit(tx, {
      bookingId: hold.id,
      action: "EXPIRED",
      previousStatus: "HELD",
      newStatus: "EXPIRED",
      actorId: null,
      actorType: "SYSTEM",
      details: {
        slotsRequested: hold.slotsRequested,
        heldUntil: hold.heldUntil.toISOString(),
      },
    });

    await markListingDirtyInTx(tx, hold.listingId, "booking_hold_expired");

    return { status: "expired" } as const;
  });
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authError = validateCronAuth(request);
    if (authError) return authError;

    if (!features.softHoldsEnabled && !features.softHoldsDraining) {
      const durationMs = Date.now() - startTime;
      logSweepSummary("info", "[sweep-expired-holds] Sweep skipped", {
        durationMs,
        expired: 0,
        failed: 0,
        notificationFailures: 0,
        selected: 0,
        skipped: true,
        stale: 0,
        dirtyListings: 0,
        reason: "soft_holds_disabled",
      });

      return NextResponse.json({
        success: true,
        expired: 0,
        selected: 0,
        failed: 0,
        stale: 0,
        skipped: true,
        reason: "soft_holds_disabled",
        durationMs,
        timestamp: new Date().toISOString(),
      });
    }

    const batch = await fetchExpiredHoldBatch();
    if (batch.skipped) {
      const durationMs = Date.now() - startTime;
      logSweepSummary("info", "[sweep-expired-holds] Sweep skipped", {
        durationMs,
        expired: 0,
        failed: 0,
        notificationFailures: 0,
        selected: 0,
        skipped: true,
        stale: 0,
        dirtyListings: 0,
        reason: batch.reason,
      });

      return NextResponse.json({
        success: true,
        expired: 0,
        selected: 0,
        failed: 0,
        stale: 0,
        skipped: true,
        reason: batch.reason,
        durationMs,
        timestamp: new Date().toISOString(),
      });
    }

    const selected = batch.holds.length;
    let expired = 0;
    let failed = 0;
    let stale = 0;
    let notificationFailures = 0;
    const successfulHolds: ExpiredHoldInfo[] = [];

    for (const hold of batch.holds) {
      try {
        const result = await processExpiredHold(hold);

        if (result.status === "stale") {
          stale += 1;
          continue;
        }

        expired += 1;
        successfulHolds.push(toExpiredHoldInfo(hold));
      } catch (error) {
        failed += 1;
        logger.sync.error("[sweep-expired-holds] Hold processing failed", {
          event: "sweep_expired_holds_hold_failed",
          bookingId: hold.id,
          listingId: hold.listingId,
          heldUntil: hold.heldUntil.toISOString(),
          error: sanitizeErrorMessage(error),
        });
      }
    }

    for (const hold of successfulHolds) {
      try {
        await createInternalNotification({
          userId: hold.tenantId,
          type: "BOOKING_HOLD_EXPIRED",
          title: "Hold Expired",
          message: `Your hold on "${hold.listingTitle}" has expired`,
          link: "/bookings",
        });

        await createInternalNotification({
          userId: hold.hostId,
          type: "BOOKING_EXPIRED",
          title: "Hold Expired",
          message: `A hold on "${hold.listingTitle}" has expired. The slot is now available.`,
          link: "/bookings",
        });
      } catch (notifError) {
        notificationFailures += 1;
        logger.sync.error("[sweep-expired-holds] Notification failed", {
          bookingId: hold.bookingId,
          error: sanitizeErrorMessage(notifError),
        });
      }
    }

    const affectedListingIds = [
      ...new Set(successfulHolds.map((hold) => hold.listingId)),
    ];
    // markListingDirty is now called inside processExpiredHold's transaction
    // per hold (CFM-405c), so each hold's dirty mark commits atomically with
    // its own source write. No batched post-tx mark is required.

    const durationMs = Date.now() - startTime;
    const summary: SweepSummary = {
      durationMs,
      expired,
      failed,
      notificationFailures,
      selected,
      skipped: false,
      stale,
      dirtyListings: affectedListingIds.length,
    };

    if (failed > 0 && expired === 0 && stale === 0) {
      logSweepSummary("error", "[sweep-expired-holds] Sweep failed", summary);
      return NextResponse.json(
        {
          success: false,
          error: "Sweeper failed",
          expired,
          selected,
          failed,
          stale,
          skipped: false,
          durationMs,
          timestamp: new Date().toISOString(),
        },
        { status: 500 }
      );
    }

    if (failed > 0) {
      logSweepSummary(
        "warn",
        "[sweep-expired-holds] Sweep completed with partial failures",
        summary
      );
    } else {
      logSweepSummary("info", "[sweep-expired-holds] Sweep complete", summary);
    }

    return NextResponse.json({
      success: true,
      expired,
      selected,
      failed,
      stale,
      skipped: false,
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.sync.error("[sweep-expired-holds] Transaction failed", {
      error: sanitizeErrorMessage(error),
    });
    return NextResponse.json(
      {
        success: false,
        error: "Sweeper failed",
        expired: 0,
        selected: 0,
        failed: 0,
        stale: 0,
        skipped: false,
      },
      { status: 500 }
    );
  }
}
