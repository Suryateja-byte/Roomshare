/**
 * Tests for GET /api/listings/[id]/viewer-state route
 */

jest.mock("next/server", () => ({
  NextResponse: {
    json: (
      data: any,
      init?: { status?: number; headers?: Record<string, string> }
    ) => {
      const headers = new Map<string, string>();
      if (init?.headers) {
        for (const [k, v] of Object.entries(init.headers)) {
          headers.set(k, v);
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

jest.mock("@/lib/prisma", () => ({
  prisma: {
    listing: { findUnique: jest.fn() },
    review: { findFirst: jest.fn() },
    booking: { findFirst: jest.fn() },
  },
}));

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/logger", () => ({
  logger: { sync: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } },
  sanitizeErrorMessage: jest.fn((e: unknown) => String(e)),
}));

jest.mock("@/lib/env", () => ({
  features: {
    contactFirstListings: false,
    softHoldsEnabled: true,
  },
}));

import { GET } from "@/app/api/listings/[id]/viewer-state/route";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { features } from "@/lib/env";

const mockedFeatures = features as {
  contactFirstListings: boolean;
  softHoldsEnabled: boolean;
};

describe("GET /api/listings/[id]/viewer-state", () => {
  const mockSession = {
    user: {
      id: "user-123",
      name: "Test User",
      email: "test@example.com",
      emailVerified: new Date("2026-04-01T12:00:00.000Z"),
    },
  };

  const routeContext = { params: Promise.resolve({ id: "listing-123" }) };

  const createRequest = (): Request =>
    new Request("http://localhost/api/listings/listing-123/viewer-state", {
      method: "GET",
    });

  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue(mockSession);
    (prisma.listing.findUnique as jest.Mock).mockResolvedValue({
      ownerId: "owner-456",
      status: "ACTIVE",
      availabilitySource: "LEGACY_BOOKING",
      availableSlots: 2,
      totalSlots: 3,
      openSlots: null,
      moveInDate: new Date("2026-05-01T00:00:00.000Z"),
      availableUntil: null,
      minStayMonths: 1,
      lastConfirmedAt: null,
      statusReason: null,
    });
    (prisma.review.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.booking.findFirst as jest.Mock).mockResolvedValue(null);
    mockedFeatures.contactFirstListings = false;
    mockedFeatures.softHoldsEnabled = true;
  });

  it("returns isLoggedIn: false for unauthenticated user with 200 status", async () => {
    (auth as jest.Mock).mockResolvedValue(null);

    const response = await GET(createRequest(), routeContext);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.isLoggedIn).toBe(false);
    expect(data.hasBookingHistory).toBe(false);
    expect(data.existingReview).toBeNull();
    expect(data.primaryCta).toBe("LOGIN_TO_MESSAGE");
    expect(data.canContact).toBe(false);
    expect(data.availabilitySource).toBe("LEGACY_BOOKING");
    expect(data.canBook).toBe(false);
    expect(data.canHold).toBe(false);
    expect(data.bookingDisabledReason).toBe("LOGIN_REQUIRED");
    expect(data.reviewEligibility).toEqual({
      canPublicReview: false,
      hasLegacyAcceptedBooking: false,
      canLeavePrivateFeedback: false,
      reason: "LOGIN_REQUIRED",
    });
  });

  it("returns hasBookingHistory: true when ACCEPTED booking exists", async () => {
    (prisma.booking.findFirst as jest.Mock).mockResolvedValue({
      id: "booking-1",
    });

    const response = await GET(createRequest(), routeContext);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.isLoggedIn).toBe(true);
    expect(data.hasBookingHistory).toBe(true);
    expect(data.primaryCta).toBe("CONTACT_HOST");
    expect(data.canContact).toBe(true);
    expect(data.availabilitySource).toBe("LEGACY_BOOKING");
    expect(data.canBook).toBe(true);
    expect(data.canHold).toBe(true);
    expect(data.bookingDisabledReason).toBeNull();
    expect(data.reviewEligibility).toEqual({
      canPublicReview: true,
      hasLegacyAcceptedBooking: true,
      canLeavePrivateFeedback: false,
      reason: "ELIGIBLE",
    });
  });

  it("returns hasBookingHistory: false when no ACCEPTED booking exists", async () => {
    (prisma.booking.findFirst as jest.Mock).mockResolvedValue(null);

    const response = await GET(createRequest(), routeContext);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.hasBookingHistory).toBe(false);
    expect(data.canBook).toBe(true);
    expect(data.canHold).toBe(true);
    expect(data.reviewEligibility).toEqual({
      canPublicReview: false,
      hasLegacyAcceptedBooking: false,
      canLeavePrivateFeedback: false,
      reason: "ACCEPTED_BOOKING_REQUIRED",
    });
  });

  it("returns existingReview with correct shape when review exists", async () => {
    const createdAt = new Date("2025-01-15T10:00:00Z");
    (prisma.review.findFirst as jest.Mock).mockResolvedValue({
      id: "review-1",
      rating: 4,
      comment: "Great place!",
      createdAt,
    });

    const response = await GET(createRequest(), routeContext);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.existingReview).toEqual({
      id: "review-1",
      rating: 4,
      comment: "Great place!",
      createdAt: createdAt.toISOString(),
    });
    expect(data.reviewEligibility).toEqual({
      canPublicReview: false,
      hasLegacyAcceptedBooking: false,
      canLeavePrivateFeedback: false,
      reason: "ALREADY_REVIEWED",
    });
  });

  it("returns existingReview: null when no review exists", async () => {
    (prisma.review.findFirst as jest.Mock).mockResolvedValue(null);

    const response = await GET(createRequest(), routeContext);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.existingReview).toBeNull();
  });

  it("returns default state on database error (graceful degradation)", async () => {
    (prisma.review.findFirst as jest.Mock).mockRejectedValue(
      new Error("DB error")
    );

    const response = await GET(createRequest(), routeContext);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.isLoggedIn).toBe(true);
    expect(data.hasBookingHistory).toBe(false);
    expect(data.existingReview).toBeNull();
    expect(data.primaryCta).toBe("CONTACT_HOST");
    expect(data.canContact).toBe(true);
    expect(data.availabilitySource).toBe("LEGACY_BOOKING");
    expect(data.canBook).toBe(true);
    expect(data.canHold).toBe(true);
    expect(data.reviewEligibility).toEqual({
      canPublicReview: false,
      hasLegacyAcceptedBooking: false,
      canLeavePrivateFeedback: false,
      reason: "ACCEPTED_BOOKING_REQUIRED",
    });
  });

  it("sets Cache-Control: private, no-store header", async () => {
    const response = await GET(createRequest(), routeContext);

    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("keeps row-driven LEGACY_BOOKING source when contact-first listings are enabled", async () => {
    mockedFeatures.contactFirstListings = true;

    const response = await GET(createRequest(), routeContext);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.primaryCta).toBe("CONTACT_HOST");
    expect(data.canContact).toBe(true);
    expect(data.availabilitySource).toBe("LEGACY_BOOKING");
    expect(data.canBook).toBe(false);
    expect(data.canHold).toBe(false);
    expect(data.bookingDisabledReason).toBe("CONTACT_ONLY");
  });

  it("returns HOST_MANAGED from the listing row and hides unavailable host-managed listings", async () => {
    (prisma.listing.findUnique as jest.Mock).mockResolvedValue({
      ownerId: "owner-456",
      status: "ACTIVE",
      availabilitySource: "HOST_MANAGED",
      availableSlots: 2,
      totalSlots: 3,
      openSlots: 0,
      moveInDate: new Date("2026-05-01T00:00:00.000Z"),
      availableUntil: null,
      minStayMonths: 1,
      lastConfirmedAt: null,
      statusReason: null,
    });

    const response = await GET(createRequest(), routeContext);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.availabilitySource).toBe("HOST_MANAGED");
    expect(data.canContact).toBe(false);
    expect(data.canBook).toBe(false);
    expect(data.canHold).toBe(false);
    expect(data.bookingDisabledReason).toBe("LISTING_UNAVAILABLE");
  });

  it("returns verify-email CTA when the viewer is logged in but unverified", async () => {
    (auth as jest.Mock).mockResolvedValue({
      user: {
        ...mockSession.user,
        emailVerified: null,
      },
    });

    const response = await GET(createRequest(), routeContext);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.primaryCta).toBe("VERIFY_EMAIL_TO_MESSAGE");
    expect(data.canContact).toBe(false);
    expect(data.canBook).toBe(false);
    expect(data.canHold).toBe(false);
    expect(data.bookingDisabledReason).toBe("EMAIL_VERIFICATION_REQUIRED");
  });
});
