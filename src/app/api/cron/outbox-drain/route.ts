/**
 * Outbox Drain Cron Route (Phase 02)
 *
 * Internal endpoint invoked by:
 *   - daily-maintenance dispatcher for all priority lanes
 *   - direct operator/test invocation for priority=0 tombstone fast-lane drains
 *
 * NOT registered as a dedicated Vercel cron; the Hobby project schedule stays
 * daily and fans out through daily-maintenance.
 * See spec §(A) for the fan-out rationale.
 *
 * When phase02_projection_writes_enabled === false, returns { skipped: true }.
 * When disable_new_publication kill switch is active, drains priority=0 only.
 */

import { NextRequest, NextResponse } from "next/server";
import { validateCronAuth } from "@/lib/cron-auth";
import { isPhase02ProjectionWritesEnabled, isKillSwitchActive } from "@/lib/flags/phase02";
import { drainOutboxOnce } from "@/lib/outbox/drain";
import { drainPublicCacheFanoutOnce } from "@/lib/public-cache/push";
import { logger, sanitizeErrorMessage } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const authError = validateCronAuth(request);
  if (authError) return authError;

  if (!isPhase02ProjectionWritesEnabled()) {
    return NextResponse.json({ skipped: true, reason: "phase02_disabled" });
  }

  const killSwitchActive = isKillSwitchActive("disable_new_publication");

  try {
    const result = await drainOutboxOnce({
      maxBatch: 50,
      maxTickMs: 9000,
      // If kill switch is active, only drain fast-lane (priority=0) tombstones
      priorityMax: killSwitchActive ? 0 : 100,
    });
    const publicCacheFanout = await drainPublicCacheFanoutOnce(20);

    logger.sync.info("[outbox-drain] Drain tick complete", {
      ...result,
      publicCacheFanout,
      killSwitchActive,
    });

    return NextResponse.json({
      ...result,
      publicCacheFanout,
      killSwitchActive,
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
