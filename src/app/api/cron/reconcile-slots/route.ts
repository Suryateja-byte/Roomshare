/**
 * Reconcile Slots Cron Route (Phase 5 - Audit Trail)
 *
 * Weekly safety net detecting and fixing availableSlots drift.
 * Uses SUM(slotsRequested) to correctly count consumed slots.
 *
 * Schedule: 0 5 * * 0 (Sunday 5:00 AM UTC)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { logger } from "@/lib/logger";
import { validateCronAuth } from "@/lib/cron-auth";
import { features } from "@/lib/env";
import { markListingsDirty } from "@/lib/search/search-doc-dirty";
import * as Sentry from "@sentry/nextjs";
import { RECONCILER_ADVISORY_LOCK_KEY } from "@/lib/hold-constants";

interface DriftRow {
  id: string;
  actual: number;
  expected: number;
}

const AUTO_FIX_THRESHOLD = 5;

export async function GET(request: NextRequest) {
  try {
    const authError = validateCronAuth(request);
    if (authError) return authError;

    if (!features.bookingAudit) {
      return NextResponse.json({
        skipped: true,
        reason: "ENABLE_BOOKING_AUDIT is off",
      });
    }

    const startTime = Date.now();

    const result = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        // Acquire advisory lock (transaction-scoped, auto-releases on commit)
        const [lockResult] = await tx.$queryRaw<[{ locked: boolean }]>`
        SELECT pg_try_advisory_xact_lock(hashtext(${RECONCILER_ADVISORY_LOCK_KEY})) as locked
      `;

        if (!lockResult.locked) {
          return { skipped: true, reason: "lock_held" } as const;
        }

        // Detect drift using SUM(slotsRequested), not COUNT
        const driftRows = await tx.$queryRaw<DriftRow[]>`
        SELECT
          l.id,
          l."availableSlots" AS actual,
          l."totalSlots" - COALESCE(SUM(b."slotsRequested") FILTER (
            WHERE b.status = 'ACCEPTED'
            OR (b.status = 'HELD' AND b."heldUntil" > NOW())
          ), 0) AS expected
        FROM "Listing" l
        LEFT JOIN "Booking" b ON b."listingId" = l.id
        WHERE l.status = 'ACTIVE'
        GROUP BY l.id
        HAVING l."availableSlots" != l."totalSlots" - COALESCE(SUM(b."slotsRequested") FILTER (
          WHERE b.status = 'ACCEPTED'
          OR (b.status = 'HELD' AND b."heldUntil" > NOW())
        ), 0)
      `;

        const fixedIds: string[] = [];
        let alertedOnly = 0;

        for (const row of driftRows) {
          const delta = Math.abs(Number(row.actual) - Number(row.expected));

          logger.sync.info("[reconcile-slots] Drift detected", {
            event: "slot_drift_detected",
            listingId: row.id.slice(0, 8) + "...",
            actual: Number(row.actual),
            expected: Number(row.expected),
            delta,
          });

          if (delta <= AUTO_FIX_THRESHOLD) {
            // Fix 2: GREATEST guard prevents negative availableSlots
            await tx.$executeRaw`
            UPDATE "Listing"
            SET "availableSlots" = GREATEST(0, ${Number(row.expected)})
            WHERE id = ${row.id}
          `;
            fixedIds.push(row.id);
          } else {
            // Fix 7: Truncate listing ID in Sentry call
            Sentry.captureMessage(
              `[reconcile-slots] Large slot drift detected (delta=${delta})`,
              {
                level: "warning",
                extra: {
                  listingId: row.id.slice(0, 8) + "...",
                  actual: row.actual,
                  expected: row.expected,
                  delta,
                },
              }
            );
            alertedOnly++;
          }
        }

        return {
          skipped: false,
          drifted: driftRows.length,
          fixedIds,
          alertedOnly,
        } as const;
      }
    );

    if (result.skipped) {
      return NextResponse.json({
        success: true,
        reconciled: 0,
        skipped: true,
        reason: result.reason,
      });
    }

    // Mark fixed listings dirty for search doc refresh (OUTSIDE TX)
    if (result.fixedIds.length > 0) {
      await markListingsDirty(result.fixedIds, "reconcile_slots");
    }

    const durationMs = Date.now() - startTime;

    logger.sync.info("[reconcile-slots] Reconciliation complete", {
      event: "reconcile_slots_complete",
      drifted: result.drifted,
      reconciled: result.fixedIds.length,
      alertedOnly: result.alertedOnly,
      durationMs,
    });

    return NextResponse.json({
      success: true,
      drifted: result.drifted,
      reconciled: result.fixedIds.length,
      alertedOnly: result.alertedOnly,
      skipped: false,
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.sync.error("[reconcile-slots] Reconciliation failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json({ error: "Reconciler failed" }, { status: 500 });
  }
}
