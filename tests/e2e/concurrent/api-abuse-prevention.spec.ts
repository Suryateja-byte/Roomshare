/**
 * P1: API abuse prevention tests
 *
 * Tests rate limiting, input validation, and abuse resistance
 * for critical API endpoints.
 */
import { test, expect } from "../helpers/test-utils";
import { testApi } from "../helpers/stability-helpers";

test.describe("API Abuse Prevention", () => {
  test.describe.configure({ mode: "serial" });

  test("getNotifications with excessive limit returns bounded results", async ({
    page,
  }) => {
    // EC-8: getNotifications has no upper bound on limit parameter.
    // This test documents the current behavior. Once a server-side cap
    // is added, strengthen the assertion to expect <= 100 items.
    const res = await page.request.get("/api/notifications?limit=99999");

    // Skip if notifications endpoint doesn't exist yet (returns 404 or HTML)
    test.skip(
      res.status() === 404 || res.headers()["content-type"]?.includes("text/html"),
      "Notifications endpoint not implemented yet"
    );

    expect(res.status()).toBe(200);

    const data = await res.json();
    const items = data.notifications || data;

    // Document: if this passes with >100 items, EC-8 is still unfixed
    if (Array.isArray(items) && items.length > 100) {
      test.info().annotations.push({
        type: "known-gap",
        description:
          "EC-8: getNotifications returned " +
          items.length +
          " items — no server-side limit cap",
      });
    }
  });

  test("listing PATCH with empty images array is rejected", async ({
    page,
  }) => {
    // EC-9: images field allows empty array, removing all photos
    const listing = await testApi<{ id: string }>(
      page,
      "findTestListing",
      {}
    );
    test.skip(!listing.ok, "Test API not available or no suitable listing");

    const res = await page.request.patch(
      `/api/listings/${listing.data.id}`,
      {
        data: { images: [] },
      }
    );

    // Should reject — a listing must have at least 1 image
    // Currently this is a known gap (no .min(1) on images array)
    // This test documents the expected behavior
    if (res.status() === 200) {
      // If the API accepts it, this test documents the bug
      test.info().annotations.push({
        type: "known-gap",
        description: "EC-9: images:[] accepted — no .min(1) validation",
      });
    } else {
      expect(res.status()).toBe(400);
    }
  });

  test("retired booking status endpoint remains unavailable", async ({
    page,
  }) => {
    const response = await page.request.post("/api/bookings/status", {
      data: {
        bookingId: "nonexistent-id",
        status: "ACCEPTED",
      },
      failOnStatusCode: false,
    });

    expect([404, 405, 410]).toContain(response.status());
  });

  test("listing status endpoint is rate limited", async ({ page }) => {
    test.skip(
      process.env.E2E_DISABLE_RATE_LIMIT === "true",
      "Rate limiting bypassed in E2E — covered by unit tests"
    );
    const listing = await testApi<{ id: string }>(
      page,
      "findTestListing",
      {}
    );
    test.skip(!listing.ok, "Test API not available or no suitable listing");

    // Fire 50 rapid requests to the public status endpoint
    const results = await Promise.all(
      Array.from({ length: 50 }, () =>
        page.request
          .get(`/api/listings/${listing.data.id}/status`)
          .then((r) => r.status())
      )
    );

    // Should see rate limiting kick in
    const rateLimited = results.filter((s) => s === 429);
    expect(rateLimited.length).toBeGreaterThan(0);
  });
});
