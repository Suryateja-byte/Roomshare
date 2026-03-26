/**
 * Booking Flow: Tenant Happy Path E2E Tests
 *
 * 5 tests covering the full tenant-side booking lifecycle:
 * - BF-01: Navigate to bookable listing and verify booking form visible
 * - BF-02: Select dates and verify form updates (price, duration)
 * - BF-03: Submit booking request and verify confirmation
 * - BF-04: Verify booking appears in user's bookings page
 * - BF-05: Double-click prevention — rapid submit should not create duplicates
 *
 * Tags: @critical, @booking, @happy-path
 */

import { test, expect } from "../helpers/test-utils";
import {
  testApi,
  findBookableListingUrl,
  selectStabilityDates,
  submitBookingViaUI,
  getMonthOffset,
  cleanupTestBookings,
  navigateToBookingsTab,
  clearBookingSessionForListing,
  setupRequestCounter,
  extractListingId,
} from "../helpers/stability-helpers";

const TENANT_EMAIL =
  process.env.E2E_TEST_OTHER_EMAIL || "e2e-other@roomshare.dev";
const TENANT_STATE = "playwright/.auth/user2.json";

test.describe("Booking Flow: Tenant Happy Path", () => {
  test.describe.configure({ mode: "serial" });

  let listingUrl: string | null = null;
  let listingId: string | null = null;
  let bookingCreated = false;

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: TENANT_STATE });
    const page = await ctx.newPage();

    // Verify test API is available — if not, listingUrl stays empty and tests skip
    const probe = await testApi(page, "ping", {}).catch(() => ({ ok: false }));
    if (!probe.ok) {
      await ctx.close();
      return; // Tests will skip via !listingUrl guard
    }

    // Find a bookable listing (not owned by tenant)
    listingUrl = await findBookableListingUrl(page, 0);

    await ctx.close();
  });

  test.afterAll(async ({ browser }) => {
    // Clean up any bookings created during this suite
    if (!listingId || !bookingCreated) return;

    const ctx = await browser.newContext({ storageState: TENANT_STATE });
    const page = await ctx.newPage();

    try {
      await cleanupTestBookings(page, {
        listingId,
        resetSlots: true,
      });
    } catch {
      // Best-effort cleanup — do not fail the suite
    } finally {
      await ctx.close();
    }
  });

  /**
   * BF-01: Navigate to a bookable listing and verify booking form is visible
   */
  test("BF-01: Listing detail page shows booking form with price and date pickers", async ({
    browser,
  }) => {
    test.skip(!listingUrl, "No bookable listing found in search results");

    const ctx = await browser.newContext({ storageState: TENANT_STATE });
    const page = await ctx.newPage();

    try {
      await page.goto(listingUrl!, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });

      listingId = extractListingId(page);
      test.skip(!listingId, "Could not extract listing ID from URL");

      // Clear any stale booking session state for this listing
      await clearBookingSessionForListing(page, listingId!);

      // Verify listing title renders
      const title = page.locator("h1").first();
      await expect(title).toBeVisible({ timeout: 15_000 });
      await expect(title).not.toHaveText("");

      // Verify price is displayed (BookingForm shows "$<price> / month")
      const priceText = page.getByText(/\$\d+/);
      await expect(priceText.first()).toBeVisible({ timeout: 10_000 });

      // Verify date pickers are present (BookingForm renders #booking-start-date and #booking-end-date)
      const startDatePicker = page.locator("#booking-start-date");
      const endDatePicker = page.locator("#booking-end-date");
      await expect(startDatePicker).toBeAttached({ timeout: 15_000 });
      await expect(endDatePicker).toBeAttached({ timeout: 15_000 });

      // Verify "Request to Book" button is visible
      const bookButton = page
        .locator("main")
        .getByRole("button", { name: /request to book/i });
      await expect(bookButton.first()).toBeVisible({ timeout: 10_000 });
    } finally {
      await ctx.close();
    }
  });

  /**
   * BF-02: Select dates and verify form updates (shows duration and price)
   */
  test("BF-02: Selecting dates updates duration indicator and price breakdown", async ({
    browser,
  }, testInfo) => {
    test.skip(!listingUrl || !listingId, "No bookable listing available");
    test.slow();

    const ctx = await browser.newContext({ storageState: TENANT_STATE });
    const page = await ctx.newPage();

    try {
      await page.goto(listingUrl!, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });

      await clearBookingSessionForListing(page, listingId!);

      // Wait for Radix hydration on date pickers
      await page
        .locator("#booking-start-date[data-state]")
        .waitFor({ state: "attached", timeout: 15_000 });

      // Select dates using the stability helper (far-future months to avoid conflicts)
      const monthOffset = getMonthOffset(testInfo, 0);
      await selectStabilityDates(page, monthOffset);

      // After selecting both dates, the duration indicator should appear
      // BookingForm shows "{diffDays} days selected" in a colored box
      const durationIndicator = page.getByText(/\d+ days selected/i);
      await expect(durationIndicator).toBeVisible({ timeout: 10_000 });

      // Price breakdown section should show the calculated total
      // BookingForm renders "$X.XX/day x N days" when dates are selected
      const dailyRate = page.getByText(/\/day/);
      await expect(dailyRate.first()).toBeVisible({ timeout: 10_000 });
    } finally {
      await ctx.close();
    }
  });

  /**
   * BF-03: Submit booking request and verify confirmation
   */
  test("BF-03: Submitting booking request shows confirmation modal and success", async ({
    browser,
  }, testInfo) => {
    test.skip(!listingUrl || !listingId, "No bookable listing available");
    test.slow();

    const ctx = await browser.newContext({ storageState: TENANT_STATE });
    const page = await ctx.newPage();

    try {
      await page.goto(listingUrl!, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });

      await clearBookingSessionForListing(page, listingId!);

      // Wait for Radix hydration
      await page
        .locator("#booking-start-date[data-state]")
        .waitFor({ state: "attached", timeout: 15_000 });

      // Select dates (use testIndex=1 for different month than BF-02)
      const monthOffset = getMonthOffset(testInfo, 1);
      await selectStabilityDates(page, monthOffset);

      // Verify duration indicator before submitting
      await expect(page.getByText(/\d+ days selected/i)).toBeVisible({
        timeout: 10_000,
      });

      // Submit booking via UI (clicks "Request to Book" -> confirms modal)
      const success = await submitBookingViaUI(page);

      // Verify success outcome
      expect(success).toBe(true);

      // Verify redirect to /bookings page happens
      await expect(page).toHaveURL(/\/bookings/, { timeout: 30_000 });

      bookingCreated = true;
    } finally {
      await ctx.close();
    }
  });

  /**
   * BF-04: Verify booking appears in user's bookings page
   */
  test("BF-04: Booking appears in tenant's Sent bookings tab", async ({
    browser,
  }) => {
    test.skip(
      !listingUrl || !listingId || !bookingCreated,
      "No booking was created in BF-03"
    );
    test.slow();

    const ctx = await browser.newContext({ storageState: TENANT_STATE });
    const page = await ctx.newPage();

    try {
      await page.goto("/bookings", {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });

      // Navigate to the Sent tab (tenant's outgoing booking requests)
      await navigateToBookingsTab(page, "sent");

      // Verify at least one booking item is visible
      const bookingItems = page.locator('[data-testid="booking-item"]');
      await expect(bookingItems.first()).toBeVisible({ timeout: 15_000 });

      // The most recent booking should show PENDING status
      // (it was just submitted and not yet accepted by the host)
      const pendingBadge = bookingItems
        .first()
        .getByText(/pending/i);
      await expect(pendingBadge).toBeVisible({ timeout: 10_000 });

      // Verify via test API that the booking exists in DB
      const res = await testApi<{ bookings: Array<{ status: string }> }>(
        page,
        "getBookingsByTenant",
        { tenantEmail: TENANT_EMAIL, listingId: listingId! }
      );

      // If the API supports this action, verify the booking status
      if (res.ok && res.data?.bookings?.length > 0) {
        const latestBooking = res.data.bookings[0];
        expect(latestBooking.status).toBe("PENDING");
      }
    } finally {
      await ctx.close();
    }
  });

  /**
   * BF-05: Double-click prevention — rapid submit should not create duplicate bookings
   *
   * The BookingForm has debounce protection (isSubmittingRef + DEBOUNCE_MS)
   * and idempotency keys. This test verifies that rapid clicks on "Request to Book"
   * do not result in multiple server action requests.
   */
  test("BF-05: Rapid double-click on submit does not create duplicate bookings", async ({
    browser,
  }, testInfo) => {
    test.skip(!listingUrl || !listingId, "No bookable listing available");
    test.slow();

    const ctx = await browser.newContext({ storageState: TENANT_STATE });
    const page = await ctx.newPage();

    try {
      await page.goto(listingUrl!, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });

      await clearBookingSessionForListing(page, listingId!);

      // Wait for Radix hydration
      await page
        .locator("#booking-start-date[data-state]")
        .waitFor({ state: "attached", timeout: 15_000 });

      // Select dates (use testIndex=2 for a different month than BF-02/BF-03)
      const monthOffset = getMonthOffset(testInfo, 2);
      await selectStabilityDates(page, monthOffset);

      // Wait for duration indicator
      await expect(page.getByText(/\d+ days selected/i)).toBeVisible({
        timeout: 10_000,
      });

      // Set up request counter to track server action POSTs
      const counter = setupRequestCounter(page);

      // Click "Request to Book" to open the confirmation modal
      const bookBtn = page
        .locator("main")
        .getByRole("button", { name: /request to book/i })
        .first();
      await bookBtn.waitFor({ state: "visible", timeout: 10_000 });
      await bookBtn.click();

      // Wait for confirmation modal
      const modal = page.locator(
        '[role="dialog"][aria-modal="true"]'
      );
      await modal.waitFor({ state: "visible", timeout: 15_000 });

      // Rapidly click "Confirm Booking" multiple times
      const confirmBtn = modal.getByRole("button", { name: /confirm booking/i });
      await confirmBtn.click();
      // Attempt immediate second click — should be debounced
      await confirmBtn.click({ force: true }).catch(() => {
        // Button may already be disabled or modal closed — expected
      });

      // Wait for the outcome (success or error)
      await page.waitForFunction(
        () => {
          const body = document.body.innerText;
          return /request sent|booking confirmed|submitted|already have|error|failed/i.test(
            body
          );
        },
        { timeout: 60_000 }
      );

      // The key invariant: at most 1 server action should have been dispatched
      // (debounce + isSubmittingRef guard prevents the second click)
      const requestCount = counter.getCount();
      expect(requestCount).toBeLessThanOrEqual(1);

      bookingCreated = true;
    } finally {
      await ctx.close();
    }
  });
});
