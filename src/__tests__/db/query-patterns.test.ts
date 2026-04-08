/**
 * DB query-pattern unit tests
 *
 * Pins the exact Prisma call shapes for two patterns flagged by the api-auditor
 * as lacking low-level coverage:
 *
 *   1. recentlyViewed upsert + LRU eviction  (view route)
 *   2. booking.count filter predicate         (can-delete route)
 *
 * These tests are intentionally DB-focused: they verify the exact where/orderBy/
 * skip/select arguments passed to Prisma — things the higher-level API tests
 * don't assert. The HTTP response layer is already covered in:
 *   - src/__tests__/api/listing-view.test.ts
 *   - src/__tests__/api/listing-can-delete.test.ts
 */

// ─── Mocks must come before any imports ────────────────────────────────────

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
      this.status = init?.status ?? 200;
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
  };
});

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: {
    sync: {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
    },
  },
  sanitizeErrorMessage: jest.fn((e: unknown) =>
    e instanceof Error ? e.message : String(e)
  ),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    listing: { update: jest.fn(), findUnique: jest.fn() },
    recentlyViewed: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    booking: { count: jest.fn() },
    conversation: { count: jest.fn() },
  },
}));

jest.mock("@/lib/rate-limit", () => ({
  checkRateLimit: jest
    .fn()
    .mockResolvedValue({ success: true, remaining: 9, resetAt: new Date() }),
  getClientIP: jest.fn().mockReturnValue("127.0.0.1"),
  RATE_LIMITS: { viewCount: { windowMs: 60_000, maxRequests: 10 } },
}));

jest.mock("@/lib/with-rate-limit", () => ({
  withRateLimit: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/lib/search/search-doc-dirty", () => ({
  markListingDirty: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@sentry/nextjs", () => ({
  captureException: jest.fn(),
}));

// ─── Imports ────────────────────────────────────────────────────────────────

import { POST } from "@/app/api/listings/[id]/view/route";
import { GET } from "@/app/api/listings/[id]/can-delete/route";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { checkRateLimit } from "@/lib/rate-limit";

// ─── Helpers ────────────────────────────────────────────────────────────────

const SESSION_USER_ID = "user-abc";
const LISTING_ID = "listing-xyz";

function makeViewRequest(): Request {
  return new Request(`http://localhost/api/listings/${LISTING_ID}/view`, {
    method: "POST",
  });
}

function makeCanDeleteRequest(): Request {
  return new Request(`http://localhost/api/listings/${LISTING_ID}/can-delete`, {
    method: "GET",
  });
}

const routeContext = {
  params: Promise.resolve({ id: LISTING_ID }),
};

// ============================================================================
// Pattern 1 — recentlyViewed upsert + LRU eviction
// ============================================================================

describe("recentlyViewed — upsert + LRU eviction DB query patterns", () => {
  const authenticatedSession = {
    user: { id: SESSION_USER_ID, name: "Alice", email: "alice@example.com" },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue(authenticatedSession);
    (checkRateLimit as jest.Mock).mockResolvedValue({ success: true });
    (prisma.listing.update as jest.Mock).mockResolvedValue({});
    (prisma.recentlyViewed.upsert as jest.Mock).mockResolvedValue({});
    (prisma.recentlyViewed.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.recentlyViewed.deleteMany as jest.Mock).mockResolvedValue({
      count: 0,
    });
  });

  describe("upsert query shape", () => {
    it("uses composite unique key userId_listingId as the where clause", async () => {
      await POST(makeViewRequest(), routeContext);

      expect(prisma.recentlyViewed.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_listingId: {
              userId: SESSION_USER_ID,
              listingId: LISTING_ID,
            },
          },
        })
      );
    });

    it("sets viewedAt in both create and update branches so timestamps stay fresh", async () => {
      const before = new Date();
      await POST(makeViewRequest(), routeContext);
      const after = new Date();

      const [call] = (prisma.recentlyViewed.upsert as jest.Mock).mock.calls;
      const { create, update } = call[0];

      expect(create.viewedAt).toBeInstanceOf(Date);
      expect(create.viewedAt.getTime()).toBeGreaterThanOrEqual(
        before.getTime()
      );
      expect(create.viewedAt.getTime()).toBeLessThanOrEqual(after.getTime());

      expect(update.viewedAt).toBeInstanceOf(Date);
      expect(update.viewedAt.getTime()).toBeGreaterThanOrEqual(
        before.getTime()
      );
      expect(update.viewedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it("populates userId and listingId in the create branch", async () => {
      await POST(makeViewRequest(), routeContext);

      expect(prisma.recentlyViewed.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            userId: SESSION_USER_ID,
            listingId: LISTING_ID,
          }),
        })
      );
    });
  });

  describe("LRU candidate query shape", () => {
    it("queries only the authenticated user's records", async () => {
      await POST(makeViewRequest(), routeContext);

      expect(prisma.recentlyViewed.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: SESSION_USER_ID },
        })
      );
    });

    it("orders by viewedAt descending so newest records are kept", async () => {
      await POST(makeViewRequest(), routeContext);

      expect(prisma.recentlyViewed.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { viewedAt: "desc" },
        })
      );
    });

    it("skips the 20 most-recent records to identify only the excess tail", async () => {
      await POST(makeViewRequest(), routeContext);

      expect(prisma.recentlyViewed.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
        })
      );
    });

    it("selects only the id field — avoids over-fetching unnecessary columns", async () => {
      await POST(makeViewRequest(), routeContext);

      expect(prisma.recentlyViewed.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: { id: true },
        })
      );
    });
  });

  describe("LRU eviction call", () => {
    it("deletes records whose ids were returned by the tail query", async () => {
      const tailEntries = [{ id: "rv-old-1" }, { id: "rv-old-2" }];
      (prisma.recentlyViewed.findMany as jest.Mock).mockResolvedValue(
        tailEntries
      );

      await POST(makeViewRequest(), routeContext);

      expect(prisma.recentlyViewed.deleteMany).toHaveBeenCalledWith({
        where: {
          id: { in: ["rv-old-1", "rv-old-2"] },
        },
      });
    });

    it("skips deleteMany entirely when findMany returns an empty array", async () => {
      (prisma.recentlyViewed.findMany as jest.Mock).mockResolvedValue([]);

      await POST(makeViewRequest(), routeContext);

      expect(prisma.recentlyViewed.deleteMany).not.toHaveBeenCalled();
    });

    it("deletes a single excess entry when exactly one record sits beyond position 20", async () => {
      const singleTail = [{ id: "rv-oldest" }];
      (prisma.recentlyViewed.findMany as jest.Mock).mockResolvedValue(
        singleTail
      );

      await POST(makeViewRequest(), routeContext);

      expect(prisma.recentlyViewed.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ["rv-oldest"] } },
      });
    });

    it("preserves all 20 recent entries when the user has exactly 20 records", async () => {
      // findMany with skip:20 on a 20-row list returns [] — nothing to evict
      (prisma.recentlyViewed.findMany as jest.Mock).mockResolvedValue([]);

      await POST(makeViewRequest(), routeContext);

      expect(prisma.recentlyViewed.deleteMany).not.toHaveBeenCalled();
    });

    it("passes all tail ids as an array to the IN clause when multiple records exceed the cap", async () => {
      const tail = Array.from({ length: 7 }, (_, i) => ({
        id: `rv-excess-${i}`,
      }));
      (prisma.recentlyViewed.findMany as jest.Mock).mockResolvedValue(tail);

      await POST(makeViewRequest(), routeContext);

      const deleteCall = (prisma.recentlyViewed.deleteMany as jest.Mock).mock
        .calls[0][0];
      expect(deleteCall.where.id.in).toHaveLength(7);
      expect(deleteCall.where.id.in).toEqual(tail.map((e) => e.id));
    });
  });

  describe("unauthenticated user — no DB writes to recentlyViewed", () => {
    it("does not call upsert when session is null", async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      await POST(makeViewRequest(), routeContext);

      expect(prisma.recentlyViewed.upsert).not.toHaveBeenCalled();
    });

    it("does not call findMany when session is null", async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      await POST(makeViewRequest(), routeContext);

      expect(prisma.recentlyViewed.findMany).not.toHaveBeenCalled();
    });

    it("does not call deleteMany when session is null", async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      await POST(makeViewRequest(), routeContext);

      expect(prisma.recentlyViewed.deleteMany).not.toHaveBeenCalled();
    });

    it("does not call upsert when session exists but user.id is absent", async () => {
      (auth as jest.Mock).mockResolvedValue({ user: {} });

      await POST(makeViewRequest(), routeContext);

      expect(prisma.recentlyViewed.upsert).not.toHaveBeenCalled();
    });
  });

  describe("database error resilience", () => {
    it("still returns 204 when the upsert throws — view endpoint is fire-and-forget", async () => {
      (prisma.listing.update as jest.Mock).mockResolvedValue({});
      (prisma.recentlyViewed.upsert as jest.Mock).mockRejectedValue(
        new Error("unique constraint violation")
      );

      const response = await POST(makeViewRequest(), routeContext);

      expect(response.status).toBe(204);
    });

    it("still returns 204 when findMany throws — error is swallowed by catch block", async () => {
      (prisma.recentlyViewed.findMany as jest.Mock).mockRejectedValue(
        new Error("query timeout")
      );

      const response = await POST(makeViewRequest(), routeContext);

      expect(response.status).toBe(204);
    });

    it("still returns 204 when deleteMany throws — error is swallowed by catch block", async () => {
      (prisma.recentlyViewed.findMany as jest.Mock).mockResolvedValue([
        { id: "rv-1" },
      ]);
      (prisma.recentlyViewed.deleteMany as jest.Mock).mockRejectedValue(
        new Error("foreign key violation")
      );

      const response = await POST(makeViewRequest(), routeContext);

      expect(response.status).toBe(204);
    });

    it("logs a warning (not an error) when a DB operation fails inside the try block", async () => {
      const { logger } = jest.requireMock("@/lib/logger");
      (prisma.listing.update as jest.Mock).mockRejectedValue(
        new Error("connection lost")
      );

      await POST(makeViewRequest(), routeContext);

      expect(logger.sync.warn).toHaveBeenCalled();
      expect(logger.sync.error).not.toHaveBeenCalled();
    });
  });

  describe("idempotency — repeated views produce exactly one upsert call per request", () => {
    it("calls upsert exactly once per POST regardless of session state", async () => {
      await POST(makeViewRequest(), routeContext);

      expect(prisma.recentlyViewed.upsert).toHaveBeenCalledTimes(1);
    });

    it("calls findMany exactly once per POST to check for excess records", async () => {
      await POST(makeViewRequest(), routeContext);

      expect(prisma.recentlyViewed.findMany).toHaveBeenCalledTimes(1);
    });
  });
});

// ============================================================================
// Pattern 2 — booking.count filter predicate for can-delete check
// ============================================================================

describe("booking.count — can-delete query patterns", () => {
  const ownerSession = {
    user: { id: "owner-111", name: "Host", email: "host@example.com" },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue(ownerSession);
    (prisma.listing.findUnique as jest.Mock).mockResolvedValue({
      ownerId: "owner-111",
    });
    (prisma.booking.count as jest.Mock).mockResolvedValue(0);
    (prisma.conversation.count as jest.Mock).mockResolvedValue(0);
  });

  describe("active-bookings count query shape", () => {
    it("filters by the listing id being checked", async () => {
      await GET(makeCanDeleteRequest(), routeContext);

      const firstCountCall = (prisma.booking.count as jest.Mock).mock.calls[0];
      expect(firstCountCall[0].where.listingId).toBe(LISTING_ID);
    });

    it("restricts to ACCEPTED status — only ACCEPTED bookings block deletion", async () => {
      await GET(makeCanDeleteRequest(), routeContext);

      const firstCountCall = (prisma.booking.count as jest.Mock).mock.calls[0];
      expect(firstCountCall[0].where.status).toBe("ACCEPTED");
    });

    it("uses gte: new Date() so only future-ending bookings block deletion", async () => {
      const before = new Date();
      await GET(makeCanDeleteRequest(), routeContext);
      const after = new Date();

      const firstCountCall = (prisma.booking.count as jest.Mock).mock.calls[0];
      const endDateFilter = firstCountCall[0].where.endDate.gte;

      expect(endDateFilter).toBeInstanceOf(Date);
      expect(endDateFilter.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(endDateFilter.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it("does not include PENDING status in the blocking query — PENDING alone never blocks deletion", async () => {
      await GET(makeCanDeleteRequest(), routeContext);

      const firstCountCall = (prisma.booking.count as jest.Mock).mock.calls[0];
      expect(firstCountCall[0].where.status).not.toBe("PENDING");
    });
  });

  describe("pending-bookings count query shape", () => {
    it("counts PENDING bookings without a date filter for the warning field", async () => {
      await GET(makeCanDeleteRequest(), routeContext);

      // booking.count is called twice: [0] active, [1] pending
      const secondCountCall = (prisma.booking.count as jest.Mock).mock.calls[1];
      expect(secondCountCall[0].where.status).toBe("PENDING");
      expect(secondCountCall[0].where.endDate).toBeUndefined();
    });

    it("scopes the pending query to the same listing id", async () => {
      await GET(makeCanDeleteRequest(), routeContext);

      const secondCountCall = (prisma.booking.count as jest.Mock).mock.calls[1];
      expect(secondCountCall[0].where.listingId).toBe(LISTING_ID);
    });
  });

  describe("canDelete derivation logic", () => {
    it("returns canDelete: true when active booking count is 0", async () => {
      (prisma.booking.count as jest.Mock)
        .mockResolvedValueOnce(0) // active
        .mockResolvedValueOnce(0); // pending

      const response = await GET(makeCanDeleteRequest(), routeContext);
      const data = await response.json();

      expect(data.canDelete).toBe(true);
    });

    it("returns canDelete: false when active booking count is 1", async () => {
      (prisma.booking.count as jest.Mock)
        .mockResolvedValueOnce(1) // active
        .mockResolvedValueOnce(0); // pending

      const response = await GET(makeCanDeleteRequest(), routeContext);
      const data = await response.json();

      expect(data.canDelete).toBe(false);
    });

    it("returns canDelete: false when multiple active bookings exist", async () => {
      (prisma.booking.count as jest.Mock)
        .mockResolvedValueOnce(5) // active
        .mockResolvedValueOnce(2); // pending

      const response = await GET(makeCanDeleteRequest(), routeContext);
      const data = await response.json();

      expect(data.canDelete).toBe(false);
      expect(data.activeBookings).toBe(5);
    });

    it("returns canDelete: true when only PENDING bookings exist — pending count does not block", async () => {
      (prisma.booking.count as jest.Mock)
        .mockResolvedValueOnce(0) // active ACCEPTED — none
        .mockResolvedValueOnce(3); // pending — present but not blocking

      const response = await GET(makeCanDeleteRequest(), routeContext);
      const data = await response.json();

      expect(data.canDelete).toBe(true);
      expect(data.pendingBookings).toBe(3);
    });

    it("exposes pendingBookings in the response so the UI can warn the host", async () => {
      (prisma.booking.count as jest.Mock)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(4);

      const response = await GET(makeCanDeleteRequest(), routeContext);
      const data = await response.json();

      expect(data).toHaveProperty("pendingBookings", 4);
    });

    it("exposes activeConversations in the response so the UI can warn the host", async () => {
      (prisma.conversation.count as jest.Mock).mockResolvedValue(7);

      const response = await GET(makeCanDeleteRequest(), routeContext);
      const data = await response.json();

      expect(data).toHaveProperty("activeConversations", 7);
    });

    it("returns canDelete: true when all bookings have past end dates — the count query excludes them via gte filter", async () => {
      // The route uses endDate: { gte: new Date() }. Past-ended bookings are
      // excluded by Prisma at the DB level. Simulate that by returning count 0.
      (prisma.booking.count as jest.Mock)
        .mockResolvedValueOnce(0) // no active future bookings returned
        .mockResolvedValueOnce(0);

      const response = await GET(makeCanDeleteRequest(), routeContext);
      const data = await response.json();

      expect(data.canDelete).toBe(true);
    });
  });

  describe("listing ownership check — query shape", () => {
    it("looks up the listing by the id from route params", async () => {
      await GET(makeCanDeleteRequest(), routeContext);

      expect(prisma.listing.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: LISTING_ID },
        })
      );
    });

    it("selects only ownerId — avoids fetching the full listing row", async () => {
      await GET(makeCanDeleteRequest(), routeContext);

      expect(prisma.listing.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          select: { ownerId: true },
        })
      );
    });

    it("does not call booking.count when listing is not found", async () => {
      (prisma.listing.findUnique as jest.Mock).mockResolvedValue(null);

      await GET(makeCanDeleteRequest(), routeContext);

      expect(prisma.booking.count).not.toHaveBeenCalled();
    });

    it("does not call booking.count when requester is not the owner", async () => {
      (prisma.listing.findUnique as jest.Mock).mockResolvedValue({
        ownerId: "someone-else",
      });

      await GET(makeCanDeleteRequest(), routeContext);

      expect(prisma.booking.count).not.toHaveBeenCalled();
    });
  });

  describe("query execution count — no over-fetching", () => {
    it("calls booking.count exactly twice per request — once for active, once for pending", async () => {
      await GET(makeCanDeleteRequest(), routeContext);

      expect(prisma.booking.count).toHaveBeenCalledTimes(2);
    });

    it("calls conversation.count exactly once per request", async () => {
      await GET(makeCanDeleteRequest(), routeContext);

      expect(prisma.conversation.count).toHaveBeenCalledTimes(1);
    });

    it("calls listing.findUnique exactly once per request", async () => {
      await GET(makeCanDeleteRequest(), routeContext);

      expect(prisma.listing.findUnique).toHaveBeenCalledTimes(1);
    });
  });
});
