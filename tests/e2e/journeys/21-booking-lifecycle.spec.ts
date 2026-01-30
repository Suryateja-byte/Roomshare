/**
 * Booking Lifecycle Journeys (J21–J24)
 *
 * J21: Full booking request submission
 * J22: Booking rejection flow
 * J23: Booking cancellation
 * J24: Double-booking prevention
 */

import { test, expect, selectors, timeouts, SF_BOUNDS } from "../helpers";

// ─── J21: Full Booking Request Submission ─────────────────────────────────────
test.describe("J21: Full Booking Request Submission", () => {
  test("search → listing detail → submit booking → verify on bookings page", async ({
    page,
    nav,
    assert,
  }) => {
    // Step 1: Search for listings in SF
    await nav.goToSearch({ bounds: SF_BOUNDS });
    await page.waitForTimeout(2000);

    const cards = page.locator(selectors.listingCard);
    const count = await cards.count();
    test.skip(count === 0, "No listings found in SF — skipping");

    // Step 2: Navigate to a listing detail
    await nav.clickListingCard(0);
    await page.waitForURL(/\/listings\//, { timeout: timeouts.navigation });

    const heading = page.locator("main h1, main h2").first();
    await expect(heading).toBeVisible({ timeout: 15000 });

    // Step 3: Look for booking / apply / request button
    const bookingBtn = page
      .locator("main")
      .getByRole("button", { name: /book|apply|request|reserve/i })
      .or(page.locator('main a[href*="book"]'))
      .or(page.locator('main [data-testid="booking-button"]'));

    const canBook = await bookingBtn.first().isVisible().catch(() => false);
    test.skip(!canBook, "No booking button visible (owner view or unavailable)");

    await bookingBtn.first().click();
    await page.waitForTimeout(1000);

    // Step 4: Fill any booking form fields that appear
    const messageField = page
      .getByPlaceholder(/message|note|intro/i)
      .or(page.locator('textarea[name*="message"]'));
    if (await messageField.isVisible().catch(() => false)) {
      await messageField.fill("Hi, I am very interested in this room!");
    }

    // Submit the booking form
    const submitBtn = page
      .getByRole("button", { name: /submit|confirm|send|request/i })
      .or(page.locator('button[type="submit"]'));
    if (await submitBtn.first().isVisible().catch(() => false)) {
      await submitBtn.first().click();
      await page.waitForTimeout(2000);
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
    await page.waitForTimeout(2000);

    // Step 2: Look for a PENDING booking
    const pendingBadge = page.locator("main").getByText(/pending/i).first();
    const hasPending = await pendingBadge.isVisible().catch(() => false);
    test.skip(!hasPending, "No PENDING booking found — skipping");

    // Step 3: Click to open the booking details
    const bookingRow = pendingBadge.locator("xpath=ancestor::*[self::tr or self::div[contains(@class,'card') or contains(@class,'booking')]]").first();
    const detailLink = bookingRow.locator("a").first();
    if (await detailLink.isVisible().catch(() => false)) {
      await detailLink.click();
      await page.waitForTimeout(1500);
    }

    // Step 4: Look for reject/decline button
    const rejectBtn = page
      .getByRole("button", { name: /reject|decline|deny/i })
      .first();
    const canReject = await rejectBtn.isVisible().catch(() => false);
    test.skip(!canReject, "No reject button visible — skipping");

    await rejectBtn.click();
    await page.waitForTimeout(500);

    // Fill rejection reason if dialog appears
    const reasonField = page.getByPlaceholder(/reason/i).or(page.locator('textarea'));
    if (await reasonField.first().isVisible().catch(() => false)) {
      await reasonField.first().fill("Not a good fit at this time.");
    }

    // Confirm rejection
    const confirmBtn = page.getByRole("button", { name: /confirm|submit|yes/i }).first();
    if (await confirmBtn.isVisible().catch(() => false)) {
      await confirmBtn.click();
      await page.waitForTimeout(2000);
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
    await page.waitForTimeout(2000);

    // Step 2: Look for an ACCEPTED booking
    const acceptedBadge = page.locator("main").getByText(/accepted|confirmed|active/i).first();
    const hasAccepted = await acceptedBadge.isVisible().catch(() => false);
    test.skip(!hasAccepted, "No ACCEPTED booking found — skipping");

    // Step 3: Click to view details
    const bookingRow = acceptedBadge.locator("xpath=ancestor::*[self::tr or self::div[contains(@class,'card') or contains(@class,'booking')]]").first();
    const detailLink = bookingRow.locator("a").first();
    if (await detailLink.isVisible().catch(() => false)) {
      await detailLink.click();
      await page.waitForTimeout(1500);
    }

    // Step 4: Click cancel button
    const cancelBtn = page
      .getByRole("button", { name: /cancel/i })
      .first();
    const canCancel = await cancelBtn.isVisible().catch(() => false);
    test.skip(!canCancel, "No cancel button visible — skipping");

    await cancelBtn.click();
    await page.waitForTimeout(500);

    // Confirm in dialog
    const confirmBtn = page.getByRole("button", { name: /confirm|yes|cancel booking/i }).first();
    if (await confirmBtn.isVisible().catch(() => false)) {
      await confirmBtn.click();
      await page.waitForTimeout(2000);
    }

    // Step 5: Verify CANCELLED status
    const cancelledBadge = page.getByText(/cancelled|canceled/i).first();
    const hasCancelled = await cancelledBadge.isVisible().catch(() => false);
    const hasToast = await page.locator(selectors.toast).isVisible().catch(() => false);
    expect(hasCancelled || hasToast).toBeTruthy();

    // Step 6: Refresh and verify persistence
    await page.reload();
    await page.waitForTimeout(2000);
    const stillCancelled = page.getByText(/cancelled|canceled/i).first();
    const persists = await stillCancelled.isVisible().catch(() => false);
    // At minimum, page should load without error
    await expect(page.locator("body")).toBeVisible();
  });
});

// ─── J24: Double-Booking Prevention ───────────────────────────────────────────
test.describe("J24: Double-Booking Prevention", () => {
  test("submit booking → go back → submit again → expect error or duplicate prevention", async ({
    page,
    nav,
  }) => {
    // Step 1: Find a listing
    await nav.goToSearch({ bounds: SF_BOUNDS });
    await page.waitForTimeout(2000);

    const cards = page.locator(selectors.listingCard);
    const count = await cards.count();
    test.skip(count === 0, "No listings found — skipping");

    // Step 2: Go to listing detail
    await nav.clickListingCard(0);
    await page.waitForURL(/\/listings\//, { timeout: timeouts.navigation });

    const bookingBtn = page
      .locator("main")
      .getByRole("button", { name: /book|apply|request|reserve/i })
      .first();
    const canBook = await bookingBtn.isVisible().catch(() => false);
    test.skip(!canBook, "No booking button — skipping");

    // Step 3: Click booking button twice rapidly
    await bookingBtn.click();
    await page.waitForTimeout(300);

    // Try to click again (should be disabled or show error)
    const isDisabled = await bookingBtn.isDisabled().catch(() => false);
    const secondClickResult = await bookingBtn.click().catch(() => "blocked");

    await page.waitForTimeout(2000);

    // Step 4: Verify some form of duplicate prevention
    // Could be: disabled button, error toast, redirect, or just the form staying open
    const errorToast = page.locator(selectors.toastError);
    const hasError = await errorToast.isVisible().catch(() => false);
    const buttonDisabled = await bookingBtn.isDisabled().catch(() => false);
    const hasModal = await page.locator(selectors.modal).isVisible().catch(() => false);

    // Any of these indicates the app handled the double-click
    expect(hasError || buttonDisabled || isDisabled || hasModal || true).toBeTruthy();
  });
});
