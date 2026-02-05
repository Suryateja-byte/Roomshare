/**
 * Pagination API Tests
 *
 * Tests cursor-based pagination at the API level using Playwright's
 * request fixture. These tests validate server-side cursor stability
 * and error handling without browser rendering.
 *
 * Strategy:
 * - Uses Playwright's `request` fixture for direct HTTP calls (no browser).
 * - Validates that keyset cursors produce disjoint page sets (no duplicates).
 * - Validates that invalid/corrupted cursors are handled gracefully (no 500s).
 *
 * Key constants:
 * - DEFAULT_PAGE_SIZE = 12 (src/lib/constants.ts:22)
 * - Cursor format: base64url-encoded JSON { v: 1, s: SortOption, k: (string|null)[], id: string }
 *
 * Overlap with existing tests:
 * - REG-004 covers API-level cursor no-duplicates (search-smoke).
 * - REG-005 covers API-level invalid cursor fallback (search-smoke).
 * - These tests are retained for regression coverage in the pagination suite.
 *
 * Run: pnpm playwright test tests/e2e/pagination/pagination-api.spec.ts --project=chromium
 */

import { test, expect, SF_BOUNDS } from "../helpers/test-utils";

const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;

// ---------------------------------------------------------------------------
// Section 2: Deduplication (API level)
// ---------------------------------------------------------------------------
test.describe("Pagination API", () => {
  // -------------------------------------------------------------------------
  // 2.2 Cursor stability: page 2 contains no IDs from page 1 [API]
  // -------------------------------------------------------------------------
  test("2.2 API page 2 contains no IDs from page 1", async ({ request }) => {
    // Fetch page 1
    const page1Res = await request.get(
      `/api/search/v2?sort=newest&${boundsQS}`,
    );

    // The endpoint may return 404 if v2 is not enabled via feature flag.
    // In that case, skip the test gracefully.
    if (page1Res.status() === 404) {
      test.skip(true, "Search v2 endpoint not enabled (feature flag off)");
      return;
    }

    expect(page1Res.status()).toBe(200);

    const page1Body = await page1Res.json();

    // Validate response shape
    expect(page1Body).toHaveProperty("list");
    expect(page1Body.list).toHaveProperty("items");
    expect(Array.isArray(page1Body.list.items)).toBe(true);

    const page1Items: Array<{ id: string }> = page1Body.list.items;
    const page1Ids = page1Items.map((item) => item.id);

    // Need a cursor to fetch page 2
    const nextCursor: string | null = page1Body.list.nextCursor;
    if (!nextCursor) {
      // Fewer than 13 listings in seed data; cannot test page 2
      test.skip(
        true,
        `Only ${page1Items.length} listings in seed data (need >12 for two pages)`,
      );
      return;
    }

    // Fetch page 2 using the cursor from page 1
    const page2Res = await request.get(
      `/api/search/v2?sort=newest&cursor=${encodeURIComponent(nextCursor)}&${boundsQS}`,
    );
    expect(page2Res.status()).toBe(200);

    const page2Body = await page2Res.json();
    expect(page2Body).toHaveProperty("list");
    expect(page2Body.list).toHaveProperty("items");
    expect(Array.isArray(page2Body.list.items)).toBe(true);

    const page2Items: Array<{ id: string }> = page2Body.list.items;
    const page2Ids = page2Items.map((item) => item.id);

    // Assert: no overlap between page 1 and page 2 ID sets
    const page1IdSet = new Set(page1Ids);
    const duplicates = page2Ids.filter((id) => page1IdSet.has(id));

    expect(
      duplicates.length,
      `Expected 0 duplicate IDs between page 1 (${page1Ids.length} items) and page 2 (${page2Ids.length} items), but found ${duplicates.length}: ${duplicates.join(", ")}`,
    ).toBe(0);

    // Sanity: page 2 should have at least 1 item
    expect(page2Items.length).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // Section 10: Edge Cases (API level)
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // 10.7 Invalid cursor handled gracefully [API]
  // -------------------------------------------------------------------------
  test("10.7 API handles invalid cursor gracefully", async ({ request }) => {
    const invalidCursors = [
      // Plain garbage string
      "GARBAGE_STRING_NOT_BASE64",
      // Valid base64 but invalid JSON content
      Buffer.from('{"id":"nonexistent"}').toString("base64url"),
      // Empty string
      "",
    ];

    for (const cursor of invalidCursors) {
      const res = await request.get(
        `/api/search/v2?cursor=${encodeURIComponent(cursor)}&${boundsQS}`,
      );

      // The endpoint may return 404 if v2 is not enabled via feature flag.
      if (res.status() === 404) {
        test.skip(true, "Search v2 endpoint not enabled (feature flag off)");
        return;
      }

      const status = res.status();
      const body = await res.json();

      // Must NOT be a 500 Internal Server Error (graceful handling required)
      expect(
        status,
        `Invalid cursor "${cursor.slice(0, 30)}..." should not cause a 500. Got status ${status}`,
      ).not.toBe(500);

      // Acceptable responses:
      // - 200 with items (fallback to first page)
      // - 400 with error message (validation rejection)
      expect([200, 400]).toContain(status);

      if (status === 200) {
        // Should return a valid response shape with items array
        expect(body).toHaveProperty("list");
        expect(body.list).toHaveProperty("items");
        expect(Array.isArray(body.list.items)).toBe(true);
      } else if (status === 400) {
        // Should return an error message (not a raw stack trace)
        expect(body).toHaveProperty("error");
        expect(typeof body.error).toBe("string");
      }
    }
  });
});
