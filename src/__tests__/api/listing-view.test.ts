/**
 * Tests for POST /api/listings/[id]/view route
 */

jest.mock("next/server", () => {
  class MockNextResponse {
    status: number;
    headers: Map<string, string>;
    private _body: unknown;

    constructor(
      body: unknown,
      init?: { status?: number; headers?: Record<string, string> }
    ) {
      this._body = body;
      this.status = init?.status || 200;
      this.headers = new Map(Object.entries(init?.headers ?? {}));
    }

    async json() {
      return this._body;
    }

    static json(data: unknown, init?: { status?: number }) {
      return new MockNextResponse(data, init);
    }
  }

  return {
    NextResponse: MockNextResponse,
    NextRequest: class MockNextRequest extends Request {
      constructor(url: string, init?: RequestInit) {
        super(url, init);
      }
    },
  };
});

jest.mock("@/lib/prisma", () => ({
  prisma: {
    listing: { update: jest.fn() },
    recentlyViewed: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/rate-limit", () => ({
  checkRateLimit: jest.fn(),
  getClientIP: jest.fn().mockReturnValue("127.0.0.1"),
  RATE_LIMITS: { viewCount: { windowMs: 60000, maxRequests: 10 } },
}));

jest.mock("@/lib/search/search-doc-dirty", () => ({
  markListingDirty: jest.fn().mockResolvedValue(undefined),
  markListingsDirty: jest.fn().mockResolvedValue(undefined),
  markListingDirtyInTx: jest.fn().mockResolvedValue(undefined),
  markListingsDirtyInTx: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/logger", () => ({
  logger: { sync: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } },
  sanitizeErrorMessage: jest.fn((e: unknown) => String(e)),
}));

import { POST } from "@/app/api/listings/[id]/view/route";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { checkRateLimit } from "@/lib/rate-limit";
// markListingDirty is mocked above; no direct import needed

describe("POST /api/listings/[id]/view", () => {
  const mockSession = {
    user: { id: "user-123", name: "Test User", email: "test@example.com" },
  };

  const routeContext = { params: Promise.resolve({ id: "listing-123" }) };

  const createRequest = (): Request =>
    new Request("http://localhost/api/listings/listing-123/view", {
      method: "POST",
    });

  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue(mockSession);
    (checkRateLimit as jest.Mock).mockResolvedValue({ success: true });
    (prisma.listing.update as jest.Mock).mockResolvedValue({});
    (prisma.recentlyViewed.upsert as jest.Mock).mockResolvedValue({});
    (prisma.recentlyViewed.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.recentlyViewed.deleteMany as jest.Mock).mockResolvedValue({});
  });

  it("returns 204 on successful view tracking for authenticated user", async () => {
    const response = await POST(createRequest(), routeContext);

    expect(response.status).toBe(204);
  });

  it("returns 204 on successful view tracking for unauthenticated user", async () => {
    (auth as jest.Mock).mockResolvedValue(null);

    const response = await POST(createRequest(), routeContext);

    expect(response.status).toBe(204);
  });

  it("returns 204 when rate-limited and does not increment viewCount", async () => {
    (checkRateLimit as jest.Mock).mockResolvedValue({ success: false });

    const response = await POST(createRequest(), routeContext);

    expect(response.status).toBe(204);
    expect(prisma.listing.update).not.toHaveBeenCalled();
  });

  it("increments listing viewCount on success", async () => {
    await POST(createRequest(), routeContext);

    expect(prisma.listing.update).toHaveBeenCalledWith({
      where: { id: "listing-123" },
      data: { viewCount: { increment: 1 } },
    });
  });

  it("upserts recentlyViewed for authenticated user", async () => {
    await POST(createRequest(), routeContext);

    expect(prisma.recentlyViewed.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_listingId: {
            userId: "user-123",
            listingId: "listing-123",
          },
        },
      })
    );
  });

  it("evicts old recentlyViewed entries beyond 20", async () => {
    const oldEntries = Array.from({ length: 5 }, (_, i) => ({ id: `rv-${i}` }));
    (prisma.recentlyViewed.findMany as jest.Mock).mockResolvedValue(oldEntries);

    await POST(createRequest(), routeContext);

    expect(prisma.recentlyViewed.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: oldEntries.map((e) => e.id) },
      },
    });
  });

  it("does not call recentlyViewed.upsert for unauthenticated user", async () => {
    (auth as jest.Mock).mockResolvedValue(null);

    await POST(createRequest(), routeContext);

    expect(prisma.recentlyViewed.upsert).not.toHaveBeenCalled();
  });

  it("returns 204 even on database error (fire-and-forget pattern)", async () => {
    (prisma.listing.update as jest.Mock).mockRejectedValue(
      new Error("DB connection error")
    );

    const response = await POST(createRequest(), routeContext);

    expect(response.status).toBe(204);
  });
});
