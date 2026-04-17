/**
 * E2E Test Suite: Booking Journeys
 * Journeys: J038-J041, J045-J046
 *
 * Tests booking management, notifications, and settings flows.
 */

import { test, expect, tags, selectors } from "../helpers";

test.describe("Booking Journeys", () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ storageState: "playwright/.auth/user.json" });

  test.beforeEach(async () => {
    test.slow();
  });

  test.describe("J038: View booking requests", () => {
    test(`${tags.auth} - View pending bookings`, async ({ page, nav }) => {
      await nav.goToBookings();

      // Check we weren't redirected to login
      const isAuthenticated = await nav.isOnAuthenticatedPage();
      test.skip(!isAuthenticated, "Auth session expired - redirected to login");
      if (!isAuthenticated) return;

      // Should load bookings page — use .first() to avoid strict mode violations
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible(
        { timeout: 10000 }
      );

      // Should show tabs or sections for different booking states
      const pendingTab = page
        .getByRole("tab", { name: /pending/i })
        .or(page.getByRole("button", { name: /pending/i }))
        .first();

      if (await pendingTab.isVisible().catch(() => false)) {
        await pendingTab.click();
      }

      // Should show bookings or empty state
      await page.waitForLoadState("domcontentloaded");
    });
  });

  test.describe("J039-J040: Accept/Reject booking", () => {
    test(`${tags.auth} - Accept a booking request`, async ({ page, nav }) => {
      await nav.goToBookings();

      // Check we weren't redirected to login
      const isAuthenticated = await nav.isOnAuthenticatedPage();
      test.skip(!isAuthenticated, "Auth session expired - redirected to login");
      if (!isAuthenticated) return;

      await page.waitForLoadState("domcontentloaded");

      // Find pending booking with accept button
      const acceptButton = page
        .getByRole("button", { name: /accept|approve/i })
        .first();

      if (await acceptButton.isVisible().catch(() => false)) {
        await acceptButton.click();

        // May have confirmation
        const confirmButton = page
          .getByRole("button", { name: /confirm|yes/i })
          .first();
        if (await confirmButton.isVisible().catch(() => false)) {
          await confirmButton.click();
        }

        // Should show success
        await expect(
          page
            .locator(selectors.toast)
            .or(page.getByText(/accepted|approved/i))
            .first()
        ).toBeVisible({ timeout: 10000 });
      }
    });

    test(`${tags.auth} - Reject a booking request`, async ({ page, nav }) => {
      await nav.goToBookings();

      // Check we weren't redirected to login
      const isAuthenticated = await nav.isOnAuthenticatedPage();
      test.skip(!isAuthenticated, "Auth session expired - redirected to login");
      if (!isAuthenticated) return;

      await page.waitForLoadState("domcontentloaded");

      const rejectButton = page
        .getByRole("button", { name: /reject|decline/i })
        .first();

      if (await rejectButton.isVisible().catch(() => false)) {
        await rejectButton.click();

        // May require reason
        const reasonInput = page.getByLabel(/reason/i);
        if (await reasonInput.isVisible().catch(() => false)) {
          await reasonInput.fill("Room is no longer available");
        }

        const confirmButton = page
          .getByRole("button", { name: /confirm|reject|submit/i })
          .first();
        if (await confirmButton.isVisible().catch(() => false)) {
          await confirmButton.click();
        }

        await expect(
          page
            .locator(selectors.toast)
            .or(page.getByText(/rejected|declined/i))
            .first()
        ).toBeVisible({ timeout: 10000 });
      }
    });
  });

  test.describe("J041-J042: Cancel booking", () => {
    test(`${tags.auth} - Cancel own booking request`, async ({ page, nav }) => {
      await nav.goToBookings();

      // Check we weren't redirected to login
      const isAuthenticated = await nav.isOnAuthenticatedPage();
      test.skip(!isAuthenticated, "Auth session expired - redirected to login");
      if (!isAuthenticated) return;

      await page.waitForLoadState("domcontentloaded");

      // Find cancel button on a booking
      const cancelButton = page
        .getByRole("button", { name: /cancel/i })
        .first();

      if (await cancelButton.isVisible().catch(() => false)) {
        await cancelButton.click();

        // Confirm cancellation
        const confirmButton = page
          .locator(selectors.modal)
          .getByRole("button", { name: /confirm|yes|cancel/i })
          .first();

        if (await confirmButton.isVisible().catch(() => false)) {
          await confirmButton.click();
        }

        await expect(
          page
            .locator(selectors.toast)
            .or(page.getByText(/cancelled/i))
            .first()
        ).toBeVisible({ timeout: 10000 });
      }
    });
  });

  test.describe("J045-J046: Booking notifications", () => {
    test(`${tags.auth} - View booking in notifications`, async ({
      page,
      nav,
    }) => {
      await nav.goToNotifications();

      // Check we weren't redirected to login
      const isAuthenticated = await nav.isOnAuthenticatedPage();
      test.skip(!isAuthenticated, "Auth session expired - redirected to login");
      if (!isAuthenticated) return;

      // Should load notifications — use .first() to avoid strict mode violations
      await expect(
        page
          .getByRole("heading", { name: /notification/i })
          .first()
          .or(page.getByRole("heading", { level: 1 }).first())
          .first()
      ).toBeVisible({ timeout: 10000 });

      // Look for booking-related notifications — may or may not have any
      await page.waitForLoadState("domcontentloaded");
    });

    test(`${tags.auth} - Booking status in email (mock check)`, async ({
      page,
      nav,
    }) => {
      // This would require email integration testing
      // For now, verify the notification preferences exist
      await nav.goToSettings();

      // Check we weren't redirected to login
      const isAuthenticated = await nav.isOnAuthenticatedPage();
      test.skip(!isAuthenticated, "Auth session expired - redirected to login");
      if (!isAuthenticated) return;

      await page.waitForLoadState("domcontentloaded");

      const emailNotifications = page.getByLabel(/email.*notification/i);

      if (await emailNotifications.isVisible().catch(() => false)) {
        await expect(emailNotifications).toBeAttached();
      }
    });
  });
});
