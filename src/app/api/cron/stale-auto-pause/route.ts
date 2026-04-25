import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";

import { validateCronAuth } from "@/lib/cron-auth";
import { runAutoPauseDispatcher } from "@/lib/freshness/auto-pause-dispatcher";
import { recordAutoPauseCronLockHeld } from "@/lib/freshness/freshness-cron-telemetry";
import { logger, sanitizeErrorMessage } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export const maxDuration = 60;

const STALE_AUTO_PAUSE_LOCK_KEY = "cron_stale_auto_pause";

export async function GET(request: NextRequest) {
  const authError = validateCronAuth(request);
  if (authError) {
    return authError;
  }

  try {
    const lockResult = await prisma.$transaction(async (tx) => {
      const [lock] = await tx.$queryRaw<[{ locked: boolean }]>`
        SELECT pg_try_advisory_xact_lock(hashtext(${STALE_AUTO_PAUSE_LOCK_KEY})) as locked
      `;

      if (!lock.locked) {
        return {
          skipped: true as const,
          reason: "lock_held" as const,
        };
      }

      const summary = await runAutoPauseDispatcher();
      return {
        skipped: false as const,
        summary,
      };
    });

    if (lockResult.skipped) {
      recordAutoPauseCronLockHeld();
      logger.sync.info("[stale-auto-pause] Skipped", {
        event: "cfm.cron.stale_auto_pause",
        reason: lockResult.reason,
      });

      return NextResponse.json({
        success: true,
        skipped: true,
        reason: lockResult.reason,
      });
    }

    const status =
      !lockResult.summary.skipped &&
      !lockResult.summary.success &&
      lockResult.summary.emitted === 0
        ? 500
        : 200;

    logger.sync.info("[stale-auto-pause] Complete", {
      event: "cfm.cron.stale_auto_pause",
      ...lockResult.summary,
    });

    return NextResponse.json(lockResult.summary, { status });
  } catch (error) {
    logger.sync.error("[stale-auto-pause] Failed", {
      event: "cfm.cron.stale_auto_pause",
      error: sanitizeErrorMessage(error),
    });
    Sentry.captureException(error, { tags: { cron: "stale-auto-pause" } });
    return NextResponse.json(
      {
        success: false,
        skipped: false,
        error: "Stale auto-pause dispatch failed",
      },
      { status: 500 }
    );
  }
}
