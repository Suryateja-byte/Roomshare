import "server-only";

import {
  Prisma,
  type EntitlementGrant,
  type EntitlementGrantStatus,
  type Payment,
  type RefundStatus,
} from "@prisma/client";
import Stripe from "stripe";
import { recordAuditEvent } from "@/lib/audit/events";
import { features } from "@/lib/env";
import { getProductCatalogEntry } from "@/lib/payments/catalog";
import { recomputeEntitlementState } from "@/lib/payments/entitlement-state";
import { centsToDecimal } from "@/lib/payments/checkout-session-status";
import {
  recordDisputeOpened,
  recordDisputeResolved,
  recordFrozenGrantRestored,
  recordPaymentAdjustmentMissingLink,
  recordRefundEntitlementAdjustmentApplied,
  recordRefundRecorded,
  recordWebhookAdjustmentReplayIgnored,
} from "@/lib/payments/telemetry";
import { prisma } from "@/lib/prisma";

type TransactionClient = Parameters<
  Parameters<typeof prisma.$transaction>[0]
>[0];

export type PaymentDisputeLifecycleStatus = "OPEN" | "WON" | "LOST";

type PaymentLookup = Pick<
  Payment,
  "id" | "userId" | "productCode" | "amount" | "currency" | "metadata" | "status"
>;

type LinkedGrant = Pick<
  EntitlementGrant,
  | "id"
  | "status"
  | "grantType"
  | "creditCount"
  | "activeFrom"
  | "activeUntil"
  | "paymentId"
  | "productCode"
  | "contactKind"
>;

export type AdjustmentEventResult =
  | { ok: true }
  | {
      ok: false;
      retryable: true;
      reason: "missing_payment" | "missing_grant";
      stripeObjectId: string;
    };

type AdjustmentOriginOptions = {
  originStripeEventId?: string | null;
};

function decimalToNumber(value: Prisma.Decimal | string | number | null): number {
  if (value === null) {
    return 0;
  }

  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return Number.parseFloat(value);
  }

  return value.toNumber();
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  if (value >= 1) {
    return 1;
  }

  return value;
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

function resolveDisputeStatus(
  dispute: Stripe.Dispute,
  eventType: "charge.dispute.created" | "charge.dispute.closed"
): PaymentDisputeLifecycleStatus {
  if (eventType === "charge.dispute.created") {
    return "OPEN";
  }

  return dispute.status === "won" ? "WON" : "LOST";
}

export function calculatePackGrantAfterRefund(input: {
  originalCreditCount: number;
  usedCount: number;
  paymentAmount: number;
  refundedAmount: number;
}): { status: EntitlementGrantStatus; creditCount: number } {
  const refundRatio = clampRatio(input.refundedAmount / input.paymentAmount);
  if (refundRatio >= 1) {
    return {
      status: "REVOKED",
      creditCount: Math.max(input.usedCount, 0),
    };
  }

  const originalUnused = Math.max(input.originalCreditCount - input.usedCount, 0);
  const remainingUnused = Math.max(
    0,
    Math.floor(originalUnused * (1 - refundRatio))
  );
  const creditCount = input.usedCount + remainingUnused;

  return {
    status: remainingUnused > 0 ? "ACTIVE" : "REVOKED",
    creditCount,
  };
}

export function calculatePassGrantAfterRefund(input: {
  activeFrom: Date;
  refundSucceededAt: Date;
  durationDays: number;
  paymentAmount: number;
  refundedAmount: number;
}): { status: EntitlementGrantStatus; activeUntil: Date } {
  const refundRatio = clampRatio(input.refundedAmount / input.paymentAmount);
  const originalExpiry = new Date(
    input.activeFrom.getTime() + input.durationDays * 24 * 60 * 60 * 1000
  );

  if (refundRatio >= 1 || originalExpiry <= input.refundSucceededAt) {
    return {
      status: "REVOKED",
      activeUntil: input.refundSucceededAt,
    };
  }

  const remainingMs = Math.max(
    originalExpiry.getTime() - input.refundSucceededAt.getTime(),
    0
  );
  const adjustedRemainingMs = Math.max(
    0,
    Math.floor(remainingMs * (1 - refundRatio))
  );
  const activeUntil = new Date(
    input.refundSucceededAt.getTime() + adjustedRemainingMs
  );

  return {
    status: adjustedRemainingMs > 0 ? "ACTIVE" : "REVOKED",
    activeUntil,
  };
}

async function findPaymentForStripeAdjustment(
  tx: TransactionClient,
  input: {
    stripePaymentIntentId?: string | null;
    stripeChargeId?: string | null;
  }
): Promise<PaymentLookup | null> {
  if (input.stripePaymentIntentId) {
    const payment = await tx.payment.findUnique({
      where: { stripePaymentIntentId: input.stripePaymentIntentId },
      select: {
        id: true,
        userId: true,
        productCode: true,
        amount: true,
        currency: true,
        metadata: true,
        status: true,
      },
    });

    if (payment) {
      return payment;
    }
  }

  if (!input.stripeChargeId) {
    return null;
  }

  return tx.payment.findFirst({
    where: {
      metadata: {
        path: ["stripeLatestChargeId"],
        equals: input.stripeChargeId,
      },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      userId: true,
      productCode: true,
      amount: true,
      currency: true,
      metadata: true,
      status: true,
    },
  });
}

async function getLinkedGrant(tx: TransactionClient, paymentId: string) {
  return tx.entitlementGrant.findUnique({
    where: { paymentId },
    select: {
      id: true,
      status: true,
      grantType: true,
      creditCount: true,
      activeFrom: true,
      activeUntil: true,
      paymentId: true,
      productCode: true,
      contactKind: true,
    },
  });
}

async function recordSystemAudit(
  tx: TransactionClient,
  input: {
    kind:
      | "REFUND_RECORDED"
      | "DISPUTE_OPENED"
      | "DISPUTE_RESOLVED"
      | "ENTITLEMENT_FROZEN"
      | "ENTITLEMENT_RESTORED"
      | "ENTITLEMENT_REVOKED";
    aggregateType: "payments" | "refunds" | "payment_disputes" | "entitlement_grants";
    aggregateId: string;
    details?: Record<string, string | number | boolean | null>;
  }
) {
  await recordAuditEvent(tx, {
    kind: input.kind,
    actor: { role: "system", id: null },
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    details: input.details,
  });
}

async function sumSucceededRefunds(tx: TransactionClient, paymentId: string) {
  const aggregate = await tx.refund.aggregate({
    where: {
      paymentId,
      status: "SUCCEEDED",
    },
    _sum: {
      amount: true,
    },
  });

  return decimalToNumber(aggregate._sum.amount as Prisma.Decimal | null);
}

async function countConsumedPackCredits(
  tx: TransactionClient,
  grant: Pick<LinkedGrant, "id" | "contactKind">
) {
  return tx.contactConsumption.count({
    where: {
      entitlementGrantId: grant.id,
      contactKind: grant.contactKind,
      source: "PACK",
      restorationState: "NONE",
    },
  });
}

async function applyRefundAdjustment(tx: TransactionClient, input: {
  payment: PaymentLookup;
  grant: LinkedGrant;
  refundId: string;
  refundRowId: string;
  refundStatus: RefundStatus;
  refundSucceededAt: Date;
}) {
  if (input.refundStatus !== "SUCCEEDED") {
    return;
  }

  const paymentAmount = decimalToNumber(input.payment.amount);
  if (paymentAmount <= 0) {
    return;
  }

  const refundedAmount = await sumSucceededRefunds(tx, input.payment.id);
  const refundRatio = clampRatio(refundedAmount / paymentAmount);

  if (input.grant.grantType === "PACK") {
    const product = getProductCatalogEntry(input.payment.productCode);
    const usedCount = await countConsumedPackCredits(tx, input.grant);
    const target = calculatePackGrantAfterRefund({
      originalCreditCount: product.creditCount ?? input.grant.creditCount ?? 0,
      usedCount,
      paymentAmount,
      refundedAmount,
    });

    const nextStatus =
      refundRatio >= 1 ? "REVOKED" : target.status;

    if (
      input.grant.creditCount === target.creditCount &&
      input.grant.status === nextStatus
    ) {
      recordWebhookAdjustmentReplayIgnored({
        adjustmentType: "refund",
        objectId: input.refundId,
      });
      return;
    }

    await tx.entitlementGrant.update({
      where: { id: input.grant.id },
      data: {
        creditCount: target.creditCount,
        status: nextStatus,
        sourceRefundId: input.refundRowId,
      },
    });

    if (features.entitlementState) {
      await recomputeEntitlementState(tx, input.payment.userId);
    }

    recordRefundEntitlementAdjustmentApplied({
      paymentId: input.payment.id,
      grantId: input.grant.id,
      stripeObjectId: input.refundId,
      resultStatus: nextStatus,
    });

    if (nextStatus === "REVOKED" && input.grant.status !== "REVOKED") {
      await recordSystemAudit(tx, {
        kind: "ENTITLEMENT_REVOKED",
        aggregateType: "entitlement_grants",
        aggregateId: input.grant.id,
        details: {
          source: "refund",
          refundId: input.refundId,
          refundedAmount,
          creditCount: target.creditCount,
        },
      });
    }
    return;
  }

  const product = getProductCatalogEntry(input.payment.productCode);
  const target = calculatePassGrantAfterRefund({
    activeFrom: input.grant.activeFrom,
    refundSucceededAt: input.refundSucceededAt,
    durationDays: product.durationDays ?? 0,
    paymentAmount,
    refundedAmount,
  });
  const nextStatus =
    refundRatio >= 1 ? "REVOKED" : target.status;
  const currentActiveUntil = input.grant.activeUntil?.toISOString() ?? null;
  const nextActiveUntil = target.activeUntil.toISOString();

  if (
    input.grant.status === nextStatus &&
    currentActiveUntil === nextActiveUntil
  ) {
    recordWebhookAdjustmentReplayIgnored({
      adjustmentType: "refund",
      objectId: input.refundId,
    });
    return;
  }

  await tx.entitlementGrant.update({
    where: { id: input.grant.id },
    data: {
      status: nextStatus,
      activeUntil: target.activeUntil,
      sourceRefundId: input.refundRowId,
    },
  });

  if (features.entitlementState) {
    await recomputeEntitlementState(tx, input.payment.userId);
  }

  recordRefundEntitlementAdjustmentApplied({
    paymentId: input.payment.id,
    grantId: input.grant.id,
    stripeObjectId: input.refundId,
    resultStatus: nextStatus,
  });

  if (nextStatus === "REVOKED" && input.grant.status !== "REVOKED") {
    await recordSystemAudit(tx, {
      kind: "ENTITLEMENT_REVOKED",
      aggregateType: "entitlement_grants",
      aggregateId: input.grant.id,
      details: {
        source: "refund",
        refundId: input.refundId,
        refundedAmount,
        activeUntil: nextActiveUntil,
      },
    });
  }
}

export async function handleRefundEvent(
  tx: TransactionClient,
  refund: Stripe.Refund,
  options: AdjustmentOriginOptions = {}
): Promise<AdjustmentEventResult> {
  const stripeChargeId =
    typeof refund.charge === "string" ? refund.charge : refund.charge?.id ?? null;
  const stripePaymentIntentId =
    typeof refund.payment_intent === "string"
      ? refund.payment_intent
      : refund.payment_intent?.id ?? null;
  const payment = await findPaymentForStripeAdjustment(tx, {
    stripePaymentIntentId,
    stripeChargeId,
  });
  const refundStatus = resolveRefundStatus(refund);

  if (!payment) {
    recordPaymentAdjustmentMissingLink({
      adjustmentType: "refund",
      stripeObjectId: refund.id,
      stripePaymentIntentId,
      stripeChargeId,
    });
    return {
      ok: false,
      retryable: true,
      reason: "missing_payment",
      stripeObjectId: refund.id,
    };
  }

  const existingRefund = await tx.refund.findUnique({
    where: { stripeRefundId: refund.id },
    select: { id: true, status: true },
  });

  const refundRow = existingRefund
    ? await tx.refund.update({
        where: { stripeRefundId: refund.id },
        data: {
          paymentId: payment.id,
          amount: centsToDecimal(refund.amount),
          currency: (refund.currency ?? payment.currency).toLowerCase(),
          status: refundStatus,
          reason: refund.reason ?? null,
          originStripeEventId: options.originStripeEventId ?? undefined,
          source: "STRIPE",
          manualReviewRequired: false,
          metadata: {
            stripePaymentIntentId,
            stripeChargeId,
            stripeStatus: refund.status ?? null,
          },
        },
        select: { id: true, status: true },
      })
    : await tx.refund.create({
        data: {
          paymentId: payment.id,
          stripeRefundId: refund.id,
          amount: centsToDecimal(refund.amount),
          currency: (refund.currency ?? payment.currency).toLowerCase(),
          status: refundStatus,
          reason: refund.reason ?? null,
          originStripeEventId: options.originStripeEventId ?? undefined,
          source: "STRIPE",
          manualReviewRequired: false,
          metadata: {
            stripePaymentIntentId,
            stripeChargeId,
            stripeStatus: refund.status ?? null,
          },
        },
        select: { id: true, status: true },
      });

  recordRefundRecorded({
    paymentId: payment.id,
    stripeRefundId: refund.id,
    status: refundStatus,
  });

  await recordSystemAudit(tx, {
    kind: "REFUND_RECORDED",
    aggregateType: "refunds",
    aggregateId: refundRow.id,
    details: {
      paymentId: payment.id,
      status: refundStatus,
      amount: refund.amount,
    },
  });

  const grant = await getLinkedGrant(tx, payment.id);
  if (!grant) {
    recordPaymentAdjustmentMissingLink({
      adjustmentType: "refund_grant",
      stripeObjectId: refund.id,
      stripePaymentIntentId,
      stripeChargeId,
    });
    return {
      ok: false,
      retryable: true,
      reason: "missing_grant",
      stripeObjectId: refund.id,
    };
  }

  await applyRefundAdjustment(tx, {
    payment,
    grant,
    refundId: refund.id,
    refundRowId: refundRow.id,
    refundStatus,
    refundSucceededAt: new Date((refund.created ?? Math.floor(Date.now() / 1000)) * 1000),
  });

  return { ok: true };
}

function resolveRestoreStatus(grant: LinkedGrant): EntitlementGrantStatus {
  if (grant.grantType === "PASS" && grant.activeUntil && grant.activeUntil <= new Date()) {
    return "EXPIRED";
  }

  return "ACTIVE";
}

export async function handleDisputeEvent(
  tx: TransactionClient,
  input: {
    dispute: Stripe.Dispute;
    eventType: "charge.dispute.created" | "charge.dispute.closed";
  },
  options: AdjustmentOriginOptions = {}
): Promise<AdjustmentEventResult> {
  const stripeChargeId =
    typeof input.dispute.charge === "string"
      ? input.dispute.charge
      : input.dispute.charge?.id ?? null;
  const stripePaymentIntentId =
    typeof input.dispute.payment_intent === "string"
      ? input.dispute.payment_intent
      : input.dispute.payment_intent?.id ?? null;
  const payment = await findPaymentForStripeAdjustment(tx, {
    stripePaymentIntentId,
    stripeChargeId,
  });

  if (!payment) {
    recordPaymentAdjustmentMissingLink({
      adjustmentType: "dispute",
      stripeObjectId: input.dispute.id,
      stripePaymentIntentId,
      stripeChargeId,
    });
    return {
      ok: false,
      retryable: true,
      reason: "missing_payment",
      stripeObjectId: input.dispute.id,
    };
  }

  const disputeStatus = resolveDisputeStatus(input.dispute, input.eventType);
  const existingDispute = await tx.paymentDispute.findUnique({
    where: { stripeDisputeId: input.dispute.id },
    select: { id: true, status: true },
  });

  const disputeRow = existingDispute
    ? await tx.paymentDispute.update({
        where: { stripeDisputeId: input.dispute.id },
        data: {
          paymentId: payment.id,
          stripeChargeId,
          amount: centsToDecimal(input.dispute.amount),
          currency: (input.dispute.currency ?? payment.currency).toLowerCase(),
          status: disputeStatus,
          reason: input.dispute.reason ?? null,
          originStripeEventId: options.originStripeEventId ?? undefined,
          metadata: {
            stripePaymentIntentId,
            stripeStatus: input.dispute.status ?? null,
          },
        },
        select: { id: true, status: true },
      })
    : await tx.paymentDispute.create({
        data: {
          paymentId: payment.id,
          stripeDisputeId: input.dispute.id,
          stripeChargeId,
          amount: centsToDecimal(input.dispute.amount),
          currency: (input.dispute.currency ?? payment.currency).toLowerCase(),
          status: disputeStatus,
          reason: input.dispute.reason ?? null,
          originStripeEventId: options.originStripeEventId ?? undefined,
          metadata: {
            stripePaymentIntentId,
            stripeStatus: input.dispute.status ?? null,
          },
        },
        select: { id: true, status: true },
      });

  if (input.eventType === "charge.dispute.created") {
    recordDisputeOpened({
      paymentId: payment.id,
      stripeDisputeId: input.dispute.id,
    });
    await recordSystemAudit(tx, {
      kind: "DISPUTE_OPENED",
      aggregateType: "payment_disputes",
      aggregateId: disputeRow.id,
      details: {
        paymentId: payment.id,
        status: disputeStatus,
      },
    });
  } else {
    recordDisputeResolved({
      paymentId: payment.id,
      stripeDisputeId: input.dispute.id,
      outcome: disputeStatus,
    });
    await recordSystemAudit(tx, {
      kind: "DISPUTE_RESOLVED",
      aggregateType: "payment_disputes",
      aggregateId: disputeRow.id,
      details: {
        paymentId: payment.id,
        status: disputeStatus,
      },
    });
  }

  const grant = await getLinkedGrant(tx, payment.id);
  if (!grant) {
    recordPaymentAdjustmentMissingLink({
      adjustmentType: "dispute_grant",
      stripeObjectId: input.dispute.id,
      stripePaymentIntentId,
      stripeChargeId,
    });
    return {
      ok: false,
      retryable: true,
      reason: "missing_grant",
      stripeObjectId: input.dispute.id,
    };
  }

  if (input.eventType === "charge.dispute.created") {
    if (grant.status === "ACTIVE") {
      await tx.entitlementGrant.update({
        where: { id: grant.id },
        data: { status: "FROZEN" },
      });

      if (features.entitlementState) {
        await recomputeEntitlementState(tx, payment.userId);
      }

      await recordSystemAudit(tx, {
        kind: "ENTITLEMENT_FROZEN",
        aggregateType: "entitlement_grants",
        aggregateId: grant.id,
        details: {
          source: "dispute",
          disputeId: input.dispute.id,
        },
      });
      return { ok: true };
    }

    recordWebhookAdjustmentReplayIgnored({
      adjustmentType: "dispute",
      objectId: input.dispute.id,
    });
    return { ok: true };
  }

  if (disputeStatus === "WON") {
    if (grant.status !== "FROZEN") {
      recordWebhookAdjustmentReplayIgnored({
        adjustmentType: "dispute",
        objectId: input.dispute.id,
      });
      return { ok: true };
    }

    const nextStatus = resolveRestoreStatus(grant);
    await tx.entitlementGrant.update({
      where: { id: grant.id },
      data: { status: nextStatus },
    });
    if (features.entitlementState) {
      await recomputeEntitlementState(tx, payment.userId);
    }
    recordFrozenGrantRestored({
      paymentId: payment.id,
      grantId: grant.id,
      stripeDisputeId: input.dispute.id,
    });
    await recordSystemAudit(tx, {
      kind: "ENTITLEMENT_RESTORED",
      aggregateType: "entitlement_grants",
      aggregateId: grant.id,
      details: {
        source: "dispute",
        disputeId: input.dispute.id,
        status: nextStatus,
      },
    });
    return { ok: true };
  }

  if (grant.status === "REVOKED") {
    recordWebhookAdjustmentReplayIgnored({
      adjustmentType: "dispute",
      objectId: input.dispute.id,
    });
    return { ok: true };
  }

  await tx.entitlementGrant.update({
    where: { id: grant.id },
    data: { status: "REVOKED" },
  });
  if (features.entitlementState) {
    await recomputeEntitlementState(tx, payment.userId);
  }
  await recordSystemAudit(tx, {
    kind: "ENTITLEMENT_REVOKED",
    aggregateType: "entitlement_grants",
    aggregateId: grant.id,
    details: {
      source: "dispute",
      disputeId: input.dispute.id,
      status: "REVOKED",
    },
  });

  return { ok: true };
}

