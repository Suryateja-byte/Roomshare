/**
 * Outbox Drain Cron Route (Phase 02)
 *
 * Internal endpoint invoked by:
 *   - daily-maintenance (every 15 min) for all priority lanes
 *   - direct operator/test invocation for priority=0 tombstone fast-lane drains
 *
 * NOT registered as a dedicated Vercel cron (would exceed Hobby plan 2-cron limit).
 * See spec §(A) for the fan-out rationale.
 *
 * When phase02_projection_writes_enabled === false, returns { skipped: true }.
 * When publication/backfill kill switches are active, leaves projection publish
 * work pending while preserving payment, alert, tombstone, and cache lanes.
 */

import { NextRequest, NextResponse } from "next/server";
import { validateCronAuth } from "@/lib/cron-auth";
import { isPhase02ProjectionWritesEnabled, isKillSwitchActive } from "@/lib/flags/phase02";
import { drainOutboxOnce } from "@/lib/outbox/drain";
import type { OutboxKind } from "@/lib/outbox/append";
import { drainPublicCacheFanoutOnce } from "@/lib/public-cache/push";
import { logger, sanitizeErrorMessage } from "@/lib/logger";

const PROJECTION_PUBLICATION_KINDS = [
  "UNIT_UPSERTED",
  "INVENTORY_UPSERTED",
  "GEOCODE_NEEDED",
  "EMBED_NEEDED",
] as const satisfies readonly OutboxKind[];

export async function GET(request: NextRequest) {
  const authError = validateCronAuth(request);
  if (authError) return authError;

  if (!isPhase02ProjectionWritesEnabled()) {
    return NextResponse.json({ skipped: true, reason: "phase02_disabled" });
  }

  const disableNewPublication = isKillSwitchActive("disable_new_publication");
  const pauseBackfillsAndRepairs = isKillSwitchActive(
    "pause_backfills_and_repairs"
  );
  const excludedKinds =
    disableNewPublication || pauseBackfillsAndRepairs
      ? PROJECTION_PUBLICATION_KINDS
      : undefined;

  try {
    const result = await drainOutboxOnce({
      maxBatch: 50,
      maxTickMs: 9000,
      priorityMax: 100,
      ...(excludedKinds ? { excludedKinds } : {}),
    });
    const publicCacheFanout = await drainPublicCacheFanoutOnce(20);

    logger.sync.info("[outbox-drain] Drain tick complete", {
      ...result,
      publicCacheFanout,
      killSwitches: {
        disableNewPublication,
        pauseBackfillsAndRepairs,
      },
    });

    return NextResponse.json({
      ...result,
      publicCacheFanout,
      killSwitchActive: disableNewPublication,
      killSwitches: {
        disableNewPublication,
        pauseBackfillsAndRepairs,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.sync.error("[outbox-drain] Drain tick failed", {
      error: sanitizeErrorMessage(error),
    });
    return NextResponse.json(
      { success: false, error: "Drain failed" },
      { status: 500 }
    );
  }
}
