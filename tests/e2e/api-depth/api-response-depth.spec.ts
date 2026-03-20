/**
 * API Response Depth Tests
 *
 * Verifies that critical API endpoints return well-structured responses
 * with correct fields, proper status codes, and no information leakage.
 *
 * Gap coverage identified by depth audit:
 * - /api/favorites — no response body assertions existed
 * - /api/messages — no response body assertions existed
 * - /api/search/v2 — already well-covered (search-v2-api.spec.ts)
 * - /api/listings — no POST success response body assertions
 * - Error responses — no stack trace / SQL leakage checks
 *
 * Uses Playwright request API for direct endpoint testing (no browser UI).
 */

import { test, expect } from "../helpers";

test.describe("API Response Depth", () => {
  test.use({ storageState: "playwright/.auth/user.json" });

  test.beforeEach(async () => {
    test.slow();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Favorites API
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe("Favorites API (/api/favorites)", () => {
    test("RD-01: GET returns savedIds array with correct structure", async ({
      request,
    }) => {
      const response = await request.get("/api/favorites");

      expect(response.status()).toBe(200);
      const data = await response.json();

      // Must have savedIds property
      expect(data).toHaveProperty("savedIds");
      expect(Array.isArray(data.savedIds)).toBe(true);

      // Each savedId should be a string (listing ID)
      for (const id of data.savedIds) {
        expect(typeof id).toBe("string");
        expect(id.length).toBeGreaterThan(0);
      }

      // Should not leak other user fields
      expect(data).not.toHaveProperty("userId");
      expect(data).not.toHaveProperty("email");
      expect(data).not.toHaveProperty("password");
    });

    test("RD-02: GET with ids param returns filtered savedIds", async ({
      request,
    }) => {
      const response = await request.get(
        "/api/favorites?ids=nonexistent-id-1,nonexistent-id-2"
      );

      expect(response.status()).toBe(200);
      const data = await response.json();

      expect(data).toHaveProperty("savedIds");
      expect(Array.isArray(data.savedIds)).toBe(true);
      // Non-existent IDs should yield empty array
      expect(data.savedIds).toHaveLength(0);
    });

    test("RD-03: POST with invalid body returns structured error", async ({
      request,
      baseURL,
    }) => {
      const response = await request.post("/api/favorites", {
        headers: { Origin: baseURL! },
        data: { invalid: true },
      });

      // Should be 400 (validation error)
      expect(response.status()).toBe(400);
      const data = await response.json();

      expect(data).toHaveProperty("error");
      expect(typeof data.error).toBe("string");

      // No stack traces in error response
      expect(data.error).not.toMatch(/at\s+\w+\s+\(/);
      // No SQL in error response
      expect(data.error).not.toMatch(/SELECT|INSERT|UPDATE|DELETE/i);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Messages API
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe("Messages API (/api/messages)", () => {
    test("RD-04: GET conversations list returns paginated structure", async ({
      request,
    }) => {
      const response = await request.get("/api/messages");

      expect(response.status()).toBe(200);
      const data = await response.json();

      // Must have conversations array and pagination
      expect(data).toHaveProperty("conversations");
      expect(Array.isArray(data.conversations)).toBe(true);
      expect(data).toHaveProperty("pagination");

      // Pagination structure
      expect(data.pagination).toHaveProperty("total");
      expect(typeof data.pagination.total).toBe("number");

      // If conversations exist, check structure
      if (data.conversations.length > 0) {
        const conversation = data.conversations[0];
        expect(conversation).toHaveProperty("id");
        // Should not leak other user's full details
        expect(conversation).not.toHaveProperty("password");
        expect(conversation).not.toHaveProperty("passwordHash");
      }
    });

    test("RD-05: GET unread count returns number", async ({ request }) => {
      const response = await request.get("/api/messages?view=unreadCount");

      expect(response.status()).toBe(200);
      const data = await response.json();

      expect(data).toHaveProperty("count");
      expect(typeof data.count).toBe("number");
      expect(data.count).toBeGreaterThanOrEqual(0);
    });

    test("RD-06: POST with empty content returns 400 error", async ({
      request,
      baseURL,
    }) => {
      const response = await request.post("/api/messages", {
        headers: { Origin: baseURL! },
        data: { conversationId: "test-conv", content: "" },
      });

      expect(response.status()).toBe(400);
      const data = await response.json();

      expect(data).toHaveProperty("error");
      expect(typeof data.error).toBe("string");
      // No internal details
      expect(data.error).not.toMatch(/at\s+\w+\s+\(/);
      expect(data.error).not.toMatch(/prisma|SELECT|INSERT/i);
    });

    test("RD-07: POST with oversized content returns 400 error", async ({
      request,
      baseURL,
    }) => {
      const response = await request.post("/api/messages", {
        headers: { Origin: baseURL! },
        data: {
          conversationId: "test-conv",
          content: "x".repeat(2001),
        },
      });

      expect(response.status()).toBe(400);
      const data = await response.json();

      expect(data).toHaveProperty("error");
      expect(data.error).toMatch(/2000|exceed|too long/i);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Listings API
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe("Listings API (/api/listings)", () => {
    test("RD-08: POST with invalid body returns structured validation error", async ({
      request,
      baseURL,
    }) => {
      const response = await request.post("/api/listings", {
        headers: { Origin: baseURL! },
        data: { title: "" },
      });

      // Should be 400 (validation error)
      expect(response.status()).toBe(400);
      const data = await response.json();

      expect(data).toHaveProperty("error");
      expect(typeof data.error).toBe("string");

      // No stack traces
      expect(data.error).not.toMatch(/at\s+\w+\s+\(/);
      expect(JSON.stringify(data)).not.toMatch(
        /node_modules|\.ts:|\.js:|Error:/
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Search API (non-v2 — the v2 endpoint is already well-tested)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe("Search Count API (/api/search-count)", () => {
    test("RD-09: GET returns count with correct structure", async ({
      request,
    }) => {
      const response = await request.get("/api/search-count");

      expect(response.status()).toBe(200);
      const data = await response.json();

      // Should have a count field
      expect(data).toHaveProperty("count");
      expect(typeof data.count).toBe("number");
      expect(data.count).toBeGreaterThanOrEqual(0);

      // Should not leak listing details
      expect(data).not.toHaveProperty("listings");
      expect(data).not.toHaveProperty("items");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Error Response Security — cross-cutting
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe("Error Response Security", () => {
    test("RD-10: 404 API routes return safe error response", async ({
      request,
    }) => {
      const response = await request.get("/api/nonexistent-endpoint");

      // Next.js returns 404 for unknown routes
      expect([404, 405]).toContain(response.status());

      // Response should not contain stack traces
      const text = await response.text();
      expect(text).not.toMatch(/at\s+\w+\s+\(/);
      expect(text).not.toMatch(/node_modules/);
    });

    test("RD-11: Invalid JSON body returns clean error", async ({
      request,
      baseURL,
    }) => {
      const response = await request.post("/api/messages", {
        headers: { "content-type": "application/json", Origin: baseURL! },
        data: "not-valid-json{",
      });

      // Should be 400 or 401, not 500
      expect(response.status()).toBeLessThan(500);
    });

    test("RD-12: Health endpoint returns structured response", async ({
      request,
    }) => {
      const response = await request.get("/api/health/ready");

      expect(response.status()).toBe(200);
      const data = await response.json();

      // Should have status field
      expect(data).toHaveProperty("status");
    });
  });
});
