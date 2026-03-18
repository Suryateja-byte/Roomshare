/**
 * Tests for GET /api/favorites route
 */

// Mock NextResponse before importing the route
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
    savedListing: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
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
}));

jest.mock("@/lib/api-error-handler", () => ({
  captureApiError: jest.fn((_error: unknown, _context: unknown) => ({
    status: 500,
    json: async () => ({ error: "Internal server error" }),
    headers: new Map(),
  })),
}));

import { GET } from "@/app/api/favorites/route";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

describe("GET /api/favorites", () => {
  const mockSession = {
    user: { id: "user-123", name: "Test User", email: "test@example.com" },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue(mockSession);
  });

  const createRequest = (ids?: string): Request =>
    new Request(
      `http://localhost/api/favorites${ids !== undefined ? `?ids=${ids}` : ""}`,
      { method: "GET" }
    );

  it("returns empty savedIds when not authenticated (200, not 401)", async () => {
    (auth as jest.Mock).mockResolvedValue(null);

    const response = await GET(createRequest("listing-1,listing-2"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.savedIds).toEqual([]);
  });

  it("returns empty savedIds when ids param is empty", async () => {
    const response = await GET(createRequest(""));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.savedIds).toEqual([]);
    expect(prisma.savedListing.findMany).not.toHaveBeenCalled();
  });

  it("returns 400 when ids validation fails (more than 60 ids)", async () => {
    const ids = Array.from({ length: 61 }, (_, i) => `listing-${i}`).join(",");

    const response = await GET(createRequest(ids));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid ids parameter");
  });

  it("returns 400 when individual id is too long (over 100 chars)", async () => {
    const longId = "a".repeat(101);

    const response = await GET(createRequest(longId));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid ids parameter");
  });

  it("returns matching savedIds for authenticated user", async () => {
    (prisma.savedListing.findMany as jest.Mock).mockResolvedValue([
      { listingId: "listing-1" },
      { listingId: "listing-2" },
    ]);

    const response = await GET(createRequest("listing-1,listing-2,listing-3"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.savedIds).toEqual(["listing-1", "listing-2"]);
    expect(prisma.savedListing.findMany).toHaveBeenCalledWith({
      where: {
        userId: "user-123",
        listingId: { in: ["listing-1", "listing-2", "listing-3"] },
      },
      select: { listingId: true },
    });
  });

  it("filters to only saved listings and does not return unsaved ones", async () => {
    (prisma.savedListing.findMany as jest.Mock).mockResolvedValue([
      { listingId: "listing-1" },
    ]);

    const response = await GET(createRequest("listing-1,listing-unsaved"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.savedIds).toEqual(["listing-1"]);
    expect(data.savedIds).not.toContain("listing-unsaved");
  });

  it("sets Cache-Control: private, no-store header", async () => {
    (prisma.savedListing.findMany as jest.Mock).mockResolvedValue([
      { listingId: "listing-1" },
    ]);

    const response = await GET(createRequest("listing-1"));

    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("returns 500 on database error via captureApiError", async () => {
    (prisma.savedListing.findMany as jest.Mock).mockRejectedValue(
      new Error("DB connection error")
    );

    const response = await GET(createRequest("listing-1"));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Internal server error");
  });
});
