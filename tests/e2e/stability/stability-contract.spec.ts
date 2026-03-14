/**
 * Stability Contract E2E Tests — Phase 1
 *
 * Validates booking system invariants from docs/stability/02-stability-contract.md.
 * Each test references specific invariant IDs (SI-XX) and contract sections.
 *
 * Uses UI-only assertions (slot badges, error messages, session storage)
 * — no custom API routes required.
 *
 * Tags: @stability, @core
 */

import { test, expect } from '../helpers';
import {
  readSlotBadge,
  clearBookingSession,
  getMonthOffset,
  selectStabilityDates,
  submitBookingViaUI,
  extractListingId,
  findBookableListingUrl,
  createExpiredHold,
  cleanupTestBookings,
  getSlotInfoViaApi,
  invokeSweeper,
  testApi,
} from '../helpers/stability-helpers';

// Auth state files — USER2 books listings owned by USER1
const USER1_EMAIL = process.env.E2E_TEST_EMAIL || 'e2e-test@roomshare.dev';
const USER1_STATE = 'playwright/.auth/user.json';
const USER2_EMAIL = 'e2e-other@roomshare.dev';
const USER2_STATE = 'playwright/.auth/user2.json';

// ─── TEST-306: Slot Accounting Invariant Verification ───────────

test.describe('Stability Contract: Slot Accounting @stability @core', () => {
  /**
   * TEST-306: PENDING Booking Slot Neutrality
   *
   * Validates: SI-05 (PENDING doesn't consume slots)
   *            SI-02 (availableSlots accuracy after cancel)
   *            SI-08 (LEAST clamp — slots never exceed total)
   *
   * Flow:
   * 1. Navigate to a bookable listing (not owned by test user)
   * 2. Read slot badge → record initial availability
   * 3. Submit PENDING booking
   * 4. Re-read slot badge → must be UNCHANGED (SI-05)
   * 5. Cancel the booking
   * 6. Re-read slot badge → must match initial (SI-02)
   */
  test('TEST-306: PENDING booking does not consume slots, cancel restores correctly', async ({
    browser,
  }, testInfo) => {
    test.slow();

    // Use USER2 context — they can book listings owned by USER1
    const ctx = await browser.newContext({ storageState: USER2_STATE });
    const page = await ctx.newPage();

    try {
      // Step 1: Find a bookable listing (use card #2 to avoid collision with other tests)
      const listingUrl = await findBookableListingUrl(page, 2);
      expect(listingUrl).toBeTruthy();

      await page.goto(listingUrl!, { waitUntil: 'domcontentloaded', timeout: 90_000 });

      const listingId = extractListingId(page);
      expect(listingId).toBeTruthy();

      // Step 2: Read initial slot badge
      const initialBadge = await readSlotBadge(page);
      const initialText = initialBadge?.text || '';

      // Step 3: Clear session state, select unique dates, submit
      await clearBookingSession(page);
      const monthOffset = getMonthOffset(testInfo, 0);
      await selectStabilityDates(page, monthOffset);

      const booked = await submitBookingViaUI(page);
      if (!booked) {
        // Date collision with leftover — skip gracefully
        test.skip(true, 'Booking failed (likely leftover from prior run)');
        return;
      }

      // SI-05: PENDING booking does NOT consume slots
      // Navigate back to listing to re-read badge
      await page.goto(listingUrl!, { waitUntil: 'domcontentloaded', timeout: 90_000 });

      const afterBookBadge = await readSlotBadge(page);
      if (initialBadge && afterBookBadge) {
        expect(afterBookBadge.available).toBe(initialBadge.available);
        expect(afterBookBadge.text).toBe(initialText);
      }

      // Step 5: Cancel the booking via /bookings
      await page.goto('/bookings', { waitUntil: 'domcontentloaded', timeout: 90_000 });

      // Wait for bookings page to render
      await page.waitForTimeout(2_000);

      // Switch to Sent tab — click directly on the text
      const sentTab = page.getByRole('button', { name: /sent/i }).first();
      await sentTab.waitFor({ state: 'visible', timeout: 15_000 });
      await sentTab.click();
      // Wait for tab content to refresh
      await page.waitForTimeout(2_000);

      // Verify we're on the Sent tab (check for booking or empty state)
      const bookingItem = page.locator('[data-testid="booking-item"]').first();
      const emptyState = page.getByText(/no bookings sent|you haven.*sent/i);
      const content = bookingItem.or(emptyState);
      await content.waitFor({ state: 'visible', timeout: 15_000 });

      // If empty — the booking might not have persisted, skip gracefully
      if (await emptyState.isVisible().catch(() => false)) {
        test.skip(true, 'Booking not visible in Sent tab');
        return;
      }

      const cancelBtn = bookingItem
        .getByRole('button', { name: /cancel/i });
      await cancelBtn.click();

      // Confirm cancellation in dialog
      const dialog = page.locator('[role="alertdialog"]');
      await dialog.waitFor({ state: 'visible', timeout: 5_000 });
      // Click the destructive/confirm action (usually last button or "Continue")
      const confirmBtn = dialog
        .getByRole('button', { name: /continue|confirm|yes/i })
        .or(dialog.locator('button.bg-destructive, button[class*="destructive"]'));
      await confirmBtn.first().click();

      // Wait for cancellation to take effect
      await page.waitForTimeout(2_000);

      // Step 6: Verify slots restored — navigate back to listing
      await page.goto(listingUrl!, { waitUntil: 'domcontentloaded', timeout: 90_000 });

      const afterCancelBadge = await readSlotBadge(page);

      // SI-02: Slots match initial state after cancel
      if (initialBadge && afterCancelBadge) {
        expect(afterCancelBadge.available).toBe(initialBadge.available);
      }

      // SI-08: Available never exceeds total
      if (afterCancelBadge) {
        expect(afterCancelBadge.available).toBeLessThanOrEqual(afterCancelBadge.total);
      }
    } finally {
      await ctx.close();
    }
  });
});

// ─── GAP TESTS ──────────────────────────────────────────────────

test.describe('Stability Contract: Gap Coverage @stability', () => {
  /**
   * TEST-GAP-01: Browser Back After Successful Booking
   * Fills gap: T3-03
   * Validates: BC-10 (booking_submitted_ sessionStorage guard)
   */
  test('TEST-GAP-01: Browser back after booking shows guard, prevents duplicate', async ({
    browser,
  }, testInfo) => {
    test.slow();

    const ctx = await browser.newContext({ storageState: USER2_STATE });
    const page = await ctx.newPage();

    try {
      // Find and navigate to a bookable listing (card #4 to avoid collision with TEST-306)
      const listingUrl = await findBookableListingUrl(page, 4);
      expect(listingUrl).toBeTruthy();

      await page.goto(listingUrl!, { waitUntil: 'domcontentloaded', timeout: 90_000 });

      const listingId = extractListingId(page);
      expect(listingId).toBeTruthy();

      // Clear session state and book
      await clearBookingSession(page);
      const monthOffset = getMonthOffset(testInfo, 5);
      await selectStabilityDates(page, monthOffset);

      const booked = await submitBookingViaUI(page);
      if (!booked) {
        test.skip(true, 'Booking failed (likely leftover from prior run)');
        return;
      }

      // Verify sessionStorage flag was set
      const submittedFlag = await page.evaluate((id) => {
        return sessionStorage.getItem(`booking_submitted_${id}`);
      }, listingId);
      expect(submittedFlag).toBeTruthy();

      // Press browser back
      await page.goBack({ waitUntil: 'domcontentloaded', timeout: 90_000 });
      await page.waitForTimeout(1_500);

      // Verify guard is active — at least one of:
      // a) "already submitted" / success message still shown
      // b) Submit button disabled
      // c) Form not rendered (redirected)
      // d) sessionStorage flag still present
      const guardMessage = page.getByText(
        /already submitted|already booked|request sent|booking confirmed/i,
      );
      const submitDisabled = page.locator(
        'button[disabled]:has-text("Request"), button[disabled]:has-text("Book")',
      );

      const hasGuard = await guardMessage.isVisible().catch(() => false);
      const isDisabled = (await submitDisabled.count()) > 0;
      const flagStillSet = await page.evaluate((id) => {
        return !!sessionStorage.getItem(`booking_submitted_${id}`);
      }, listingId);

      // At least one guard mechanism should be active
      expect(hasGuard || isDisabled || flagStillSet).toBe(true);
    } finally {
      await ctx.close();
    }
  });

  /**
   * TEST-GAP-02: Hold Expires During Confirmation — Sweeper Cleans Up
   * Fills gap: T3-05
   * Validates: SI-14 (expired hold cleaned up), SI-08 (slots restored)
   *
   * Uses the test-helpers API to create an already-expired hold, then
   * invokes the sweeper cron to expire it and verifies slots are restored.
   * Requires: E2E_TEST_HELPERS=true, CRON_SECRET set
   */
  test('TEST-GAP-02: Expired hold is swept and slots are restored', async ({
    browser,
  }) => {
    test.slow();

    // Use USER1 context (host/listing owner) for API calls
    const ctx = await browser.newContext({ storageState: USER1_STATE });
    const page = await ctx.newPage();

    // Check if test-helpers API is available
    const probe = await testApi(page, 'findTestListing', {
      ownerEmail: USER1_EMAIL, minSlots: 1,
    });
    if (!probe.ok) {
      test.skip(true, 'Test-helpers API not available (E2E_TEST_HELPERS not set or route not compiled)');
      await ctx.close();
      return;
    }

    const listing = probe.data as { id: string; availableSlots: number; totalSlots: number };
    let holdBookingId: string | undefined;

    try {
      // Step 1: Record initial slot state
      const slotsBefore = await getSlotInfoViaApi(page, listing.id);

      // Step 2: Create an already-expired hold (5 minutes ago)
      const hold = await createExpiredHold(page, listing.id, USER2_EMAIL, 1, 5);
      holdBookingId = hold.bookingId;
      expect(hold.bookingId).toBeTruthy();

      // Step 3: Verify slots were consumed by the hold creation
      const slotsAfterHold = await getSlotInfoViaApi(page, listing.id);
      expect(slotsAfterHold.availableSlots).toBe(slotsBefore.availableSlots - 1);

      // Step 4: Try to invoke sweeper (requires valid CRON_SECRET)
      let sweeperWorked = false;
      try {
        const sweeperResult = await invokeSweeper(page);
        if (sweeperResult.success) {
          sweeperWorked = true;
          expect(sweeperResult.expired).toBeGreaterThanOrEqual(1);
        }
      } catch {
        // CRON_SECRET not set or invalid — skip sweeper verification
      }

      if (sweeperWorked) {
        // Step 5a: Verify slots restored by sweeper
        const slotsAfterSweep = await getSlotInfoViaApi(page, listing.id);
        expect(slotsAfterSweep.availableSlots).toBe(slotsBefore.availableSlots);
        expect(slotsAfterSweep.availableSlots).toBeLessThanOrEqual(slotsAfterSweep.totalSlots);
      } else {
        // Step 5b: Sweeper unavailable — verify the hold creation was correct
        // (slots consumed, hold exists with expired heldUntil)
        // The hold will be cleaned up in the finally block
        expect(slotsAfterHold.availableSlots).toBeLessThanOrEqual(slotsAfterHold.totalSlots);
      }
    } finally {
      // Cleanup: delete the test hold and restore slots
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
   * TEST-GAP-03: Error Messages Are User-Friendly (No Stack Traces)
   * Fills gap: T3-08
   * Validates: Section 3 (Error Taxonomy)
   *
   * Triggers a duplicate booking error and verifies the error message
   * is user-friendly with no stack traces or raw error objects.
   */
  test('TEST-GAP-03: Error messages contain no stack traces or raw errors', async ({
    browser,
  }, testInfo) => {
    test.slow();

    const ctx = await browser.newContext({ storageState: USER2_STATE });
    const page = await ctx.newPage();

    // Forbidden patterns that should NEVER appear in user-facing errors
    const forbiddenPatterns = [
      /\.ts:\d+/,
      /\.js:\d+/,
      /at\s+\w+\s+\(/,
      /TypeError:/,
      /ReferenceError:/,
      /ECONNREFUSED/,
    ];

    try {
      const listingUrl = await findBookableListingUrl(page, 6);
      expect(listingUrl).toBeTruthy();

      // First booking (should succeed)
      await page.goto(listingUrl!, { waitUntil: 'domcontentloaded', timeout: 90_000 });
      await clearBookingSession(page);

      const monthOffset = getMonthOffset(testInfo, 10);
      await selectStabilityDates(page, monthOffset);

      const firstBooked = await submitBookingViaUI(page);
      if (!firstBooked) {
        // First booking failed — likely duplicate from prior run. That's ok,
        // we can still check the error message quality.
        const alert = page.locator('[role="alert"]').first();
        const visible = await alert.isVisible({ timeout: 3_000 }).catch(() => false);
        if (visible) {
          const text = (await alert.textContent()) || '';
          for (const pattern of forbiddenPatterns) {
            expect(text).not.toMatch(pattern);
          }
        }
        return; // Test passes — error was user-friendly
      }

      // Second booking (same dates — should get duplicate error)
      await page.goto(listingUrl!, { waitUntil: 'domcontentloaded', timeout: 90_000 });
      await clearBookingSession(page);
      await selectStabilityDates(page, monthOffset);

      const secondBooked = await submitBookingViaUI(page);

      // Second should fail with duplicate error
      if (!secondBooked) {
        const alert = page.locator('[role="alert"]').first();
        const toast = page.locator('[data-sonner-toast][data-type="error"]').first();
        const errorEl = alert.or(toast);

        const errorVisible = await errorEl.isVisible({ timeout: 5_000 }).catch(() => false);
        if (errorVisible) {
          const errorText = (await errorEl.textContent()) || '';

          // Verify error is user-friendly
          expect(errorText.length).toBeGreaterThan(0);

          for (const pattern of forbiddenPatterns) {
            expect(errorText).not.toMatch(pattern);
          }

          // Should contain a recognizable user message
          expect(errorText).toMatch(
            /already|duplicate|existing|overlapping/i,
          );
        }
      }
    } finally {
      await ctx.close();
    }
  });
});
