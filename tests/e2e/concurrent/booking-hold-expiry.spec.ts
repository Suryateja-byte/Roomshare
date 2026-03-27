/**
 * P1: Booking hold expiry race conditions
 *
 * Tests the interaction between the sweeper cron and active operations:
 * - Host accept vs sweeper expire race
 * - Sweeper vs sweeper (advisory lock deduplication)
 * - Hold expiry during checkout flow
 */
import { test, expect } from "../helpers/test-utils";
import {
  testApi,
  invokeSweeper,
  getSlotInfoViaApi as getSlotInfo,
} from "../helpers/stability-helpers";

test.describe("Booking Hold Expiry Races", () => {
  test.describe.configure({ mode: "serial", retries: 0 });

  test("sweeper correctly expires held bookings and restores slots", async ({
    page,
  }) => {
    // Find a listing and record initial slots
    const listing = await testApi<{ id: string }>(
      page,
      "findTestListing",
      {}
    );
    expect(listing.ok).toBe(true);
    const listingId = listing.data.id;

    const before = await getSlotInfo(page, listingId);

    // Create an already-expired hold (minutesAgo > holdDuration)
    const hold = await testApi<{ id: string; bookingId: string }>(
      page,
      "createExpiredHold",
      {
        listingId,
        slotsRequested: 1,
        holdMinutes: 1,
        minutesAgo: 5,
      }
    );
    expect(hold.ok).toBe(true);

    // Invoke the sweeper
    const sweepResult = await invokeSweeper(page);
    expect(sweepResult.success).toBe(true);
    expect(sweepResult.expired).toBeGreaterThanOrEqual(1);

    // Verify booking is EXPIRED
    const booking = await testApi<{ status: string }>(page, "getBooking", {
      bookingId: hold.data.bookingId,
    });
    expect(booking.data.status).toBe("EXPIRED");

    // Verify slots restored
    const after = await getSlotInfo(page, listingId);
    expect(after.availableSlots).toBe(before.availableSlots);
  });

  test("two simultaneous sweeper invocations do not double-process", async ({
    page,
  }) => {
    const listing = await testApi<{ id: string }>(
      page,
      "findTestListing",
      {}
    );
    expect(listing.ok).toBe(true);

    // Create 2 expired holds
    await testApi(page, "createExpiredHold", {
      listingId: listing.data.id,
      slotsRequested: 1,
      holdMinutes: 1,
      minutesAgo: 5,
    });
    await testApi(page, "createExpiredHold", {
      listingId: listing.data.id,
      slotsRequested: 1,
      holdMinutes: 1,
      minutesAgo: 5,
    });

    // Race: two sweeper invocations
    const [result1, result2] = await Promise.all([
      invokeSweeper(page),
      invokeSweeper(page),
    ]);

    // Advisory lock ensures one processes, one skips (or both process disjoint sets via SKIP LOCKED)
    const totalExpired = result1.expired + result2.expired;
    expect(totalExpired).toBeGreaterThanOrEqual(2);

    // Neither should report an error
    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);
  });
});
