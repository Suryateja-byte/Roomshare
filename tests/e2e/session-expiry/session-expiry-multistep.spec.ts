/**
 * E2E Test Suite: Session Expiry — Multi-Step Flows
 * Test IDs: SE-MS01..MS02
 *
 * Tests multi-step flows where session can expire between steps:
 * - DeleteListingButton: 4-step flow (can-delete -> confirm -> password -> delete)
 *   Currently has NO 401 handling at any step.
 *
 * References:
 *   DeleteListingButton.tsx:35-94 — No 401 check on any fetch call
 *   DeleteListingButton.tsx — Steps: can-delete check, confirmation modal, password entry, delete API
 */

import { test, tags } from "../helpers";

test.describe("Session Expiry: Multi-Step Flows", () => {
  test.use({ storageState: "playwright/.auth/user.json" });

  test.beforeEach(async () => {
    test.slow();
  });

  test.fixme(
    `${tags.auth} ${tags.sessionExpiry} - SE-MS01: DeleteListing session expires after can-delete check`,
    async ({ page }) => {
      // FIXME: DeleteListingButton has a 4-step flow:
      // 1. fetch(`/api/listings/${id}/can-delete`) — checks eligibility
      // 2. User confirms in modal
      // 3. User enters password
      // 4. fetch(`/api/listings/${id}`, { method: 'DELETE' })
      //
      // Session can expire between any steps. Currently:
      // - No 401 check after can-delete (step 1)
      // - No 401 check after delete (step 4)
      // - User completes entire 4-step confirmation flow then gets
      //   a generic "Failed to delete listing" toast.
      //
      // Expected: Detect 401 at any step, show session expiry message,
      // redirect to login with callbackUrl to the listing page.

      // Would need a listing owned by the test user
      // Navigate to listing management page or a specific listing
      await page.goto("/");
      await page.waitForLoadState("domcontentloaded");

      // TODO: Navigate to user's own listing that has a delete button
      // Expire session between confirmation and delete API call
      // Assert: should detect 401 and redirect instead of showing generic error
    },
  );

  test.fixme(
    `${tags.auth} ${tags.sessionExpiry} - SE-MS02: DeleteListing session expires at can-delete check`,
    async ({ page: _page }) => {
      // FIXME: When session expires before the initial can-delete check:
      // - fetch returns 401
      // - Component doesn't check response.status
      // - Shows generic error or undefined behavior
      //
      // Expected: Detect 401, show "Session expired" message, redirect.

      // Would need a listing owned by the test user
    },
  );
});
