import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { processSearchAlerts } from "@/lib/search-alerts";
import { logger, sanitizeErrorMessage } from "@/lib/logger";
import { withRetry } from "@/lib/retry";
import { validateCronAuth } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";

const SEARCH_ALERTS_LOCK_KEY = "cron_search_alerts";

// Vercel Cron or external cron service endpoint
// Secured with CRON_SECRET in all environments
export async function GET(request: NextRequest) {
  const authError = validateCronAuth(request);
  if (authError) return authError;

  try {
    // Transaction-level advisory lock — auto-releases on commit/rollback,
    // preventing orphaned locks if Vercel kills the function on timeout.
    const lockResult = await prisma.$transaction(async (tx) => {
      const [lock] = await tx.$queryRaw<[{ locked: boolean }]>`
        SELECT pg_try_advisory_xact_lock(hashtext(${SEARCH_ALERTS_LOCK_KEY})) as locked
      `;

      if (!lock.locked) {
        return { skipped: true as const };
      }

      logger.sync.info("Starting search alerts processing...");
      const startTime = Date.now();

      const result = await withRetry(() => processSearchAlerts(), {
        context: "processSearchAlerts",
      });

      const duration = Date.now() - startTime;
      logger.sync.info(`Search alerts completed in ${duration}ms`, {
        ...result,
        duration,
      });

      return { skipped: false as const, duration, result };
    });

    if (lockResult.skipped) {
      logger.sync.info("[SearchAlerts] Skipped — another instance is running");
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: "lock_held",
      });
    }

    return NextResponse.json({
      success: true,
      duration: `${lockResult.duration}ms`,
      ...lockResult.result,
    });
  } catch (error) {
    logger.sync.error("Search alerts cron error", {
      error: sanitizeErrorMessage(error),
    });
    Sentry.captureException(error, { tags: { cron: "search-alerts" } });
    return NextResponse.json(
      { success: false, error: "Search alerts processing failed" },
      { status: 500 }
    );
  }
}
