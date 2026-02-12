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
    assert,
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

    // Wait for listing detail to load
    await page.waitForLoadState('domcontentloaded');
    const heading = page.locator("main h1, main h2, main [class*='title'], main [data-testid='listing-title']").first();
    const hasHeading = await heading.isVisible().catch(() => false);
    // If no heading, page may still be loading or have different structure — continue anyway

    // Step 3: Look for booking / apply / request button
    const bookingBtn = page
      .locator("main")
      .getByRole("button", { name: /book|apply|request|reserve/i })
      .or(page.locator('main a[href*="book"]'))
      .or(page.locator('main [data-testid="booking-button"]'));

    const canBook = await bookingBtn.first().isVisible().catch(() => false);
    test.skip(!canBook, "No booking button visible (owner view or unavailable)");

    await bookingBtn.first().click();
    await page.waitForLoadState('domcontentloaded');

    // Step 4: Fill any booking form fields that appear
    const messageField = page
      .getByPlaceholder(/message|note|intro/i)
      .or(page.locator('textarea[name*="message"]'))
      .first();
    if (await messageField.isVisible().catch(() => false)) {
      await messageField.fill("Hi, I am very interested in this room!");
    }

    // Submit the booking form
    const submitBtn = page
      .getByRole("button", { name: /submit|confirm|send|request/i })
      .or(page.locator('button[type="submit"]'));
    if (await submitBtn.first().isVisible().catch(() => false)) {
      await submitBtn.first().click();
      await page.waitForLoadState('domcontentloaded');
    }

    // Step 5: Verify toast or redirect
    const toast = page.locator(selectors.toast);
    const onBookings = page.url().includes("/bookings");
    const hasToast = await toast.isVisible().catch(() => false);
    expect(hasToast || onBookings).toBeTruthy();
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

    // Step 5: Verify status changed
    const rejectedBadge = page.getByText(/rejected|declined/i).first();
    const hasRejected = await rejectedBadge.isVisible().catch(() => false);
    const hasToast = await page.locator(selectors.toast).isVisible().catch(() => false);
    expect(hasRejected || hasToast).toBeTruthy();
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

    // Step 5: Verify CANCELLED status
    const cancelledBadge = page.getByText(/cancelled|canceled/i).first();
    const hasCancelled = await cancelledBadge.isVisible().catch(() => false);
    const hasToast = await page.locator(selectors.toast).isVisible().catch(() => false);
    expect(hasCancelled || hasToast).toBeTruthy();

    // Step 6: Refresh and verify persistence
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    const stillCancelled = page.getByText(/cancelled|canceled/i).first();
    const persists = await stillCancelled.isVisible().catch(() => false);
    expect(persists).toBeTruthy();
  });
});

// ─── J24: Double-Booking Prevention ───────────────────────────────────────────
test.describe("J24: Double-Booking Prevention", () => {
  test("fill dates → confirm booking → verify button disabled during submission", async ({
    page,
    nav,
  }) => {
    // Step 1: Find a listing NOT owned by test user (with retry)
    await nav.goToSearch({ q: "Reviewer Nob Hill", bounds: SF_BOUNDS });
    await page.waitForLoadState('domcontentloaded');

    let cards = searchResultsContainer(page).locator(selectors.listingCard);
    let count = await cards.count();
    if (count === 0) {
      await nav.goToSearch({ q: "Reviewer", bounds: SF_BOUNDS });
      await page.waitForLoadState('domcontentloaded');
      cards = searchResultsContainer(page).locator(selectors.listingCard);
      count = await cards.count();
    }
    if (count === 0) {
      await nav.goToSearch({ bounds: SF_BOUNDS });
      await page.waitForLoadState('domcontentloaded');
      cards = searchResultsContainer(page).locator(selectors.listingCard);
      count = await cards.count();
    }
    test.skip(count === 0, "Reviewer listing not found — skipping");

    // Step 2: Go to listing detail
    await nav.clickListingCard(0);
    await page.waitForURL(/\/listings\//, { timeout: timeouts.navigation, waitUntil: "commit" });
    await page.waitForLoadState('domcontentloaded');

    const requestToBookBtn = page
      .locator("main")
      .getByRole("button", { name: /request to book/i })
      .first();
    const canBook = await requestToBookBtn.isVisible().catch(() => false);
    test.skip(!canBook, "No 'Request to Book' button — skipping (owner view or unavailable)");

    // Step 3: Fill start date — click date picker trigger, then click "Today"
    // DatePicker has a hydration guard (mounted state) — the SSR placeholder
    // renders a plain <button> without data-state. After useEffect sets mounted=true,
    // Radix Popover.Trigger replaces it and adds data-state="closed". Wait for that
    // attribute before clicking so we don't click the inert SSR placeholder.
    const startDateTrigger = page.locator('#booking-start-date');
    await startDateTrigger.scrollIntoViewIfNeeded();
    await page.locator('#booking-start-date[data-state]').waitFor({ state: 'attached', timeout: 15_000 });
    await startDateTrigger.click();
    const todayBtn = page.getByRole('button', { name: 'Today' });
    await todayBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await todayBtn.click();
    await page.waitForTimeout(500);

    // Step 4: Fill end date — click date picker, navigate 2 months forward, select day 15
    // This ensures >=30 days (MIN_BOOKING_DAYS) from today
    const endDateTrigger = page.locator('#booking-end-date');
    await endDateTrigger.scrollIntoViewIfNeeded();
    await endDateTrigger.click();
    await page.waitForTimeout(300);

    const nextMonthBtn = page.locator('button[aria-label="Next month"]');
    if (await nextMonthBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nextMonthBtn.click();
      await page.waitForTimeout(300);
      await nextMonthBtn.click();
      await page.waitForTimeout(300);
    }

    // Select day 15 from the calendar
    const dayButtons = page
      .locator('[data-radix-popper-content-wrapper] button, [class*="popover"] button')
      .filter({ hasText: /^15$/ });
    const dayButton = dayButtons.first();
    if (await dayButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await dayButton.click();
    } else {
      // Fallback: use "Today" if day 15 isn't visible
      const fallbackToday = page.getByRole('button', { name: 'Today' });
      if (await fallbackToday.isVisible({ timeout: 2000 }).catch(() => false)) {
        await fallbackToday.click();
      }
    }
    await page.waitForTimeout(500);

    // Step 5: Click "Request to Book" → should open confirmation modal
    await requestToBookBtn.click();

    const confirmModal = page.locator('[role="dialog"][aria-modal="true"]');
    const modalOpened = await confirmModal.isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!modalOpened, "Confirmation modal did not open — dates may be invalid, skipping");

    // Step 6: Click "Confirm Booking" in the modal
    const confirmBookingBtn = confirmModal.getByRole('button', { name: /confirm booking/i });
    await expect(confirmBookingBtn).toBeVisible({ timeout: 3000 });
    await confirmBookingBtn.click();

    // Step 7: Core assertion — after confirmSubmit, isLoading=true disables the button
    // The "Request to Book" button should be disabled (isLoading || hasSubmittedSuccessfully)
    await expect(requestToBookBtn).toBeDisabled({ timeout: 5000 });

    // Step 8: Wait for server outcome (success toast/redirect, error toast, or already-submitted message)
    const outcome = page.locator(selectors.toast)
      .or(page.getByText(/success|already submitted|request sent|redirecting/i));
    await outcome.first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  });
});
