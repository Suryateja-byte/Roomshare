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

import { GET } from "@/app/api/listings/[id]/viewer-state/route";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

describe("GET /api/listings/[id]/viewer-state", () => {
  const mockSession = {
    user: { id: "user-123", name: "Test User", email: "test@example.com" },
  };

  const routeContext = { params: Promise.resolve({ id: "listing-123" }) };

  const createRequest = (): Request =>
    new Request("http://localhost/api/listings/listing-123/viewer-state", {
      method: "GET",
    });

  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue(mockSession);
    (prisma.review.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.booking.findFirst as jest.Mock).mockResolvedValue(null);
  });

  it("returns isLoggedIn: false for unauthenticated user with 200 status", async () => {
    (auth as jest.Mock).mockResolvedValue(null);

    const response = await GET(createRequest(), routeContext);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.isLoggedIn).toBe(false);
    expect(data.hasBookingHistory).toBe(false);
    expect(data.existingReview).toBeNull();
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
  });

  it("returns hasBookingHistory: false when no ACCEPTED booking exists", async () => {
    (prisma.booking.findFirst as jest.Mock).mockResolvedValue(null);

    const response = await GET(createRequest(), routeContext);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.hasBookingHistory).toBe(false);
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
  });

  it("sets Cache-Control: private, no-store header", async () => {
    const response = await GET(createRequest(), routeContext);

    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
