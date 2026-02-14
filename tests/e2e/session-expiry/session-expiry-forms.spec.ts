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
      const listingLink = firstCard.locator("a").first();
      await listingLink.click();
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
  test.fixme(
    `${tags.auth} ${tags.sessionExpiry} - SE-FM02: CreateListingForm should detect SESSION_EXPIRED and redirect`,
    async ({ page }) => {
      // FIXME: CreateListingForm persists draft to localStorage but shows a
      // generic error on session expiry instead of detecting SESSION_EXPIRED.
      // Expected: Detect SESSION_EXPIRED code, redirect to /login with callbackUrl.

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

      // Should detect SESSION_EXPIRED and redirect (currently doesn't)
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
      await listingLink.locator("a").first().click();
      await page.waitForURL(/\/listings\/.+/);

      // Look for booking form elements (date inputs, booking CTA)
      const bookBtn = page
        .getByRole("button", { name: /book|reserve|request/i })
        .first();
      if (!(await bookBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
        test.skip(true, "No booking button available on this listing");
        return;
      }

      // Expire session before booking attempt
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
  test.fixme(
    `${tags.auth} ${tags.sessionExpiry} - SE-FM04: EditListingForm should detect SESSION_EXPIRED and redirect`,
    async ({ page: _page }) => {
      // FIXME: EditListingForm has no specific SESSION_EXPIRED handling.
      // It persists draft to localStorage but shows a generic error.
      // Expected: Detect SESSION_EXPIRED code, redirect to /login with callbackUrl.

      // Would need a listing owned by the test user to test editing
      // Navigate to /listings/{id}/edit
    },
  );
});
