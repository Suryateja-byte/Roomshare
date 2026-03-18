import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { processSearchAlerts } from "@/lib/search-alerts";
import { logger, sanitizeErrorMessage } from "@/lib/logger";
import { withRetry } from "@/lib/retry";
import { validateCronAuth } from "@/lib/cron-auth";

// Vercel Cron or external cron service endpoint
// Secured with CRON_SECRET in all environments
export async function GET(request: NextRequest) {
  const authError = validateCronAuth(request);
  if (authError) return authError;

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
  }
}
