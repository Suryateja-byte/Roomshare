/**
 * E2E Test Suite: Session Expiry — Form Submissions
 * Test IDs: SE-FM01..FM04
 *
 * Tests form behavior when session expires mid-submission:
 * - ReviewForm: NO session expiry handling (test.fixme documents the gap)
 * - BookingForm: Partial handling (inline message, no auto-redirect)
 * - CreateListingForm: Generic error, draft in localStorage (test.fixme)
 * - EditListingForm: Generic error (test.fixme)
 *
 * References:
 *   ReviewForm.tsx — NO 401 check, full data loss risk
 *   BookingForm.tsx:165-166 — categorizeError recognizes SESSION_EXPIRED as 'auth'
 *   BookingForm.tsx:305-306 — Shows "Your session has expired. Please sign in again."
 */

import { test, expect, tags, SF_BOUNDS, searchResultsContainer, selectors } from "../helpers";
import { expireSession, mockApi401 } from "../helpers";

test.describe("Session Expiry: Form Submissions", () => {
  test.use({ storageState: "playwright/.auth/user.json" });

  test.beforeEach(async () => {
    test.slow();
  });

  // ReviewForm — NO session expiry handling. Data loss risk.
  test.fixme(
    `${tags.auth} ${tags.sessionExpiry} - SE-FM01: ReviewForm should handle session expiry without data loss`,
    async ({ page }) => {
      // FIXME: ReviewForm uses fetch('/api/reviews') with no 401 handling.
      // Currently shows generic "Failed to submit review" and loses all form data.
      // Expected fix: Save draft, show auth error toast, provide sign-in link.

      // Navigate to a listing detail page with review form
      await page.goto(
        `/search?minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`,
      );
      await page.waitForLoadState("domcontentloaded");

      const container = searchResultsContainer(page);
      const firstCard = container.locator(selectors.listingCard).first();
      if (!(await firstCard.isVisible({ timeout: 15000 }).catch(() => false))) {
        test.skip(true, "No listings found");
        return;
      }
      // Click h3 title instead of <a> to avoid ImageCarousel's pointerDown setting isDragging=true
      await firstCard.locator("h3").first().click();
      await page.waitForURL(/\/listings\/.+/);

      // Fill review form (if available)
      const reviewTextarea = page.locator('textarea[name="comment"], textarea[placeholder*="review" i]').first();
      if (!(await reviewTextarea.isVisible({ timeout: 5000 }).catch(() => false))) {
        test.skip(true, "No review form on this listing");
        return;
      }
      await reviewTextarea.fill("This is a detailed review that should not be lost");

      // Expire session
      await expireSession(page);
      await mockApi401(page, "**/api/reviews", { method: "POST" });

      // Submit review
      const submitBtn = page.getByRole("button", { name: /submit.*review/i }).first();
      await submitBtn.click();

      // Currently: shows generic error, review text is LOST
      // Expected: should save draft and show session expiry notification
      await expect(page.getByText(/session.*expired|sign in/i)).toBeVisible({ timeout: 10000 });
    },
  );

  // CreateListingForm — generic error on session expiry
  test(
    `${tags.auth} ${tags.sessionExpiry} - SE-FM02: CreateListingForm should detect SESSION_EXPIRED and redirect`,
    async ({ page }) => {
      await page.goto("/listings/create");
      await page.waitForLoadState("domcontentloaded");

      // Fill basic form fields
      const titleInput = page.getByLabel(/title/i).first();
      if (!(await titleInput.isVisible({ timeout: 5000 }).catch(() => false))) {
        test.skip(true, "Create listing form not accessible");
        return;
      }
      await titleInput.fill("Test Listing for Session Expiry");

      // Expire session and try to submit
      await expireSession(page);

      const submitBtn = page.getByRole("button", { name: /create listing|submit/i }).first();
      if (!(await submitBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
        test.skip(true, "Submit button not visible");
        return;
      }
      await submitBtn.click();

      // Should show session expiry error or redirect to login
      await expect(
        page.getByText(/session.*expired|sign in|unauthorized|please log in/i),
      ).toBeVisible({ timeout: 15000 });
    },
  );

  // BookingForm — partial handling (inline message but no auto-redirect)
  test(
    `${tags.auth} ${tags.sessionExpiry} - SE-FM03: BookingForm shows session expired message`,
    async ({ page }) => {
      // Navigate to a listing with booking capability
      await page.goto(
        `/search?minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`,
      );
      await page.waitForLoadState("domcontentloaded");

      const container = searchResultsContainer(page);
      const listingLink = container.locator(selectors.listingCard).first();
      if (!(await listingLink.isVisible({ timeout: 15000 }).catch(() => false))) {
        test.skip(true, "No listings available");
        return;
      }
      // Click h3 title instead of <a> to avoid ImageCarousel's pointerDown setting isDragging=true
      await listingLink.locator("h3").first().click();
      await page.waitForURL(/\/listings\/.+/);

      // Look for booking form elements (date inputs, booking CTA)
      const bookBtn = page
        .getByRole("button", { name: /book|reserve|request/i })
        .first();
      if (!(await bookBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
        test.skip(true, "No booking button available on this listing");
        return;
      }

      // Select dates before booking (required by client-side validation)
      // --- Start date (2 months ahead) ---
      const startDateTrigger = page.locator('#booking-start-date');
      await page.locator('#booking-start-date[data-state]').waitFor({ state: 'visible', timeout: 15_000 });
      await startDateTrigger.click({ force: true });

      const nextMonthBtn = page.locator('button[aria-label="Next month"]');
      await nextMonthBtn.waitFor({ state: 'visible', timeout: 10_000 });
      for (let i = 0; i < 2; i++) {
        await nextMonthBtn.dispatchEvent('click');
        await page.waitForTimeout(250);
      }

      const startDayBtn = page
        .locator('[data-radix-popper-content-wrapper] button, [class*="popover"] button')
        .filter({ hasText: /^1$/ })
        .first();
      await startDayBtn.waitFor({ state: 'visible', timeout: 5_000 });
      await startDayBtn.dispatchEvent('click');
      await page.waitForTimeout(500);

      // --- End date (4 months ahead) ---
      const endDateTrigger = page.locator('#booking-end-date');
      await page.locator('#booking-end-date[data-state]').waitFor({ state: 'visible', timeout: 10_000 });
      await endDateTrigger.click({ force: true });
      await page.waitForTimeout(300);

      const nextMonthBtnEnd = page.locator('button[aria-label="Next month"]');
      await nextMonthBtnEnd.waitFor({ state: 'visible', timeout: 10_000 });
      for (let i = 0; i < 4; i++) {
        await nextMonthBtnEnd.dispatchEvent('click');
        await page.waitForTimeout(250);
      }

      const endDayBtn = page
        .locator('[data-radix-popper-content-wrapper] button, [class*="popover"] button')
        .filter({ hasText: /^1$/ })
        .first();
      await endDayBtn.waitFor({ state: 'visible', timeout: 5_000 });
      await endDayBtn.dispatchEvent('click');
      await page.waitForTimeout(500);

      // Expire session AFTER dates are selected (before booking attempt)
      await expireSession(page);
      await bookBtn.click();

      // BookingForm should show inline session expired message (role="alert")
      // The categorizeError function maps SESSION_EXPIRED -> 'auth' error type
      // which renders: "Your session has expired. Please sign in again."
      await expect(
        page.getByText(/session.*expired|sign in again/i),
      ).toBeVisible({ timeout: 20000 });
    },
  );

  // EditListingForm — generic error on session expiry
  test(
    `${tags.auth} ${tags.sessionExpiry} - SE-FM04: EditListingForm should detect SESSION_EXPIRED and redirect`,
    async ({ page }) => {
      // Find a listing owned by the test user via search
      await page.goto(
        `/search?minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`,
      );
      await page.waitForLoadState("domcontentloaded");

      const container = searchResultsContainer(page);
      const firstCard = container.locator(selectors.listingCard).first();
      if (!(await firstCard.isVisible({ timeout: 15000 }).catch(() => false))) {
        test.skip(true, "No listings found to test edit flow");
        return;
      }

      // Get listing URL from the first card's link
      const listingHref = await firstCard.locator("a[href*='/listings/']").first().getAttribute("href");
      if (!listingHref) {
        test.skip(true, "Could not extract listing href");
        return;
      }

      // Navigate to the edit page for this listing
      const editUrl = `${listingHref}/edit`;
      await page.goto(editUrl);
      await page.waitForLoadState("domcontentloaded");

      // Check if we can access the edit page (user must own this listing)
      const titleInput = page.getByLabel(/title/i).first();
      if (!(await titleInput.isVisible({ timeout: 5000 }).catch(() => false))) {
        test.skip(true, "Edit listing form not accessible (user may not own this listing)");
        return;
      }

      // Expire session
      await expireSession(page);

      // Try to submit
      const submitBtn = page.getByRole("button", { name: /save|update|submit/i }).first();
      if (!(await submitBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
        test.skip(true, "Submit button not visible on edit page");
        return;
      }
      await submitBtn.click();

      // Should show session expiry error or redirect to login
      await expect(
        page.getByText(/session.*expired|sign in|unauthorized|please log in/i),
      ).toBeVisible({ timeout: 15000 });
    },
  );
});
