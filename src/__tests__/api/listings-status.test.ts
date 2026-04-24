/**
 * Tests for GET /api/listings/[id]/status route.
 *
 * This route stays public, but under the privacy-first status contract it
 * becomes auth-aware and returns a public-safe snapshot for guests while
 * preserving recovery diagnostics for owners/admins.
 */

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    listing: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock("@/lib/with-rate-limit", () => ({
  withRateLimit: jest.fn().mockResolvedValue(null),
}));

jest.mock("next/server", () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number; headers?: HeadersInit }) => ({
      status: init?.status ?? 200,
      json: async () => data,
      headers: new Headers(init?.headers),
    }),
  },
}));

import { auth } from "@/auth";
import { GET } from "@/app/api/listings/[id]/status/route";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";

const mockedAuth = auth as jest.Mock;

function buildPrivacyFirstListing(overrides: Record<string, unknown> = {}) {
  return {
    id: "listing-123",
    ownerId: "owner-123",
    version: 7,
    availabilitySource: "HOST_MANAGED",
    status: "ACTIVE",
    statusReason: null,
    availableSlots: 1,
    totalSlots: 1,
    openSlots: 1,
    moveInDate: new Date("2026-05-01T00:00:00.000Z"),
    availableUntil: null,
    minStayMonths: 1,
    lastConfirmedAt: new Date("2026-04-01T12:00:00.000Z"),
    needsMigrationReview: false,
    ...overrides,
  };
}

describe("GET /api/listings/[id]/status", () => {
  const mockParams = Promise.resolve({ id: "listing-123" });
  const now = new Date("2026-04-15T12:00:00.000Z");

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    jest.clearAllMocks();
    (withRateLimit as jest.Mock).mockResolvedValue(null);
    mockedAuth.mockResolvedValue(null);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("rate limiting", () => {
    it("applies rate limiting to prevent polling abuse", async () => {
      (prisma.listing.findUnique as jest.Mock).mockResolvedValue(
        buildPrivacyFirstListing({
          availabilitySource: "LEGACY_BOOKING",
          lastConfirmedAt: null,
        })
      );

      const request = new Request(
        "http://localhost/api/listings/listing-123/status"
      );
      await GET(request, { params: mockParams });

      expect(withRateLimit).toHaveBeenCalledWith(request, {
        type: "listingStatus",
      });
    });

    it("returns 429 when rate limited", async () => {
      const rateLimitResponse = {
        status: 429,
        json: async () => ({ error: "Too many requests" }),
        headers: new Headers(),
      };
      (withRateLimit as jest.Mock).mockResolvedValue(rateLimitResponse);

      const request = new Request(
        "http://localhost/api/listings/listing-123/status"
      );
      const response = await GET(request, { params: mockParams });

      expect(response.status).toBe(429);
    });
  });

  describe("canonical privacy-first status contract", () => {
    it("returns only the public-safe snapshot fields for guests", async () => {
      (prisma.listing.findUnique as jest.Mock).mockResolvedValue(
        buildPrivacyFirstListing()
      );

      const response = await GET(
        new Request("http://localhost/api/listings/listing-123/status"),
        { params: mockParams }
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("no-store");

      const data = await response.json();
      expect(data).toEqual({
        id: "listing-123",
        canManage: false,
        availabilitySource: "HOST_MANAGED",
        publicStatus: "AVAILABLE",
        searchEligible: true,
        contactDisabledReason: null,
      });
      expect(Object.keys(data)).toEqual([
        "id",
        "canManage",
        "availabilitySource",
        "publicStatus",
        "searchEligible",
        "contactDisabledReason",
      ]);
    });

    it("returns the diagnostic snapshot for the owner", async () => {
      mockedAuth.mockResolvedValue({
        user: {
          id: "owner-123",
          isAdmin: false,
        },
      });
      (prisma.listing.findUnique as jest.Mock).mockResolvedValue(
        buildPrivacyFirstListing()
      );

      const response = await GET(
        new Request("http://localhost/api/listings/listing-123/status"),
        { params: mockParams }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({
        id: "listing-123",
        canManage: true,
        version: 7,
        availabilitySource: "HOST_MANAGED",
        status: "ACTIVE",
        statusReason: null,
        publicStatus: "AVAILABLE",
        searchEligible: true,
        freshnessBucket: "REMINDER",
        lastConfirmedAt: "2026-04-01T12:00:00.000Z",
        staleAt: "2026-04-22T12:00:00.000Z",
        autoPauseAt: "2026-05-01T12:00:00.000Z",
        contactDisabledReason: null,
      });
    });

    it("returns the diagnostic snapshot for admins", async () => {
      mockedAuth.mockResolvedValue({
        user: {
          id: "someone-else",
          isAdmin: true,
        },
      });
      (prisma.listing.findUnique as jest.Mock).mockResolvedValue(
        buildPrivacyFirstListing({
          status: "PAUSED",
          statusReason: "STALE_AUTO_PAUSE",
          lastConfirmedAt: new Date("2026-03-10T12:00:00.000Z"),
        })
      );

      const response = await GET(
        new Request("http://localhost/api/listings/listing-123/status"),
        { params: mockParams }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.canManage).toBe(true);
      expect(data.statusReason).toBe("STALE_AUTO_PAUSE");
      expect(data.publicStatus).toBe("NEEDS_RECONFIRMATION");
      expect(data.searchEligible).toBe(false);
      expect(data.freshnessBucket).toBe("AUTO_PAUSE_DUE");
    });

    it("maps migration review to a public-safe reason", async () => {
      (prisma.listing.findUnique as jest.Mock).mockResolvedValue(
        buildPrivacyFirstListing({
          needsMigrationReview: true,
          statusReason: "MIGRATION_REVIEW",
        })
      );

      const response = await GET(
        new Request("http://localhost/api/listings/listing-123/status"),
        { params: mockParams }
      );

      expect(await response.json()).toEqual({
        id: "listing-123",
        canManage: false,
        availabilitySource: "HOST_MANAGED",
        publicStatus: "AVAILABLE",
        searchEligible: false,
        contactDisabledReason: "MIGRATION_REVIEW",
      });
    });

    it("maps moderation locks to a public-safe reason", async () => {
      (prisma.listing.findUnique as jest.Mock).mockResolvedValue(
        buildPrivacyFirstListing({
          status: "PAUSED",
          statusReason: "ADMIN_PAUSED",
        })
      );

      const response = await GET(
        new Request("http://localhost/api/listings/listing-123/status"),
        { params: mockParams }
      );

      expect(await response.json()).toEqual({
        id: "listing-123",
        canManage: false,
        availabilitySource: "HOST_MANAGED",
        publicStatus: "PAUSED",
        searchEligible: false,
        contactDisabledReason: "MODERATION_LOCKED",
      });
    });

    it("maps generic public unavailability to LISTING_UNAVAILABLE", async () => {
      (prisma.listing.findUnique as jest.Mock).mockResolvedValue(
        buildPrivacyFirstListing({
          status: "PAUSED",
          statusReason: "HOST_PAUSED",
          openSlots: 0,
          availableSlots: 0,
        })
      );

      const response = await GET(
        new Request("http://localhost/api/listings/listing-123/status"),
        { params: mockParams }
      );

      expect(await response.json()).toEqual({
        id: "listing-123",
        canManage: false,
        availabilitySource: "HOST_MANAGED",
        publicStatus: "PAUSED",
        searchEligible: false,
        contactDisabledReason: "LISTING_UNAVAILABLE",
      });
    });

    it("queries the additional fields needed by the shared evaluator", async () => {
      (prisma.listing.findUnique as jest.Mock).mockResolvedValue(
        buildPrivacyFirstListing()
      );

      await GET(
        new Request("http://localhost/api/listings/listing-123/status"),
        { params: mockParams }
      );

      expect(prisma.listing.findUnique).toHaveBeenCalledWith({
        where: { id: "listing-123" },
        select: {
          id: true,
          ownerId: true,
          version: true,
          status: true,
          statusReason: true,
          availableSlots: true,
          totalSlots: true,
          openSlots: true,
          moveInDate: true,
          availableUntil: true,
          minStayMonths: true,
          lastConfirmedAt: true,
        },
      });
    });

    it("returns 404 for missing listings", async () => {
      (prisma.listing.findUnique as jest.Mock).mockResolvedValue(null);

      const response = await GET(
        new Request("http://localhost/api/listings/nonexistent/status"),
        { params: Promise.resolve({ id: "nonexistent" }) }
      );

      expect(response.status).toBe(404);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(await response.json()).toEqual({ error: "Listing not found" });
    });
  });

  describe("error handling", () => {
    it("returns 500 on database error", async () => {
      (prisma.listing.findUnique as jest.Mock).mockRejectedValue(
        new Error("DB connection failed")
      );

      const response = await GET(
        new Request("http://localhost/api/listings/listing-123/status"),
        { params: mockParams }
      );

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe("Internal server error");
    });
  });
});
