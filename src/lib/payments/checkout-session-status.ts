import type { PaymentStatus } from "@prisma/client";
import { isProductCode } from "@/lib/payments/catalog";

export type PurchaseContext = "CONTACT_HOST" | "PHONE_REVEAL" | "SEARCH_ALERTS";

export type ContactCheckoutMetadata = {
  purchaseContext: "CONTACT_HOST" | "PHONE_REVEAL";
  userId: string;
  listingId: string;
  unitId: string;
  unitIdentityEpoch: number;
  productCode: "CONTACT_PACK_3" | "MOVERS_PASS_30D";
  contactKind: "MESSAGE_START" | "REVEAL_PHONE";
};

export type SearchAlertsCheckoutMetadata = {
  purchaseContext: "SEARCH_ALERTS";
  userId: string;
  productCode: "MOVERS_PASS_30D";
  contactKind: "MESSAGE_START";
};

export type PaywallMetadata =
  | ContactCheckoutMetadata
  | SearchAlertsCheckoutMetadata;

export type CheckoutStatus = "OPEN" | "COMPLETE" | "EXPIRED";
export type CheckoutPaymentStatus = "PAID" | "UNPAID";
export type FulfillmentStatus =
  | "PENDING"
  | "FULFILLED"
  | "FAILED"
  | "CANCELED";

export interface CheckoutSessionSnapshot {
  checkoutStatus: CheckoutStatus;
  paymentStatus: CheckoutPaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  requiresViewerStateRefresh: boolean;
}

export function centsToDecimal(amountInCents: number | null | undefined): string {
  const normalized = typeof amountInCents === "number" ? amountInCents : 0;
  return (normalized / 100).toFixed(2);
}

export function parsePaywallMetadata(metadata: unknown): PaywallMetadata | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const record = metadata as Record<string, unknown>;
  const purchaseContext =
    typeof record.purchaseContext === "string"
      ? record.purchaseContext.trim()
      : "";
  const userId =
    typeof record.userId === "string" ? record.userId.trim() : "";
  const listingId =
    typeof record.listingId === "string" ? record.listingId.trim() : "";
  const unitId =
    typeof record.unitId === "string" ? record.unitId.trim() : "";
  const productCode =
    typeof record.productCode === "string" ? record.productCode.trim() : "";
  const contactKind =
    typeof record.contactKind === "string" ? record.contactKind.trim() : "";
  const rawEpoch = record.unitIdentityEpoch;
  const unitIdentityEpoch = Number.parseInt(String(rawEpoch ?? ""), 10);

  if (!userId || !productCode || !isProductCode(productCode)) {
    return null;
  }

  if (contactKind !== "MESSAGE_START") {
    return null;
  }

  if (purchaseContext === "SEARCH_ALERTS") {
    if (productCode !== "MOVERS_PASS_30D") {
      return null;
    }

    return {
      purchaseContext: "SEARCH_ALERTS",
      userId,
      productCode: "MOVERS_PASS_30D",
      contactKind: "MESSAGE_START",
    };
  }

  if (
    purchaseContext &&
    purchaseContext !== "CONTACT_HOST" &&
    purchaseContext !== "PHONE_REVEAL" &&
    purchaseContext !== "SEARCH_ALERTS"
  ) {
    return null;
  }

  const resolvedPurchaseContext =
    purchaseContext === "PHONE_REVEAL" ? "PHONE_REVEAL" : "CONTACT_HOST";
  const expectedContactKind =
    resolvedPurchaseContext === "PHONE_REVEAL"
      ? "REVEAL_PHONE"
      : "MESSAGE_START";
  if (contactKind !== expectedContactKind) {
    return null;
  }

  if (!listingId || !unitId || !Number.isInteger(unitIdentityEpoch)) {
    return null;
  }

  return {
    purchaseContext: resolvedPurchaseContext,
    userId,
    listingId,
    unitId,
    unitIdentityEpoch,
    productCode,
    contactKind: "MESSAGE_START",
  };
}

export function isContactCheckoutMetadata(
  metadata: PaywallMetadata | null
): metadata is ContactCheckoutMetadata {
  return (
    metadata?.purchaseContext === "CONTACT_HOST" ||
    metadata?.purchaseContext === "PHONE_REVEAL"
  );
}

export function isSearchAlertsCheckoutMetadata(
  metadata: PaywallMetadata | null
): metadata is SearchAlertsCheckoutMetadata {
  return metadata?.purchaseContext === "SEARCH_ALERTS";
}

export function isMatchingCheckoutRequest(input: {
  metadata: PaywallMetadata | null;
  purchaseContext: PurchaseContext;
  listingId?: string | null;
}): boolean {
  if (!input.metadata || input.metadata.purchaseContext !== input.purchaseContext) {
    return false;
  }

  if (
    input.purchaseContext === "CONTACT_HOST" ||
    input.purchaseContext === "PHONE_REVEAL"
  ) {
    return (
      isContactCheckoutMetadata(input.metadata) &&
      input.metadata.listingId === (input.listingId ?? "")
    );
  }

  return isSearchAlertsCheckoutMetadata(input.metadata);
}

export function matchesCheckoutMetadata(
  left: PaywallMetadata,
  right: PaywallMetadata
): boolean {
  if (
    left.purchaseContext !== right.purchaseContext ||
    left.userId !== right.userId ||
    left.productCode !== right.productCode ||
    left.contactKind !== right.contactKind
  ) {
    return false;
  }

  if (
    left.purchaseContext === "SEARCH_ALERTS" &&
    right.purchaseContext === "SEARCH_ALERTS"
  ) {
    return true;
  }

  return (
    isContactCheckoutMetadata(left) &&
    isContactCheckoutMetadata(right) &&
    left.listingId === right.listingId &&
    left.unitId === right.unitId &&
    left.unitIdentityEpoch === right.unitIdentityEpoch
  );
}

export function normalizeCheckoutStatus(
  status: string | null | undefined
): CheckoutStatus {
  switch (status) {
    case "complete":
      return "COMPLETE";
    case "expired":
      return "EXPIRED";
    default:
      return "OPEN";
  }
}

export function normalizeCheckoutPaymentStatus(
  status: string | null | undefined
): CheckoutPaymentStatus {
  return status === "paid" ? "PAID" : "UNPAID";
}

function getPaymentStatusRank(status: PaymentStatus): number {
  switch (status) {
    case "SUCCEEDED":
      return 4;
    case "FAILED":
    case "CANCELED":
      return 3;
    case "CHECKOUT_COMPLETED":
      return 2;
    case "CHECKOUT_CREATED":
    default:
      return 1;
  }
}

export function resolveMonotonicPaymentStatus(
  currentStatus: PaymentStatus | null | undefined,
  nextStatus: PaymentStatus
): { status: PaymentStatus; suppressed: boolean } {
  if (!currentStatus) {
    return { status: nextStatus, suppressed: false };
  }

  if (getPaymentStatusRank(currentStatus) > getPaymentStatusRank(nextStatus)) {
    return { status: currentStatus, suppressed: true };
  }

  if (currentStatus === nextStatus) {
    return { status: currentStatus, suppressed: false };
  }

  if (getPaymentStatusRank(currentStatus) === getPaymentStatusRank(nextStatus)) {
    return { status: currentStatus, suppressed: true };
  }

  return { status: nextStatus, suppressed: false };
}

export function classifyCheckoutSessionSnapshot(input: {
  localPaymentStatus?: PaymentStatus | null;
  hasGrant: boolean;
  stripeCheckoutStatus?: string | null;
  stripePaymentStatus?: string | null;
}): CheckoutSessionSnapshot {
  if (input.hasGrant) {
    return {
      checkoutStatus: "COMPLETE",
      paymentStatus: "PAID",
      fulfillmentStatus: "FULFILLED",
      requiresViewerStateRefresh: true,
    };
  }

  switch (input.localPaymentStatus) {
    case "SUCCEEDED":
      return {
        checkoutStatus: "COMPLETE",
        paymentStatus: "PAID",
        fulfillmentStatus: "PENDING",
        requiresViewerStateRefresh: false,
      };
    case "FAILED":
      return {
        checkoutStatus: "COMPLETE",
        paymentStatus: "UNPAID",
        fulfillmentStatus: "FAILED",
        requiresViewerStateRefresh: false,
      };
    case "CANCELED":
      return {
        checkoutStatus: "EXPIRED",
        paymentStatus: "UNPAID",
        fulfillmentStatus: "CANCELED",
        requiresViewerStateRefresh: false,
      };
    default:
      break;
  }

  const checkoutStatus = normalizeCheckoutStatus(input.stripeCheckoutStatus);
  const paymentStatus = normalizeCheckoutPaymentStatus(input.stripePaymentStatus);

  if (checkoutStatus === "EXPIRED") {
    return {
      checkoutStatus,
      paymentStatus,
      fulfillmentStatus: "CANCELED",
      requiresViewerStateRefresh: false,
    };
  }

  if (checkoutStatus === "COMPLETE") {
    return {
      checkoutStatus,
      paymentStatus,
      fulfillmentStatus: paymentStatus === "PAID" ? "PENDING" : "FAILED",
      requiresViewerStateRefresh: false,
    };
  }

  return {
    checkoutStatus,
    paymentStatus,
    fulfillmentStatus: "PENDING",
    requiresViewerStateRefresh: false,
  };
}
