jest.mock("@/lib/payments/telemetry", () => ({
  recordDisputeOpened: jest.fn(),
  recordDisputeResolved: jest.fn(),
  recordFrozenGrantRestored: jest.fn(),
  recordPaymentAdjustmentMissingLink: jest.fn(),
  recordEntitlementStateRebuild: jest.fn(),
  recordRefundEntitlementAdjustmentApplied: jest.fn(),
  recordRefundRecorded: jest.fn(),
  recordWebhookAdjustmentReplayIgnored: jest.fn(),
}));

jest.mock("@/lib/audit/events", () => ({
  recordAuditEvent: jest.fn().mockResolvedValue({ auditEventId: "audit-123" }),
}));

import { Prisma } from "@prisma/client";
import {
  calculatePackGrantAfterRefund,
  calculatePassGrantAfterRefund,
  handleDisputeEvent,
  handleRefundEvent,
} from "@/lib/payments/entitlement-adjustments";
import {
  recordPaymentAdjustmentMissingLink,
  recordWebhookAdjustmentReplayIgnored,
} from "@/lib/payments/telemetry";

function buildTx() {
  return {
    payment: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    refund: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn(),
    },
    paymentDispute: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    entitlementGrant: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
    },
    contactConsumption: {
      count: jest.fn(),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    entitlementState: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
    },
    auditEvent: {
      create: jest.fn().mockResolvedValue({ id: "audit-123" }),
    },
  } as any;
}

describe("entitlement adjustments", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("reduces only unused pack credits on a partial refund", () => {
    expect(
      calculatePackGrantAfterRefund({
        originalCreditCount: 3,
        usedCount: 1,
        paymentAmount: 4.99,
        refundedAmount: 2.49,
      })
    ).toEqual({
      status: "ACTIVE",
      creditCount: 2,
    });
  });

  it("revokes remaining pack entitlement on a full refund", () => {
    expect(
      calculatePackGrantAfterRefund({
        originalCreditCount: 3,
        usedCount: 1,
        paymentAmount: 4.99,
        refundedAmount: 4.99,
      })
    ).toEqual({
      status: "REVOKED",
      creditCount: 1,
    });
  });

  it("shortens a pass proportionally on a partial refund", () => {
    const refundSucceededAt = new Date("2026-04-15T00:00:00.000Z");
    const result = calculatePassGrantAfterRefund({
      activeFrom: new Date("2026-04-01T00:00:00.000Z"),
      refundSucceededAt,
      durationDays: 30,
      paymentAmount: 9.99,
      refundedAmount: 5.0,
    });

    expect(result.status).toBe("ACTIVE");
    expect(result.activeUntil.toISOString()).toBe("2026-04-22T23:48:28.108Z");
  });

  it("revokes a pass completely on a full refund", () => {
    const refundSucceededAt = new Date("2026-04-15T00:00:00.000Z");
    expect(
      calculatePassGrantAfterRefund({
        activeFrom: new Date("2026-04-01T00:00:00.000Z"),
        refundSucceededAt,
        durationDays: 30,
        paymentAmount: 9.99,
        refundedAmount: 9.99,
      })
    ).toEqual({
      status: "REVOKED",
      activeUntil: refundSucceededAt,
    });
  });

  it("applies a succeeded refund to the linked pack grant", async () => {
    const tx = buildTx();
    tx.payment.findUnique.mockResolvedValue({
      id: "payment-123",
      productCode: "CONTACT_PACK_3",
      amount: new Prisma.Decimal("4.99"),
      currency: "usd",
      metadata: { stripeLatestChargeId: "ch_123" },
    });
    tx.refund.findUnique.mockResolvedValue(null);
    tx.refund.create.mockResolvedValue({ id: "refund-row-123", status: "SUCCEEDED" });
    tx.refund.aggregate.mockResolvedValue({
      _sum: { amount: new Prisma.Decimal("2.49") },
    });
    tx.entitlementGrant.findUnique.mockResolvedValue({
      id: "grant-123",
      status: "ACTIVE",
      grantType: "PACK",
      creditCount: 3,
      activeFrom: new Date("2026-04-01T00:00:00.000Z"),
      activeUntil: null,
      paymentId: "payment-123",
      productCode: "CONTACT_PACK_3",
      contactKind: "MESSAGE_START",
    });
    tx.contactConsumption.count.mockResolvedValue(1);

    const result = await handleRefundEvent(
      tx,
      {
        id: "re_123",
        amount: 249,
        currency: "usd",
        status: "succeeded",
        created: 1776211200,
        reason: "requested_by_customer",
        charge: "ch_123",
        payment_intent: "pi_123",
      } as any,
      { originStripeEventId: "evt_refund" }
    );

    expect(result).toEqual({ ok: true });
    expect(tx.refund.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        paymentId: "payment-123",
        stripeRefundId: "re_123",
        status: "SUCCEEDED",
        originStripeEventId: "evt_refund",
        source: "STRIPE",
      }),
      select: { id: true, status: true },
    });
    expect(tx.contactConsumption.count).toHaveBeenCalledWith({
      where: {
        entitlementGrantId: "grant-123",
        contactKind: "MESSAGE_START",
        source: "PACK",
        restorationState: "NONE",
      },
    });
    expect(tx.entitlementGrant.update).toHaveBeenCalledWith({
      where: { id: "grant-123" },
      data: {
        creditCount: 2,
        status: "ACTIVE",
        sourceRefundId: "refund-row-123",
      },
    });
  });

  it("uses the grant contact kind when subtracting refunded pack credits", async () => {
    const tx = buildTx();
    tx.payment.findUnique.mockResolvedValue({
      id: "payment-phone",
      userId: "user-123",
      productCode: "CONTACT_PACK_3",
      amount: new Prisma.Decimal("4.99"),
      currency: "usd",
      metadata: { stripeLatestChargeId: "ch_phone" },
    });
    tx.refund.findUnique.mockResolvedValue(null);
    tx.refund.create.mockResolvedValue({ id: "refund-row-phone", status: "SUCCEEDED" });
    tx.refund.aggregate.mockResolvedValue({
      _sum: { amount: new Prisma.Decimal("2.49") },
    });
    tx.entitlementGrant.findUnique.mockResolvedValue({
      id: "grant-phone",
      status: "ACTIVE",
      grantType: "PACK",
      creditCount: 3,
      activeFrom: new Date("2026-04-01T00:00:00.000Z"),
      activeUntil: null,
      paymentId: "payment-phone",
      productCode: "CONTACT_PACK_3",
      contactKind: "REVEAL_PHONE",
    });
    tx.contactConsumption.count.mockResolvedValue(1);

    await handleRefundEvent(tx, {
      id: "re_phone",
      amount: 249,
      currency: "usd",
      status: "succeeded",
      created: 1776211200,
      charge: "ch_phone",
      payment_intent: "pi_phone",
    } as any);

    expect(tx.contactConsumption.count).toHaveBeenCalledWith({
      where: {
        entitlementGrantId: "grant-phone",
        contactKind: "REVEAL_PHONE",
        source: "PACK",
        restorationState: "NONE",
      },
    });
  });

  it("freezes, restores, and revokes grants across dispute lifecycle events", async () => {
    jest.useFakeTimers({
      now: new Date("2026-04-15T00:00:00.000Z"),
    });

    const tx = buildTx();
    tx.payment.findFirst.mockResolvedValue({
      id: "payment-123",
      productCode: "MOVERS_PASS_30D",
      amount: new Prisma.Decimal("9.99"),
      currency: "usd",
      metadata: { stripeLatestChargeId: "ch_123" },
    });
    tx.paymentDispute.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "dispute-row-123", status: "OPEN" })
      .mockResolvedValueOnce({ id: "dispute-row-123", status: "WON" });
    tx.paymentDispute.create.mockResolvedValue({
      id: "dispute-row-123",
      status: "OPEN",
    });
    tx.paymentDispute.update
      .mockResolvedValueOnce({ id: "dispute-row-123", status: "WON" })
      .mockResolvedValueOnce({ id: "dispute-row-123", status: "LOST" });
    tx.entitlementGrant.findUnique
      .mockResolvedValueOnce({
        id: "grant-123",
        status: "ACTIVE",
        grantType: "PASS",
        creditCount: null,
        activeFrom: new Date("2026-04-01T00:00:00.000Z"),
        activeUntil: new Date("2026-05-01T00:00:00.000Z"),
        paymentId: "payment-123",
        productCode: "MOVERS_PASS_30D",
        contactKind: "MESSAGE_START",
      })
      .mockResolvedValueOnce({
        id: "grant-123",
        status: "FROZEN",
        grantType: "PASS",
        creditCount: null,
        activeFrom: new Date("2026-04-01T00:00:00.000Z"),
        activeUntil: new Date("2026-05-01T00:00:00.000Z"),
        paymentId: "payment-123",
        productCode: "MOVERS_PASS_30D",
        contactKind: "MESSAGE_START",
      })
      .mockResolvedValueOnce({
        id: "grant-123",
        status: "FROZEN",
        grantType: "PASS",
        creditCount: null,
        activeFrom: new Date("2026-04-01T00:00:00.000Z"),
        activeUntil: new Date("2026-05-01T00:00:00.000Z"),
        paymentId: "payment-123",
        productCode: "MOVERS_PASS_30D",
        contactKind: "MESSAGE_START",
      });

    await handleDisputeEvent(tx, {
      eventType: "charge.dispute.created",
      dispute: {
        id: "dp_123",
        amount: 999,
        currency: "usd",
        charge: "ch_123",
        payment_intent: null,
        status: "warning_needs_response",
        reason: "fraudulent",
      } as any,
    });
    await handleDisputeEvent(tx, {
      eventType: "charge.dispute.closed",
      dispute: {
        id: "dp_123",
        amount: 999,
        currency: "usd",
        charge: "ch_123",
        payment_intent: null,
        status: "won",
        reason: "fraudulent",
      } as any,
    });
    await handleDisputeEvent(tx, {
      eventType: "charge.dispute.closed",
      dispute: {
        id: "dp_123",
        amount: 999,
        currency: "usd",
        charge: "ch_123",
        payment_intent: null,
        status: "lost",
        reason: "fraudulent",
      } as any,
    });

    expect(tx.entitlementGrant.update).toHaveBeenNthCalledWith(1, {
      where: { id: "grant-123" },
      data: { status: "FROZEN" },
    });
    expect(tx.entitlementGrant.update).toHaveBeenNthCalledWith(2, {
      where: { id: "grant-123" },
      data: { status: "ACTIVE" },
    });
    expect(tx.entitlementGrant.update).toHaveBeenNthCalledWith(3, {
      where: { id: "grant-123" },
      data: { status: "REVOKED" },
    });
  });

  it("records a missing-link metric when a refund cannot be matched", async () => {
    const tx = buildTx();
    tx.payment.findUnique.mockResolvedValue(null);
    tx.payment.findFirst.mockResolvedValue(null);

    const result = await handleRefundEvent(tx, {
      id: "re_missing",
      amount: 499,
      currency: "usd",
      status: "succeeded",
      created: 1776211200,
      charge: "ch_missing",
      payment_intent: "pi_missing",
    } as any);

    expect(result).toEqual({
      ok: false,
      retryable: true,
      reason: "missing_payment",
      stripeObjectId: "re_missing",
    });
    expect(recordPaymentAdjustmentMissingLink).toHaveBeenCalledWith({
      adjustmentType: "refund",
      stripeObjectId: "re_missing",
      stripePaymentIntentId: "pi_missing",
      stripeChargeId: "ch_missing",
    });
    expect(tx.refund.create).not.toHaveBeenCalled();
  });

  it("treats repeat dispute-open processing as a no-op after the grant is already frozen", async () => {
    const tx = buildTx();
    tx.payment.findFirst.mockResolvedValue({
      id: "payment-123",
      productCode: "MOVERS_PASS_30D",
      amount: new Prisma.Decimal("9.99"),
      currency: "usd",
      metadata: { stripeLatestChargeId: "ch_123" },
    });
    tx.paymentDispute.findUnique.mockResolvedValue({ id: "dispute-row-123", status: "OPEN" });
    tx.paymentDispute.update.mockResolvedValue({ id: "dispute-row-123", status: "OPEN" });
    tx.entitlementGrant.findUnique.mockResolvedValue({
      id: "grant-123",
      status: "FROZEN",
      grantType: "PASS",
      creditCount: null,
      activeFrom: new Date("2026-04-01T00:00:00.000Z"),
      activeUntil: new Date("2026-05-01T00:00:00.000Z"),
      paymentId: "payment-123",
      productCode: "MOVERS_PASS_30D",
      contactKind: "MESSAGE_START",
    });

    await handleDisputeEvent(tx, {
      eventType: "charge.dispute.created",
      dispute: {
        id: "dp_123",
        amount: 999,
        currency: "usd",
        charge: "ch_123",
        payment_intent: null,
        status: "warning_needs_response",
        reason: "fraudulent",
      } as any,
    });

    expect(recordWebhookAdjustmentReplayIgnored).toHaveBeenCalledWith({
      adjustmentType: "dispute",
      objectId: "dp_123",
    });
    expect(tx.entitlementGrant.update).not.toHaveBeenCalled();
  });
});

