import {
  classifyCheckoutSessionSnapshot,
  parsePaywallMetadata,
  resolveMonotonicPaymentStatus,
} from "@/lib/payments/checkout-session-status";

describe("checkout-session-status helpers", () => {
  it("preserves SUCCEEDED as a monotonic terminal payment state", () => {
    expect(
      resolveMonotonicPaymentStatus("SUCCEEDED", "CHECKOUT_COMPLETED")
    ).toEqual({
      status: "SUCCEEDED",
      suppressed: true,
    });
  });

  it("parses paywall metadata with either string or numeric epochs", () => {
    expect(
      parsePaywallMetadata({
        purchaseContext: "CONTACT_HOST",
        userId: "user-123",
        listingId: "listing-123",
        unitId: "unit-123",
        unitIdentityEpoch: "7",
        productCode: "CONTACT_PACK_3",
        contactKind: "MESSAGE_START",
      })
    ).toEqual({
      purchaseContext: "CONTACT_HOST",
      userId: "user-123",
      listingId: "listing-123",
      unitId: "unit-123",
      unitIdentityEpoch: 7,
      productCode: "CONTACT_PACK_3",
      contactKind: "MESSAGE_START",
    });

    expect(
      parsePaywallMetadata({
        purchaseContext: "CONTACT_HOST",
        userId: "user-123",
        listingId: "listing-123",
        unitId: "unit-123",
        unitIdentityEpoch: 8,
        productCode: "MOVERS_PASS_30D",
        contactKind: "MESSAGE_START",
      })
    ).toEqual({
      purchaseContext: "CONTACT_HOST",
      userId: "user-123",
      listingId: "listing-123",
      unitId: "unit-123",
      unitIdentityEpoch: 8,
      productCode: "MOVERS_PASS_30D",
      contactKind: "MESSAGE_START",
    });
  });

  it("parses saved-search alert checkout metadata without listing context", () => {
    expect(
      parsePaywallMetadata({
        purchaseContext: "SEARCH_ALERTS",
        userId: "user-123",
        productCode: "MOVERS_PASS_30D",
        contactKind: "MESSAGE_START",
      })
    ).toEqual({
      purchaseContext: "SEARCH_ALERTS",
      userId: "user-123",
      productCode: "MOVERS_PASS_30D",
      contactKind: "MESSAGE_START",
    });
  });

  it("parses phone reveal checkout metadata as REVEAL_PHONE", () => {
    expect(
      parsePaywallMetadata({
        purchaseContext: "PHONE_REVEAL",
        userId: "user-123",
        listingId: "listing-123",
        unitId: "unit-123",
        unitIdentityEpoch: "9",
        productCode: "CONTACT_PACK_3",
        contactKind: "REVEAL_PHONE",
      })
    ).toEqual({
      purchaseContext: "PHONE_REVEAL",
      userId: "user-123",
      listingId: "listing-123",
      unitId: "unit-123",
      unitIdentityEpoch: 9,
      productCode: "CONTACT_PACK_3",
      contactKind: "REVEAL_PHONE",
    });
  });

  it("rejects mismatched contact kind metadata", () => {
    expect(
      parsePaywallMetadata({
        purchaseContext: "PHONE_REVEAL",
        userId: "user-123",
        listingId: "listing-123",
        unitId: "unit-123",
        unitIdentityEpoch: "9",
        productCode: "CONTACT_PACK_3",
        contactKind: "MESSAGE_START",
      })
    ).toBeNull();
  });

  it("classifies an open checkout session before payment completes", () => {
    expect(
      classifyCheckoutSessionSnapshot({
        localPaymentStatus: "CHECKOUT_CREATED",
        hasGrant: false,
        stripeCheckoutStatus: "open",
        stripePaymentStatus: "unpaid",
      })
    ).toEqual({
      checkoutStatus: "OPEN",
      paymentStatus: "UNPAID",
      fulfillmentStatus: "PENDING",
      requiresViewerStateRefresh: false,
    });
  });

  it("classifies a paid session without a grant as pending fulfillment", () => {
    expect(
      classifyCheckoutSessionSnapshot({
        localPaymentStatus: "CHECKOUT_COMPLETED",
        hasGrant: false,
        stripeCheckoutStatus: "complete",
        stripePaymentStatus: "paid",
      })
    ).toEqual({
      checkoutStatus: "COMPLETE",
      paymentStatus: "PAID",
      fulfillmentStatus: "PENDING",
      requiresViewerStateRefresh: false,
    });
  });

  it("classifies fulfilled, failed, and canceled terminal states", () => {
    expect(
      classifyCheckoutSessionSnapshot({
        localPaymentStatus: "SUCCEEDED",
        hasGrant: true,
      })
    ).toEqual({
      checkoutStatus: "COMPLETE",
      paymentStatus: "PAID",
      fulfillmentStatus: "FULFILLED",
      requiresViewerStateRefresh: true,
    });

    expect(
      classifyCheckoutSessionSnapshot({
        localPaymentStatus: "FAILED",
        hasGrant: false,
      })
    ).toEqual({
      checkoutStatus: "COMPLETE",
      paymentStatus: "UNPAID",
      fulfillmentStatus: "FAILED",
      requiresViewerStateRefresh: false,
    });

    expect(
      classifyCheckoutSessionSnapshot({
        localPaymentStatus: "CANCELED",
        hasGrant: false,
      })
    ).toEqual({
      checkoutStatus: "EXPIRED",
      paymentStatus: "UNPAID",
      fulfillmentStatus: "CANCELED",
      requiresViewerStateRefresh: false,
    });
  });
});
