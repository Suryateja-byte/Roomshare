/**
 * Tests for reviews API route (A6.3, A6.1, B1.2)
 */

jest.mock("next/server", () => ({
  NextResponse: {
    json: (
      data: unknown,
      init?: { status?: number; headers?: Record<string, string> }
    ) => {
      const headersMap = new Map<string, string>();
      if (init?.headers) {
        Object.entries(init.headers).forEach(([k, v]) => headersMap.set(k, v));
      }
      return {
        status: init?.status || 200,
        json: async () => data,
        headers: headersMap,
      };
    },
  },
}));

// Mock dependencies before imports
jest.mock("@/lib/prisma", () => {
  const reviewMock = {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  };
  const bookingMock = { findFirst: jest.fn() };
  const listingMock = { findUnique: jest.fn() };
  const txClient = {
    review: reviewMock,
    booking: bookingMock,
    listing: listingMock,
    $executeRaw: jest.fn(),
  };
  return {
    prisma: {
      review: reviewMock,
      booking: bookingMock,
      listing: listingMock,
      $transaction: jest.fn((fn: (tx: typeof txClient) => unknown) =>
        fn(txClient)
      ),
      $executeRaw: jest.fn(),
    },
  };
});

jest.mock("@/auth", () => ({ auth: jest.fn() }));

jest.mock("@/lib/with-rate-limit", () => ({
  withRateLimit: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/app/actions/suspension", () => ({
  checkSuspension: jest.fn().mockResolvedValue({ suspended: false }),
}));

jest.mock("@/lib/notifications", () => ({
  createInternalNotification: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock("@/lib/email", () => ({
  sendNotificationEmailWithPreference: jest
    .fn()
    .mockResolvedValue({ success: true }),
}));

jest.mock("@/lib/api-error-handler", () => ({
  captureApiError: jest.fn().mockImplementation(() => ({
    status: 500,
    json: async () => ({ error: "Internal error" }),
    headers: new Map(),
  })),
}));

jest.mock("@/lib/search/search-doc-dirty", () => ({
  markListingDirty: jest.fn().mockResolvedValue(undefined),
  markListingsDirty: jest.fn().mockResolvedValue(undefined),
  markListingDirtyInTx: jest.fn().mockResolvedValue(undefined),
  markListingsDirtyInTx: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/pagination-schema", () => ({
  parsePaginationParams: jest.fn().mockReturnValue({
    success: true,
    data: { cursor: undefined, limit: 20 },
  }),
  buildPaginationResponse: jest
    .fn()
    .mockImplementation((items, limit, total) => ({
      items,
      pagination: { total, hasMore: false, nextCursor: null },
    })),
  buildPrismaQueryOptions: jest.fn().mockReturnValue({ take: 21 }),
}));

jest.mock("@/lib/logger", () => ({
  logger: { sync: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } },
  sanitizeErrorMessage: jest.fn((e: any) => e?.message || "unknown"),
}));

import { POST, GET, PUT, DELETE } from "@/app/api/reviews/route";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { checkSuspension } from "@/app/actions/suspension";
import { withRateLimit } from "@/lib/with-rate-limit";
import { NextResponse } from "next/server";

function createRequest(
  method: string,
  body?: object,
  url = "http://localhost/api/reviews"
) {
  if (method === "GET" || method === "DELETE") {
    return new Request(url, { method });
  }
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Reviews API Route", () => {
  const mockSession = {
    user: {
      id: "user-123",
      name: "Test User",
      email: "test@example.com",
      emailVerified: new Date(),
    },
  };

  const validBody = {
    listingId: "listing-1",
    rating: 5,
    comment: "Great place!",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue(mockSession);
    (checkSuspension as jest.Mock).mockResolvedValue({ suspended: false });
    (withRateLimit as jest.Mock).mockResolvedValue(null);
  });

  describe("POST /api/reviews", () => {
    it("returns 401 when not authenticated", async () => {
      (auth as jest.Mock).mockResolvedValue(null);
      const res = await POST(createRequest("POST", validBody));
      expect(res.status).toBe(401);
    });

    it("returns 403 when email not verified", async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { ...mockSession.user, emailVerified: null },
      });
      const res = await POST(createRequest("POST", validBody));
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toContain("verification");
    });

    it("returns 403 when account suspended", async () => {
      (checkSuspension as jest.Mock).mockResolvedValue({
        suspended: true,
        error: "Account suspended",
      });
      const res = await POST(createRequest("POST", validBody));
      expect(res.status).toBe(403);
    });

    it("returns 400 for invalid JSON body", async () => {
      const req = new Request("http://localhost/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("returns 400 for Zod failure: rating=0", async () => {
      const res = await POST(
        createRequest("POST", { listingId: "l1", rating: 0, comment: "hi" })
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Invalid request");
    });

    it("returns 400 for Zod failure: rating=6", async () => {
      const res = await POST(
        createRequest("POST", { listingId: "l1", rating: 6, comment: "hi" })
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 when neither listingId nor targetUserId", async () => {
      const res = await POST(
        createRequest("POST", { rating: 3, comment: "hi" })
      );
      expect(res.status).toBe(400);
    });

    it("returns 409 for duplicate listing review (B1.2)", async () => {
      (prisma.review.findFirst as jest.Mock).mockResolvedValue({
        id: "existing-review",
      });
      (prisma.booking.findFirst as jest.Mock).mockResolvedValue({
        id: "booking-1",
      });
      const res = await POST(createRequest("POST", validBody));
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toContain("already reviewed");
      expect(prisma.review.create).not.toHaveBeenCalled();
    });

    it("returns 403 when no ACCEPTED booking for listing", async () => {
      (prisma.review.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.booking.findFirst as jest.Mock).mockResolvedValue(null);
      const res = await POST(createRequest("POST", validBody));
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe(
        "Only past guests with a confirmed stay can leave a public review."
      );
    });

    it("creates review successfully for listing", async () => {
      (prisma.review.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.booking.findFirst as jest.Mock).mockResolvedValue({
        id: "booking-1",
      });
      (prisma.review.create as jest.Mock).mockResolvedValue({
        id: "review-1",
        authorId: "user-123",
        listingId: "listing-1",
        rating: 5,
        comment: "Great place!",
        author: { name: "Test User", image: null },
      });
      (prisma.listing.findUnique as jest.Mock).mockResolvedValue(null);

      const res = await POST(createRequest("POST", validBody));
      expect(res.status).toBe(201);
      expect(prisma.review.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            authorId: "user-123",
            listingId: "listing-1",
            rating: 5,
            comment: "Great place!",
          }),
        })
      );
    });

    it("returns rate limit response when rate limited", async () => {
      (withRateLimit as jest.Mock).mockResolvedValue(
        NextResponse.json({ error: "Rate limited" }, { status: 429 })
      );
      const res = await POST(createRequest("POST", validBody));
      expect(res.status).toBe(429);
      expect(auth).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/reviews", () => {
    it("returns paginated reviews", async () => {
      const mockReviews = [
        {
          id: "r1",
          rating: 5,
          comment: "Great",
          author: { name: "User 1", image: null },
        },
        {
          id: "r2",
          rating: 4,
          comment: "Good",
          author: { name: "User 2", image: null },
        },
      ];
      (prisma.review.count as jest.Mock).mockResolvedValue(2);
      (prisma.review.findMany as jest.Mock).mockResolvedValue(mockReviews);

      const res = await GET(
        createRequest(
          "GET",
          undefined,
          "http://localhost/api/reviews?listingId=l1"
        )
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.reviews).toHaveLength(2);
    });

    it("returns 400 when neither listingId nor userId", async () => {
      const res = await GET(createRequest("GET"));
      expect(res.status).toBe(400);
    });
  });

  describe("PUT /api/reviews", () => {
    it("returns 401 when not authenticated", async () => {
      (auth as jest.Mock).mockResolvedValue(null);
      const res = await PUT(
        createRequest("POST", { reviewId: "r1", rating: 4, comment: "Updated" })
      );
      expect(res.status).toBe(401);
    });

    it("returns 404 when review not found", async () => {
      (prisma.review.findUnique as jest.Mock).mockResolvedValue(null);
      const res = await PUT(
        createRequest("POST", { reviewId: "r1", rating: 4, comment: "Updated" })
      );
      expect(res.status).toBe(404);
    });

    it("returns 403 when review belongs to another user", async () => {
      (prisma.review.findUnique as jest.Mock).mockResolvedValue({
        id: "r1",
        authorId: "other-user",
      });
      const res = await PUT(
        createRequest("POST", { reviewId: "r1", rating: 4, comment: "Updated" })
      );
      expect(res.status).toBe(403);
    });

    it("updates review successfully", async () => {
      (prisma.review.findUnique as jest.Mock).mockResolvedValue({
        id: "r1",
        authorId: "user-123",
        listingId: "listing-1",
      });
      (prisma.review.update as jest.Mock).mockResolvedValue({
        id: "r1",
        rating: 4,
        comment: "Updated",
        author: { name: "Test User", image: null },
      });

      const res = await PUT(
        createRequest("POST", { reviewId: "r1", rating: 4, comment: "Updated" })
      );
      expect(res.status).toBe(200);
    });
  });

  describe("DELETE /api/reviews", () => {
    it("returns 401 when not authenticated", async () => {
      (auth as jest.Mock).mockResolvedValue(null);
      const res = await DELETE(
        createRequest(
          "DELETE",
          undefined,
          "http://localhost/api/reviews?reviewId=r1"
        )
      );
      expect(res.status).toBe(401);
    });

    it("returns 404 when review not found", async () => {
      (prisma.review.findUnique as jest.Mock).mockResolvedValue(null);
      const res = await DELETE(
        createRequest(
          "DELETE",
          undefined,
          "http://localhost/api/reviews?reviewId=r1"
        )
      );
      expect(res.status).toBe(404);
    });

    it("returns 403 when review belongs to another user", async () => {
      (prisma.review.findUnique as jest.Mock).mockResolvedValue({
        id: "r1",
        authorId: "other-user",
      });
      const res = await DELETE(
        createRequest(
          "DELETE",
          undefined,
          "http://localhost/api/reviews?reviewId=r1"
        )
      );
      expect(res.status).toBe(403);
    });

    it("deletes review successfully", async () => {
      (prisma.review.findUnique as jest.Mock).mockResolvedValue({
        id: "r1",
        authorId: "user-123",
        listingId: "listing-1",
      });
      (prisma.review.delete as jest.Mock).mockResolvedValue({ id: "r1" });

      const res = await DELETE(
        createRequest(
          "DELETE",
          undefined,
          "http://localhost/api/reviews?reviewId=r1"
        )
      );
      expect(res.status).toBe(200);
      expect(prisma.review.delete).toHaveBeenCalledWith({
        where: { id: "r1" },
      });
    });
  });
});
