/**
 * P0-3: HELD→REJECTED and HELD→CANCELLED slot restoration
 *
 * Gap: No test coverage for slot restoration when HELD bookings are
 * rejected or cancelled. HELD bookings consume slots at creation
 * (unlike PENDING). The slot math is different and must be verified.
 *
 * These are test.fail() stubs that will be replaced with passing tests
 * once we verify the current behavior via testApi.
 */
import { test, expect } from "../helpers/test-utils";
import { testApi } from "../helpers/stability-helpers";

test.describe("P0-3: HELD booking slot restoration", () => {
  test.describe.configure({ mode: "serial" });

  test(
    "HELD→REJECTED restores availableSlots",
    async ({ page }) => {
      // Find a test listing and record initial slot count
      const listing = await testApi(page, "findTestListing", {});
      expect(listing.ok).toBe(true);
      const listingId = listing.data.id;

      const before = await testApi<{ availableSlots: number; totalSlots: number }>(
        page,
        "getListingSlots",
        { listingId }
      );
      expect(before.ok).toBe(true);
      const initialSlots = before.data.availableSlots;

      // Create a HELD booking (consumes 1 slot at creation)
      const booking = await testApi(page, "createHeldBooking", {
        listingId,
        slotsRequested: 1,
      });
      expect(booking.ok).toBe(true);

      // Verify slot was consumed
      const during = await testApi<{ availableSlots: number }>(
        page,
        "getListingSlots",
        { listingId }
      );
      expect(during.data.availableSlots).toBe(initialSlots - 1);

      // REJECT the held booking (should restore slot)
      const rejectRes = await page.request.post("/api/bookings/status", {
        data: { bookingId: booking.data.id, status: "REJECTED" },
      });

      // Verify slot was restored
      const after = await testApi<{ availableSlots: number }>(
        page,
        "getListingSlots",
        { listingId }
      );
      expect(after.data.availableSlots).toBe(initialSlots);
    }
  );

  test(
    "HELD→CANCELLED restores availableSlots",
    async ({ page }) => {
      const listing = await testApi(page, "findTestListing", {});
      expect(listing.ok).toBe(true);
      const listingId = listing.data.id;

      const before = await testApi<{ availableSlots: number; totalSlots: number }>(
        page,
        "getListingSlots",
        { listingId }
      );
      expect(before.ok).toBe(true);
      const initialSlots = before.data.availableSlots;

      // Create a HELD booking
      const booking = await testApi(page, "createHeldBooking", {
        listingId,
        slotsRequested: 1,
      });
      expect(booking.ok).toBe(true);

      // Verify slot consumed
      const during = await testApi<{ availableSlots: number }>(
        page,
        "getListingSlots",
        { listingId }
      );
      expect(during.data.availableSlots).toBe(initialSlots - 1);

      // CANCEL the held booking as the tenant (should restore slot)
      // This uses a different auth context (user2 = tenant)
      const cancelRes = await page.request.post("/api/bookings/status", {
        data: { bookingId: booking.data.id, status: "CANCELLED" },
      });

      // Verify slot restored
      const after = await testApi<{ availableSlots: number }>(
        page,
        "getListingSlots",
        { listingId }
      );
      expect(after.data.availableSlots).toBe(initialSlots);
    }
  );
});
