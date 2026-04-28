import "server-only";

import { logger } from "@/lib/logger";
import { hashIdForLog } from "@/lib/messaging/cfm-messaging-telemetry";
import type {
  ContactConsumptionSource,
  ContactKind,
  ProductCode,
} from "@prisma/client";

type PurchaseContext = "CONTACT_HOST" | "PHONE_REVEAL" | "SEARCH_ALERTS";

export const PAYWALL_MISSING_PHYSICAL_UNIT_ID_REASON =
  "missing_physical_unit_id";
export const PAYWALL_MISSING_PHYSICAL_UNIT_ROW_REASON =
  "missing_physical_unit_row";

function hashNullableId(id: string | null | undefined): string | null {
  return id ? hashIdForLog(id) : null;
}

export function recordCheckoutSessionCreated(input: {
  userId: string;
  purchaseContext: PurchaseContext;
  listingId?: string | null;
  productCode: ProductCode;
}) {
  logger.sync.info("cfm.paywall.checkout_session_created_count", {
    metric: "checkout_session_created",
    userIdHash: hashIdForLog(input.userId),
    purchaseContext: input.purchaseContext,
    listingIdHash: hashNullableId(input.listingId),
    productCode: input.productCode,
  });
}

export function recordPaymentIntentSucceededWithoutGrant(input: {
  stripePaymentIntentId: string;
  reason: string;
}) {
  logger.sync.warn("cfm.paywall.payment_intent_succeeded_without_grant_count", {
    metric: "payment_intent_succeeded_without_grant",
    stripePaymentIntentId: input.stripePaymentIntentId,
    reason: input.reason,
  });
}

export function recordStripeEventReplayIgnored(input: {
  stripeEventId: string;
  eventType: string;
}) {
  logger.sync.info("cfm.paywall.stripe_event_replay_ignored_count", {
    metric: "stripe_event_replay_ignored",
    stripeEventId: input.stripeEventId,
    eventType: input.eventType,
  });
}

export function recordContactConsumptionCreated(input: {
  userId: string;
  unitId: string;
  unitIdentityEpoch: number;
  source: ContactConsumptionSource;
}) {
  logger.sync.info("cfm.paywall.contact_consumption_created_count", {
    metric: "contact_consumption_created",
    userIdHash: hashIdForLog(input.userId),
    unitIdHash: hashIdForLog(input.unitId),
    unitIdentityEpoch: input.unitIdentityEpoch,
    source: input.source,
  });
}

export function recordStartConversationBlockedPaywall(input: {
  userId: string;
  listingId: string;
  unitId: string | null;
}) {
  logger.sync.info("cfm.paywall.start_conversation_blocked_count", {
    metric: "start_conversation_blocked_paywall",
    userIdHash: hashIdForLog(input.userId),
    listingIdHash: hashIdForLog(input.listingId),
    unitIdHash: hashNullableId(input.unitId),
  });
}

export function recordPaywallBypassMissingUnitId(input: {
  userId: string;
  listingId: string;
  reason:
    | typeof PAYWALL_MISSING_PHYSICAL_UNIT_ID_REASON
    | typeof PAYWALL_MISSING_PHYSICAL_UNIT_ROW_REASON;
}) {
  logger.sync.info("cfm.paywall.bypass_missing_unit_id_count", {
    metric: "paywall_bypass_missing_unit_id",
    userIdHash: hashIdForLog(input.userId),
    listingIdHash: hashIdForLog(input.listingId),
    reason: input.reason,
  });
}

export function recordCheckoutStatusForeignSession(input: {
  userId: string;
  purchaseContext: PurchaseContext;
  listingId?: string | null;
  sessionId: string;
}) {
  logger.sync.warn("cfm.paywall.checkout_status_foreign_session_count", {
    metric: "checkout_status_foreign_session",
    userIdHash: hashIdForLog(input.userId),
    purchaseContext: input.purchaseContext,
    listingIdHash: hashNullableId(input.listingId),
    sessionId: input.sessionId,
  });
}

export function recordInvalidPaymentStateTransition(input: {
  paymentId: string;
  currentStatus: string;
  attemptedStatus: string;
  retainedStatus: string;
}) {
  logger.sync.warn("cfm.paywall.invalid_payment_state_transition_count", {
    metric: "invalid_payment_state_transition",
    paymentId: input.paymentId,
    currentStatus: input.currentStatus,
    attemptedStatus: input.attemptedStatus,
    retainedStatus: input.retainedStatus,
  });
}

export function recordRefundRecorded(input: {
  paymentId: string;
  stripeRefundId: string;
  status: string;
}) {
  logger.sync.info("cfm.paywall.refund_recorded_count", {
    metric: "refund_recorded",
    paymentId: input.paymentId,
    stripeRefundId: input.stripeRefundId,
    status: input.status,
  });
}

export function recordRefundEntitlementAdjustmentApplied(input: {
  paymentId: string;
  grantId: string;
  stripeObjectId: string;
  resultStatus: string;
}) {
  logger.sync.info("cfm.paywall.refund_entitlement_adjustment_applied_count", {
    metric: "refund_entitlement_adjustment_applied",
    paymentId: input.paymentId,
    grantId: input.grantId,
    stripeObjectId: input.stripeObjectId,
    resultStatus: input.resultStatus,
  });
}

export function recordDisputeOpened(input: {
  paymentId: string;
  stripeDisputeId: string;
}) {
  logger.sync.warn("cfm.paywall.dispute_opened_count", {
    metric: "dispute_opened",
    paymentId: input.paymentId,
    stripeDisputeId: input.stripeDisputeId,
  });
}

export function recordDisputeResolved(input: {
  paymentId: string;
  stripeDisputeId: string;
  outcome: string;
}) {
  logger.sync.warn("cfm.paywall.dispute_resolved_count", {
    metric: "dispute_resolved",
    paymentId: input.paymentId,
    stripeDisputeId: input.stripeDisputeId,
    outcome: input.outcome,
  });
}

export function recordFrozenGrantRestored(input: {
  paymentId: string;
  grantId: string;
  stripeDisputeId: string;
}) {
  logger.sync.info("cfm.paywall.frozen_grant_restored_count", {
    metric: "frozen_grant_restored",
    paymentId: input.paymentId,
    grantId: input.grantId,
    stripeDisputeId: input.stripeDisputeId,
  });
}

export function recordWebhookAdjustmentReplayIgnored(input: {
  adjustmentType: string;
  objectId: string;
}) {
  logger.sync.info("cfm.paywall.webhook_adjustment_replay_ignored_count", {
    metric: "webhook_adjustment_replay_ignored",
    adjustmentType: input.adjustmentType,
    objectId: input.objectId,
  });
}

export function recordPaymentAdjustmentMissingLink(input: {
  adjustmentType: string;
  stripeObjectId: string;
  stripePaymentIntentId?: string | null;
  stripeChargeId?: string | null;
}) {
  logger.sync.warn("cfm.paywall.payment_adjustment_missing_link_count", {
    metric: "payment_adjustment_missing_link",
    adjustmentType: input.adjustmentType,
    stripeObjectId: input.stripeObjectId,
    stripePaymentIntentId: input.stripePaymentIntentId ?? null,
    stripeChargeId: input.stripeChargeId ?? null,
  });
}

export function recordEntitlementStateShadowMismatch(input: {
  userId: string;
  contactKind?: ContactKind;
  existingFreeRemaining: number | null;
  nextFreeRemaining: number;
  existingPaidRemaining: number | null;
  nextPaidRemaining: number;
}) {
  logger.sync.warn("cfm.paywall.entitlement_state_shadow_mismatch_count", {
    metric: "entitlement_state_shadow_mismatch",
    userIdHash: hashIdForLog(input.userId),
    contactKind: input.contactKind ?? "MESSAGE_START",
    existingFreeRemaining: input.existingFreeRemaining,
    nextFreeRemaining: input.nextFreeRemaining,
    existingPaidRemaining: input.existingPaidRemaining,
    nextPaidRemaining: input.nextPaidRemaining,
  });
}

export function recordEntitlementStateRebuild(input: {
  userId: string;
  contactKind?: ContactKind;
  durationMs: number;
  rebuilt: boolean;
  success: boolean;
}) {
  logger.sync.info("cfm.paywall.entitlement_state_rebuild_ms", {
    metric: "entitlement_state_rebuild_ms",
    userIdHash: hashIdForLog(input.userId),
    contactKind: input.contactKind ?? "MESSAGE_START",
    durationMs: input.durationMs,
    rebuilt: input.rebuilt,
    success: input.success,
  });
}

export function recordContactRestorationApplied(input: {
  userId: string;
  contactConsumptionId: string;
  reason:
    | "HOST_BOUNCE"
    | "HOST_BAN"
    | "HOST_MASS_DEACTIVATED"
    | "HOST_GHOST_SLA"
    | "SUPPORT";
}) {
  logger.sync.info("cfm.paywall.contact_restoration_applied_count", {
    metric: "contact_restoration_applied",
    userIdHash: hashIdForLog(input.userId),
    contactConsumptionIdHash: hashIdForLog(input.contactConsumptionId),
    reason: input.reason,
  });
}

export function recordContactRestorationReplayIgnored(input: {
  userId: string;
  contactConsumptionId: string;
  reason:
    | "HOST_BOUNCE"
    | "HOST_BAN"
    | "HOST_MASS_DEACTIVATED"
    | "HOST_GHOST_SLA"
    | "SUPPORT";
}) {
  logger.sync.info("cfm.paywall.contact_restoration_replay_ignored_count", {
    metric: "contact_restoration_replay_ignored",
    userIdHash: hashIdForLog(input.userId),
    contactConsumptionIdHash: hashIdForLog(input.contactConsumptionId),
    reason: input.reason,
  });
}

export function recordHostBounceRestoreApplied(input: {
  userId: string;
  contactConsumptionId: string;
}) {
  logger.sync.info("cfm.paywall.host_bounce_restore_applied_count", {
    metric: "host_bounce_restore_applied",
    userIdHash: hashIdForLog(input.userId),
    contactConsumptionIdHash: hashIdForLog(input.contactConsumptionId),
  });
}

export function recordGhostSlaRestoreApplied(input: {
  userId: string;
  contactConsumptionId: string;
}) {
  logger.sync.info("cfm.paywall.ghost_sla_restore_applied_count", {
    metric: "ghost_sla_restore_applied",
    userIdHash: hashIdForLog(input.userId),
    contactConsumptionIdHash: hashIdForLog(input.contactConsumptionId),
  });
}

export function recordMassDeactivationRestoreApplied(input: {
  userId: string;
  contactConsumptionId: string;
}) {
  logger.sync.info("cfm.paywall.mass_deactivation_restore_applied_count", {
    metric: "mass_deactivation_restore_applied",
    userIdHash: hashIdForLog(input.userId),
    contactConsumptionIdHash: hashIdForLog(input.contactConsumptionId),
  });
}

export function recordBanRestoreApplied(input: {
  userId: string;
  contactConsumptionId: string;
}) {
  logger.sync.info("cfm.paywall.ban_restore_applied_count", {
    metric: "ban_restore_applied",
    userIdHash: hashIdForLog(input.userId),
    contactConsumptionIdHash: hashIdForLog(input.contactConsumptionId),
  });
}

export function recordStartConversationPaywallUnavailable(input: {
  userId: string;
  listingId: string;
}) {
  logger.sync.warn("cfm.paywall.start_conversation_paywall_unavailable_count", {
    metric: "start_conversation_paywall_unavailable",
    userIdHash: hashIdForLog(input.userId),
    listingIdHash: hashIdForLog(input.listingId),
  });
}
