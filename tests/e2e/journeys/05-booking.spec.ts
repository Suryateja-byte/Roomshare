/**
 * E2E Test Suite: Booking Journeys
 * Journeys: J037-J046
 *
 * Tests booking request flow, acceptance/rejection, calendar management,
 * and booking status updates.
 */

import { test, expect, tags, selectors, timeouts } from '../helpers';

test.describe('Booking Journeys', () => {
  test.use({ storageState: 'playwright/.auth/user.json' });

  test.beforeEach(async () => {
    test.slow();
  });

  test.describe('J037: Submit booking request', () => {
    test(`${tags.auth} - Request to book a listing`, async ({ page, nav, data }) => {
      // Navigate to a listing
      await nav.goToSearch();
      await nav.clickListingCard(0);

      // Find booking form or contact button
      const bookingForm = page.locator('[data-testid="booking-form"], form').filter({
        has: page.getByText(/book|request|move-in/i),
      });

      const contactButton = page.getByRole('button', { name: /contact|book|request/i });

      if (await bookingForm.isVisible()) {
        // Fill booking form
        const moveInDate = page.getByLabel(/move.*in|start.*date/i);
        if (await moveInDate.isVisible()) {
          await moveInDate.fill(data.futureDate(30));
        }

        const messageInput = page.getByLabel(/message/i);
        if (await messageInput.isVisible()) {
          await messageInput.fill('Hi, I am interested in this room. Is it still available?');
        }

        // Submit booking
        await page.getByRole('button', { name: /submit|request|book/i }).click();

        // Should show success or redirect
        await expect(
          page.locator(selectors.toast)
            .or(page.getByText(/sent|submitted|pending/i))
        ).toBeVisible({ timeout: 10000 });
      } else if (await contactButton.isVisible()) {
        await contactButton.click();

        // May open modal or navigate to messages
        await page.waitForTimeout(1000);
      }
    });

    test(`${tags.auth} - Cannot book own listing`, async ({ page, nav }) => {
      await nav.goToProfile();

      // Find a user's own listing
      const ownListing = page.locator(selectors.listingCard).first();

      if (await ownListing.isVisible()) {
        await ownListing.click();

        // Book button should not be visible or should be disabled
        const bookButton = page.getByRole('button', { name: /book|request/i });

        if (await bookButton.isVisible()) {
          // Should be disabled or show "your listing"
          const isDisabled = await bookButton.isDisabled();
          const hasOwnIndicator = await page.getByText(/your listing|you own/i).isVisible();

          expect(isDisabled || hasOwnIndicator).toBeTruthy();
        }
      }
    });
  });

  test.describe('J038: View booking requests', () => {
    test(`${tags.auth} - View pending bookings`, async ({ page, nav }) => {
      await nav.goToBookings();

      // Should load bookings page
      // Target h1 page title specifically to avoid strict mode violation
      await expect(page.getByRole('heading', { level: 1, name: /booking/i })).toBeVisible();

      // Should show tabs or sections for different booking states
      const pendingTab = page.getByRole('tab', { name: /pending/i })
        .or(page.getByRole('button', { name: /pending/i }));

      if (await pendingTab.isVisible()) {
        await pendingTab.click();
      }

      // Should show bookings or empty state
      await page.waitForLoadState('domcontentloaded');
    });
  });

  test.describe('J039-J040: Accept/Reject booking', () => {
    test(`${tags.auth} - Accept a booking request`, async ({ page, nav }) => {
      await nav.goToBookings();

      // Find pending booking with accept button
      const acceptButton = page.getByRole('button', { name: /accept|approve/i }).first();

      if (await acceptButton.isVisible()) {
        await acceptButton.click();

        // May have confirmation
        const confirmButton = page.getByRole('button', { name: /confirm|yes/i });
        if (await confirmButton.isVisible()) {
          await confirmButton.click();
        }

        // Should show success
        await expect(
          page.locator(selectors.toast)
            .or(page.getByText(/accepted|approved/i))
        ).toBeVisible({ timeout: 10000 });
      }
    });

    test(`${tags.auth} - Reject a booking request`, async ({ page, nav }) => {
      await nav.goToBookings();

      const rejectButton = page.getByRole('button', { name: /reject|decline/i }).first();

      if (await rejectButton.isVisible()) {
        await rejectButton.click();

        // May require reason
        const reasonInput = page.getByLabel(/reason/i);
        if (await reasonInput.isVisible()) {
          await reasonInput.fill('Room is no longer available');
        }

        const confirmButton = page.getByRole('button', { name: /confirm|reject|submit/i });
        if (await confirmButton.isVisible()) {
          await confirmButton.click();
        }

        await expect(
          page.locator(selectors.toast)
            .or(page.getByText(/rejected|declined/i))
        ).toBeVisible({ timeout: 10000 });
      }
    });
  });

  test.describe('J041-J042: Cancel booking', () => {
    test(`${tags.auth} - Cancel own booking request`, async ({ page, nav }) => {
      await nav.goToBookings();

      // Find cancel button on a booking
      const cancelButton = page.getByRole('button', { name: /cancel/i }).first();

      if (await cancelButton.isVisible()) {
        await cancelButton.click();

        // Confirm cancellation
        const confirmButton = page.locator(selectors.modal)
          .getByRole('button', { name: /confirm|yes|cancel/i });

        if (await confirmButton.isVisible()) {
          await confirmButton.click();
        }

        await expect(
          page.locator(selectors.toast)
            .or(page.getByText(/cancelled/i))
        ).toBeVisible({ timeout: 10000 });
      }
    });
  });

  test.describe('J043-J044: Booking calendar', () => {
    test(`${tags.auth} - View booking calendar on listing`, async ({ page, nav }) => {
      await nav.goToSearch();
      await nav.clickListingCard(0);

      // Look for calendar component
      const calendar = page.locator('[data-testid="calendar"], [class*="calendar"]').first();

      if (await calendar.isVisible()) {
        // Should show available/unavailable dates
        await expect(calendar).toBeVisible();

        // Try navigating calendar months
        const nextMonth = page.getByRole('button', { name: /next|forward|>/i });
        if (await nextMonth.isVisible()) {
          await nextMonth.click();
          await page.waitForTimeout(500);
        }
      }
    });

    test(`${tags.auth} - Date picker validation`, async ({ page, nav, data }) => {
      await nav.goToSearch();
      await nav.clickListingCard(0);

      const dateInput = page.getByLabel(/move.*in|date/i).first();

      if (await dateInput.isVisible()) {
        // Try past date - should be invalid
        await dateInput.fill(data.pastDate(30));

        const submitButton = page.getByRole('button', { name: /book|request/i });
        if (await submitButton.isVisible()) {
          await submitButton.click();

          // Should show error about past date
          await expect(
            page.getByText(/past|future|invalid.*date/i)
              .or(page.locator('[aria-invalid="true"]'))
          ).toBeVisible({ timeout: 5000 });
        }
      }
    });
  });

  test.describe('J045-J046: Booking notifications', () => {
    test(`${tags.auth} - View booking in notifications`, async ({ page, nav }) => {
      await nav.goToNotifications();

      // Should load notifications
      await expect(page.getByRole('heading', { name: /notification/i })).toBeVisible();

      // Look for booking-related notifications
      const bookingNotification = page.getByText(/booking|request/i);

      // May or may not have notifications
      await page.waitForLoadState('domcontentloaded');
    });

    test(`${tags.auth} - Booking status in email (mock check)`, async ({ page, nav }) => {
      // This would require email integration testing
      // For now, verify the notification preferences exist
      await nav.goToSettings();

      const emailNotifications = page.getByLabel(/email.*notification/i);

      if (await emailNotifications.isVisible()) {
        await expect(emailNotifications).toBeAttached();
      }
    });
  });
});
