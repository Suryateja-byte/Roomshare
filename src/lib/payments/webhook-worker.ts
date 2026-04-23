import "server-only";

import { Prisma, type PaymentStatus } from "@prisma/client";
import Stripe from "stripe";
import { features } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import type { TransactionClient } from "@/lib/db/with-actor";
import { recordAuditEvent } from "@/lib/audit/events";
import { handleDisputeEvent, handleRefundEvent } from "@/lib/payments/entitlement-adjustments";
import { getProductCatalogEntry } from "@/lib/payments/catalog";
import { recomputeEntitlementState } from "@/lib/payments/entitlement-state";
import {
  centsToDecimal,
  matchesCheckoutMetadata,
  parsePaywallMetadata,
  type PaywallMetadata,
  resolveMonotonicPaymentStatus,
} from "@/lib/payments/checkout-session-status";
import {
  recordInvalidPaymentStateTransition,
  recordPaymentIntentSucceededWithoutGrant,
} from "@/lib/payments/telemetry";

export class PaymentWebhookRetryableError extends Error {
  retryAfterMs: number;

  constructor(message: string, retryAfterMs = 60_000) {
    super(message);
    this.name = "PaymentWebhookRetryableError";
    this.retryAfterMs = retryAfterMs;
  }
}

type PaymentWebhookClient = TransactionClient;

type StripeEventRow = {
  id: string;
  stripeEventId: string;
  eventType: string;
  payload: Prisma.JsonValue;
  livemode: boolean;
  processedAt: Date | null;
};

function logSuppressedTransition(input: {
  paymentId: string;
  currentStatus: PaymentStatus;
  attemptedStatus: PaymentStatus;
  retainedStatus: PaymentStatus;
  suppressed: boolean;
}) {
  if (!input.suppressed) {
    return;
  }

  recordInvalidPaymentStateTransition({
    paymentId: input.paymentId,
    currentStatus: input.currentStatus,
    attemptedStatus: input.attemptedStatus,
    retainedStatus: input.retainedStatus,
  });
}

async function findPendingPaymentForMetadata(
  client: PaymentWebhookClient,
  metadata: PaywallMetadata
) {
  const candidate = await client.payment.findFirst({
    where: {
      userId: metadata.userId,
      productCode: metadata.productCode,
      stripePaymentIntentId: null,
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      metadata: true,
    },
  });

  if (!candidate) {
    return null;
  }

  const candidateMetadata = parsePaywallMetadata(candidate.metadata);
  if (!candidateMetadata || !matchesCheckoutMetadata(candidateMetadata, metadata)) {
    return null;
  }

  return candidate;
}

async function upsertPaymentFromCheckoutSession(
  client: PaymentWebhookClient,
  input: {
    session: Stripe.Checkout.Session;
    metadata: PaywallMetadata;
    targetStatus: PaymentStatus;
    stripeEvent: StripeEventRow;
  }
) {
  const stripePaymentIntentId =
    typeof input.session.payment_intent === "string"
      ? input.session.payment_intent
      : null;
  const existing = await client.payment.findFirst({
    where: {
      OR: [
        { stripeCheckoutSessionId: input.session.id },
        ...(stripePaymentIntentId ? [{ stripePaymentIntentId }] : []),
      ],
    },
    select: {
      id: true,
      status: true,
    },
  });

  const resolvedStatus = resolveMonotonicPaymentStatus(
    existing?.status,
    input.targetStatus
  );
  const stripeCustomerId =
    typeof input.session.customer === "string" ? input.session.customer : null;
  const data = {
    userId: input.metadata.userId,
    productCode: input.metadata.productCode,
    status: resolvedStatus.status,
    stripeCheckoutSessionId: input.session.id,
    stripePaymentIntentId,
    stripeCustomerId,
    amount: centsToDecimal(input.session.amount_total),
    currency: (input.session.currency ?? "usd").toLowerCase(),
    livemode: input.stripeEvent.livemode,
    originStripeEventId: input.stripeEvent.stripeEventId,
    metadata: {
      ...input.metadata,
      stripeCustomerId,
      stripePaymentStatus: input.session.payment_status ?? null,
    },
  } satisfies Prisma.PaymentUncheckedCreateInput;

  if (existing) {
    logSuppressedTransition({
      paymentId: existing.id,
      currentStatus: existing.status,
      attemptedStatus: input.targetStatus,
      retainedStatus: resolvedStatus.status,
      suppressed: resolvedStatus.suppressed,
    });

    return client.payment.update({
      where: { id: existing.id },
      data,
    });
  }

  return client.payment.create({ data });
}

async function upsertPaymentFromIntent(
  client: PaymentWebhookClient,
  input: {
    intent: Stripe.PaymentIntent;
    metadata: PaywallMetadata;
    targetStatus: PaymentStatus;
    stripeEvent: StripeEventRow;
  }
) {
  const byIntentId = await client.payment.findUnique({
    where: { stripePaymentIntentId: input.intent.id },
    select: { id: true, status: true },
  });
  const fallback = byIntentId
    ? null
    : await findPendingPaymentForMetadata(client, input.metadata);
  const existing = byIntentId ?? fallback;
  const resolvedStatus = resolveMonotonicPaymentStatus(
    existing?.status,
    input.targetStatus
  );
  const stripeCustomerId =
    typeof input.intent.customer === "string" ? input.intent.customer : null;

  const data = {
    userId: input.metadata.userId,
    productCode: input.metadata.productCode,
    status: resolvedStatus.status,
    stripePaymentIntentId: input.intent.id,
    stripeCustomerId,
    amount: centsToDecimal(input.intent.amount_received || input.intent.amount),
    currency: (input.intent.currency ?? "usd").toLowerCase(),
    livemode: input.stripeEvent.livemode,
    originStripeEventId: input.stripeEvent.stripeEventId,
    paidAt: resolvedStatus.status === "SUCCEEDED" ? new Date() : undefined,
    metadata: {
      ...input.metadata,
      stripeCustomerId,
      stripeLatestChargeId:
        typeof input.intent.latest_charge === "string"
          ? input.intent.latest_charge
          : null,
    },
  } satisfies Prisma.PaymentUncheckedCreateInput;

  if (existing) {
    logSuppressedTransition({
      paymentId: existing.id,
      currentStatus: existing.status,
      attemptedStatus: input.targetStatus,
      retainedStatus: resolvedStatus.status,
      suppressed: resolvedStatus.suppressed,
    });

    return client.payment.update({
      where: { id: existing.id },
      data,
    });
  }

  return client.payment.create({ data });
}

async function recordAmountMismatch(
  client: PaymentWebhookClient,
  input: {
    stripeEvent: StripeEventRow;
    userId: string;
    productCode: string;
    expectedAmount: number;
    actualAmount: number;
    currency: string;
  }
) {
  await recordAuditEvent(client, {
    kind: "PAYMENT_AMOUNT_MISMATCH",
    actor: { role: "system", id: null },
    aggregateType: "stripe_events",
    aggregateId: input.stripeEvent.id,
    details: {
      userId: input.userId,
      productCode: input.productCode,
      expectedAmount: input.expectedAmount,
      actualAmount: input.actualAmount,
      currency: input.currency,
    },
  });
}

async function validateCatalogAmount(
  client: PaymentWebhookClient,
  input: {
    stripeEvent: StripeEventRow;
    metadata: PaywallMetadata;
    amountCents: number;
    currency: string | null | undefined;
  }
) {
  const product = getProductCatalogEntry(input.metadata.productCode);
  const currency = (input.currency ?? "usd").toLowerCase();
  if (product.amountCents === input.amountCents && currency === "usd") {
    return true;
  }

  await recordAmountMismatch(client, {
    stripeEvent: input.stripeEvent,
    userId: input.metadata.userId,
    productCode: input.metadata.productCode,
    expectedAmount: product.amountCents,
    actualAmount: input.amountCents,
    currency,
  });
  return false;
}

async function queueAutoRefundForBannedUser(
  client: PaymentWebhookClient,
  input: {
    paymentId: string;
    userId: string;
    stripeEvent: StripeEventRow;
  }
) {
  await client.payment.update({
    where: { id: input.paymentId },
    data: {
      fraudFlag: true,
      autoRefundStatus: "QUEUED_BANNED_USER",
    },
  });

  await client.refundQueueItem.create({
    data: {
      paymentId: input.paymentId,
      userId: input.userId,
      reason: "banned_user_inflight",
      status: "PENDING",
      metadata: {
        stripeEventId: input.stripeEvent.stripeEventId,
      },
    },
  });

  await recordAuditEvent(client, {
    kind: "PAYMENT_FRAUD_FLAGGED",
    actor: { role: "system", id: null },
    aggregateType: "payments",
    aggregateId: input.paymentId,
    details: {
      reason: "banned_user_inflight",
      userId: input.userId,
    },
  });
}

async function grantEntitlementForPayment(
  client: PaymentWebhookClient,
  input: {
    paymentId: string;
    userId: string;
    metadata: PaywallMetadata;
    stripeEvent: StripeEventRow;
  }
) {
  const existingGrant = await client.entitlementGrant.findUnique({
    where: { paymentId: input.paymentId },
    select: { id: true },
  });

  if (existingGrant) {
    return;
  }

  const user = await client.user.findUnique({
    where: { id: input.userId },
    select: { isSuspended: true },
  });
  if (user?.isSuspended) {
    await queueAutoRefundForBannedUser(client, {
      paymentId: input.paymentId,
      userId: input.userId,
      stripeEvent: input.stripeEvent,
    });
    return;
  }

  if (features.freezeNewGrants) {
    throw new PaymentWebhookRetryableError("New entitlement grants are frozen");
  }

  const product = getProductCatalogEntry(input.metadata.productCode);
  const now = new Date();
  const currentPassGrantEnd = product.durationDays
    ? await client.entitlementGrant.findFirst({
        where: {
          userId: input.userId,
          contactKind: input.metadata.contactKind,
          grantType: "PASS",
          status: "ACTIVE",
          activeUntil: { gt: now },
        },
        orderBy: { activeUntil: "desc" },
        select: { activeUntil: true },
      })
    : null;
  const activeFrom =
    product.durationDays && currentPassGrantEnd?.activeUntil
      ? currentPassGrantEnd.activeUntil
      : now;
  const activeUntil = product.durationDays
    ? new Date(
        activeFrom.getTime() + product.durationDays * 24 * 60 * 60 * 1000
      )
    : null;

  await client.entitlementGrant.create({
    data: {
      userId: input.userId,
      productCode: input.metadata.productCode,
      contactKind: input.metadata.contactKind,
      grantType: product.creditCount ? "PACK" : "PASS",
      status: "ACTIVE",
      creditCount: product.creditCount ?? null,
      originalCreditCount: product.creditCount ?? null,
      paymentId: input.paymentId,
      idempotencyKey: `payment:${input.paymentId}:${input.metadata.contactKind}`,
      activeFrom,
      activeUntil,
      windowStartDelta: product.durationDays ? activeFrom : null,
      windowEndDelta: activeUntil,
      metadata: {
        purchaseContext: input.metadata.purchaseContext,
        ...(input.metadata.purchaseContext === "CONTACT_HOST"
          ? {
              listingId: input.metadata.listingId,
              unitId: input.metadata.unitId,
              unitIdentityEpoch: input.metadata.unitIdentityEpoch,
            }
          : {}),
      },
    },
  });

  if (features.entitlementState) {
    await recomputeEntitlementState(client, input.userId);
  }
}

async function processStripeEventObject(
  client: PaymentWebhookClient,
  stripeEvent: StripeEventRow,
  event: Stripe.Event
) {
  if (process.env.NODE_ENV === "production" && !stripeEvent.livemode) {
    return;
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const metadata = parsePaywallMetadata(session.metadata);
      if (!metadata) {
        return;
      }

      await upsertPaymentFromCheckoutSession(client, {
        session,
        metadata,
        targetStatus: "CHECKOUT_COMPLETED",
        stripeEvent,
      });
      return;
    }
    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      const metadata = parsePaywallMetadata(session.metadata);
      if (!metadata) {
        return;
      }

      await upsertPaymentFromCheckoutSession(client, {
        session,
        metadata,
        targetStatus: "CANCELED",
        stripeEvent,
      });
      return;
    }
    case "payment_intent.payment_failed": {
      const intent = event.data.object as Stripe.PaymentIntent;
      const metadata = parsePaywallMetadata(intent.metadata);
      if (!metadata) {
        return;
      }

      await upsertPaymentFromIntent(client, {
        intent,
        metadata,
        targetStatus: "FAILED",
        stripeEvent,
      });
      return;
    }
    case "payment_intent.succeeded": {
      const intent = event.data.object as Stripe.PaymentIntent;
      const metadata = parsePaywallMetadata(intent.metadata);

      if (!metadata) {
        recordPaymentIntentSucceededWithoutGrant({
          stripePaymentIntentId: intent.id,
          reason: "missing_or_invalid_metadata",
        });
        return;
      }

      const amountOk = await validateCatalogAmount(client, {
        stripeEvent,
        metadata,
        amountCents: intent.amount_received || intent.amount,
        currency: intent.currency,
      });
      if (!amountOk) {
        return;
      }

      const payment = await upsertPaymentFromIntent(client, {
        intent,
        metadata,
        targetStatus: "SUCCEEDED",
        stripeEvent,
      });
      await grantEntitlementForPayment(client, {
        paymentId: payment.id,
        userId: payment.userId,
        metadata,
        stripeEvent,
      });
      return;
    }
    case "refund.created":
    case "refund.updated":
    case "refund.failed": {
      const refund = event.data.object as Stripe.Refund;
      const result = await handleRefundEvent(client, refund, {
        originStripeEventId: stripeEvent.stripeEventId,
      });
      if (!result.ok && result.retryable) {
        throw new PaymentWebhookRetryableError(
          `Stripe refund ${result.stripeObjectId} is waiting for ${result.reason}`,
          60_000
        );
      }
      return;
    }
    case "charge.dispute.created":
    case "charge.dispute.closed": {
      const dispute = event.data.object as Stripe.Dispute;
      const result = await handleDisputeEvent(
        client,
        {
          dispute,
          eventType: event.type,
        },
        {
          originStripeEventId: stripeEvent.stripeEventId,
        }
      );
      if (!result.ok && result.retryable) {
        throw new PaymentWebhookRetryableError(
          `Stripe dispute ${result.stripeObjectId} is waiting for ${result.reason}`,
          60_000
        );
      }
      return;
    }
    default:
      return;
  }
}

export async function processCapturedStripeEvent(
  client: PaymentWebhookClient,
  stripeEventRowId: string
) {
  const stripeEvent = await client.stripeEvent.findUnique({
    where: { id: stripeEventRowId },
    select: {
      id: true,
      stripeEventId: true,
      eventType: true,
      payload: true,
      livemode: true,
      processedAt: true,
    },
  });

  if (!stripeEvent) {
    throw new Error(`Stripe event row not found: ${stripeEventRowId}`);
  }

  if (stripeEvent.processedAt) {
    return;
  }

  const event = stripeEvent.payload as unknown as Stripe.Event;
  await client.stripeEvent.update({
    where: { id: stripeEvent.id },
    data: {
      processingStatus: "PROCESSING",
      attemptCount: { increment: 1 },
      lastError: null,
    },
  });

  try {
    await client.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtext(${`payment-webhook:${stripeEvent.stripeEventId}`}))
    `;
    await processStripeEventObject(client, stripeEvent, event);
    await client.stripeEvent.update({
      where: { id: stripeEvent.id },
      data: {
        processedAt: new Date(),
        processingStatus: "PROCESSED",
        processedBy: "outbox-drain",
        lastError: null,
      },
    });
  } catch (error) {
    const retryAfterMs =
      error instanceof PaymentWebhookRetryableError ? error.retryAfterMs : null;
    await client.stripeEvent.update({
      where: { id: stripeEvent.id },
      data: {
        processingStatus: retryAfterMs === null ? "FAILED" : "PENDING",
        nextAttemptAt:
          retryAfterMs === null
            ? undefined
            : new Date(Date.now() + retryAfterMs),
        lastError: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}

export async function processCapturedStripeEventById(stripeEventRowId: string) {
  await prisma.$transaction((tx) =>
    processCapturedStripeEvent(tx, stripeEventRowId)
  );
}
