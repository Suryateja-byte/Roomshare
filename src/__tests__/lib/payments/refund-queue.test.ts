jest.mock("@/lib/logger", () => ({
  logger: {
    sync: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
  },
  sanitizeErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : String(error),
}));

const mockCreateRefund = jest.fn();
jest.mock("@/lib/payments/stripe", () => ({
  getStripeClient: () => ({
    refunds: {
      create: (...args: unknown[]) => mockCreateRefund(...args),
    },
  }),
}));

jest.mock("@/lib/prisma", () => {
  const tx = {
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    refund: {
      upsert: jest.fn(),
    },
    refundQueueItem: {
      update: jest.fn(),
    },
    payment: {
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const prisma: Record<string, any> = {
    __tx: tx,
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
      callback(tx)
    ),
    $executeRaw: jest.fn(),
    payment: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    refundQueueItem: {
      update: jest.fn(),
    },
  };

  return { prisma };
});

import { processRefundQueueOnce } from "@/lib/payments/refund-queue";
import { prisma } from "@/lib/prisma";

const tx = (prisma as any).__tx;

describe("processRefundQueueOnce", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    tx.$queryRaw.mockResolvedValue([
      {
        id: "queue-1",
        paymentId: "payment-123",
        userId: "user-123",
        reason: "banned_user_inflight",
        attemptCount: 0,
        metadata: {},
      },
    ]);
    (prisma.payment.findUnique as jest.Mock).mockResolvedValue({
      id: "payment-123",
      userId: "user-123",
      stripePaymentIntentId: "pi_123",
      amount: "4.99",
      currency: "usd",
      autoRefundStatus: "QUEUED_BANNED_USER",
    });
    mockCreateRefund.mockResolvedValue({
      id: "re_123",
      amount: 499,
      currency: "usd",
      status: "succeeded",
      reason: null,
      payment_intent: "pi_123",
      charge: "ch_123",
    });
  });

  it("creates a Stripe refund with deterministic idempotency and completes the queue item", async () => {
    const result = await processRefundQueueOnce({ maxBatch: 1 });

    expect(result).toMatchObject({
      claimed: 1,
      processed: 1,
      refunded: 1,
      retryScheduled: 0,
      manualReview: 0,
    });
    expect(mockCreateRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_intent: "pi_123",
        metadata: expect.objectContaining({
          refundQueueItemId: "queue-1",
          paymentId: "payment-123",
          reason: "banned_user_inflight",
        }),
      }),
      {
        idempotencyKey: "auto-refund:payment-123:banned_user_inflight",
      }
    );
    expect(tx.refund.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stripeRefundId: "re_123" },
        create: expect.objectContaining({
          paymentId: "payment-123",
          status: "SUCCEEDED",
          source: "AUTO_REFUND_QUEUE",
        }),
      })
    );
    expect(tx.refundQueueItem.update).toHaveBeenCalledWith({
      where: { id: "queue-1" },
      data: expect.objectContaining({
        status: "COMPLETED",
        stripeRefundId: "re_123",
        processedAt: expect.any(Date),
      }),
    });
  });

  it("sends items with missing payment intents to manual review", async () => {
    (prisma.payment.findUnique as jest.Mock).mockResolvedValue({
      id: "payment-123",
      userId: "user-123",
      stripePaymentIntentId: null,
      amount: "4.99",
      currency: "usd",
      autoRefundStatus: "QUEUED_BANNED_USER",
    });

    const result = await processRefundQueueOnce({ maxBatch: 1 });

    expect(result.manualReview).toBe(1);
    expect(mockCreateRefund).not.toHaveBeenCalled();
    expect(tx.refundQueueItem.update).toHaveBeenCalledWith({
      where: { id: "queue-1" },
      data: expect.objectContaining({
        status: "MANUAL_REVIEW",
        lastError: "missing_stripe_payment_intent",
      }),
    });
    expect(tx.payment.updateMany).toHaveBeenCalledWith({
      where: { id: "payment-123", userId: "user-123" },
      data: { autoRefundStatus: "MANUAL_REVIEW_BANNED_USER" },
    });
  });

  it("does not mutate payment status when queue row ownership mismatches", async () => {
    (prisma.payment.findUnique as jest.Mock).mockResolvedValue({
      id: "payment-123",
      userId: "other-user",
      stripePaymentIntentId: "pi_123",
      amount: "4.99",
      currency: "usd",
      autoRefundStatus: "QUEUED_BANNED_USER",
    });

    const result = await processRefundQueueOnce({ maxBatch: 1 });

    expect(result.manualReview).toBe(1);
    expect(mockCreateRefund).not.toHaveBeenCalled();
    expect(tx.refundQueueItem.update).toHaveBeenCalledWith({
      where: { id: "queue-1" },
      data: expect.objectContaining({
        status: "MANUAL_REVIEW",
        lastError: "mismatched_payment_owner",
      }),
    });
    expect(tx.payment.update).not.toHaveBeenCalled();
    expect(tx.payment.updateMany).not.toHaveBeenCalled();
  });

  it("reschedules transient Stripe failures", async () => {
    mockCreateRefund.mockRejectedValue(new Error("stripe unavailable"));

    const result = await processRefundQueueOnce({ maxBatch: 1, maxAttempts: 5 });

    expect(result.retryScheduled).toBe(1);
    expect(tx.refundQueueItem.update).toHaveBeenCalledWith({
      where: { id: "queue-1" },
      data: expect.objectContaining({
        status: "PENDING",
        nextAttemptAt: expect.any(Date),
        lastError: "stripe unavailable",
      }),
    });
    expect(tx.payment.updateMany).toHaveBeenCalledWith({
      where: { id: "payment-123", userId: "user-123" },
      data: { autoRefundStatus: "QUEUED_BANNED_USER" },
    });
  });

  it("sends exhausted retry failures to manual review with an ownership guard", async () => {
    mockCreateRefund.mockRejectedValue(new Error("stripe unavailable"));

    const result = await processRefundQueueOnce({ maxBatch: 1, maxAttempts: 1 });

    expect(result.manualReview).toBe(1);
    expect(tx.refundQueueItem.update).toHaveBeenCalledWith({
      where: { id: "queue-1" },
      data: expect.objectContaining({
        status: "MANUAL_REVIEW",
        lastError: "stripe unavailable",
        processedAt: expect.any(Date),
      }),
    });
    expect(tx.payment.updateMany).toHaveBeenCalledWith({
      where: { id: "payment-123", userId: "user-123" },
      data: { autoRefundStatus: "MANUAL_REVIEW_BANNED_USER" },
    });
  });
});
