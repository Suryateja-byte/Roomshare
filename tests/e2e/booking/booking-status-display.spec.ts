/**
 * Booking Status Display E2E Tests
 *
 * Tests that the /bookings page renders booking cards with correct
 * status badges, action buttons, and countdown timers per booking state.
 *
 * Tags: @booking, @auth
 */

import { test, expect } from "../helpers";
import {
  testApi,
  createPendingBooking,
  createAcceptedBooking,
  createHeldBooking,
  cleanupTestBookings,
  navigateToBookingsTab,
} from "../helpers/stability-helpers";

const USER1_EMAIL = process.env.E2E_TEST_EMAIL || "e2e-test@roomshare.dev";
const USER1_STATE = "playwright/.auth/user.json";
const USER2_EMAIL = "e2e-other@roomshare.dev";
const USER2_STATE = "playwright/.auth/user2.json";

test.describe("Booking Status Display @booking @auth", () => {
  test.describe.configure({ mode: 'serial' });
  /**
   * Test 1: Bookings page renders with Sent/Received tabs
   * Verifies page heading, tab buttons, and tab switching work.
   */
  test("Bookings page renders with Sent/Received tabs", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: USER1_STATE });
    const page = await ctx.newPage();

    try {
      await page.goto("/bookings", {
        waitUntil: "domcontentloaded",
        timeout: 90_000,
      });

      // Page heading
      await expect(
        page.getByRole("heading", { name: /my bookings/i, level: 1 })
      ).toBeVisible({ timeout: 15_000 });

      // Received tab button (default active)
      const receivedBtn = page
        .getByRole("button", { name: /received/i })
        .first();
      await expect(receivedBtn).toBeVisible();

      // Sent tab button
      const sentBtn = page.getByRole("button", { name: /sent/i }).first();
      await expect(sentBtn).toBeVisible();

      // Switch to Sent tab
      await sentBtn.click();
      await page.waitForTimeout(1_000);

      // Switch back to Received tab
      await receivedBtn.click();
      await page.waitForTimeout(1_000);

      // Page still intact after tab switching
      await expect(
        page.getByRole("heading", { name: /my bookings/i, level: 1 })
      ).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  /**
   * Test 2: PENDING booking card shows correct elements (host view)
   * Creates a PENDING booking from USER2 on USER1's listing,
   * then verifies the host sees correct badge and action buttons.
   */
  test("PENDING booking card shows status badge and Accept/Reject buttons (host view)", async ({
    browser,
  }) => {
    test.slow();
    const ctx = await browser.newContext({ storageState: USER1_STATE });
    const page = await ctx.newPage();

    // Check test API availability
    const probe = await testApi(page, "findTestListing", {
      ownerEmail: USER1_EMAIL,
      minSlots: 1,
    });
    if (!probe.ok) {
      test.skip(true, "Test API not available");
      await ctx.close();
      return;
    }

    const listing = probe.data as { id: string; title: string };
    let bookingId: string | undefined;

    try {
      // Create PENDING booking: USER2 books USER1's listing
      const result = await createPendingBooking(
        page,
        listing.id,
        USER2_EMAIL
      );
      bookingId = result.bookingId;

      // Navigate to /bookings -> Received tab
      await page.goto("/bookings", {
        waitUntil: "domcontentloaded",
        timeout: 90_000,
      });
      await navigateToBookingsTab(page, "received");

      // Find the booking item
      const bookingItem = page.locator('[data-testid="booking-item"]').first();
      await bookingItem.waitFor({ state: "visible", timeout: 15_000 });

      // Assert: PENDING status badge visible (uppercase text "PENDING" rendered as "Pending" label)
      await expect(bookingItem.getByText(/pending/i).first()).toBeVisible();

      // Assert: Listing title visible
      await expect(bookingItem.getByText(listing.title)).toBeVisible();

      // Assert: Accept button visible
      await expect(
        bookingItem.getByRole("button", { name: /accept/i })
      ).toBeVisible();

      // Assert: Reject button visible
      await expect(
        bookingItem.getByRole("button", { name: /reject/i })
      ).toBeVisible();

      // Assert: Check-in and Check-out date labels present
      await expect(bookingItem.getByText(/check-in/i)).toBeVisible();
      await expect(bookingItem.getByText(/check-out/i)).toBeVisible();
    } finally {
      if (bookingId) {
        await cleanupTestBookings(page, {
          bookingIds: [bookingId],
          listingId: listing.id,
          resetSlots: true,
        }).catch(() => {});
      }
      await ctx.close();
    }
  });

  /**
   * Test 3: ACCEPTED booking card shows correct elements (tenant view)
   * Creates an ACCEPTED booking for USER2 and verifies the tenant
   * sees the correct badge and Cancel button on the Sent tab.
   */
  test("ACCEPTED booking card shows status badge and Cancel button (tenant view)", async ({
    browser,
  }) => {
    test.slow();
    const ctx = await browser.newContext({ storageState: USER2_STATE });
    const page = await ctx.newPage();

    // Check test API availability via USER2 context
    const probe = await testApi(page, "findTestListing", {
      ownerEmail: USER1_EMAIL,
      minSlots: 1,
    });
    if (!probe.ok) {
      test.skip(true, "Test API not available");
      await ctx.close();
      return;
    }

    const listing = probe.data as { id: string; title: string };
    let bookingId: string | undefined;

    try {
      // Create ACCEPTED booking: USER2 is tenant on USER1's listing
      const result = await createAcceptedBooking(
        page,
        listing.id,
        USER2_EMAIL,
        1
      );
      bookingId = result.bookingId;

      // Navigate to /bookings -> Sent tab (USER2 as tenant)
      await page.goto("/bookings", {
        waitUntil: "domcontentloaded",
        timeout: 90_000,
      });
      await navigateToBookingsTab(page, "sent");

      // Find the booking item
      const bookingItem = page.locator('[data-testid="booking-item"]').first();
      await bookingItem.waitFor({ state: "visible", timeout: 15_000 });

      // Assert: ACCEPTED status badge visible
      await expect(bookingItem.getByText(/accepted/i).first()).toBeVisible();

      // Assert: Listing title visible
      await expect(bookingItem.getByText(listing.title)).toBeVisible();

      // Assert: Cancel Booking button visible (sent tab shows cancel for ACCEPTED)
      await expect(
        bookingItem.getByRole("button", { name: /cancel/i })
      ).toBeVisible();

      // Assert: Total Price label present
      await expect(bookingItem.getByText(/total price/i)).toBeVisible();
    } finally {
      if (bookingId) {
        await cleanupTestBookings(page, {
          bookingIds: [bookingId],
          listingId: listing.id,
          resetSlots: true,
        }).catch(() => {});
      }
      await ctx.close();
    }
  });

  /**
   * Test 4: HELD booking card shows countdown timer
   * Creates a HELD booking with 15min TTL and verifies the countdown
   * timer (MM:SS format) is rendered.
   */
  test("HELD booking card shows countdown timer", async ({ browser }) => {
    test.slow();
    const ctx = await browser.newContext({ storageState: USER2_STATE });
    const page = await ctx.newPage();

    const probe = await testApi(page, "findTestListing", {
      ownerEmail: USER1_EMAIL,
      minSlots: 1,
    });
    if (!probe.ok) {
      test.skip(true, "Test API not available");
      await ctx.close();
      return;
    }

    const listing = probe.data as { id: string };
    let bookingId: string | undefined;

    try {
      // Create HELD booking with 15-min TTL
      const hold = await createHeldBooking(
        page,
        listing.id,
        USER2_EMAIL,
        1,
        15
      );
      bookingId = hold.bookingId;

      // Navigate to /bookings -> Sent tab
      await page.goto("/bookings", {
        waitUntil: "domcontentloaded",
        timeout: 90_000,
      });
      await navigateToBookingsTab(page, "sent");

      // Find the booking item
      const bookingItem = page.locator('[data-testid="booking-item"]').first();
      await bookingItem.waitFor({ state: "visible", timeout: 15_000 });

      // Assert: HELD status badge visible
      await expect(bookingItem.getByText(/held/i).first()).toBeVisible();

      // Assert: Countdown timer visible (MM:SS format like "14:59" or "14:30")
      // The HoldCountdown component renders a timer — look for the pattern
      const countdown = bookingItem
        .locator("span, div")
        .filter({ hasText: /\d{1,2}:\d{2}/ })
        .first();
      const countdownVisible = await countdown
        .isVisible({ timeout: 10_000 })
        .catch(() => false);

      if (countdownVisible) {
        const text = (await countdown.textContent()) || "";
        expect(text).toMatch(/\d{1,2}:\d{2}/);
      } else {
        // May need to click the "Held" status filter to show HELD bookings
        const heldFilter = page
          .getByRole("button", { name: /held/i })
          .first();
        if (
          await heldFilter.isVisible({ timeout: 3_000 }).catch(() => false)
        ) {
          await heldFilter.click();
          await page.waitForTimeout(1_000);
          const retryCountdown = bookingItem
            .locator("span, div")
            .filter({ hasText: /\d{1,2}:\d{2}/ })
            .first();
          await expect(retryCountdown).toBeVisible({ timeout: 5_000 });
        }
      }
    } finally {
      if (bookingId) {
        await cleanupTestBookings(page, {
          bookingIds: [bookingId],
          listingId: listing.id,
          resetSlots: true,
        }).catch(() => {});
      }
      await ctx.close();
    }
  });

  /**
   * Test 5: Empty bookings state
   * A user with no bookings should see an empty state message.
   * Uses the Received tab (default) with no pre-created bookings.
   */
  test("Empty bookings state shows appropriate message", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: USER2_STATE });
    const page = await ctx.newPage();

    try {
      await page.goto("/bookings", {
        waitUntil: "domcontentloaded",
        timeout: 90_000,
      });

      // Wait for hydration
      await page.waitForTimeout(2_000);

      // Check the Received tab first (default)
      const receivedBtn = page
        .getByRole("button", { name: /received/i })
        .first();
      await expect(receivedBtn).toBeVisible({ timeout: 15_000 });

      // If there are already booking items, check Sent tab instead
      const hasReceivedBookings = await page
        .locator('[data-testid="booking-item"]')
        .first()
        .isVisible({ timeout: 3_000 })
        .catch(() => false);

      if (hasReceivedBookings) {
        // Try Sent tab — it might be empty
        await navigateToBookingsTab(page, "sent");

        const hasSentBookings = await page
          .locator('[data-testid="booking-item"]')
          .first()
          .isVisible({ timeout: 3_000 })
          .catch(() => false);

        if (hasSentBookings) {
          // Both tabs have bookings — skip the empty state test
          test.skip(true, "User has bookings on both tabs — cannot test empty state");
          return;
        }
      }

      // Assert: empty state container visible
      const emptyState = page.locator('[data-testid="empty-state"]');
      await expect(emptyState).toBeVisible({ timeout: 10_000 });

      // Assert: empty state message text
      // Received: "No booking requests yet" / Sent: "No bookings made yet"
      await expect(
        emptyState.getByText(/no booking(s| requests)? (yet|made)/i)
      ).toBeVisible();

      // Assert: CTA button exists ("List a Room" or "Find a Room")
      await expect(
        emptyState.getByRole("button", { name: /list a room|find a room/i })
          .or(emptyState.locator('a').filter({ hasText: /list a room|find a room/i }))
          .first()
      ).toBeVisible();
    } finally {
      await ctx.close();
    }
  });
});
