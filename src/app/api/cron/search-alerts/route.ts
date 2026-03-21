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

  // Session-level advisory lock — prevents concurrent cron runs
  const [lockResult] = await prisma.$queryRaw<[{ locked: boolean }]>`
    SELECT pg_try_advisory_lock(hashtext(${SEARCH_ALERTS_LOCK_KEY})) as locked
  `;

  if (!lockResult.locked) {
    logger.sync.info("[SearchAlerts] Skipped — another instance is running");
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: "lock_held",
    });
  }

  try {
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

    return NextResponse.json({
      success: true,
      duration: `${duration}ms`,
      ...result,
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
  } finally {
    // Always release the session-level lock, even on error
    await prisma.$queryRaw`
      SELECT pg_advisory_unlock(hashtext(${SEARCH_ALERTS_LOCK_KEY}))
    `;
  }
}
