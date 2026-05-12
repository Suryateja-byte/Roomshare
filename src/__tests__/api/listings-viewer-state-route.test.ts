const mockEvaluateMessageStartPaywall = jest.fn();

jest.mock("next/server", () => ({
  NextResponse: {
    json: (
      data: unknown,
      init?: { status?: number; headers?: Record<string, string> }
    ) => {
      const headers = new Map<string, string>(
        Object.entries(init?.headers || {})
      );

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

jest.mock("@/lib/env", () => ({
  features: {
    privateFeedback: true,
    contactPaywallEnforcement: true,
  },
}));

jest.mock("@/lib/with-rate-limit", () => ({
  withRateLimit: jest.fn(),
}));

jest.mock("@/lib/payments/contact-paywall", () => ({
  evaluateMessageStartPaywall: (...args: unknown[]) =>
    mockEvaluateMessageStartPaywall(...args),
}));

jest.mock("@/lib/logger", () => ({
  logger: {
    sync: {
      warn: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
    },
  },
  sanitizeErrorMessage: jest.fn((value: unknown) =>
    value instanceof Error ? value.message : String(value)
  ),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    listing: {
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    blockedUser: {
      findMany: jest.fn(),
    },
    review: {
      findFirst: jest.fn(),
    },
    conversation: {
      findFirst: jest.fn(),
    },
    report: {
      findFirst: jest.fn(),
    },
  },
}));

import { GET } from "@/app/api/listings/[id]/viewer-state/route";
import { auth } from "@/auth";
import { features } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";

describe("GET /api/listings/[id]/viewer-state", () => {
  const mockedFeatures = features as {
    privateFeedback: boolean;
    contactPaywallEnforcement: boolean;
  };
  const dayInMs = 24 * 60 * 60 * 1000;
  const freshLastConfirmedAt = () => new Date(Date.now() - dayInMs);

  function buildListing(
    overrides: Partial<{
      ownerId: string;
      status: string;
      availableSlots: number;
      totalSlots: number;
      openSlots: number;
      moveInDate: Date;
      availableUntil: Date | null;
      minStayMonths: number;
      lastConfirmedAt: Date | null;
      statusReason: string | null;
      physicalUnitId: string | null;
      owner: { isSuspended: boolean };
    }> = {}
  ) {
    return {
      ownerId: "owner-1",
      status: "ACTIVE",
      availableSlots: 1,
      totalSlots: 1,
      openSlots: 1,
      moveInDate: new Date("2026-05-01T00:00:00.000Z"),
      availableUntil: null,
      minStayMonths: 1,
      lastConfirmedAt: freshLastConfirmedAt(),
      statusReason: null,
      physicalUnitId: "unit-1",
      owner: { isSuspended: false },
      ...overrides,
    };
  }

  function callViewerState(listingId = "listing-1") {
    return GET(
      new Request(
        `http://localhost/api/listings/${listingId}/viewer-state`
      ),
      { params: Promise.resolve({ id: listingId }) }
    );
  }

  async function expectJson(response: Awaited<ReturnType<typeof GET>>) {
    return response.json();
  }

  function expectPrivateNoStore(response: Awaited<ReturnType<typeof GET>>) {
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockedFeatures.privateFeedback = true;
    mockedFeatures.contactPaywallEnforcement = true;
    (withRateLimit as jest.Mock).mockResolvedValue(null);
    (auth as jest.Mock).mockResolvedValue(null);
    (prisma.listing.findUnique as jest.Mock).mockResolvedValue(buildListing());
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      isSuspended: false,
    });
    (prisma.blockedUser.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.review.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.conversation.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.report.findFirst as jest.Mock).mockResolvedValue(null);
    mockEvaluateMessageStartPaywall.mockResolvedValue({ summary: null });
  });

  it("returns the rate-limit response before loading auth or listing data", async () => {
    const rateLimitResponse = {
      status: 429,
      headers: new Map([["Cache-Control", "no-store"]]),
      json: async () => ({ error: "Too many requests" }),
    };
    (withRateLimit as jest.Mock).mockResolvedValueOnce(rateLimitResponse);

    const response = await callViewerState();

    expect(response).toBe(rateLimitResponse);
    expect(auth).not.toHaveBeenCalled();
    expect(prisma.listing.findUnique).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      error: "Too many requests",
    });
  });

  it("returns a private anonymous contact contract without leaking internals", async () => {
    const response = await callViewerState();

    expect(response.status).toBe(200);
    expectPrivateNoStore(response);
    expect(mockEvaluateMessageStartPaywall).toHaveBeenCalledWith({
      userId: null,
      physicalUnitId: "unit-1",
    });

    const payload = await expectJson(response);
    expect(payload).toEqual(
      expect.objectContaining({
        isLoggedIn: false,
        hasBookingHistory: false,
        existingReview: null,
        primaryCta: "LOGIN_TO_MESSAGE",
        canContact: false,
        contactDisabledReason: "LOGIN_REQUIRED",
        availabilitySource: "HOST_MANAGED",
        canBook: false,
        canHold: false,
        bookingDisabledReason: "LOGIN_REQUIRED",
        paywallSummary: null,
        needsMigrationReview: false,
      })
    );
    expect(payload.publicAvailability).toEqual(
      expect.objectContaining({
        availabilitySource: "HOST_MANAGED",
        isPubliclyAvailable: true,
        searchEligible: true,
      })
    );
    expect(payload.reviewEligibility).toEqual(
      expect.objectContaining({
        canPublicReview: false,
        canLeavePrivateFeedback: false,
        reason: "LOGIN_REQUIRED",
      })
    );
    expect(JSON.stringify(payload)).not.toContain("owner-1");
    expect(payload).not.toHaveProperty("ownerId");
    expect(payload).not.toHaveProperty("physicalUnitId");
    expect(payload).not.toHaveProperty("availabilityGateReason");
  });

  it("returns a contactable authenticated viewer contract with review context", async () => {
    (auth as jest.Mock).mockResolvedValue({
      user: {
        id: "viewer-1",
        emailVerified: new Date("2026-04-01T00:00:00.000Z"),
      },
    });
    (prisma.review.findFirst as jest.Mock).mockResolvedValue({
      id: "review-1",
      rating: 5,
      comment: "Great place",
      createdAt: new Date("2026-04-10T00:00:00.000Z"),
      privateNotes: "SHOULD_NOT_LEAK",
    });
    (prisma.conversation.findFirst as jest.Mock).mockResolvedValue({
      id: "conversation-1",
    });

    const response = await callViewerState();

    expect(response.status).toBe(200);
    expectPrivateNoStore(response);
    expect(prisma.review.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: {
          id: true,
          rating: true,
          comment: true,
          createdAt: true,
        },
      })
    );

    const payload = await expectJson(response);
    expect(payload).toEqual(
      expect.objectContaining({
        isLoggedIn: true,
        primaryCta: "CONTACT_HOST",
        canContact: true,
        contactDisabledReason: null,
        bookingDisabledReason: "CONTACT_ONLY",
        existingReview: {
          id: "review-1",
          rating: 5,
          comment: "Great place",
          createdAt: "2026-04-10T00:00:00.000Z",
        },
      })
    );
    expect(payload.reviewEligibility).toEqual(
      expect.objectContaining({
        canLeavePrivateFeedback: true,
        hasLegacyAcceptedBooking: false,
        reason: "ALREADY_REVIEWED",
      })
    );
    expect(JSON.stringify(payload)).not.toContain("SHOULD_NOT_LEAK");
  });

  it("returns owner and unverified viewer auth variants without enabling contact", async () => {
    (auth as jest.Mock).mockResolvedValueOnce({
      user: {
        id: "owner-1",
        emailVerified: new Date("2026-04-01T00:00:00.000Z"),
      },
    });

    const ownerResponse = await callViewerState();
    const ownerPayload = await expectJson(ownerResponse);

    expect(ownerResponse.status).toBe(200);
    expectPrivateNoStore(ownerResponse);
    expect(ownerPayload).toEqual(
      expect.objectContaining({
        isLoggedIn: true,
        primaryCta: "EDIT_LISTING",
        canContact: false,
        contactDisabledReason: "OWNER_VIEW",
        bookingDisabledReason: "OWNER_VIEW",
      })
    );
    expect(prisma.conversation.findFirst).not.toHaveBeenCalled();
    expect(prisma.report.findFirst).not.toHaveBeenCalled();

    jest.clearAllMocks();
    (withRateLimit as jest.Mock).mockResolvedValue(null);
    (auth as jest.Mock).mockResolvedValue({
      user: { id: "viewer-1", emailVerified: null },
    });
    (prisma.listing.findUnique as jest.Mock).mockResolvedValue(buildListing());
    (prisma.review.findFirst as jest.Mock).mockResolvedValue(null);
    mockEvaluateMessageStartPaywall.mockResolvedValue({ summary: null });

    const unverifiedResponse = await callViewerState();
    const unverifiedPayload = await expectJson(unverifiedResponse);

    expect(unverifiedResponse.status).toBe(200);
    expectPrivateNoStore(unverifiedResponse);
    expect(unverifiedPayload).toEqual(
      expect.objectContaining({
        isLoggedIn: true,
        primaryCta: "VERIFY_EMAIL_TO_MESSAGE",
        canContact: false,
        contactDisabledReason: "EMAIL_VERIFICATION_REQUIRED",
        bookingDisabledReason: "EMAIL_VERIFICATION_REQUIRED",
      })
    );
    expect(unverifiedPayload.reviewEligibility.canLeavePrivateFeedback).toBe(
      false
    );
  });

  it("maps missing, unavailable, and moderation-locked listings to safe contact-disabled reasons", async () => {
    (auth as jest.Mock).mockResolvedValue({
      user: {
        id: "viewer-1",
        emailVerified: new Date("2026-04-01T00:00:00.000Z"),
      },
    });

    (prisma.listing.findUnique as jest.Mock).mockResolvedValueOnce(null);
    const missingResponse = await callViewerState("missing-listing");
    const missingPayload = await expectJson(missingResponse);

    expect(missingResponse.status).toBe(200);
    expectPrivateNoStore(missingResponse);
    expect(missingPayload).toEqual(
      expect.objectContaining({
        isLoggedIn: true,
        primaryCta: "CONTACT_HOST",
        canContact: false,
        contactDisabledReason: "LISTING_UNAVAILABLE",
        bookingDisabledReason: "LISTING_UNAVAILABLE",
        publicAvailability: null,
      })
    );

    (prisma.listing.findUnique as jest.Mock).mockResolvedValueOnce(
      buildListing({
        status: "PAUSED",
        statusReason: "HOST_PAUSED",
        availableSlots: 0,
        openSlots: 0,
      })
    );
    const unavailableResponse = await callViewerState("paused-listing");
    const unavailablePayload = await expectJson(unavailableResponse);

    expect(unavailableResponse.status).toBe(200);
    expectPrivateNoStore(unavailableResponse);
    expect(unavailablePayload.contactDisabledReason).toBe(
      "LISTING_UNAVAILABLE"
    );
    expect(unavailablePayload.publicAvailability).toEqual(
      expect.objectContaining({
        isPubliclyAvailable: false,
        searchEligible: false,
      })
    );

    (prisma.listing.findUnique as jest.Mock).mockResolvedValueOnce(
      buildListing({
        status: "PAUSED",
        statusReason: "ADMIN_PAUSED",
      })
    );
    const moderationResponse = await callViewerState("admin-paused-listing");
    const moderationPayload = await expectJson(moderationResponse);

    expect(moderationResponse.status).toBe(200);
    expectPrivateNoStore(moderationResponse);
    expect(moderationPayload.contactDisabledReason).toBe("MODERATION_LOCKED");
    expect(moderationPayload.bookingDisabledReason).toBe(
      "LISTING_UNAVAILABLE"
    );
  });

  it("enforces a paywall-required viewer state without exposing payment internals", async () => {
    (auth as jest.Mock).mockResolvedValue({
      user: {
        id: "viewer-1",
        emailVerified: new Date("2026-04-01T00:00:00.000Z"),
      },
    });
    mockEvaluateMessageStartPaywall.mockResolvedValue({
      summary: {
        state: "PURCHASE_REQUIRED",
        requiresPurchase: true,
        productCode: "CONTACT_PACK_3",
        remainingFreeMessages: 0,
      },
    });

    const response = await callViewerState();

    expect(response.status).toBe(200);
    expectPrivateNoStore(response);

    const payload = await expectJson(response);
    expect(payload).toEqual(
      expect.objectContaining({
        primaryCta: "CONTACT_HOST",
        canContact: false,
        contactDisabledReason: "PAYWALL_REQUIRED",
        bookingDisabledReason: "CONTACT_ONLY",
        paywallSummary: expect.objectContaining({
          requiresPurchase: true,
          productCode: "CONTACT_PACK_3",
        }),
      })
    );
    expect(payload).not.toHaveProperty("payment");
    expect(payload).not.toHaveProperty("paymentId");
  });

  it.each([
    {
      name: "suspended viewer",
      expectedReason: "VIEWER_SUSPENDED",
      setup: () => {
        (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({
          isSuspended: true,
        });
      },
    },
    {
      name: "suspended host",
      expectedReason: "HOST_SUSPENDED",
      setup: () => {
        (prisma.listing.findUnique as jest.Mock).mockResolvedValueOnce(
          buildListing({ owner: { isSuspended: true } })
        );
      },
    },
    {
      name: "viewer blocks host",
      expectedReason: "VIEWER_BLOCKED_HOST",
      setup: () => {
        (prisma.blockedUser.findMany as jest.Mock).mockResolvedValueOnce([
          { blockerId: "viewer-1", blockedId: "owner-1" },
        ]);
      },
    },
    {
      name: "host blocks viewer",
      expectedReason: "HOST_BLOCKED_VIEWER",
      setup: () => {
        (prisma.blockedUser.findMany as jest.Mock).mockResolvedValueOnce([
          { blockerId: "owner-1", blockedId: "viewer-1" },
        ]);
      },
    },
  ])(
    "returns explicit privacy-safe pre-click disabled state for $name",
    async ({ expectedReason, setup }) => {
      (auth as jest.Mock).mockResolvedValue({
        user: {
          id: "viewer-1",
          emailVerified: new Date("2026-04-01T00:00:00.000Z"),
        },
      });
      setup();

      const response = await callViewerState();

      expect(response.status).toBe(200);
      expectPrivateNoStore(response);

      const payload = await expectJson(response);
      expect(payload).toEqual(
        expect.objectContaining({
          primaryCta: "CONTACT_HOST",
          canContact: false,
          contactDisabledReason: expectedReason,
          canBook: false,
          canHold: false,
          bookingDisabledReason: "CONTACT_ONLY",
        })
      );
      expect(JSON.stringify(payload)).not.toContain("blockerId");
      expect(JSON.stringify(payload)).not.toContain("blockedId");
      expect(JSON.stringify(payload)).not.toContain("owner-1");
      expect(payload).not.toHaveProperty("owner");
      expect(payload).not.toHaveProperty("isSuspended");
    }
  );

  it("keeps fallback responses private and privacy-safe when authenticated context loading fails", async () => {
    (auth as jest.Mock).mockResolvedValue({
      user: {
        id: "viewer-1",
        emailVerified: new Date("2026-04-01T00:00:00.000Z"),
      },
    });
    (prisma.review.findFirst as jest.Mock).mockRejectedValue(
      new Error("review lookup failed")
    );

    const response = await callViewerState();

    expect(response.status).toBe(200);
    expectPrivateNoStore(response);

    const payload = await expectJson(response);
    expect(payload).toEqual(
      expect.objectContaining({
        isLoggedIn: true,
        existingReview: null,
        primaryCta: "CONTACT_HOST",
        canContact: true,
        contactDisabledReason: null,
      })
    );
    expect(payload.reviewEligibility).toEqual(
      expect.objectContaining({
        canPublicReview: false,
        canLeavePrivateFeedback: false,
      })
    );
  });
});
