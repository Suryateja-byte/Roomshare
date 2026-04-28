import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { validateCronAuth } from "@/lib/cron-auth";
import { logger, sanitizeErrorMessage } from "@/lib/logger";
import { processRefundQueueOnce } from "@/lib/payments/refund-queue";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authError = validateCronAuth(request);
  if (authError) {
    return authError;
  }

  try {
    const result = await processRefundQueueOnce();
    logger.sync.info("[payments-refund-queue] Complete", {
      event: "cfm.payments.refund_queue",
      ...result,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    logger.sync.error("[payments-refund-queue] Failed", {
      event: "cfm.payments.refund_queue",
      error: sanitizeErrorMessage(error),
    });
    Sentry.captureException(error, { tags: { cron: "payments-refund-queue" } });
    return NextResponse.json(
      { success: false, error: "Refund queue processing failed" },
      { status: 500 }
    );
  }
}
