jest.mock("@/lib/env", () => ({
  features: {
    get entitlementState() {
      return false;
    },
    get freezeNewGrants() {
      return process.env.KILL_SWITCH_FREEZE_NEW_GRANTS === "true";
    },
  },
}));

const mockRecordAuditEvent = jest.fn();
jest.mock("@/lib/audit/events", () => ({
  recordAuditEvent: (...args: unknown[]) => mockRecordAuditEvent(...args),
}));

const mockRecordPaymentIntentSucceededWithoutGrant = jest.fn();
const mockRecordInvalidPaymentStateTransition = jest.fn();
const mockRecordPaymentAdjustmentMissingLink = jest.fn();
jest.mock("@/lib/payments/telemetry", () => ({
  recordPaymentIntentSucceededWithoutGrant: (...args: unknown[]) =>
    mockRecordPaymentIntentSucceededWithoutGrant(...args),
  recordInvalidPaymentStateTransition: (...args: unknown[]) =>
    mockRecordInvalidPaymentStateTransition(...args),
  recordDisputeOpened: jest.fn(),
  recordDisputeResolved: jest.fn(),
  recordFrozenGrantRestored: jest.fn(),
  recordPaymentAdjustmentMissingLink: (...args: unknown[]) =>
    mockRecordPaymentAdjustmentMissingLink(...args),
  recordRefundEntitlementAdjustmentApplied: jest.fn(),
  recordRefundRecorded: jest.fn(),
  recordWebhookAdjustmentReplayIgnored: jest.fn(),
}));

import { processCapturedStripeEvent } from "@/lib/payments/webhook-worker";

function buildClient(eventPayload: Record<string, unknown>, livemode = true) {
  return {
    stripeEvent: {
      findUnique: jest.fn().mockResolvedValue({
        id: "stripe-row-1",
        stripeEventId: "evt_1",
        eventType: eventPayload.type,
        payload: eventPayload,
        livemode,
        processedAt: null,
      }),
      update: jest.fn().mockResolvedValue({ id: "stripe-row-1" }),
    },
    payment: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        id: "payment-123",
        userId: "user-123",
      }),
      update: jest.fn().mockResolvedValue({
        id: "payment-123",
        userId: "user-123",
      }),
    },
    entitlementGrant: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: "grant-123" }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ isSuspended: false }),
    },
    refundQueueItem: {
      create: jest.fn().mockResolvedValue({ id: "refund-queue-1" }),
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
    contactConsumption: {
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    auditEvent: {
      create: jest.fn(),
    },
    $executeRaw: jest.fn().mockResolvedValue(undefined),
  } as any;
}

function succeededIntent(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt_1",
    type: "payment_intent.succeeded",
    data: {
      object: {
        id: "pi_123",
        amount_received: 499,
        amount: 499,
        currency: "usd",
        customer: "cus_123",
        latest_charge: "ch_123",
        metadata: {
          purchaseContext: "CONTACT_HOST",
          userId: "user-123",
          listingId: "listing-123",
          unitId: "unit-123",
          unitIdentityEpoch: "7",
          productCode: "CONTACT_PACK_3",
          contactKind: "MESSAGE_START",
        },
        ...overrides,
      },
    },
  };
}

describe("processCapturedStripeEvent", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.clearAllMocks();
    (process.env as Record<string, string | undefined>).NODE_ENV = "test";
    process.env.KILL_SWITCH_FREEZE_NEW_GRANTS = "false";
  });

  afterAll(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV =
      originalNodeEnv;
    delete process.env.KILL_SWITCH_FREEZE_NEW_GRANTS;
  });

  it("creates one succeeded payment and one entitlement grant", async () => {
    const client = buildClient(succeededIntent());

    await processCapturedStripeEvent(client, "stripe-row-1");

    expect(client.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-123",
        productCode: "CONTACT_PACK_3",
        status: "SUCCEEDED",
        stripePaymentIntentId: "pi_123",
        stripeCustomerId: "cus_123",
        amount: "4.99",
        livemode: true,
        originStripeEventId: "evt_1",
      }),
    });
    expect(client.entitlementGrant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-123",
        productCode: "CONTACT_PACK_3",
        contactKind: "MESSAGE_START",
        grantType: "PACK",
        creditCount: 3,
        originalCreditCount: 3,
        paymentId: "payment-123",
        idempotencyKey: "payment:payment-123:MESSAGE_START",
      }),
    });
    expect(client.stripeEvent.update).toHaveBeenLastCalledWith({
      where: { id: "stripe-row-1" },
      data: expect.objectContaining({
        processingStatus: "PROCESSED",
        processedBy: "outbox-drain",
      }),
    });
  });

  it("grants phone reveal payments against the REVEAL_PHONE ledger", async () => {
    const client = buildClient(
      succeededIntent({
        metadata: {
          purchaseContext: "PHONE_REVEAL",
          userId: "user-123",
          listingId: "listing-123",
          unitId: "unit-123",
          unitIdentityEpoch: "7",
          productCode: "CONTACT_PACK_3",
          contactKind: "REVEAL_PHONE",
        },
      })
    );

    await processCapturedStripeEvent(client, "stripe-row-1");

    expect(client.entitlementGrant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-123",
        productCode: "CONTACT_PACK_3",
        contactKind: "REVEAL_PHONE",
        paymentId: "payment-123",
        idempotencyKey: "payment:payment-123:REVEAL_PHONE",
        metadata: expect.objectContaining({
          purchaseContext: "PHONE_REVEAL",
          listingId: "listing-123",
          unitId: "unit-123",
          unitIdentityEpoch: 7,
        }),
      }),
    });
  });

  it("refuses amount-tampered payment intents without granting", async () => {
    const client = buildClient(succeededIntent({ amount_received: 1, amount: 1 }));

    await processCapturedStripeEvent(client, "stripe-row-1");

    expect(client.payment.create).not.toHaveBeenCalled();
    expect(client.entitlementGrant.create).not.toHaveBeenCalled();
    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        kind: "PAYMENT_AMOUNT_MISMATCH",
        aggregateType: "stripe_events",
        aggregateId: "stripe-row-1",
      })
    );
  });

  it("does not grant from test-mode Stripe events in production", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV =
      "production";
    const client = buildClient(succeededIntent(), false);

    await processCapturedStripeEvent(client, "stripe-row-1");

    expect(client.payment.create).not.toHaveBeenCalled();
    expect(client.entitlementGrant.create).not.toHaveBeenCalled();
    expect(client.stripeEvent.update).toHaveBeenLastCalledWith({
      where: { id: "stripe-row-1" },
      data: expect.objectContaining({
        processingStatus: "PROCESSED",
      }),
    });
  });

  it("queues auto-refund and skips grant for suspended users", async () => {
    const client = buildClient(succeededIntent());
    client.user.findUnique.mockResolvedValue({ isSuspended: true });

    await processCapturedStripeEvent(client, "stripe-row-1");

    expect(client.entitlementGrant.create).not.toHaveBeenCalled();
    expect(client.payment.update).toHaveBeenCalledWith({
      where: { id: "payment-123" },
      data: {
        fraudFlag: true,
        autoRefundStatus: "QUEUED_BANNED_USER",
      },
    });
    expect(client.refundQueueItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        paymentId: "payment-123",
        userId: "user-123",
        reason: "banned_user_inflight",
      }),
    });
  });

  it("requeues grant creation while the new-grants freeze switch is enabled", async () => {
    process.env.KILL_SWITCH_FREEZE_NEW_GRANTS = "true";
    const client = buildClient(succeededIntent());

    await expect(processCapturedStripeEvent(client, "stripe-row-1")).rejects.toThrow(
      "New entitlement grants are frozen"
    );

    expect(client.entitlementGrant.create).not.toHaveBeenCalled();
    expect(client.stripeEvent.update).toHaveBeenLastCalledWith({
      where: { id: "stripe-row-1" },
      data: expect.objectContaining({
        processingStatus: "PENDING",
        nextAttemptAt: expect.any(Date),
      }),
    });
  });

  it("requeues out-of-order refunds until the payment link exists", async () => {
    const client = buildClient({
      id: "evt_refund",
      type: "refund.created",
      data: {
        object: {
          id: "re_123",
          amount: 499,
          currency: "usd",
          status: "succeeded",
          created: 1776211200,
          charge: "ch_123",
          payment_intent: "pi_123",
        },
      },
    });

    await expect(processCapturedStripeEvent(client, "stripe-row-1")).rejects.toThrow(
      "Stripe refund re_123 is waiting for missing_payment"
    );

    expect(mockRecordPaymentAdjustmentMissingLink).toHaveBeenCalledWith({
      adjustmentType: "refund",
      stripeObjectId: "re_123",
      stripePaymentIntentId: "pi_123",
      stripeChargeId: "ch_123",
    });
    expect(client.stripeEvent.update).toHaveBeenLastCalledWith({
      where: { id: "stripe-row-1" },
      data: expect.objectContaining({
        processingStatus: "PENDING",
        nextAttemptAt: expect.any(Date),
      }),
    });
  });

  it("does not retry auto-refund webhooks when the banned-user payment has no grant", async () => {
    const client = buildClient({
      id: "evt_refund",
      type: "refund.created",
      data: {
        object: {
          id: "re_123",
          amount: 499,
          currency: "usd",
          status: "succeeded",
          created: 1776211200,
          charge: "ch_123",
          payment_intent: "pi_123",
        },
      },
    });
    client.payment.findUnique.mockResolvedValue({
      id: "payment-123",
      userId: "user-123",
      productCode: "CONTACT_PACK_3",
      amount: "4.99",
      currency: "usd",
      metadata: null,
      status: "SUCCEEDED",
      fraudFlag: true,
      autoRefundStatus: "REFUND_SUBMITTED_BANNED_USER",
    });
    client.refund.findUnique.mockResolvedValue(null);
    client.refund.create.mockResolvedValue({
      id: "refund-row-123",
      status: "SUCCEEDED",
    });
    client.entitlementGrant.findUnique.mockResolvedValue(null);

    await processCapturedStripeEvent(client, "stripe-row-1");

    expect(mockRecordPaymentAdjustmentMissingLink).not.toHaveBeenCalledWith(
      expect.objectContaining({
        adjustmentType: "refund_grant",
      })
    );
    expect(client.stripeEvent.update).toHaveBeenLastCalledWith({
      where: { id: "stripe-row-1" },
      data: expect.objectContaining({
        processingStatus: "PROCESSED",
      }),
    });
  });
});
