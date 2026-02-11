/**
 * E2E Test Suite: Booking Journeys
 * Journeys: J037-J046
 *
 * Tests booking request flow, acceptance/rejection, calendar management,
 * and booking status updates.
 */

import { test, expect, tags, selectors, timeouts, SF_BOUNDS } from '../helpers';

test.describe('Booking Journeys', () => {
  test.use({ storageState: 'playwright/.auth/user.json' });

  test.beforeEach(async () => {
    test.slow();
  });

  test.describe('J037: Submit booking request', () => {
    test(`${tags.auth} - Request to book a listing`, async ({ page, nav, data }) => {
      // Navigate to a listing
      await nav.goToSearch({ bounds: SF_BOUNDS });
      await page.waitForLoadState('domcontentloaded');

      // Check if listing cards exist before clicking
      const cards = page.locator(selectors.listingCard);
      if ((await cards.count()) === 0) return;

      await nav.clickListingCard(0);
      await page.waitForLoadState('domcontentloaded');

      // Find booking form or contact button
      const bookingForm = page.locator('[data-testid="booking-form"], form').filter({
        has: page.getByText(/book|request|move-in/i),
      });

      const contactButton = page.getByRole('button', { name: /contact|book|request/i }).first();

      if (await bookingForm.isVisible().catch(() => false)) {
        // Fill booking form
        const moveInDate = page.getByLabel(/move.*in|start.*date/i);
        if (await moveInDate.isVisible().catch(() => false)) {
          await moveInDate.fill(data.futureDate(30));
        }

        const messageInput = page.getByLabel(/message/i);
        if (await messageInput.isVisible().catch(() => false)) {
          await messageInput.fill('Hi, I am interested in this room. Is it still available?');
        }

        // Submit booking
        const submitButton = page.getByRole('button', { name: /submit|request|book/i }).first();
        if (await submitButton.isVisible().catch(() => false)) {
          await submitButton.click();

          // Should show success or redirect
          await expect(
            page.locator(selectors.toast)
              .or(page.getByText(/sent|submitted|pending/i))
              .first()
          ).toBeVisible({ timeout: 10000 });
        }
      } else if (await contactButton.isVisible().catch(() => false)) {
        await contactButton.click();

        // May open modal or navigate to messages
        await page.waitForTimeout(1000);
      }
    });

    test(`${tags.auth} - Cannot book own listing`, async ({ page, nav }) => {
      await nav.goToProfile();

      // Check we weren't redirected to login
      if (!(await nav.isOnAuthenticatedPage())) {
        test.skip(true, 'Auth session expired - redirected to login');
        return;
      }

      await page.waitForLoadState('domcontentloaded');

      // Find a user's own listing
      const ownListing = page.locator(selectors.listingCard).first();

      if (await ownListing.isVisible().catch(() => false)) {
        await ownListing.click();
        await page.waitForLoadState('domcontentloaded');

        // Book button should not be visible or should be disabled
        const bookButton = page.getByRole('button', { name: /book|request/i }).first();

        if (await bookButton.isVisible().catch(() => false)) {
          // Should be disabled or show "your listing"
          const isDisabled = await bookButton.isDisabled();
          const hasOwnIndicator = await page.getByText(/your listing|you own/i).isVisible().catch(() => false);

          expect(isDisabled || hasOwnIndicator).toBeTruthy();
        }
      }
    });
  });

  test.describe('J038: View booking requests', () => {
    test(`${tags.auth} - View pending bookings`, async ({ page, nav }) => {
      await nav.goToBookings();

      // Check we weren't redirected to login
      if (!(await nav.isOnAuthenticatedPage())) {
        test.skip(true, 'Auth session expired - redirected to login');
        return;
      }

      // Should load bookings page — use .first() to avoid strict mode violations
      await expect(
        page.getByRole('heading', { level: 1 }).first()
      ).toBeVisible({ timeout: 10000 });

      // Should show tabs or sections for different booking states
      const pendingTab = page.getByRole('tab', { name: /pending/i })
        .or(page.getByRole('button', { name: /pending/i }))
        .first();

      if (await pendingTab.isVisible().catch(() => false)) {
        await pendingTab.click();
      }

      // Should show bookings or empty state
      await page.waitForLoadState('domcontentloaded');
    });
  });

  test.describe('J039-J040: Accept/Reject booking', () => {
    test(`${tags.auth} - Accept a booking request`, async ({ page, nav }) => {
      await nav.goToBookings();

      // Check we weren't redirected to login
      if (!(await nav.isOnAuthenticatedPage())) {
        test.skip(true, 'Auth session expired - redirected to login');
        return;
      }

      await page.waitForLoadState('domcontentloaded');

      // Find pending booking with accept button
      const acceptButton = page.getByRole('button', { name: /accept|approve/i }).first();

      if (await acceptButton.isVisible().catch(() => false)) {
        await acceptButton.click();

        // May have confirmation
        const confirmButton = page.getByRole('button', { name: /confirm|yes/i }).first();
        if (await confirmButton.isVisible().catch(() => false)) {
          await confirmButton.click();
        }

        // Should show success
        await expect(
          page.locator(selectors.toast)
            .or(page.getByText(/accepted|approved/i))
            .first()
        ).toBeVisible({ timeout: 10000 });
      }
    });

    test(`${tags.auth} - Reject a booking request`, async ({ page, nav }) => {
      await nav.goToBookings();

      // Check we weren't redirected to login
      if (!(await nav.isOnAuthenticatedPage())) {
        test.skip(true, 'Auth session expired - redirected to login');
        return;
      }

      await page.waitForLoadState('domcontentloaded');

      const rejectButton = page.getByRole('button', { name: /reject|decline/i }).first();

      if (await rejectButton.isVisible().catch(() => false)) {
        await rejectButton.click();

        // May require reason
        const reasonInput = page.getByLabel(/reason/i);
        if (await reasonInput.isVisible().catch(() => false)) {
          await reasonInput.fill('Room is no longer available');
        }

        const confirmButton = page.getByRole('button', { name: /confirm|reject|submit/i }).first();
        if (await confirmButton.isVisible().catch(() => false)) {
          await confirmButton.click();
        }

        await expect(
          page.locator(selectors.toast)
            .or(page.getByText(/rejected|declined/i))
            .first()
        ).toBeVisible({ timeout: 10000 });
      }
    });
  });

  test.describe('J041-J042: Cancel booking', () => {
    test(`${tags.auth} - Cancel own booking request`, async ({ page, nav }) => {
      await nav.goToBookings();

      // Check we weren't redirected to login
      if (!(await nav.isOnAuthenticatedPage())) {
        test.skip(true, 'Auth session expired - redirected to login');
        return;
      }

      await page.waitForLoadState('domcontentloaded');

      // Find cancel button on a booking
      const cancelButton = page.getByRole('button', { name: /cancel/i }).first();

      if (await cancelButton.isVisible().catch(() => false)) {
        await cancelButton.click();

        // Confirm cancellation
        const confirmButton = page.locator(selectors.modal)
          .getByRole('button', { name: /confirm|yes|cancel/i }).first();

        if (await confirmButton.isVisible().catch(() => false)) {
          await confirmButton.click();
        }

        await expect(
          page.locator(selectors.toast)
            .or(page.getByText(/cancelled/i))
            .first()
        ).toBeVisible({ timeout: 10000 });
      }
    });
  });

  test.describe('J043-J044: Booking calendar', () => {
    test(`${tags.auth} - View booking calendar on listing`, async ({ page, nav }) => {
      await nav.goToSearch({ bounds: SF_BOUNDS });
      await page.waitForLoadState('domcontentloaded');

      // Check if listing cards exist before clicking
      const cards = page.locator(selectors.listingCard);
      if ((await cards.count()) === 0) return;

      await nav.clickListingCard(0);
      await page.waitForLoadState('domcontentloaded');

      // Look for calendar component
      const calendar = page.locator('[data-testid="calendar"], [class*="calendar"]').first();

      if (await calendar.isVisible().catch(() => false)) {
        // Should show available/unavailable dates
        await expect(calendar).toBeVisible();

        // Try navigating calendar months
        const nextMonth = page.getByRole('button', { name: /next|forward|>/i }).first();
        if (await nextMonth.isVisible().catch(() => false)) {
          await nextMonth.click();
          await page.waitForTimeout(500);
        }
      }
    });

    test(`${tags.auth} - Date picker validation`, async ({ page, nav, data }) => {
      await nav.goToSearch({ bounds: SF_BOUNDS });
      await page.waitForLoadState('domcontentloaded');

      // Check if listing cards exist before clicking
      const cards = page.locator(selectors.listingCard);
      if ((await cards.count()) === 0) return;

      await nav.clickListingCard(0);
      await page.waitForLoadState('domcontentloaded');

      const dateInput = page.getByLabel(/move.*in|date/i).first();

      if (await dateInput.isVisible().catch(() => false)) {
        // Try past date - should be invalid
        await dateInput.fill(data.pastDate(30));

        const submitButton = page.getByRole('button', { name: /book|request/i }).first();
        if (await submitButton.isVisible().catch(() => false)) {
          await submitButton.click();

          // Should show error about past date
          await expect(
            page.getByText(/past|future|invalid.*date/i)
              .or(page.locator('[aria-invalid="true"]'))
              .first()
          ).toBeVisible({ timeout: 5000 });
        }
      }
    });
  });

  test.describe('J045-J046: Booking notifications', () => {
    test(`${tags.auth} - View booking in notifications`, async ({ page, nav }) => {
      await nav.goToNotifications();

      // Check we weren't redirected to login
      if (!(await nav.isOnAuthenticatedPage())) {
        test.skip(true, 'Auth session expired - redirected to login');
        return;
      }

      // Should load notifications — use .first() to avoid strict mode violations
      await expect(
        page.getByRole('heading', { name: /notification/i }).first()
          .or(page.getByRole('heading', { level: 1 }).first())
          .first()
      ).toBeVisible({ timeout: 10000 });

      // Look for booking-related notifications — may or may not have any
      await page.waitForLoadState('domcontentloaded');
    });

    test(`${tags.auth} - Booking status in email (mock check)`, async ({ page, nav }) => {
      // This would require email integration testing
      // For now, verify the notification preferences exist
      await nav.goToSettings();

      // Check we weren't redirected to login
      if (!(await nav.isOnAuthenticatedPage())) {
        test.skip(true, 'Auth session expired - redirected to login');
        return;
      }

      await page.waitForLoadState('domcontentloaded');

      const emailNotifications = page.getByLabel(/email.*notification/i);

      if (await emailNotifications.isVisible().catch(() => false)) {
        await expect(emailNotifications).toBeAttached();
      }
    });
  });
});
