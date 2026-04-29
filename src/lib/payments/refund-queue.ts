import "server-only";

import type { RefundStatus } from "@prisma/client";
import type Stripe from "stripe";
import { logger, sanitizeErrorMessage } from "@/lib/logger";
import { centsToDecimal } from "@/lib/payments/checkout-session-status";
import { getStripeClient } from "@/lib/payments/stripe";
import { prisma } from "@/lib/prisma";

type TransactionClient = Parameters<
  Parameters<typeof prisma.$transaction>[0]
>[0];

type RefundQueueRow = {
  id: string;
  paymentId: string | null;
  userId: string;
  reason: string;
  attemptCount: number;
  metadata: unknown;
};

type RefundQueuePayment = {
  id: string;
  userId: string;
  stripePaymentIntentId: string | null;
  amount: unknown;
  currency: string;
  autoRefundStatus: string | null;
};

export interface RefundQueueOptions {
  maxBatch?: number;
  maxTickMs?: number;
  maxAttempts?: number;
  now?: () => Date;
}

export interface RefundQueueResult {
  claimed: number;
  processed: number;
  refunded: number;
  retryScheduled: number;
  manualReview: number;
  elapsedMs: number;
}

const DEFAULT_MAX_BATCH = 10;
const DEFAULT_MAX_TICK_MS = 8000;
const DEFAULT_MAX_ATTEMPTS = 5;

function retryDelayMs(attemptCount: number): number {
  const baseMs = 60_000;
  const maxMs = 60 * 60 * 1000;
  return Math.min(baseMs * Math.pow(2, Math.max(attemptCount - 1, 0)), maxMs);
}

function resolveRefundStatus(refund: Stripe.Refund): RefundStatus {
  switch (refund.status) {
    case "succeeded":
      return "SUCCEEDED";
    case "failed":
      return "FAILED";
    case "canceled":
      return "CANCELED";
    default:
      return "PENDING";
  }
}

function resolveQueuedRefundOutcome(
  refund: Stripe.Refund
): "succeeded" | "submitted" | "manual_review" {
  if (refund.status === "succeeded") {
    return "succeeded";
  }

  if (refund.status === "pending") {
    return "submitted";
  }

  return "manual_review";
}

function buildStripeRefundMetadata(row: RefundQueueRow, paymentId: string) {
  return {
    source: "auto_refund_queue",
    refundQueueItemId: row.id,
    paymentId,
    reason: row.reason,
  };
}

async function markManualReview(
  tx: TransactionClient,
  input: { row: RefundQueueRow; paymentId?: string | null; reason: string }
) {
  await tx.refundQueueItem.update({
    where: { id: input.row.id },
    data: {
      status: "MANUAL_REVIEW",
      lastError: input.reason,
      processedAt: new Date(),
    },
  });

  if (input.paymentId) {
    await tx.payment.updateMany({
      where: { id: input.paymentId, userId: input.row.userId },
      data: { autoRefundStatus: "MANUAL_REVIEW_BANNED_USER" },
    });
  }
}

async function recordQueuedRefund(
  tx: TransactionClient,
  input: {
    row: RefundQueueRow;
    payment: RefundQueuePayment;
    refund: Stripe.Refund;
  }
) {
  const refundStatus = resolveRefundStatus(input.refund);
  const outcome = resolveQueuedRefundOutcome(input.refund);
  const manualReviewRequired = outcome === "manual_review";
  const stripePaymentIntentId =
    typeof input.refund.payment_intent === "string"
      ? input.refund.payment_intent
      : input.refund.payment_intent?.id ?? input.payment.stripePaymentIntentId;
  const stripeChargeId =
    typeof input.refund.charge === "string"
      ? input.refund.charge
      : input.refund.charge?.id ?? null;

  await tx.refund.upsert({
    where: { stripeRefundId: input.refund.id },
    update: {
      paymentId: input.payment.id,
      amount: centsToDecimal(input.refund.amount),
      currency: (input.refund.currency ?? input.payment.currency).toLowerCase(),
      status: refundStatus,
      reason: input.refund.reason ?? input.row.reason,
      source: "AUTO_REFUND_QUEUE",
      manualReviewRequired,
      metadata: {
        stripePaymentIntentId,
        stripeChargeId,
        stripeStatus: input.refund.status ?? null,
        refundQueueItemId: input.row.id,
      },
    },
    create: {
      paymentId: input.payment.id,
      stripeRefundId: input.refund.id,
      amount: centsToDecimal(input.refund.amount),
      currency: (input.refund.currency ?? input.payment.currency).toLowerCase(),
      status: refundStatus,
      reason: input.refund.reason ?? input.row.reason,
      source: "AUTO_REFUND_QUEUE",
      manualReviewRequired,
      metadata: {
        stripePaymentIntentId,
        stripeChargeId,
        stripeStatus: input.refund.status ?? null,
        refundQueueItemId: input.row.id,
      },
    },
  });

  if (outcome === "manual_review") {
    await tx.payment.update({
      where: { id: input.payment.id },
      data: { autoRefundStatus: "MANUAL_REVIEW_BANNED_USER" },
    });

    await tx.refundQueueItem.update({
      where: { id: input.row.id },
      data: {
        status: "MANUAL_REVIEW",
        stripeRefundId: input.refund.id,
        lastError: `stripe_refund_${input.refund.status ?? "unknown"}`,
        processedAt: new Date(),
      },
    });

    return "manual_review" as const;
  }

  await tx.payment.update({
    where: { id: input.payment.id },
    data: {
      autoRefundStatus:
        outcome === "succeeded"
          ? "REFUNDED_BANNED_USER"
          : "REFUND_SUBMITTED_BANNED_USER",
    },
  });

  await tx.refundQueueItem.update({
    where: { id: input.row.id },
    data: {
      status: "COMPLETED",
      stripeRefundId: input.refund.id,
      lastError: null,
      processedAt: new Date(),
    },
  });

  return "refunded" as const;
}

async function processRefundQueueRow(row: RefundQueueRow) {
  if (!row.paymentId) {
    await prisma.$transaction((tx) =>
      markManualReview(tx, {
        row,
        reason: "missing_payment_id",
      })
    );
    return "manual_review" as const;
  }

  const payment = await prisma.payment.findUnique({
    where: { id: row.paymentId },
    select: {
      id: true,
      userId: true,
      stripePaymentIntentId: true,
      amount: true,
      currency: true,
      autoRefundStatus: true,
    },
  });

  if (!payment) {
    await prisma.$transaction((tx) =>
      markManualReview(tx, {
        row,
        reason: "missing_payment",
      })
    );
    return "manual_review" as const;
  }

  if (payment.userId !== row.userId) {
    await prisma.$transaction((tx) =>
      markManualReview(tx, {
        row,
        reason: "mismatched_payment_owner",
      })
    );
    return "manual_review" as const;
  }

  if (!payment.stripePaymentIntentId) {
    await prisma.$transaction((tx) =>
      markManualReview(tx, {
        row,
        paymentId: payment.id,
        reason: "missing_stripe_payment_intent",
      })
    );
    return "manual_review" as const;
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: { autoRefundStatus: "REFUND_PROCESSING_BANNED_USER" },
  });

  const refund = await getStripeClient().refunds.create(
    {
      payment_intent: payment.stripePaymentIntentId,
      metadata: buildStripeRefundMetadata(row, payment.id),
    },
    {
      idempotencyKey: `auto-refund:${payment.id}:${row.reason}`,
    }
  );

  const outcome = await prisma.$transaction((tx) =>
    recordQueuedRefund(tx, {
      row,
      payment,
      refund,
    })
  );

  return outcome;
}

async function releaseUnprocessedRows(rowIds: string[]) {
  if (rowIds.length === 0) {
    return;
  }

  await prisma.$executeRaw`
    UPDATE refund_queue_items
    SET status = 'PENDING',
        attempt_count = GREATEST(attempt_count - 1, 0),
        updated_at = NOW()
    WHERE id = ANY(${rowIds}::TEXT[])
      AND status = 'PROCESSING'
  `;
}

async function scheduleRetry(
  row: RefundQueueRow,
  input: { maxAttempts: number; error: unknown }
) {
  const attemptNumber = row.attemptCount + 1;
  const message = sanitizeErrorMessage(input.error);

  if (attemptNumber >= input.maxAttempts) {
    await prisma.$transaction(async (tx) => {
      await tx.refundQueueItem.update({
        where: { id: row.id },
        data: {
          status: "MANUAL_REVIEW",
          lastError: message,
          processedAt: new Date(),
        },
      });
      if (row.paymentId) {
        await tx.payment.updateMany({
          where: { id: row.paymentId, userId: row.userId },
          data: { autoRefundStatus: "MANUAL_REVIEW_BANNED_USER" },
        });
      }
    });
    return "manual_review" as const;
  }

  await prisma.$transaction(async (tx) => {
    await tx.refundQueueItem.update({
      where: { id: row.id },
      data: {
        status: "PENDING",
        nextAttemptAt: new Date(Date.now() + retryDelayMs(attemptNumber)),
        lastError: message,
      },
    });
    if (row.paymentId) {
      await tx.payment.updateMany({
        where: { id: row.paymentId, userId: row.userId },
        data: { autoRefundStatus: "QUEUED_BANNED_USER" },
      });
    }
  });
  return "retry" as const;
}

export async function processRefundQueueOnce(
  opts: RefundQueueOptions = {}
): Promise<RefundQueueResult> {
  const {
    maxBatch = DEFAULT_MAX_BATCH,
    maxTickMs = DEFAULT_MAX_TICK_MS,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    now = () => new Date(),
  } = opts;
  const startedAt = Date.now();
  let processed = 0;
  let refunded = 0;
  let retryScheduled = 0;
  let manualReview = 0;

  const rows = await prisma.$transaction(async (tx) => {
    const claimed = await tx.$queryRaw<RefundQueueRow[]>`
      SELECT
        id,
        payment_id AS "paymentId",
        user_id AS "userId",
        reason,
        attempt_count AS "attemptCount",
        metadata
      FROM refund_queue_items
      WHERE status = 'PENDING'
        AND next_attempt_at <= ${now()}
      ORDER BY next_attempt_at ASC, created_at ASC
      LIMIT ${maxBatch}
      FOR UPDATE SKIP LOCKED
    `;

    if (claimed.length === 0) {
      return [];
    }

    await tx.$executeRaw`
      UPDATE refund_queue_items
      SET status = 'PROCESSING',
          attempt_count = attempt_count + 1,
          last_error = NULL,
          updated_at = NOW()
      WHERE id = ANY(${claimed.map((row) => row.id)}::TEXT[])
    `;

    return claimed;
  });

  const unprocessedIds: string[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (Date.now() - startedAt >= maxTickMs) {
      unprocessedIds.push(...rows.slice(index).map((item) => item.id));
      break;
    }

    processed += 1;
    try {
      const outcome = await processRefundQueueRow(row);
      if (outcome === "refunded") {
        refunded += 1;
      } else {
        manualReview += 1;
      }
    } catch (error) {
      logger.sync.warn("cfm.payments.refund_queue_retry", {
        refundQueueItemId: row.id,
        reason: row.reason,
        error: sanitizeErrorMessage(error),
      });
      const scheduled = await scheduleRetry(row, { maxAttempts, error });
      if (scheduled === "retry") {
        retryScheduled += 1;
      } else {
        manualReview += 1;
      }
    }
  }

  await releaseUnprocessedRows(unprocessedIds);

  return {
    claimed: rows.length,
    processed,
    refunded,
    retryScheduled,
    manualReview,
    elapsedMs: Date.now() - startedAt,
  };
}
