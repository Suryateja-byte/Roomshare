/**
 * Reconcile inventory projection and scalar slot cache.
 *
 * The day-level projection is rebuilt from authoritative bookings and then the
 * transitional Listing.availableSlots cache is refreshed from live availability.
 */

import { NextRequest, NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { validateCronAuth } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { RECONCILER_ADVISORY_LOCK_KEY } from "@/lib/hold-constants";
import { markListingsDirty } from "@/lib/search/search-doc-dirty";
import {
  getAvailability,
  rebuildListingDayInventory,
} from "@/lib/availability";

export async function GET(request: NextRequest) {
  try {
    const authError = validateCronAuth(request);
    if (authError) return authError;

    const startTime = Date.now();

    const result = await prisma.$transaction(async (tx) => {
      const [lockResult] = await tx.$queryRaw<[{ locked: boolean }]>`
        SELECT pg_try_advisory_xact_lock(hashtext(${RECONCILER_ADVISORY_LOCK_KEY})) as locked
      `;

      if (!lockResult.locked) {
        return { skipped: true, reason: "lock_held" } as const;
      }

      const listings = await tx.listing.findMany({
        where: { status: "ACTIVE" },
        select: { id: true, availableSlots: true },
      });

      const fixedIds: string[] = [];
      let drifted = 0;

      for (const listing of listings) {
        await rebuildListingDayInventory(tx, listing.id, new Date());

        const availability = await getAvailability(listing.id, { tx });
        if (!availability) {
          continue;
        }

        if (availability.effectiveAvailableSlots !== listing.availableSlots) {
          drifted += 1;
          await tx.listing.update({
            where: { id: listing.id },
            data: { availableSlots: availability.effectiveAvailableSlots },
          });
          fixedIds.push(listing.id);
        }
      }

      return {
        skipped: false,
        drifted,
        fixedIds,
      } as const;
    });

    if (result.skipped) {
      return NextResponse.json({
        success: true,
        drifted: 0,
        reconciled: 0,
        skipped: true,
        reason: result.reason,
      });
    }

    if (result.fixedIds.length > 0) {
      await markListingsDirty(result.fixedIds, "reconcile_slots");
    }

    const durationMs = Date.now() - startTime;

    logger.sync.info("[reconcile-slots] Reconciliation complete", {
      event: "availability_drift_fixed",
      drifted: result.drifted,
      reconciled: result.fixedIds.length,
      durationMs,
    });

    return NextResponse.json({
      success: true,
      drifted: result.drifted,
      reconciled: result.fixedIds.length,
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
