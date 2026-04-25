import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";

import { validateCronAuth } from "@/lib/cron-auth";
import { runFreshnessDispatcher } from "@/lib/freshness/dispatcher";
import { recordFreshnessCronLockHeld } from "@/lib/freshness/freshness-cron-telemetry";
import { logger, sanitizeErrorMessage } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export const maxDuration = 60;

const FRESHNESS_REMINDER_LOCK_KEY = "cron_freshness_reminders";

export async function GET(request: NextRequest) {
  const authError = validateCronAuth(request);
  if (authError) {
    return authError;
  }

  try {
    const lockResult = await prisma.$transaction(async (tx) => {
      const [lock] = await tx.$queryRaw<[{ locked: boolean }]>`
        SELECT pg_try_advisory_xact_lock(hashtext(${FRESHNESS_REMINDER_LOCK_KEY})) as locked
      `;

      if (!lock.locked) {
        return {
          skipped: true as const,
          reason: "lock_held" as const,
        };
      }

      const summary = await runFreshnessDispatcher();
      return {
        skipped: false as const,
        summary,
      };
    });

    if (lockResult.skipped) {
      recordFreshnessCronLockHeld();
      logger.sync.info("[freshness-reminders] Skipped", {
        event: "cfm.cron.freshness_reminder",
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
      lockResult.summary.emitted.reminder + lockResult.summary.emitted.warning === 0
        ? 500
        : 200;

    logger.sync.info("[freshness-reminders] Complete", {
      event: "cfm.cron.freshness_reminder",
      ...lockResult.summary,
    });

    return NextResponse.json(lockResult.summary, { status });
  } catch (error) {
    logger.sync.error("[freshness-reminders] Failed", {
      event: "cfm.cron.freshness_reminder",
      error: sanitizeErrorMessage(error),
    });
    Sentry.captureException(error, { tags: { cron: "freshness-reminders" } });
    return NextResponse.json(
      {
        success: false,
        skipped: false,
        error: "Freshness reminder dispatch failed",
      },
      { status: 500 }
    );
  }
}
