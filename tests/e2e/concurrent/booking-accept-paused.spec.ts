/**
 * P0-2: Booking ACCEPT on non-ACTIVE listing
 *
 * Bug: manage-booking.ts:171 (HELD→ACCEPTED) and :255 (PENDING→ACCEPTED)
 * neither path checks listing.status. A host can ACCEPT a booking on a
 * PAUSED or RENTED listing, violating the booking invariant.
 *
 * This file documents the bug as test.fail() stubs. Once the fix lands
 * (add "status" to both SELECT ... FOR UPDATE queries and check
 * listing.status === 'ACTIVE'), flip to test() and verify they pass.
 */
import { test, expect } from "../helpers/test-utils";
import { testApi } from "../helpers/stability-helpers";

test.describe("P0-2: ACCEPT on non-ACTIVE listing", () => {
  test.describe.configure({ mode: "serial" });

  let listingId: string;
  let bookingId: string;

  test.fail(
    "PENDING→ACCEPTED should be blocked when listing is PAUSED",
    async ({ page }) => {
      // Setup: find a test listing and create a PENDING booking
      const listing = await testApi<{ id: string }>(page, "findTestListing", {});
      expect(listing.ok).toBe(true);
      listingId = listing.data.id;

      // Create a PENDING booking as user2
      const booking = await testApi<{ id: string }>(page, "createPendingBooking", {
        listingId,
        userId: process.env.E2E_USER2_ID,
      });
      expect(booking.ok).toBe(true);
      bookingId = booking.data.id;

      // PAUSE the listing via API
      const pauseRes = await page.request.patch(`/api/listings/${listingId}`, {
        data: { status: "PAUSED" },
      });

      // Now attempt to ACCEPT the booking — this SHOULD fail but currently succeeds
      const acceptRes = await page.request.post("/api/bookings/status", {
        data: { bookingId, status: "ACCEPTED" },
      });

      // The bug: this returns 200 instead of 400/409
      // After fix: expect 400 with error "LISTING_NOT_ACTIVE"
      expect(acceptRes.status()).toBe(400);
    }
  );

  test.fail(
    "HELD→ACCEPTED should be blocked when listing is PAUSED",
    async ({ page }) => {
      // Setup: find a test listing and create a HELD booking
      const listing = await testApi(page, "findTestListing", {});
      expect(listing.ok).toBe(true);
      listingId = listing.data.id;

      const booking = await testApi(page, "createHeldBooking", {
        listingId,
        userId: process.env.E2E_USER2_ID,
      });
      expect(booking.ok).toBe(true);
      bookingId = booking.data.id;

      // PAUSE the listing
      const pauseRes = await page.request.patch(`/api/listings/${listingId}`, {
        data: { status: "PAUSED" },
      });

      // Attempt to ACCEPT the HELD booking — should fail
      const acceptRes = await page.request.post("/api/bookings/status", {
        data: { bookingId, status: "ACCEPTED" },
      });

      // The bug: this returns 200 instead of 400/409
      expect(acceptRes.status()).toBe(400);
    }
  );
});
