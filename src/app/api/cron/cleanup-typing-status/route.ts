import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as Sentry from "@sentry/nextjs";
import { logger, sanitizeErrorMessage } from "@/lib/logger";
import { withRetry } from "@/lib/retry";
import { validateCronAuth } from "@/lib/cron-auth";

export async function GET(request: NextRequest) {
  try {
    const authError = validateCronAuth(request);
    if (authError) return authError;

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    // Delete stale typing status entries — with retry for transient DB errors
    const result = await withRetry(
      () =>
        prisma.typingStatus.deleteMany({
          where: {
            updatedAt: { lt: fiveMinutesAgo },
          },
        }),
      { context: "cleanup-typing-status" }
    );

    logger.sync.info(
      `[Cleanup Cron] Deleted ${result.count} stale typing status entries`
    );

    return NextResponse.json({
      success: true,
      deleted: result.count,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.sync.error("Typing status cleanup error", {
      error: sanitizeErrorMessage(error),
    });
    Sentry.captureException(error, { tags: { cron: "cleanup-typing-status" } });
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
}
