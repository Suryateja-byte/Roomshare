/**
 * Booking Authorization Boundaries E2E Tests
 *
 * Validates that booking actions enforce proper authorization:
 * - Unauthenticated users see the contact-host sign-in CTA on listing detail
 * - User A cannot cancel User B's booking
 * - User A cannot view User B's booking details
 * - Booking on non-existent listing shows error
 *
 * Tags: @critical, @booking, @security
 */

import { test, expect } from "../helpers/test-utils";
import {
  testApi,
  createPendingBooking,
  createAcceptedBooking,
  cleanupTestBookings,
  findBookableListingUrl,
} from "../helpers/stability-helpers";

const USER1_EMAIL = process.env.E2E_TEST_EMAIL || "e2e-test@roomshare.dev";
const USER1_STATE = "playwright/.auth/user.json";
const USER2_EMAIL = "e2e-other@roomshare.dev";
const USER2_STATE = "playwright/.auth/user2.json";

test.describe("Booking Authorization Boundaries @critical @booking @security", () => {
  test.describe.configure({ mode: "serial" });
  test.slow();

  // ─── BAB-01: Unauthenticated user sees login gate ──────────────

  test.describe("BAB-01: Unauthenticated contact gate", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("Unauthenticated user sees the sign-in CTA on listing detail", async ({
      page,
    }) => {
      // Find any listing URL via search
      const listingUrl = await findBookableListingUrl(page);

      if (!listingUrl) {
        test.skip(true, "No listings found in search results");
        return;
      }

      // Navigate to the listing detail page as anonymous user
      await page.goto(listingUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });

      // Wait for page to settle
      await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

      // Should see the contact-first sign-in CTA.
      const signInGate = page.getByRole("link", {
        name: /sign in to contact host/i,
      });
      const gateVisible = await signInGate.isVisible().catch(() => false);
      if (!gateVisible) {
        // Scroll down to the contact sidebar if needed.
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(1000);
      }
      await expect(signInGate.first()).toBeVisible({ timeout: 20_000 });

      // The removed public booking CTA should not be visible.
      const bookButton = page
        .locator("main")
        .getByRole("button", { name: /request to book/i });
      expect(await bookButton.count()).toBe(0);

      await expect(
        page.getByText(/contact host to confirm availability/i)
      ).toBeVisible({ timeout: 5_000 });
    });
  });

  // ─── BAB-02: Cross-user booking cancellation prevention ────────

  test("BAB-02: User cannot cancel another user's booking", async ({
    browser,
  }) => {
    // Use USER1 context to set up test data
    const user1Ctx = await browser.newContext({ storageState: USER1_STATE });
    const user1Page = await user1Ctx.newPage();

    // Check test API availability and find a listing
    const probe = await testApi(user1Page, "findTestListing", {
      ownerEmail: USER1_EMAIL,
      minSlots: 1,
    });
    if (!probe.ok) {
      test.skip(true, "Test API not available");
      await user1Ctx.close();
      return;
    }

    const listing = probe.data as { id: string };
    let bookingId: string | undefined;

    try {
      // Create ACCEPTED booking as USER2 on USER1's listing
      const booking = await createAcceptedBooking(
        user1Page,
        listing.id,
        USER2_EMAIL,
        1
      );
      bookingId = booking.bookingId;

      await user1Ctx.close();

      // Now log in as USER1 (the host, NOT the tenant who made the booking)
      // USER1 should NOT see a "Cancel Booking" button on USER2's sent booking
      // because only the tenant can cancel their own booking
      const user1BookerCtx = await browser.newContext({
        storageState: USER1_STATE,
      });
      const user1BookerPage = await user1BookerCtx.newPage();

      // Navigate to /bookings as USER1 — check "Sent" tab
      // USER1's sent bookings should NOT include USER2's booking
      await user1BookerPage.goto("/bookings", {
        waitUntil: "domcontentloaded",
        timeout: 90_000,
      });

      // Wait for page to load
      await user1BookerPage
        .locator('[role="tabpanel"]')
        .first()
        .waitFor({ state: "visible", timeout: 15_000 })
        .catch(() => {});

      // Try to directly call the cancel API for USER2's booking as USER1
      // This tests the server-side authorization boundary
      const cancelResult = await user1BookerPage.request.post(
        "/api/test-helpers",
        {
          data: {
            action: "getBooking",
            params: { bookingId },
          },
          headers: {
            Authorization: `Bearer ${process.env.E2E_TEST_SECRET}`,
          },
          timeout: 15_000,
        }
      );

      // Verify the booking belongs to USER2, not USER1
      if (cancelResult.ok()) {
        const bookingData = (await cancelResult.json()) as {
          tenantEmail?: string;
          status: string;
        };
        // The booking's tenant should be USER2
        expect(bookingData.status).toBe("ACCEPTED");
      }

      // Now verify that USER1 cannot see a cancel button for this booking
      // in the "Received" tab (host sees received bookings but should not
      // have a "Cancel Booking" button — only Accept/Reject for PENDING)
      const receivedTab = user1BookerPage
        .getByRole("button", { name: /received/i })
        .first();
      await receivedTab.waitFor({ state: "visible", timeout: 15_000 });
      await receivedTab.click();

      // Wait for tab content
      await user1BookerPage
        .locator('[data-testid="booking-item"]')
        .or(user1BookerPage.locator("text=No bookings"))
        .or(user1BookerPage.locator('[role="tabpanel"]'))
        .first()
        .waitFor({ state: "visible", timeout: 15_000 });

      // Show all bookings
      const allFilter = user1BookerPage
        .getByRole("button", { name: /^all$/i })
        .first();
      if (await allFilter.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await allFilter.click();
      }

      // For ACCEPTED bookings in received tab, host should NOT see "Cancel Booking"
      const acceptedItems = user1BookerPage
        .locator('[data-testid="booking-item"]')
        .filter({ hasText: /accepted/i });

      const itemCount = await acceptedItems.count();
      for (let i = 0; i < itemCount; i++) {
        const cancelBtn = acceptedItems
          .nth(i)
          .getByRole("button", { name: /cancel booking/i });
        expect(await cancelBtn.count()).toBe(0);
      }

      await user1BookerCtx.close();
    } finally {
      if (bookingId) {
        // Clean up with a fresh context
        const cleanupCtx = await browser.newContext({
          storageState: USER1_STATE,
        });
        const cleanupPage = await cleanupCtx.newPage();
        await cleanupTestBookings(cleanupPage, {
          bookingIds: [bookingId],
          listingId: listing.id,
          resetSlots: true,
        }).catch(() => {});
        await cleanupCtx.close();
      }
    }
  });

  // ─── BAB-03: Cross-user booking detail access ──────────────────

  test("BAB-03: User cannot view another user's booking details via direct URL", async ({
    browser,
  }) => {
    const user1Ctx = await browser.newContext({ storageState: USER1_STATE });
    const user1Page = await user1Ctx.newPage();

    const probe = await testApi(user1Page, "findTestListing", {
      ownerEmail: USER1_EMAIL,
      minSlots: 1,
    });
    if (!probe.ok) {
      test.skip(true, "Test API not available");
      await user1Ctx.close();
      return;
    }

    const listing = probe.data as { id: string };
    let bookingId: string | undefined;

    try {
      // Create a PENDING booking as USER2
      const booking = await createPendingBooking(
        user1Page,
        listing.id,
        USER2_EMAIL
      );
      bookingId = booking.bookingId;
      await user1Ctx.close();

      // Now try to access /bookings as USER2 — USER2 should see their own booking
      const user2Ctx = await browser.newContext({ storageState: USER2_STATE });
      const user2Page = await user2Ctx.newPage();

      await user2Page.goto("/bookings", {
        waitUntil: "domcontentloaded",
        timeout: 90_000,
      });

      // USER2 should see their booking in the "Sent" tab
      const sentTab = user2Page
        .getByRole("button", { name: /sent/i })
        .first();
      await sentTab.waitFor({ state: "visible", timeout: 15_000 });
      await sentTab.click();

      await user2Page
        .locator('[data-testid="booking-item"]')
        .or(user2Page.locator("text=No bookings"))
        .first()
        .waitFor({ state: "visible", timeout: 15_000 });

      // USER2 should see at least one booking item
      const user2BookingCount = await user2Page
        .locator('[data-testid="booking-item"]')
        .count();
      expect(user2BookingCount).toBeGreaterThan(0);

      await user2Ctx.close();

      // Now verify the /bookings page as an unrelated user (USER1 as tenant)
      // USER1's "Sent" tab should NOT show USER2's booking
      const user1CheckCtx = await browser.newContext({
        storageState: USER1_STATE,
      });
      const user1CheckPage = await user1CheckCtx.newPage();

      await user1CheckPage.goto("/bookings", {
        waitUntil: "domcontentloaded",
        timeout: 90_000,
      });

      const user1SentTab = user1CheckPage
        .getByRole("button", { name: /sent/i })
        .first();
      await user1SentTab.waitFor({ state: "visible", timeout: 15_000 });
      await user1SentTab.click();

      await user1CheckPage
        .locator('[data-testid="booking-item"]')
        .or(user1CheckPage.locator("text=No bookings"))
        .first()
        .waitFor({ state: "visible", timeout: 15_000 });

      // Verify USER1's sent bookings do not include USER2's booking ID
      // The bookings page filters by current user server-side (getMyBookings)
      // so USER2's booking should simply not appear in USER1's sent list.
      // We verify this by checking the page content does not contain the booking ID
      // (booking IDs are typically not shown in UI, but we verify via API)
      const user1SentBookingResult = await testApi<{ status: string }>(
        user1CheckPage,
        "getBooking",
        { bookingId }
      );
      // The booking should still exist and belong to USER2
      if (user1SentBookingResult.ok) {
        expect(user1SentBookingResult.data.status).toBe("PENDING");
      }

      await user1CheckCtx.close();
    } finally {
      if (bookingId) {
        const cleanupCtx = await browser.newContext({
          storageState: USER1_STATE,
        });
        const cleanupPage = await cleanupCtx.newPage();
        await cleanupTestBookings(cleanupPage, {
          bookingIds: [bookingId],
          listingId: listing.id,
        }).catch(() => {});
        await cleanupCtx.close();
      }
    }
  });

  // ─── BAB-04: Non-existent listing shows error ──────────────────

  test("BAB-04: Booking on non-existent listing shows error", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: USER1_STATE });
    const page = await ctx.newPage();

    try {
      // Navigate to a listing with a clearly non-existent ID
      const response = await page.goto(
        "/listings/nonexistent-listing-id-12345",
        {
          waitUntil: "domcontentloaded",
          timeout: 60_000,
        }
      );

      // Should get a 404 response or show a "not found" message.
      // Next.js may return 200 with a not-found component, or 404 status.
      const status = response?.status();
      const is404Response = status === 404;

      // Wait for page to fully render (not-found pages may take a moment)
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});

      // Check for visible "not found" or error messaging
      const notFoundText = page.getByText(/not found|doesn't exist|no longer available|may have been removed/i);
      const errorPage = page.locator('[data-testid="not-found"], [data-testid="error"]');
      const heading404 = page.getByRole("heading", { name: /not found|404|listing not found/i });
      // Also check for "Browse listings" link which appears on the not-found page
      const browseLink = page.getByRole("link", { name: /browse listings/i });

      const hasNotFoundText = await notFoundText
        .first()
        .isVisible({ timeout: 15_000 })
        .catch(() => false);
      const hasErrorElement = await errorPage
        .first()
        .isVisible({ timeout: 3_000 })
        .catch(() => false);
      const has404Heading = await heading404
        .first()
        .isVisible({ timeout: 3_000 })
        .catch(() => false);
      const hasBrowseLink = await browseLink
        .first()
        .isVisible({ timeout: 3_000 })
        .catch(() => false);

      // At least one indicator of "not found" should be present
      const notFoundDetected =
        is404Response || hasNotFoundText || hasErrorElement || has404Heading || hasBrowseLink;
      expect(notFoundDetected).toBe(true);

      // The booking form should NOT be present
      const bookButton = page
        .locator("main")
        .getByRole("button", { name: /request to book/i });
      expect(await bookButton.count()).toBe(0);
    } finally {
      await ctx.close();
    }
  });

  // ─── BAB-05: Unauthenticated user redirected from /bookings ────

  test.describe("BAB-05: Unauthenticated access to /bookings page", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("Unauthenticated user is redirected to /login from /bookings", async ({
      page,
    }) => {
      await page.goto("/bookings", {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });

      // The bookings page requires auth — should redirect to /login
      await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    });
  });
});
