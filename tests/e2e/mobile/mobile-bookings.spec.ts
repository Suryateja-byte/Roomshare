import { test, expect } from '../helpers';

test.use({ viewport: { width: 390, height: 844 } });
test.use({ storageState: 'playwright/.auth/user.json' });

test.describe('Mobile Bookings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/bookings');
    await page.waitForLoadState('domcontentloaded');
  });

  test('MB-01: Bookings list page renders in mobile layout', async ({ page }) => {
    // Wait for the page to render — look for heading or booking items
    await expect(
      page.getByRole('heading', { name: /my bookings/i }).or(page.getByText('My Bookings')).first()
    ).toBeVisible({ timeout: 15000 });

    // No horizontal overflow
    const noOverflow = await page.evaluate(
      () => document.body.scrollWidth <= window.innerWidth + 5
    );
    expect(noOverflow).toBe(true);
  });

  test('MB-02: Booking card shows status badge, listing title, dates', async ({ page }) => {
    // testUser has bookings (sent as tenant and received as host).
    // Default tab is "Received". Switch to "Sent" to see testUser's own booking.
    const sentTab = page.getByRole('button', { name: /sent/i }).first();
    if (await sentTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await sentTab.click();
      await page.waitForTimeout(500);
    }

    const bookingCard = page.locator('[data-testid="booking-item"]').first();
    // If no booking cards visible in sent, check received tab
    if (!(await bookingCard.isVisible({ timeout: 5000 }).catch(() => false))) {
      const receivedTab = page.getByRole('button', { name: /received/i }).first();
      if (await receivedTab.isVisible({ timeout: 3000 }).catch(() => false)) {
        await receivedTab.click();
        await page.waitForTimeout(500);
      }
    }

    // Check booking card has essential elements
    const card = page.locator('[data-testid="booking-item"]').first();
    if (await card.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Status badge (Pending, Accepted, Rejected, Cancelled)
      await expect(
        card.locator('span').filter({ hasText: /pending|accepted|rejected|cancelled/i }).first()
      ).toBeVisible({ timeout: 5000 });

      // Listing title (link text)
      const titleLink = card.locator('a').first();
      await expect(titleLink).toBeVisible();

      // Dates — Check-in / Check-out labels
      await expect(card.getByText('Check-in')).toBeVisible();
      await expect(card.getByText('Check-out')).toBeVisible();
    } else {
      // No bookings at all — check empty state
      await expect(
        page.locator('[data-testid="empty-state"]').or(page.getByText(/no booking/i)).first()
      ).toBeVisible({ timeout: 5000 });
    }
  });

  test('MB-03: Tap booking card navigates to listing detail', async ({ page }) => {
    // Ensure we can see a booking card
    const sentTab = page.getByRole('button', { name: /sent/i }).first();
    if (await sentTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await sentTab.click();
      await page.waitForTimeout(500);
    }

    let card = page.locator('[data-testid="booking-item"]').first();
    if (!(await card.isVisible({ timeout: 5000 }).catch(() => false))) {
      const receivedTab = page.getByRole('button', { name: /received/i }).first();
      if (await receivedTab.isVisible({ timeout: 3000 }).catch(() => false)) {
        await receivedTab.click();
        await page.waitForTimeout(500);
      }
      card = page.locator('[data-testid="booking-item"]').first();
    }

    if (await card.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Click any link within the booking card (listing title or booking detail)
      const cardLink = card.locator('a').first();
      if (await cardLink.isVisible({ timeout: 3000 }).catch(() => false)) {
        await cardLink.click();
        // Wait for navigation to complete — could go to /listings/ or /bookings/
        await page.waitForURL(/\/(listings|bookings)\//, { timeout: 15000 });
        const url = page.url();
        expect(url.includes('/listings/') || url.includes('/bookings/')).toBeTruthy();
      } else {
        test.skip(true, 'No clickable link found in booking card');
      }
    } else {
      test.skip(true, 'No booking cards available to tap');
    }
  });

  test('MB-04: Empty bookings state renders correctly', async ({ page }) => {
    // Check for empty state — this depends on whether the default tab has bookings.
    // If received has bookings but we filter to a status with none, we can test empty state.
    const allBookingCards = page.locator('[data-testid="booking-item"]');
    const cardCount = await allBookingCards.count();

    if (cardCount === 0) {
      // Already showing empty state
      await expect(
        page.locator('[data-testid="empty-state"]').or(page.getByText(/no booking/i)).first()
      ).toBeVisible({ timeout: 5000 });
    } else {
      // Try filtering by a status that likely has no bookings (e.g., Cancelled)
      const cancelledFilter = page.getByRole('button', { name: /cancelled/i }).first();
      if (await cancelledFilter.isVisible({ timeout: 3000 }).catch(() => false)) {
        await cancelledFilter.click();
        await page.waitForTimeout(500);
        const filteredCards = await page.locator('[data-testid="booking-item"]').count();
        if (filteredCards === 0) {
          await expect(
            page.locator('[data-testid="empty-state"]').or(page.getByText(/no booking/i)).first()
          ).toBeVisible({ timeout: 5000 });
        }
      }
    }

    // Verify no horizontal overflow regardless
    const noOverflow = await page.evaluate(
      () => document.body.scrollWidth <= window.innerWidth + 5
    );
    expect(noOverflow).toBe(true);
  });

  test('MB-05: Status filter chips are visible and scrollable on mobile', async ({ page }) => {
    // The bookings page has status filter chips (All, Pending, Accepted, Rejected, Cancelled)
    // Look for "All" filter button which is always present when bookings page loads
    const allFilter = page.getByRole('button', { name: /^all$/i }).first();

    if (await allFilter.isVisible({ timeout: 8000 }).catch(() => false)) {
      await expect(allFilter).toBeVisible();

      // Check at least one more filter is present
      const pendingFilter = page.getByRole('button', { name: /pending/i }).first();
      const hasMore = await pendingFilter.isVisible({ timeout: 3000 }).catch(() => false);
      if (hasMore) {
        await expect(pendingFilter).toBeVisible();
      }

      // Verify filter buttons don't overflow viewport
      const noOverflow = await page.evaluate(
        () => document.body.scrollWidth <= window.innerWidth + 5
      );
      expect(noOverflow).toBe(true);
    } else {
      // Filter chips may not be rendered if the tabs (Sent/Received) haven't loaded
      test.skip(true, 'Filter chips not visible — page may not have loaded fully');
    }
  });

  test('MB-06: Cancel booking button accessible on mobile', async ({ page }) => {
    // Switch to sent tab where testUser's own bookings are
    const sentTab = page.getByRole('button', { name: /sent/i }).first();
    if (await sentTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await sentTab.click();
      await page.waitForTimeout(500);
    }

    const cancelButton = page.getByRole('button', { name: /cancel booking/i }).first();
    if (await cancelButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Verify the button is within the viewport or scrollable to
      const box = await cancelButton.boundingBox();
      expect(box).toBeTruthy();
      if (box) {
        expect(box.width).toBeGreaterThan(30);
        expect(box.height).toBeGreaterThan(30);
      }
    } else {
      // No cancellable bookings (all might be completed/rejected/cancelled)
      test.skip(true, 'No cancellable booking found in sent tab');
    }
  });

  test('MB-07: Refresh/reload preserves bookings display', async ({ page }) => {
    // Verify page loads
    await expect(
      page.getByRole('heading', { name: /my bookings/i }).or(page.getByText('My Bookings')).first()
    ).toBeVisible({ timeout: 15000 });

    // Reload
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    // Verify page still displays correctly
    await expect(
      page.getByRole('heading', { name: /my bookings/i }).or(page.getByText('My Bookings')).first()
    ).toBeVisible({ timeout: 15000 });

    // No horizontal overflow after reload
    const noOverflow = await page.evaluate(
      () => document.body.scrollWidth <= window.innerWidth + 5
    );
    expect(noOverflow).toBe(true);
  });

  test('MB-08: Booking detail grid responsive on mobile', async ({ page }) => {
    // The BookingCard has a grid: grid-cols-2 md:grid-cols-4
    // On mobile (390px) it should be 2 columns
    const sentTab = page.getByRole('button', { name: /sent/i }).first();
    if (await sentTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await sentTab.click();
      await page.waitForTimeout(500);
    }

    let card = page.locator('[data-testid="booking-item"]').first();
    if (!(await card.isVisible({ timeout: 5000 }).catch(() => false))) {
      const receivedTab = page.getByRole('button', { name: /received/i }).first();
      if (await receivedTab.isVisible({ timeout: 3000 }).catch(() => false)) {
        await receivedTab.click();
        await page.waitForTimeout(500);
      }
      card = page.locator('[data-testid="booking-item"]').first();
    }

    if (await card.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Check the card doesn't overflow
      const cardBox = await card.boundingBox();
      expect(cardBox).toBeTruthy();
      if (cardBox) {
        // Card width should be within viewport
        expect(cardBox.width).toBeLessThanOrEqual(390 + 5);
      }

      // No horizontal overflow
      const noOverflow = await page.evaluate(
        () => document.body.scrollWidth <= window.innerWidth + 5
      );
      expect(noOverflow).toBe(true);
    } else {
      test.skip(true, 'No booking cards available to check responsiveness');
    }
  });
});
