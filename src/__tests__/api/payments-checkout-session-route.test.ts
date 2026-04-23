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

jest.mock("@/lib/api-error-handler", () => ({
  captureApiError: jest.fn((error: unknown) => {
    throw error;
  }),
}));

jest.mock("@/lib/env", () => ({
  features: {
    contactPaywall: true,
    searchAlertPaywall: false,
  },
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    payment: {
      findUnique: jest.fn(),
    },
    entitlementGrant: {
      findUnique: jest.fn(),
    },
  },
}));

const mockRetrieveCheckoutSession = jest.fn();
jest.mock("@/lib/payments/stripe", () => ({
  getStripeClient: () => ({
    checkout: {
      sessions: {
        retrieve: (...args: unknown[]) => mockRetrieveCheckoutSession(...args),
      },
    },
  }),
}));

const mockRecordCheckoutStatusForeignSession = jest.fn();
jest.mock("@/lib/payments/telemetry", () => ({
  recordCheckoutStatusForeignSession: (...args: unknown[]) =>
    mockRecordCheckoutStatusForeignSession(...args),
}));

jest.mock("@/lib/with-rate-limit", () => ({
  withRateLimit: jest.fn().mockResolvedValue(null),
}));

import { GET } from "@/app/api/payments/checkout-session/route";
import { auth } from "@/auth";
import { features } from "@/lib/env";
import { prisma } from "@/lib/prisma";

const mockedFeatures = features as {
  contactPaywall: boolean;
  searchAlertPaywall: boolean;
};

describe("GET /api/payments/checkout-session", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedFeatures.contactPaywall = true;
    mockedFeatures.searchAlertPaywall = false;
    (auth as jest.Mock).mockResolvedValue({
      user: {
        id: "user-123",
        email: "user@example.com",
      },
    });
    (prisma.payment.findUnique as jest.Mock).mockResolvedValue({
      id: "payment-123",
      userId: "user-123",
      productCode: "CONTACT_PACK_3",
      status: "CHECKOUT_COMPLETED",
      metadata: {
        purchaseContext: "CONTACT_HOST",
        userId: "user-123",
        listingId: "listing-123",
        unitId: "unit-123",
        unitIdentityEpoch: 3,
        productCode: "CONTACT_PACK_3",
        contactKind: "MESSAGE_START",
      },
    });
    (prisma.entitlementGrant.findUnique as jest.Mock).mockResolvedValue(null);
    mockRetrieveCheckoutSession.mockResolvedValue({
      id: "cs_test_123",
      status: "complete",
      payment_status: "paid",
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
  });

  it("returns 401 when the caller is not authenticated", async () => {
    (auth as jest.Mock).mockResolvedValue(null);

    const response = await GET(
      new Request(
        "http://localhost/api/payments/checkout-session?session_id=cs_test_123&listing_id=listing-123"
      )
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("returns 404 for foreign or mismatched checkout sessions", async () => {
    (prisma.payment.findUnique as jest.Mock).mockResolvedValue({
      id: "payment-123",
      userId: "user-123",
      productCode: "CONTACT_PACK_3",
      status: "CHECKOUT_COMPLETED",
      metadata: {
        purchaseContext: "CONTACT_HOST",
        userId: "user-123",
        listingId: "listing-999",
        unitId: "unit-123",
        unitIdentityEpoch: 3,
        productCode: "CONTACT_PACK_3",
        contactKind: "MESSAGE_START",
      },
    });

    const response = await GET(
      new Request(
        "http://localhost/api/payments/checkout-session?session_id=cs_test_123&listing_id=listing-123"
      )
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Not found" });
    expect(mockRecordCheckoutStatusForeignSession).toHaveBeenCalledWith({
      userId: "user-123",
      purchaseContext: "CONTACT_HOST",
      listingId: "listing-123",
      sessionId: "cs_test_123",
    });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("returns pending fulfillment when payment is complete but grant is not active yet", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/payments/checkout-session?session_id=cs_test_123&listing_id=listing-123"
      )
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      sessionId: "cs_test_123",
      purchaseContext: "CONTACT_HOST",
      listingId: "listing-123",
      productCode: "CONTACT_PACK_3",
      checkoutStatus: "COMPLETE",
      paymentStatus: "PAID",
      fulfillmentStatus: "PENDING",
      requiresViewerStateRefresh: false,
    });
    expect(mockRetrieveCheckoutSession).toHaveBeenCalledWith("cs_test_123");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("returns fulfilled without reloading Stripe when an active grant already exists", async () => {
    (prisma.payment.findUnique as jest.Mock).mockResolvedValue({
      id: "payment-123",
      userId: "user-123",
      productCode: "CONTACT_PACK_3",
      status: "SUCCEEDED",
      metadata: {
        purchaseContext: "CONTACT_HOST",
        userId: "user-123",
        listingId: "listing-123",
        unitId: "unit-123",
        unitIdentityEpoch: 3,
        productCode: "CONTACT_PACK_3",
        contactKind: "MESSAGE_START",
      },
    });
    (prisma.entitlementGrant.findUnique as jest.Mock).mockResolvedValue({
      id: "grant-123",
      status: "ACTIVE",
    });

    const response = await GET(
      new Request(
        "http://localhost/api/payments/checkout-session?session_id=cs_test_123&listing_id=listing-123"
      )
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      sessionId: "cs_test_123",
      purchaseContext: "CONTACT_HOST",
      listingId: "listing-123",
      productCode: "CONTACT_PACK_3",
      checkoutStatus: "COMPLETE",
      paymentStatus: "PAID",
      fulfillmentStatus: "FULFILLED",
      requiresViewerStateRefresh: true,
    });
    expect(mockRetrieveCheckoutSession).not.toHaveBeenCalled();
  });

  it("supports saved-search alerts checkout-session polling by context", async () => {
    mockedFeatures.searchAlertPaywall = true;
    (prisma.payment.findUnique as jest.Mock).mockResolvedValue({
      id: "payment-123",
      userId: "user-123",
      productCode: "MOVERS_PASS_30D",
      status: "SUCCEEDED",
      metadata: {
        purchaseContext: "SEARCH_ALERTS",
        userId: "user-123",
        productCode: "MOVERS_PASS_30D",
        contactKind: "MESSAGE_START",
      },
    });
    (prisma.entitlementGrant.findUnique as jest.Mock).mockResolvedValue({
      id: "grant-123",
      status: "ACTIVE",
    });

    const response = await GET(
      new Request(
        "http://localhost/api/payments/checkout-session?session_id=cs_test_123&context=SEARCH_ALERTS"
      )
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      sessionId: "cs_test_123",
      purchaseContext: "SEARCH_ALERTS",
      listingId: null,
      productCode: "MOVERS_PASS_30D",
      checkoutStatus: "COMPLETE",
      paymentStatus: "PAID",
      fulfillmentStatus: "FULFILLED",
      requiresViewerStateRefresh: false,
    });
  });
});
