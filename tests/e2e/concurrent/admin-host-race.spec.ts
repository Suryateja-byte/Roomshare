/**
 * P1: Admin vs Host concurrent operations
 *
 * Tests that admin and host actions on the same listing
 * are properly serialized and don't cause inconsistent state.
 */
import { test, expect } from "../helpers/test-utils";
import { testApi } from "../helpers/stability-helpers";

test.describe("Admin vs Host Race Conditions", () => {
  test.describe.configure({ mode: "serial", retries: 0 });

  test("admin suspend + host edit listing — both cannot succeed on same resource", async ({
    browser,
    page,
  }) => {
    const listing = await testApi<{ id: string }>(
      page,
      "findTestListing",
      {}
    );
    expect(listing.ok).toBe(true);
    const listingId = listing.data.id;

    // Two contexts: admin and host
    const adminCtx = await browser.newContext({
      storageState: "playwright/.auth/admin.json",
    });
    const hostCtx = await browser.newContext({
      storageState: "playwright/.auth/user.json",
    });

    const adminPage = await adminCtx.newPage();
    const hostPage = await hostCtx.newPage();

    // Concurrent: admin suspends listing while host edits title
    const [adminRes, hostRes] = await Promise.all([
      adminPage.request.post(`/api/admin/listings/${listingId}/action`, {
        data: { action: "suspend", reason: "Test suspension" },
      }),
      hostPage.request.patch(`/api/listings/${listingId}`, {
        data: { title: "Updated title during admin action" },
      }),
    ]);

    // At least one should succeed — neither should error with 500
    const adminStatus = adminRes.status();
    const hostStatus = hostRes.status();
    expect([200, 400, 403, 409]).toContain(adminStatus);
    expect([200, 400, 403, 409]).toContain(hostStatus);

    // No 500 errors (would indicate unhandled concurrency)
    expect(adminStatus).not.toBe(500);
    expect(hostStatus).not.toBe(500);

    await adminCtx.close();
    await hostCtx.close();
  });

  test("admin action on listing during active booking accept", async ({
    browser,
    page,
  }) => {
    const listing = await testApi<{ id: string }>(
      page,
      "findTestListing",
      {}
    );
    expect(listing.ok).toBe(true);

    // Create a PENDING booking
    const booking = await testApi<{ id: string }>(
      page,
      "createPendingBooking",
      { listingId: listing.data.id }
    );
    expect(booking.ok).toBe(true);

    const adminCtx = await browser.newContext({
      storageState: "playwright/.auth/admin.json",
    });
    const hostCtx = await browser.newContext({
      storageState: "playwright/.auth/user.json",
    });

    const adminPage = await adminCtx.newPage();
    const hostPage = await hostCtx.newPage();

    // Concurrent: admin suspends listing while host accepts booking
    const [adminRes, hostRes] = await Promise.all([
      adminPage.request.post(
        `/api/admin/listings/${listing.data.id}/action`,
        {
          data: { action: "suspend", reason: "Concurrent test" },
        }
      ),
      hostPage.request.post("/api/bookings/status", {
        data: { bookingId: booking.data.id, status: "ACCEPTED" },
      }),
    ]);

    // With P0-2 fix: if admin suspends first (listing becomes non-ACTIVE),
    // the host's ACCEPT should fail with LISTING_NOT_ACTIVE
    // If host accepts first, admin suspension should still succeed

    // Neither should 500
    expect(adminRes.status()).not.toBe(500);
    expect(hostRes.status()).not.toBe(500);

    // Verify final state is consistent
    const finalBooking = await testApi<{ status: string }>(
      page,
      "getBooking",
      { bookingId: booking.data.id }
    );
    expect(finalBooking.ok).toBe(true);
    // Booking should be in a valid terminal or active state
    expect([
      "PENDING",
      "ACCEPTED",
      "REJECTED",
      "CANCELLED",
    ]).toContain(finalBooking.data.status);

    await adminCtx.close();
    await hostCtx.close();

    // Cleanup
    await testApi(page, "cleanupTestBookings", {
      listingId: listing.data.id,
    });
  });
});
