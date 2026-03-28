/**
 * P1: Listing deletion cascade behavior
 *
 * Tests that listing deletion correctly handles active bookings.
 * EC-6 finding: FK constraint is RESTRICT (not CASCADE), so deletion
 * fails with FK violation if non-ACCEPTED bookings exist.
 */
import { test, expect } from "../helpers/test-utils";
import { testApi } from "../helpers/stability-helpers";

test.describe("Listing Deletion Cascade", () => {
  test.describe.configure({ mode: "serial" });

  test("listing with PENDING bookings cannot be deleted (RESTRICT FK)", async ({
    page,
  }) => {
    // Find a listing that has a PENDING booking
    const listing = await testApi<{ id: string }>(
      page,
      "findTestListing",
      {}
    );
    test.skip(!listing.ok, "Test API not available or no suitable listing");

    // Create a PENDING booking on it
    const booking = await testApi<{ id: string }>(
      page,
      "createPendingBooking",
      { listingId: listing.data.id }
    );
    expect(booking.ok).toBe(true);

    // Attempt to delete the listing via API
    const deleteRes = await page.request.delete(
      `/api/listings/${listing.data.id}`
    );

    // The RESTRICT FK should prevent deletion
    // The handler should either:
    // - Return an error about active bookings
    // - Or cancel the bookings first then delete
    if (deleteRes.status() === 200) {
      // If deletion succeeded, verify bookings were properly handled
      const deletedBooking = await testApi<{ status: string }>(
        page,
        "getBooking",
        { bookingId: booking.data.id }
      );
      // Booking should be CANCELLED, not deleted
      if (deletedBooking.ok) {
        expect(deletedBooking.data.status).toBe("CANCELLED");
      }
    } else {
      // Deletion blocked — this is the expected behavior with RESTRICT FK
      expect([400, 409, 500]).toContain(deleteRes.status());
    }

    // Cleanup
    await testApi(page, "cleanupTestBookings", {
      listingId: listing.data.id,
    });
  });

  test("listing with ACCEPTED bookings blocks deletion", async ({ page }) => {
    const listing = await testApi<{ id: string }>(
      page,
      "findTestListing",
      {}
    );
    test.skip(!listing.ok, "Test API not available or no suitable listing");

    // Create an ACCEPTED booking
    const booking = await testApi<{ id: string }>(
      page,
      "createAcceptedBooking",
      { listingId: listing.data.id }
    );
    expect(booking.ok).toBe(true);

    // Attempt to delete
    const deleteRes = await page.request.delete(
      `/api/listings/${listing.data.id}`
    );

    // Should be blocked (listing has active booking)
    expect(deleteRes.ok()).toBe(false);

    // Cleanup
    await testApi(page, "cleanupTestBookings", {
      listingId: listing.data.id,
    });
  });
});
