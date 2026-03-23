/**
 * Tests for GET /api/listings/[id]/can-delete route
 */

jest.mock("next/server", () => ({
  NextResponse: {
    json: (data: any, init?: { status?: number }) => ({
      status: init?.status || 200,
      json: async () => data,
      headers: new Map(),
    }),
  },
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    listing: { findUnique: jest.fn() },
    booking: { count: jest.fn() },
    conversation: { count: jest.fn() },
  },
}));

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/with-rate-limit", () => ({
  withRateLimit: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/lib/logger", () => ({
  logger: { sync: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } },
  sanitizeErrorMessage: jest.fn((e: unknown) => String(e)),
}));

jest.mock("@sentry/nextjs", () => ({
  captureException: jest.fn(),
}));

import { GET } from "@/app/api/listings/[id]/can-delete/route";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
// Sentry is mocked above; no direct import needed

describe("GET /api/listings/[id]/can-delete", () => {
  const mockSession = {
    user: { id: "user-123", name: "Test User", email: "test@example.com" },
  };

  const routeContext = { params: Promise.resolve({ id: "listing-123" }) };

  const createRequest = (): Request =>
    new Request("http://localhost/api/listings/listing-123/can-delete", {
      method: "GET",
    });

  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue(mockSession);
    (prisma.listing.findUnique as jest.Mock).mockResolvedValue({
      ownerId: "user-123",
    });
    (prisma.booking.count as jest.Mock).mockResolvedValue(0);
    (prisma.conversation.count as jest.Mock).mockResolvedValue(0);
  });

  it("returns 401 when not authenticated", async () => {
    (auth as jest.Mock).mockResolvedValue(null);

    const response = await GET(createRequest(), routeContext);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 404 when listing not found", async () => {
    (prisma.listing.findUnique as jest.Mock).mockResolvedValue(null);

    const response = await GET(createRequest(), routeContext);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Listing not found");
  });

  it("returns 404 when user is not the owner", async () => {
    (prisma.listing.findUnique as jest.Mock).mockResolvedValue({
      ownerId: "other-user-456",
    });

    const response = await GET(createRequest(), routeContext);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Listing not found");
  });

  it("returns canDelete: true when no active bookings", async () => {
    (prisma.booking.count as jest.Mock).mockResolvedValue(0);

    const response = await GET(createRequest(), routeContext);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.canDelete).toBe(true);
    expect(data.activeBookings).toBe(0);
  });

  it("returns canDelete: false when active bookings exist", async () => {
    (prisma.booking.count as jest.Mock)
      .mockResolvedValueOnce(2) // active ACCEPTED bookings
      .mockResolvedValueOnce(0); // pending bookings

    const response = await GET(createRequest(), routeContext);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.canDelete).toBe(false);
    expect(data.activeBookings).toBe(2);
  });

  it("returns pending booking and conversation counts", async () => {
    (prisma.booking.count as jest.Mock)
      .mockResolvedValueOnce(0) // active ACCEPTED bookings
      .mockResolvedValueOnce(3); // pending bookings
    (prisma.conversation.count as jest.Mock).mockResolvedValue(5);

    const response = await GET(createRequest(), routeContext);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.pendingBookings).toBe(3);
    expect(data.activeConversations).toBe(5);
  });

  it("returns 500 on database error", async () => {
    (prisma.listing.findUnique as jest.Mock).mockRejectedValue(
      new Error("DB connection error")
    );

    const response = await GET(createRequest(), routeContext);

    expect(response.status).toBe(500);
  });

  it("does not leak internal error details in 500 response", async () => {
    (prisma.listing.findUnique as jest.Mock).mockRejectedValue(
      new Error("SELECT * FROM listing WHERE id = $1 failed")
    );

    const response = await GET(createRequest(), routeContext);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Internal Server Error");
    expect(JSON.stringify(data)).not.toContain("SELECT");
    expect(JSON.stringify(data)).not.toContain("FROM listing");
  });
});
