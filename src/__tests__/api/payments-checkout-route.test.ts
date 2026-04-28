jest.mock("next/server", () => ({
  NextResponse: {
    json: (
      data: unknown,
      init?: { status?: number; headers?: Record<string, string> }
    ) => {
      const headers = new Map<string, string>();
      if (init?.headers) {
        for (const [key, value] of Object.entries(init.headers)) {
          headers.set(key, value);
        }
      }
      return {
        status: init?.status || 200,
        json: async () => data,
        headers,
      };
    },
  },
}));

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/app/actions/suspension", () => ({
  checkSuspension: jest.fn().mockResolvedValue({ suspended: false }),
  checkEmailVerified: jest.fn().mockResolvedValue({ verified: true }),
}));

jest.mock("@/lib/api-error-handler", () => ({
  captureApiError: jest.fn((error: unknown) => {
    throw error;
  }),
}));

jest.mock("@/lib/env", () => ({
  features: {
    contactPaywall: true,
    searchAlertPaywall: false,
    disablePayments: false,
  },
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    listing: {
      findUnique: jest.fn(),
    },
    payment: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    paymentAbuseSignal: {
      count: jest.fn(),
      create: jest.fn(),
    },
  },
}));

jest.mock("@/lib/with-rate-limit", () => ({
  withRateLimit: jest.fn().mockResolvedValue(null),
}));

const mockEvaluateMessageStartPaywall = jest.fn();
const mockEvaluateContactPaywall = jest.fn();
jest.mock("@/lib/payments/contact-paywall", () => ({
  evaluateMessageStartPaywall: (...args: unknown[]) =>
    mockEvaluateMessageStartPaywall(...args),
  evaluateContactPaywall: (...args: unknown[]) =>
    mockEvaluateContactPaywall(...args),
}));

const mockEvaluateSavedSearchAlertPaywall = jest.fn();
jest.mock("@/lib/payments/search-alert-paywall", () => ({
  evaluateSavedSearchAlertPaywall: (...args: unknown[]) =>
    mockEvaluateSavedSearchAlertPaywall(...args),
}));

const mockCreateCheckoutSession = jest.fn();
jest.mock("@/lib/payments/stripe", () => ({
  getStripeClient: () => ({
    checkout: {
      sessions: {
        create: (...args: unknown[]) => mockCreateCheckoutSession(...args),
      },
    },
  }),
  getStripePriceId: jest.fn().mockReturnValue("price_contact_pack"),
}));

jest.mock("@/lib/payments/telemetry", () => ({
  recordCheckoutSessionCreated: jest.fn(),
  recordPaywallBypassMissingUnitId: jest.fn(),
}));

import { POST } from "@/app/api/payments/checkout/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { features } from "@/lib/env";

const mockedFeatures = features as {
  contactPaywall: boolean;
  searchAlertPaywall: boolean;
  disablePayments: boolean;
};

describe("POST /api/payments/checkout", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedFeatures.contactPaywall = true;
    mockedFeatures.searchAlertPaywall = false;
    mockedFeatures.disablePayments = false;
    (auth as jest.Mock).mockResolvedValue({
      user: {
        id: "user-123",
        email: "user@example.com",
        emailVerified: new Date("2026-04-01T00:00:00.000Z"),
      },
    });
    (prisma.listing.findUnique as jest.Mock).mockResolvedValue({
      id: "listing-123",
      ownerId: "owner-456",
      physicalUnitId: "unit-123",
      title: "Sunny room",
      status: "ACTIVE",
      statusReason: null,
      needsMigrationReview: false,
      availabilitySource: "HOST_MANAGED",
      availableSlots: 1,
      totalSlots: 1,
      openSlots: 1,
      moveInDate: new Date("2026-05-01T00:00:00.000Z"),
      availableUntil: null,
      minStayMonths: 1,
      lastConfirmedAt: new Date("2026-04-20T00:00:00.000Z"),
    });
    mockEvaluateMessageStartPaywall.mockResolvedValue({
      summary: {
        enabled: true,
        mode: "PAYWALL_REQUIRED",
        freeContactsRemaining: 0,
        packContactsRemaining: 0,
        activePassExpiresAt: null,
        requiresPurchase: true,
        offers: [],
      },
      unitId: "unit-123",
      unitIdentityEpoch: 3,
    });
    mockEvaluateContactPaywall.mockResolvedValue({
      summary: {
        enabled: true,
        mode: "PAYWALL_REQUIRED",
        freeContactsRemaining: 0,
        packContactsRemaining: 0,
        activePassExpiresAt: null,
        requiresPurchase: true,
        offers: [],
      },
      unitId: "unit-123",
      unitIdentityEpoch: 3,
    });
    mockCreateCheckoutSession.mockResolvedValue({
      id: "cs_test_123",
      payment_intent: null,
      url: "https://checkout.stripe.com/pay/cs_test_123",
    });
    mockEvaluateSavedSearchAlertPaywall.mockResolvedValue({
      enabled: true,
      mode: "PAYWALL_REQUIRED",
      activePassExpiresAt: null,
      requiresPurchase: true,
      offers: [],
    });
    (prisma.payment.create as jest.Mock).mockResolvedValue({
      id: "payment-123",
    });
    (prisma.payment.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.paymentAbuseSignal.count as jest.Mock).mockResolvedValue(0);
    (prisma.paymentAbuseSignal.create as jest.Mock).mockResolvedValue({
      id: "signal-123",
    });
  });

  it("returns 404 when the paywall feature is off", async () => {
    mockedFeatures.contactPaywall = false;

    const response = await POST(
      new Request("http://localhost/api/payments/checkout", {
        method: "POST",
        headers: {
          origin: "http://localhost",
          host: "localhost",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          listingId: "listing-123",
          productCode: "CONTACT_PACK_3",
        }),
      })
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Not found" });
  });

  it("returns 503 when payments are disabled by kill switch", async () => {
    mockedFeatures.disablePayments = true;

    const response = await POST(
      new Request("http://localhost/api/payments/checkout", {
        method: "POST",
        headers: {
          origin: "http://localhost",
          host: "localhost",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          listingId: "listing-123",
          productCode: "CONTACT_PACK_3",
        }),
      })
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Payments are temporarily unavailable. Please try again shortly.",
      code: "PAYMENTS_DISABLED",
    });
    expect(mockCreateCheckoutSession).not.toHaveBeenCalled();
  });

  it("creates a Stripe Checkout session with metadata for a paywalled contact", async () => {
    const response = await POST(
      new Request("http://localhost/api/payments/checkout", {
        method: "POST",
        headers: {
          origin: "http://localhost",
          host: "localhost",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          listingId: "listing-123",
          productCode: "CONTACT_PACK_3",
        }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      checkoutUrl: "https://checkout.stripe.com/pay/cs_test_123",
      sessionId: "cs_test_123",
    });
    expect(mockCreateCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "payment",
        payment_method_types: ["card"],
        success_url:
          "http://localhost/listings/listing-123?contactCheckout=success&session_id={CHECKOUT_SESSION_ID}",
        cancel_url:
          "http://localhost/listings/listing-123?contactCheckout=cancelled",
        line_items: [
          {
            price: "price_contact_pack",
            quantity: 1,
          },
        ],
        metadata: expect.objectContaining({
          purchaseContext: "CONTACT_HOST",
          userId: "user-123",
          listingId: "listing-123",
          unitId: "unit-123",
          unitIdentityEpoch: "3",
          productCode: "CONTACT_PACK_3",
          contactKind: "MESSAGE_START",
        }),
        payment_intent_data: expect.objectContaining({
          metadata: expect.objectContaining({
            userId: "user-123",
            listingId: "listing-123",
          }),
        }),
      })
    );
    expect(prisma.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-123",
        productCode: "CONTACT_PACK_3",
        status: "CHECKOUT_CREATED",
        stripeCheckoutSessionId: "cs_test_123",
        stripePaymentIntentId: null,
        amount: "4.99",
        currency: "usd",
      }),
    });
  });

  it("passes a scoped Stripe idempotency key when the client provides one", async () => {
    const response = await POST(
      new Request("http://localhost/api/payments/checkout", {
        method: "POST",
        headers: {
          origin: "http://localhost",
          host: "localhost",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          listingId: "listing-123",
          productCode: "CONTACT_PACK_3",
          clientIdempotencyKey: "idem-123",
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(mockCreateCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          purchaseContext: "CONTACT_HOST",
        }),
      }),
      {
        idempotencyKey:
          "checkout:user-123:CONTACT_HOST:listing-123:CONTACT_PACK_3:idem-123",
      }
    );
  });

  it("returns the checkout session when local payment persistence sees a duplicate Stripe session", async () => {
    (prisma.payment.create as jest.Mock).mockRejectedValue({ code: "P2002" });
    (prisma.payment.findUnique as jest.Mock).mockResolvedValue({
      userId: "user-123",
      productCode: "CONTACT_PACK_3",
      metadata: {
        purchaseContext: "CONTACT_HOST",
        userId: "user-123",
        listingId: "listing-123",
        unitId: "unit-123",
        unitIdentityEpoch: "3",
        productCode: "CONTACT_PACK_3",
        contactKind: "MESSAGE_START",
      },
    });

    const response = await POST(
      new Request("http://localhost/api/payments/checkout", {
        method: "POST",
        headers: {
          origin: "http://localhost",
          host: "localhost",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          listingId: "listing-123",
          productCode: "CONTACT_PACK_3",
          clientIdempotencyKey: "idem-123",
        }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      checkoutUrl: "https://checkout.stripe.com/pay/cs_test_123",
      sessionId: "cs_test_123",
    });
  });

  it("fails closed when duplicate Stripe session metadata belongs to another checkout", async () => {
    (prisma.payment.create as jest.Mock).mockRejectedValue({ code: "P2002" });
    (prisma.payment.findUnique as jest.Mock).mockResolvedValue({
      userId: "other-user",
      productCode: "CONTACT_PACK_3",
      metadata: {
        purchaseContext: "CONTACT_HOST",
        userId: "other-user",
        listingId: "listing-999",
        unitId: "unit-999",
        unitIdentityEpoch: "1",
        productCode: "CONTACT_PACK_3",
        contactKind: "MESSAGE_START",
      },
    });

    await expect(
      POST(
        new Request("http://localhost/api/payments/checkout", {
          method: "POST",
          headers: {
            origin: "http://localhost",
            host: "localhost",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            listingId: "listing-123",
            productCode: "CONTACT_PACK_3",
            clientIdempotencyKey: "idem-123",
          }),
        })
      )
    ).rejects.toThrow(
      "Stripe checkout session already exists with mismatched metadata"
    );
  });

  it("creates phone reveal checkout metadata with the phone reveal return param", async () => {
    const response = await POST(
      new Request("http://localhost/api/payments/checkout", {
        method: "POST",
        headers: {
          origin: "http://localhost",
          host: "localhost",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          purchaseContext: "PHONE_REVEAL",
          listingId: "listing-123",
          productCode: "CONTACT_PACK_3",
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(mockEvaluateContactPaywall).toHaveBeenCalledWith({
      userId: "user-123",
      physicalUnitId: "unit-123",
      contactKind: "REVEAL_PHONE",
    });
    expect(mockCreateCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        success_url:
          "http://localhost/listings/listing-123?phoneRevealCheckout=success&session_id={CHECKOUT_SESSION_ID}",
        cancel_url:
          "http://localhost/listings/listing-123?phoneRevealCheckout=cancelled",
        metadata: expect.objectContaining({
          purchaseContext: "PHONE_REVEAL",
          contactKind: "REVEAL_PHONE",
        }),
      })
    );
  });

  it("returns 409 when the listing should bypass paywall enforcement", async () => {
    mockEvaluateMessageStartPaywall.mockResolvedValue({
      summary: {
        enabled: true,
        mode: "MIGRATION_BYPASS",
        freeContactsRemaining: 2,
        packContactsRemaining: 0,
        activePassExpiresAt: null,
        requiresPurchase: false,
        offers: [],
      },
      unitId: null,
      unitIdentityEpoch: null,
    });

    const response = await POST(
      new Request("http://localhost/api/payments/checkout", {
        method: "POST",
        headers: {
          origin: "http://localhost",
          host: "localhost",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          listingId: "listing-123",
          productCode: "CONTACT_PACK_3",
        }),
      })
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "This listing does not require purchase right now.",
    });
  });

  it("accepts saved-search alerts checkout only for MOVERS_PASS_30D", async () => {
    mockedFeatures.searchAlertPaywall = true;

    const response = await POST(
      new Request("http://localhost/api/payments/checkout", {
        method: "POST",
        headers: {
          origin: "http://localhost",
          host: "localhost",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          purchaseContext: "SEARCH_ALERTS",
          productCode: "MOVERS_PASS_30D",
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(mockCreateCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        success_url:
          "http://localhost/saved-searches?alertsCheckout=success&session_id={CHECKOUT_SESSION_ID}",
        cancel_url: "http://localhost/saved-searches?alertsCheckout=cancelled",
        metadata: expect.objectContaining({
          purchaseContext: "SEARCH_ALERTS",
          userId: "user-123",
          productCode: "MOVERS_PASS_30D",
          contactKind: "MESSAGE_START",
        }),
      })
    );
  });

  it("rejects CONTACT_PACK_3 for saved-search alerts", async () => {
    mockedFeatures.searchAlertPaywall = true;

    const response = await POST(
      new Request("http://localhost/api/payments/checkout", {
        method: "POST",
        headers: {
          origin: "http://localhost",
          host: "localhost",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          purchaseContext: "SEARCH_ALERTS",
          productCode: "CONTACT_PACK_3",
        }),
      })
    );

    expect(response.status).toBe(400);
  });
});
