/**
 * Booking Lifecycle Journeys (J21–J24)
 *
 * J21: Full booking request submission
 * J22: Booking rejection flow
 * J23: Booking cancellation
 * J24: Double-booking prevention
 */

import { test, expect, selectors, timeouts, SF_BOUNDS, searchResultsContainer } from "../helpers";

test.beforeEach(async () => {
  test.slow();
});

// ─── J21: Full Booking Request Submission ─────────────────────────────────────
test.describe("J21: Full Booking Request Submission", () => {
  test("search → listing detail → submit booking → verify on bookings page", async ({
    page,
    nav,
  }) => {
    // Step 1: Search for a listing NOT owned by test user (reviewer's listing)
    await nav.goToSearch({ q: "Reviewer Nob Hill", bounds: SF_BOUNDS });
    await page.waitForLoadState('domcontentloaded');

    const cards = searchResultsContainer(page).locator(selectors.listingCard);
    const count = await cards.count();
    test.skip(count === 0, "Reviewer listing not found — skipping");

    // Step 2: Navigate to a listing detail
    await nav.clickListingCard(0);
    await page.waitForURL(/\/listings\//, { timeout: timeouts.navigation, waitUntil: "commit" });
    await page.waitForLoadState('domcontentloaded');

    // Step 3: Verify booking button is visible
    const requestToBookBtn = page
      .locator("main")
      .getByRole("button", { name: /request to book/i })
      .first();
    const canBook = await requestToBookBtn.isVisible().catch(() => false);
    test.skip(!canBook, "No 'Request to Book' button — skipping (owner view or unavailable)");

    // Step 4: Select booking dates (offset 14 months to avoid collision with J24's 3-11 range)
    await selectBookingDates(page, 14);

    // Step 5: Click "Request to Book" → confirmation modal
    await requestToBookBtn.click();

    const confirmModal = page.locator('[role="dialog"][aria-modal="true"]');
    await expect(confirmModal).toBeVisible({ timeout: 10_000 });

    // Step 6: Click "Confirm Booking"
    const confirmBookingBtn = confirmModal.getByRole('button', { name: /confirm booking/i });
    await expect(confirmBookingBtn).toBeVisible({ timeout: 5_000 });
    await confirmBookingBtn.click();

    // Step 7: Verify success — require success-specific text (not any toast)
    await expect(
      page.getByText(/request sent|booking confirmed|submitted|pending/i)
        .or(page.locator(selectors.toast).filter({ hasText: /sent|confirmed|success/i }))
        .first()
    ).toBeVisible({ timeout: 15_000 });
  });
});

// ─── J22: Booking Rejection Flow ──────────────────────────────────────────────
test.describe("J22: Booking Rejection Flow", () => {
  test("navigate to bookings → find pending → reject", async ({
    page,
    nav,
  }) => {
    // Step 1: Go to bookings page
    await nav.goToBookings();
    await page.waitForLoadState('domcontentloaded');

    // Step 2: Look for a PENDING booking
    const pendingBadge = page.locator("main").getByText(/pending/i).first();
    const hasPending = await pendingBadge.isVisible().catch(() => false);
    test.skip(!hasPending, "No PENDING booking found — skipping");

    // Step 3: Click to open the booking details
    const bookingRow = pendingBadge.locator("xpath=ancestor::*[self::tr or self::div[contains(@class,'card') or contains(@class,'booking')]]").first();
    const detailLink = bookingRow.locator("a").first();
    if (await detailLink.isVisible().catch(() => false)) {
      await detailLink.click();
      await page.waitForLoadState('domcontentloaded');
    }

    // Step 4: Look for reject/decline button
    const rejectBtn = page
      .getByRole("button", { name: /reject|decline|deny/i })
      .first();
    const canReject = await rejectBtn.isVisible().catch(() => false);
    test.skip(!canReject, "No reject button visible — skipping");

    await rejectBtn.click();
    await page.locator('[role="dialog"], [role="alertdialog"], textarea').first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});

    // Fill rejection reason if dialog appears
    const reasonField = page.getByPlaceholder(/reason/i).or(page.locator('textarea'));
    if (await reasonField.first().isVisible().catch(() => false)) {
      await reasonField.first().fill("Not a good fit at this time.");
    }

    // Confirm rejection
    const confirmBtn = page.getByRole("button", { name: /confirm|submit|yes/i }).first();
    if (await confirmBtn.isVisible().catch(() => false)) {
      await confirmBtn.click();
      await page.waitForLoadState('domcontentloaded');
    }

    // Step 5: Verify rejection — require rejection-specific text (not any toast)
    await expect(
      page.getByText(/rejected|declined/i)
        .or(page.locator(selectors.toast).filter({ hasText: /rejected|declined|updated/i }))
        .first()
    ).toBeVisible({ timeout: 15_000 });
  });
});

// ─── J23: Booking Cancellation ────────────────────────────────────────────────
test.describe("J23: Booking Cancellation", () => {
  test("navigate to bookings → find accepted → cancel → verify persists after refresh", async ({
    page,
    nav,
  }) => {
    // Step 1: Go to bookings page
    await nav.goToBookings();
    await page.waitForLoadState('domcontentloaded');

    // Step 2: Look for an ACCEPTED booking
    const acceptedBadge = page.locator("main").getByText(/accepted|confirmed|active/i).first();
    const hasAccepted = await acceptedBadge.isVisible().catch(() => false);
    test.skip(!hasAccepted, "No ACCEPTED booking found — skipping");

    // Step 3: Click to view details
    const bookingRow = acceptedBadge.locator("xpath=ancestor::*[self::tr or self::div[contains(@class,'card') or contains(@class,'booking')]]").first();
    const detailLink = bookingRow.locator("a").first();
    if (await detailLink.isVisible().catch(() => false)) {
      await detailLink.click();
      await page.waitForLoadState('domcontentloaded');
    }

    // Step 4: Click cancel button
    const cancelBtn = page
      .getByRole("button", { name: /cancel/i })
      .first();
    const canCancel = await cancelBtn.isVisible().catch(() => false);
    test.skip(!canCancel, "No cancel button visible — skipping");

    await cancelBtn.click();
    await page.locator('[role="dialog"], [role="alertdialog"]').first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});

    // Confirm in dialog
    const confirmBtn = page.getByRole("button", { name: /confirm|yes|cancel booking/i }).first();
    if (await confirmBtn.isVisible().catch(() => false)) {
      await confirmBtn.click();
      await page.waitForLoadState('domcontentloaded');
    }

    // Step 5: Verify cancellation — require cancellation-specific text (not any toast)
    await expect(
      page.getByText(/cancelled|canceled/i)
        .or(page.locator(selectors.toast).filter({ hasText: /cancelled|canceled/i }))
        .first()
    ).toBeVisible({ timeout: 15_000 });

    // Step 6: Refresh and verify persistence
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    const stillCancelled = page.getByText(/cancelled|canceled/i).first();
    const persists = await stillCancelled.isVisible().catch(() => false);
    expect(persists).toBeTruthy();
  });
});

// ─── J24: Double-Booking Prevention ───────────────────────────────────────────

/**
 * Select booking dates via the DatePicker UI.
 * Navigates `startMonths` months forward for start date (day 1),
 * and `startMonths + 2` months forward for end date (day 1).
 * This ensures >=30 days (MIN_BOOKING_DAYS) and unique date windows per browser.
 */
async function selectBookingDates(page: import('@playwright/test').Page, startMonths: number) {
  // --- Start date ---
  const startDateTrigger = page.locator('#booking-start-date');
  await startDateTrigger.scrollIntoViewIfNeeded();
  // Wait for Radix hydration: SSR placeholder lacks data-state, hydrated Popover.Trigger has it
  await page.locator('#booking-start-date[data-state]').waitFor({ state: 'attached', timeout: 15_000 });
  await startDateTrigger.click();

  const nextMonthBtnStart = page.locator('button[aria-label="Next month"]');
  await nextMonthBtnStart.waitFor({ state: 'visible', timeout: 10_000 });
  for (let i = 0; i < startMonths; i++) {
    await nextMonthBtnStart.click();
    await page.waitForTimeout(250);
  }

  // Select day 1 from the calendar (unique, always exists)
  const startDayBtn = page
    .locator('[data-radix-popper-content-wrapper] button, [class*="popover"] button')
    .filter({ hasText: /^1$/ })
    .first();
  await startDayBtn.waitFor({ state: 'visible', timeout: 5_000 });
  // dispatchEvent works even when portal lands outside viewport (mobile)
  await startDayBtn.dispatchEvent('click');
  await page.waitForTimeout(500);

  // --- End date ---
  const endDateTrigger = page.locator('#booking-end-date');
  await endDateTrigger.scrollIntoViewIfNeeded();
  await page.locator('#booking-end-date[data-state]').waitFor({ state: 'attached', timeout: 10_000 });
  await endDateTrigger.click();
  await page.waitForTimeout(300);

  const nextMonthBtnEnd = page.locator('button[aria-label="Next month"]');
  await nextMonthBtnEnd.waitFor({ state: 'visible', timeout: 10_000 });
  // End date picker opens at CURRENT month, not start-date's month.
  // Navigate startMonths + 2 from current month to land 2 months after start date.
  for (let i = 0; i < startMonths + 2; i++) {
    await nextMonthBtnEnd.click();
    await page.waitForTimeout(250);
  }

  // Select day 1 for end date
  const endDayBtn = page
    .locator('[data-radix-popper-content-wrapper] button, [class*="popover"] button')
    .filter({ hasText: /^1$/ })
    .first();
  await endDayBtn.waitFor({ state: 'visible', timeout: 5_000 });
  await endDayBtn.dispatchEvent('click');
  await page.waitForTimeout(500);
}

test.describe("J24: Double-Booking Prevention", () => {
  test("submit booking → clear session → attempt duplicate → assert server rejection", async ({
    page,
    nav,
  }) => {
    const testInfo = test.info();

    // Per-project month offsets to avoid date collisions across parallel browsers
    const MONTH_OFFSETS: Record<string, number> = {
      'chromium': 3, 'firefox': 5, 'webkit': 7,
      'Mobile Chrome': 9, 'Mobile Safari': 11,
    };
    const monthOffset = (MONTH_OFFSETS[testInfo.project.name] ?? 4) + (testInfo.retry * 2);

    // Step 1: Search for a listing NOT owned by test user
    await nav.goToSearch({ q: "Reviewer Nob Hill", bounds: SF_BOUNDS });
    await page.waitForLoadState('domcontentloaded');

    const cards = searchResultsContainer(page).locator(selectors.listingCard);
    const count = await cards.count();
    test.skip(count === 0, "Reviewer listing not found — skipping");

    // Step 2: Navigate to listing detail and extract listingId
    await nav.clickListingCard(0);
    await page.waitForURL(/\/listings\//, { timeout: timeouts.navigation, waitUntil: "commit" });
    await page.waitForLoadState('domcontentloaded');

    const listingId = page.url().match(/\/listings\/([^/?#]+)/)?.[1];
    test.skip(!listingId, "Could not extract listingId from URL — skipping");

    // Step 3: Verify booking button is visible
    const requestToBookBtn = page
      .locator("main")
      .getByRole("button", { name: /request to book/i })
      .first();
    const canBook = await requestToBookBtn.isVisible().catch(() => false);
    test.skip(!canBook, "No 'Request to Book' button — skipping (owner view or unavailable)");

    // Step 4: Clear stale sessionStorage keys from prior runs
    await page.evaluate((id) => {
      sessionStorage.removeItem(`booking_submitted_${id}`);
      sessionStorage.removeItem(`booking_pending_key_${id}`);
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const k = sessionStorage.key(i);
        if (k?.startsWith('booking_key_')) sessionStorage.removeItem(k);
      }
    }, listingId);

    // ──── PHASE 1: Submit first booking successfully ────

    // Step 5: Select unique dates for this browser project
    await selectBookingDates(page, monthOffset);

    // Step 6: Click "Request to Book" → confirmation modal
    await requestToBookBtn.click();

    const confirmModal = page.locator('[role="dialog"][aria-modal="true"]');
    await expect(confirmModal).toBeVisible({ timeout: 10_000 });

    // Step 7: Click "Confirm Booking"
    const confirmBookingBtn = confirmModal.getByRole('button', { name: /confirm booking/i });
    await expect(confirmBookingBtn).toBeVisible({ timeout: 5_000 });
    await confirmBookingBtn.click();

    // Step 8: Assert first booking succeeded specifically
    const successIndicator = page.getByText(/request sent|booking confirmed|submitted/i)
      .or(page.locator(selectors.toast).filter({ hasText: /sent|confirmed|success/i }));
    await expect(successIndicator.first()).toBeVisible({ timeout: 15_000 });

    // ──── PHASE 2: Attempt duplicate booking, expect rejection ────

    // Step 9: Clear sessionStorage to reset client-side guards
    await page.evaluate((id) => {
      sessionStorage.removeItem(`booking_submitted_${id}`);
      sessionStorage.removeItem(`booking_pending_key_${id}`);
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const k = sessionStorage.key(i);
        if (k?.startsWith('booking_key_')) sessionStorage.removeItem(k);
      }
    }, listingId);

    // Step 10: Navigate back to listing detail
    await page.goto(`/listings/${listingId}`);
    await page.waitForLoadState('domcontentloaded');

    // Wait for booking form to hydrate
    await page.locator('#booking-start-date[data-state]').waitFor({ state: 'attached', timeout: 15_000 });

    // Step 11: Select the SAME dates as phase 1
    await selectBookingDates(page, monthOffset);

    // Step 12: Click "Request to Book" → confirmation modal
    const requestToBookBtn2 = page
      .locator("main")
      .getByRole("button", { name: /request to book/i })
      .first();
    await requestToBookBtn2.click();

    const confirmModal2 = page.locator('[role="dialog"][aria-modal="true"]');
    await expect(confirmModal2).toBeVisible({ timeout: 10_000 });

    // Step 13: Click "Confirm Booking"
    const confirmBookingBtn2 = confirmModal2.getByRole('button', { name: /confirm booking/i });
    await expect(confirmBookingBtn2).toBeVisible({ timeout: 5_000 });
    await confirmBookingBtn2.click();

    // Step 14: Assert server rejection — BookingForm renders error in role="alert"
    // Server returns: "You already have a booking request for these exact dates."
    // or: "You already have a booking request for overlapping dates."
    const errorAlert = page.locator('[role="alert"]');
    await expect(errorAlert.first()).toBeVisible({ timeout: 15_000 });
    await expect(errorAlert.first()).toContainText(/already have a booking/i);

    // Must NOT have redirected to /bookings (that would mean success)
    expect(page.url()).toContain('/listings/');
  });
});
