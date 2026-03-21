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

    const now = new Date();

    // Delete expired idempotency keys — with retry for transient DB errors
    const result = await withRetry(
      () =>
        prisma.idempotencyKey.deleteMany({
          where: {
            expiresAt: { lt: now },
          },
        }),
      { context: "cleanup-idempotency-keys" }
    );

    logger.sync.info(
      `[Cleanup Cron] Deleted ${result.count} expired idempotency keys`
    );

    return NextResponse.json({
      success: true,
      deleted: result.count,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    logger.sync.error("Idempotency key cleanup error", {
      error: sanitizeErrorMessage(error),
    });
    Sentry.captureException(error, {
      tags: { cron: "cleanup-idempotency-keys" },
    });
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
}
