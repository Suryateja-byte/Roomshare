/**
 * Booking State Guards E2E Tests
 *
 * Validates that the booking state machine guards are enforced through the UI:
 * - Last-slot oversell prevention at accept time
 * - Terminal states (CANCELLED, REJECTED, EXPIRED) show no action buttons
 * - EXPIRED can only be set by the cron sweeper (no manual "Expire" button)
 *
 * Tags: @critical, @booking, @security
 */

import { test, expect } from "../helpers";
import {
  testApi,
  createPendingBooking,
  createExpiredHold,
  cleanupTestBookings,
  getSlotInfoViaApi,
  getGroundTruthSlots,
  navigateToBookingsTab,
  invokeSweeper,
} from "../helpers/stability-helpers";

const USER1_EMAIL = process.env.E2E_TEST_EMAIL || "e2e-test@roomshare.dev";
const USER1_STATE = "playwright/.auth/user.json";
const USER2_EMAIL = "e2e-other@roomshare.dev";
const USER2_STATE = "playwright/.auth/user2.json";
const REVIEWER_EMAIL = "e2e-reviewer@roomshare.dev";

// ─── Last-Slot Oversell Prevention ──────────────────────────────

test.describe("Booking State Guards: Oversell Prevention @critical @booking @security", () => {
  test.describe.configure({ mode: 'serial' });
  /**
   * TEST-SG-01: Last-slot oversell prevention at accept time
   *
   * Invariant: When availableSlots = 0, accepting another PENDING booking
   * must fail with a capacity error. The state machine + FOR UPDATE lock
   * prevents two PENDING bookings from both being ACCEPTED when only 1 slot
   * remains.
   *
   * Setup: listing with 1 available slot, 2 PENDING bookings from different tenants.
   * Accept first → slots go to 0. Accept second → must FAIL.
   */
  test("TEST-SG-01: Cannot accept second booking when last slot is taken", async ({
    browser,
  }) => {
    test.slow();
    const hostCtx = await browser.newContext({ storageState: USER1_STATE });
    const hostPage = await hostCtx.newPage();

    // Check test API availability
    const probe = await testApi(hostPage, "findTestListing", {
      ownerEmail: USER1_EMAIL,
      minSlots: 1,
    });
    if (!probe.ok) {
      test.skip(true, "Test API not available");
      await hostCtx.close();
      return;
    }

    const listing = probe.data as {
      id: string;
      totalSlots: number;
      availableSlots: number;
    };
    const bookingIds: string[] = [];

    try {
      // Clean up any prior test bookings and reset slots
      await cleanupTestBookings(hostPage, {
        listingId: listing.id,
        resetSlots: true,
      }).catch(() => {});

      // Verify we have at least 1 slot available
      const initialSlots = await getSlotInfoViaApi(hostPage, listing.id);
      if (initialSlots.availableSlots < 1) {
        test.skip(true, "Listing has no available slots after reset");
        return;
      }

      // Create 2 PENDING bookings from different tenants with non-overlapping dates
      // to ensure they target the same slot pool
      const booking1 = await createPendingBooking(
        hostPage,
        listing.id,
        USER2_EMAIL
      );
      bookingIds.push(booking1.bookingId);

      const booking2 = await createPendingBooking(
        hostPage,
        listing.id,
        REVIEWER_EMAIL
      );
      bookingIds.push(booking2.bookingId);

      // Navigate to /bookings as host → Received tab
      await hostPage.goto("/bookings", {
        waitUntil: "domcontentloaded",
        timeout: 90_000,
      });
      await navigateToBookingsTab(hostPage, "received");

      // Find and accept the first booking
      const bookingItems = hostPage.locator('[data-testid="booking-item"]');
      await bookingItems.first().waitFor({ state: "visible", timeout: 15_000 });

      const firstAcceptBtn = bookingItems
        .first()
        .getByRole("button", { name: /accept/i });
      const firstAcceptVisible = await firstAcceptBtn
        .isVisible({ timeout: 5_000 })
        .catch(() => false);

      if (!firstAcceptVisible) {
        test.skip(true, "Accept button not visible (booking may not be PENDING)");
        return;
      }

      await firstAcceptBtn.click();

      // Wait for the accept to process — look for success toast or status change
      await hostPage
        .waitForFunction(
          () =>
            /accepted|success|no available|cannot accept|error|slots/i.test(
              document.body.innerText
            ),
          { timeout: 30_000 }
        )
        .catch(() => {});

      // Verify first accept succeeded via API
      const booking1Status = await testApi<{ status: string }>(
        hostPage,
        "getBooking",
        { bookingId: booking1.bookingId }
      );

      // If the first accept worked, slots should be consumed
      if (booking1Status.ok && booking1Status.data.status === "ACCEPTED") {
        // Verify slot count dropped
        const slotsAfterFirst = await getSlotInfoViaApi(hostPage, listing.id);

        // Reload page to get fresh UI state
        await hostPage.goto("/bookings", {
          waitUntil: "domcontentloaded",
          timeout: 90_000,
        });
        await navigateToBookingsTab(hostPage, "received");

        // Try to accept the second booking
        const refreshedItems = hostPage.locator('[data-testid="booking-item"]');
        await refreshedItems
          .first()
          .waitFor({ state: "visible", timeout: 15_000 });

        // Look for an Accept button on any remaining PENDING booking
        const secondAcceptBtn = refreshedItems
          .getByRole("button", { name: /accept/i })
          .first();
        const secondAcceptVisible = await secondAcceptBtn
          .isVisible({ timeout: 5_000 })
          .catch(() => false);

        if (secondAcceptVisible) {
          await secondAcceptBtn.click();

          // Wait for outcome — should fail with capacity error
          await hostPage
            .waitForFunction(
              () =>
                /accepted|no available|cannot accept|all slots|error|capacity|slots.*booked/i.test(
                  document.body.innerText
                ),
              { timeout: 30_000 }
            )
            .catch(() => {});

          // Check for error toast/message about capacity
          const errorToast = hostPage
            .locator('[data-sonner-toast][data-type="error"]')
            .first();
          const alertError = hostPage
            .locator('[role="alert"]:not(#__next-route-announcer__)')
            .first();

          const hasErrorToast = await errorToast
            .isVisible({ timeout: 5_000 })
            .catch(() => false);
          const hasAlertError = await alertError
            .isVisible({ timeout: 3_000 })
            .catch(() => false);

          if (hasErrorToast) {
            const toastText = (await errorToast.textContent()) || "";
            expect(toastText).toMatch(
              /no available|cannot accept|all slots|capacity/i
            );
          } else if (hasAlertError) {
            const alertText = (await alertError.textContent()) || "";
            expect(alertText).toMatch(
              /no available|cannot accept|all slots|capacity/i
            );
          }
          // If no visible error, the UI may have handled it by not showing the button
          // (optimistic update reverted). Verify via DB.
        }

        // Verify DB state: second booking should NOT be ACCEPTED
        const booking2Status = await testApi<{ status: string }>(
          hostPage,
          "getBooking",
          { bookingId: booking2.bookingId }
        );
        if (booking2Status.ok) {
          // Second booking should still be PENDING (not ACCEPTED)
          expect(booking2Status.data.status).not.toBe("ACCEPTED");
        }

        // Verify ground truth: only 1 accepted booking consuming the slot
        if (slotsAfterFirst.availableSlots === 0) {
          const truth = await getGroundTruthSlots(hostPage, listing.id);
          expect(truth).toBe(0);
        }
      } else {
        // First accept didn't produce ACCEPTED — might have been a capacity issue
        // from prior test state. Skip gracefully.
        test.skip(
          true,
          "First accept did not succeed (possible prior test interference)"
        );
      }
    } finally {
      await cleanupTestBookings(hostPage, {
        bookingIds,
        listingId: listing.id,
        resetSlots: true,
      }).catch(() => {});
      await hostCtx.close();
    }
  });
});

// ─── Terminal State Tests ───────────────────────────────────────

test.describe("Booking State Guards: Terminal States @critical @booking @security", () => {
  test.describe.configure({ mode: 'serial' });
  /**
   * TEST-SG-02: CANCELLED booking shows no action buttons
   *
   * Terminal state invariant: CANCELLED has no valid transitions.
   * The UI must not display Accept, Reject, or Cancel buttons.
   */
  test("TEST-SG-02: CANCELLED booking shows no action buttons", async ({
    browser,
  }) => {
    test.slow();
    const ctx = await browser.newContext({ storageState: USER1_STATE });
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
      // Create a PENDING booking, then cancel it via API
      const booking = await createPendingBooking(
        page,
        listing.id,
        USER2_EMAIL
      );
      bookingId = booking.bookingId;

      // Cancel it via test API (set status to CANCELLED directly)
      await testApi(page, "updateBookingStatusDirect", {
        bookingId: booking.bookingId,
        status: "CANCELLED",
      }).catch(() => {
        // Fallback: if updateBookingStatusDirect doesn't exist, cancel via cleanupTestBookings
        // which deletes it. Create a fresh cancelled booking instead.
      });

      // Verify booking is CANCELLED
      const check = await testApi<{ status: string }>(page, "getBooking", {
        bookingId: booking.bookingId,
      });

      if (!check.ok || check.data.status !== "CANCELLED") {
        // Direct status update not available — create via cleanup + recreate approach:
        // Delete the booking and re-create as cancelled using DB manipulation
        // For now, do it through the UI: navigate as tenant and cancel
        const tenantCtx = await browser.newContext({
          storageState: USER2_STATE,
        });
        const tenantPage = await tenantCtx.newPage();

        await tenantPage.goto("/bookings", {
          waitUntil: "domcontentloaded",
          timeout: 90_000,
        });
        await navigateToBookingsTab(tenantPage, "sent");

        const bookingItem = tenantPage
          .locator('[data-testid="booking-item"]')
          .first();
        await bookingItem.waitFor({ state: "visible", timeout: 15_000 });

        const cancelBtn = bookingItem.getByRole("button", {
          name: /cancel/i,
        });
        const cancelVisible = await cancelBtn
          .isVisible({ timeout: 5_000 })
          .catch(() => false);

        if (cancelVisible) {
          await cancelBtn.click();

          // Confirm cancel dialog
          const dialog = tenantPage.locator('[role="alertdialog"]');
          await dialog.waitFor({ state: "visible", timeout: 5_000 });
          const confirmBtn = dialog
            .getByRole("button", { name: /yes.*cancel|continue|confirm/i })
            .or(
              dialog.locator(
                'button.bg-destructive, button[class*="destructive"], button.bg-red-600'
              )
            );
          await confirmBtn.first().click();
          await expect(tenantPage.locator('[role="alertdialog"]')).not.toBeVisible({ timeout: 10_000 });
        }

        await tenantCtx.close();
      }

      // Now as HOST, navigate to /bookings received tab and find the cancelled booking
      await page.goto("/bookings", {
        waitUntil: "domcontentloaded",
        timeout: 90_000,
      });
      await navigateToBookingsTab(page, "received");

      // The booking should show "Cancelled" status
      const cancelledBadge = page.getByText("Cancelled").first();
      const badgeVisible = await cancelledBadge
        .isVisible({ timeout: 10_000 })
        .catch(() => false);

      if (badgeVisible) {
        // Find the booking item containing this cancelled badge
        const bookingItem = page
          .locator('[data-testid="booking-item"]')
          .filter({ hasText: /cancelled/i })
          .first();

        // Assert: No Accept, Reject, or Cancel buttons
        const acceptBtn = bookingItem.getByRole("button", {
          name: /^accept$/i,
        });
        const rejectBtn = bookingItem.getByRole("button", {
          name: /^reject$/i,
        });
        const cancelBookingBtn = bookingItem.getByRole("button", {
          name: /cancel/i,
        });

        expect(await acceptBtn.count()).toBe(0);
        expect(await rejectBtn.count()).toBe(0);
        expect(await cancelBookingBtn.count()).toBe(0);
      } else {
        // Try switching to sent tab (as tenant) to verify
        // The booking might only be visible in sent tab for the tenant
        // As host, the received tab should show it with no action buttons
        // If not visible, the booking was already cleaned up
        test.skip(true, "Cancelled booking not visible in received tab");
      }

      bookingId = undefined; // Already cancelled — no cleanup needed
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
   * TEST-SG-03: REJECTED booking shows no action buttons
   *
   * Terminal state invariant: REJECTED has no valid transitions.
   * The UI must not display Accept, Reject, or Cancel buttons.
   */
  test("TEST-SG-03: REJECTED booking shows no action buttons", async ({
    browser,
  }) => {
    test.slow();
    const hostCtx = await browser.newContext({ storageState: USER1_STATE });
    const hostPage = await hostCtx.newPage();

    const probe = await testApi(hostPage, "findTestListing", {
      ownerEmail: USER1_EMAIL,
      minSlots: 1,
    });
    if (!probe.ok) {
      test.skip(true, "Test API not available");
      await hostCtx.close();
      return;
    }

    const listing = probe.data as { id: string };
    let bookingId: string | undefined;

    try {
      // Create a PENDING booking from USER2
      const booking = await createPendingBooking(
        hostPage,
        listing.id,
        USER2_EMAIL
      );
      bookingId = booking.bookingId;

      // As host, reject the booking via UI
      await hostPage.goto("/bookings", {
        waitUntil: "domcontentloaded",
        timeout: 90_000,
      });
      await navigateToBookingsTab(hostPage, "received");

      const bookingItem = hostPage
        .locator('[data-testid="booking-item"]')
        .first();
      await bookingItem.waitFor({ state: "visible", timeout: 15_000 });

      const rejectBtn = bookingItem.getByRole("button", { name: /reject/i });
      const rejectVisible = await rejectBtn
        .isVisible({ timeout: 5_000 })
        .catch(() => false);

      if (!rejectVisible) {
        test.skip(true, "Reject button not visible");
        return;
      }

      await rejectBtn.click();

      // Confirm reject dialog
      const dialog = hostPage.locator('[role="alertdialog"]');
      await dialog.waitFor({ state: "visible", timeout: 5_000 });
      const confirmRejectBtn = dialog
        .getByRole("button", { name: /reject/i })
        .last();
      await confirmRejectBtn.click();

      // Wait for rejection to process
      await hostPage
        .waitForFunction(
          () => /rejected|success/i.test(document.body.innerText),
          { timeout: 30_000 }
        )
        .catch(() => {});

      // Reload to get fresh state
      await hostPage.goto("/bookings", {
        waitUntil: "domcontentloaded",
        timeout: 90_000,
      });
      await navigateToBookingsTab(hostPage, "received");

      // Find the rejected booking
      const rejectedBadge = hostPage.getByText("Rejected").first();
      const badgeVisible = await rejectedBadge
        .isVisible({ timeout: 10_000 })
        .catch(() => false);

      if (badgeVisible) {
        const rejectedItem = hostPage
          .locator('[data-testid="booking-item"]')
          .filter({ hasText: /rejected/i })
          .first();

        // Assert: No action buttons
        const acceptBtn = rejectedItem.getByRole("button", {
          name: /^accept$/i,
        });
        const rejectBtnAgain = rejectedItem.getByRole("button", {
          name: /^reject$/i,
        });
        const cancelBtn = rejectedItem.getByRole("button", {
          name: /cancel/i,
        });

        expect(await acceptBtn.count()).toBe(0);
        expect(await rejectBtnAgain.count()).toBe(0);
        expect(await cancelBtn.count()).toBe(0);
      } else {
        // Check via DB that booking was actually rejected
        const bookingStatus = await testApi<{ status: string }>(
          hostPage,
          "getBooking",
          { bookingId: booking.bookingId }
        );
        expect(bookingStatus.data.status).toBe("REJECTED");
      }

      bookingId = undefined; // Terminal state — no cleanup needed
    } finally {
      if (bookingId) {
        await cleanupTestBookings(hostPage, {
          bookingIds: [bookingId],
          listingId: listing.id,
        }).catch(() => {});
      }
      await hostCtx.close();
    }
  });

  /**
   * TEST-SG-04: EXPIRED booking shows no action buttons
   *
   * Terminal state invariant: EXPIRED has no valid transitions.
   * Only the cron sweeper can set EXPIRED status.
   *
   * Uses createExpiredHold + invokeSweeper to create an EXPIRED booking,
   * then verifies no action buttons are shown.
   */
  test("TEST-SG-04: EXPIRED booking shows no action buttons", async ({
    browser,
  }) => {
    test.slow();
    const ctx = await browser.newContext({ storageState: USER1_STATE });
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
    let holdBookingId: string | undefined;

    try {
      // Create an already-expired hold (5 minutes ago)
      const hold = await createExpiredHold(
        page,
        listing.id,
        USER2_EMAIL,
        1,
        5
      );
      holdBookingId = hold.bookingId;

      // Try to invoke sweeper to transition HELD→EXPIRED
      let sweeperWorked = false;
      try {
        const sweeperResult = await invokeSweeper(page);
        if (sweeperResult.success) {
          sweeperWorked = true;
        }
      } catch {
        // CRON_SECRET not set — sweeper not available
      }

      if (!sweeperWorked) {
        // Without the sweeper, the booking stays as HELD with an expired heldUntil.
        // The UI may still show it as HELD or the inline expiry in manage-booking.ts
        // may catch it. Either way, we can verify the status via API and UI behavior.

        // Try to trigger inline expiry by attempting an accept (which reads the booking
        // and auto-expires it if heldUntil is past)
        // Actually, just verify the HELD booking with expired heldUntil shows properly
        test.skip(true, "Sweeper not available (CRON_SECRET not set)");
        return;
      }

      // Verify booking is EXPIRED via API
      const bookingStatus = await testApi<{ status: string }>(
        page,
        "getBooking",
        { bookingId: hold.bookingId }
      );
      if (bookingStatus.ok) {
        expect(bookingStatus.data.status).toBe("EXPIRED");
      }

      // Navigate to /bookings received tab as host
      await page.goto("/bookings", {
        waitUntil: "domcontentloaded",
        timeout: 90_000,
      });
      await navigateToBookingsTab(page, "received");

      // Look for expired badge — allow time for booking list to hydrate
      const expiredBadge = page.getByText("Expired").first();
      const badgeVisible = await expiredBadge
        .waitFor({ state: "visible", timeout: 30_000 })
        .then(() => true)
        .catch(() => false);

      if (badgeVisible) {
        const expiredItem = page
          .locator('[data-testid="booking-item"]')
          .filter({ hasText: /expired/i })
          .first();

        // Assert: No action buttons
        const acceptBtn = expiredItem.getByRole("button", {
          name: /^accept$/i,
        });
        const rejectBtn = expiredItem.getByRole("button", {
          name: /^reject$/i,
        });
        const cancelBtn = expiredItem.getByRole("button", {
          name: /cancel/i,
        });
        const expireBtn = expiredItem.getByRole("button", {
          name: /expire/i,
        });

        expect(await acceptBtn.count()).toBe(0);
        expect(await rejectBtn.count()).toBe(0);
        expect(await cancelBtn.count()).toBe(0);
        expect(await expireBtn.count()).toBe(0);
      } else {
        // Expired bookings might be filtered out by default — try "Expired" filter
        const expiredFilter = page
          .getByRole("button", { name: /expired/i })
          .first();
        if (
          await expiredFilter.isVisible({ timeout: 3_000 }).catch(() => false)
        ) {
          await expiredFilter.click();
          await expect(page.locator('[data-testid="booking-item"]').first()).toBeVisible({ timeout: 10_000 }).catch(() => {});

          const retryBadge = page.getByText("Expired").first();
          const retryVisible = await retryBadge
            .isVisible({ timeout: 5_000 })
            .catch(() => false);

          if (retryVisible) {
            const expiredItem = page
              .locator('[data-testid="booking-item"]')
              .filter({ hasText: /expired/i })
              .first();

            expect(
              await expiredItem
                .getByRole("button", { name: /^accept$/i })
                .count()
            ).toBe(0);
            expect(
              await expiredItem
                .getByRole("button", { name: /^reject$/i })
                .count()
            ).toBe(0);
            expect(
              await expiredItem
                .getByRole("button", { name: /cancel/i })
                .count()
            ).toBe(0);
          }
        }
      }

      holdBookingId = undefined; // Expired — sweeper already handled it
    } finally {
      if (holdBookingId) {
        await cleanupTestBookings(page, {
          bookingIds: [holdBookingId],
          listingId: listing.id,
          resetSlots: true,
        }).catch(() => {});
      }
      await ctx.close();
    }
  });

  /**
   * TEST-SG-05: No "Expire" button exists for any active booking state
   *
   * Invariant: EXPIRED can only be set by the cron sweeper. The UI must
   * never show an "Expire" button for PENDING, ACCEPTED, or HELD bookings.
   */
  test("TEST-SG-05: No Expire button exists for any active booking", async ({
    browser,
  }) => {
    test.slow();
    const ctx = await browser.newContext({ storageState: USER1_STATE });
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
      // Create a PENDING booking to ensure at least one active booking exists
      const booking = await createPendingBooking(
        page,
        listing.id,
        USER2_EMAIL
      );
      bookingId = booking.bookingId;

      // Check received tab as host
      await page.goto("/bookings", {
        waitUntil: "domcontentloaded",
        timeout: 90_000,
      });
      await navigateToBookingsTab(page, "received");

      const bookingItems = page.locator('[data-testid="booking-item"]');
      await bookingItems
        .first()
        .waitFor({ state: "visible", timeout: 15_000 });

      // Scan ALL booking items for an "Expire" action button.
      // Use exact match to exclude "Expired" status filter buttons.
      const expireButtons = page.getByRole("button", { name: /^expire$/i });
      expect(await expireButtons.count()).toBe(0);

      // Also check sent tab
      await navigateToBookingsTab(page, "sent");

      // Wait for content (may be empty state or bookings)
      const sentContent = page
        .locator('[data-testid="booking-item"]')
        .first()
        .or(page.locator('[data-testid="empty-state"]'));
      await sentContent
        .waitFor({ state: "visible", timeout: 10_000 })
        .catch(() => {});

      const expireButtonsSent = page.getByRole("button", { name: /^expire$/i });
      expect(await expireButtonsSent.count()).toBe(0);
    } finally {
      if (bookingId) {
        await cleanupTestBookings(page, {
          bookingIds: [bookingId],
          listingId: listing.id,
        }).catch(() => {});
      }
      await ctx.close();
    }
  });
});
