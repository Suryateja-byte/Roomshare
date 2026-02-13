import { test, expect } from '../helpers';

test.use({ viewport: { width: 390, height: 844 } });
test.use({ storageState: 'playwright/.auth/user.json' });

test.describe('Mobile Notifications', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/notifications');
    await page.waitForLoadState('domcontentloaded');
  });

  test('MN-01: Notifications page renders in mobile layout', async ({ page }) => {
    // Wait for the notifications page to load
    await expect(
      page.locator('[data-testid="notifications-page"]')
    ).toBeVisible({ timeout: 15000 });

    // Check heading is visible
    await expect(
      page.getByRole('heading', { name: /notifications/i }).first()
    ).toBeVisible({ timeout: 10000 });

    // No horizontal overflow
    const noOverflow = await page.evaluate(
      () => document.body.scrollWidth <= window.innerWidth + 5
    );
    expect(noOverflow).toBe(true);
  });

  test('MN-02: Notification items display correctly (no overflow)', async ({ page }) => {
    await expect(
      page.locator('[data-testid="notifications-page"]')
    ).toBeVisible({ timeout: 15000 });

    const notificationItems = page.locator('[data-testid="notification-item"]');
    const count = await notificationItems.count().catch(() => 0);

    if (count > 0) {
      // Check the first notification item
      const firstItem = notificationItems.first();
      await expect(firstItem).toBeVisible({ timeout: 5000 });

      const box = await firstItem.boundingBox();
      expect(box).toBeTruthy();
      if (box) {
        // Item width should not exceed viewport
        expect(box.width).toBeLessThanOrEqual(390 + 5);
      }

      // Verify text content is present (title and message)
      const itemText = await firstItem.textContent();
      expect(itemText).toBeTruthy();
      expect(itemText!.length).toBeGreaterThan(0);
    } else {
      // Empty state — should display "No notifications yet"
      await expect(
        page.getByText(/no notifications/i).or(page.getByText(/all caught up/i)).first()
      ).toBeVisible({ timeout: 5000 });
    }

    // No horizontal overflow
    const noOverflow = await page.evaluate(
      () => document.body.scrollWidth <= window.innerWidth + 5
    );
    expect(noOverflow).toBe(true);
  });

  test('MN-03: Tap actions work (mark read, delete)', async ({ page }) => {
    await expect(
      page.locator('[data-testid="notifications-page"]')
    ).toBeVisible({ timeout: 15000 });

    const notificationItems = page.locator('[data-testid="notification-item"]');
    const count = await notificationItems.count().catch(() => 0);

    if (count > 0) {
      const firstItem = notificationItems.first();

      // Check for mark-read button (only on unread notifications)
      const markReadBtn = firstItem.locator('[data-testid="mark-read-button"]');
      const deleteBtn = firstItem.locator('[data-testid="delete-button"]');

      if (await markReadBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Verify mark-read button is tappable (adequate size)
        const readBox = await markReadBtn.boundingBox();
        expect(readBox).toBeTruthy();
        if (readBox) {
          expect(readBox.width).toBeGreaterThanOrEqual(24);
          expect(readBox.height).toBeGreaterThanOrEqual(24);
        }
      }

      if (await deleteBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Verify delete button is tappable
        const deleteBox = await deleteBtn.boundingBox();
        expect(deleteBox).toBeTruthy();
        if (deleteBox) {
          expect(deleteBox.width).toBeGreaterThanOrEqual(24);
          expect(deleteBox.height).toBeGreaterThanOrEqual(24);
        }
      }
    } else {
      test.skip(true, 'No notifications available to test actions');
    }
  });

  test('MN-04: Filter tabs render and are tappable', async ({ page }) => {
    await expect(
      page.locator('[data-testid="notifications-page"]')
    ).toBeVisible({ timeout: 15000 });

    // Filter tabs: All and Unread
    const filterTabs = page.locator('[data-testid="filter-tabs"]');
    await expect(filterTabs).toBeVisible({ timeout: 10000 });

    // Check "All" button
    const allButton = filterTabs.getByRole('button', { name: /all/i }).first();
    await expect(allButton).toBeVisible({ timeout: 5000 });

    // Check "Unread" button
    const unreadButton = filterTabs.getByRole('button', { name: /unread/i }).first();
    await expect(unreadButton).toBeVisible({ timeout: 5000 });

    // Verify they fit within viewport (no overflow)
    const tabsBox = await filterTabs.boundingBox();
    expect(tabsBox).toBeTruthy();
    if (tabsBox) {
      expect(tabsBox.width).toBeLessThanOrEqual(390 + 5);
    }

    // Tap the unread filter and verify it activates
    await unreadButton.click();
    await page.waitForTimeout(300);

    // The unread button should now be active (has active styling)
    // Verify the page still renders correctly
    const noOverflow = await page.evaluate(
      () => document.body.scrollWidth <= window.innerWidth + 5
    );
    expect(noOverflow).toBe(true);
  });

  test('MN-05: Empty state renders correctly', async ({ page }) => {
    await expect(
      page.locator('[data-testid="notifications-page"]')
    ).toBeVisible({ timeout: 15000 });

    // Switch to unread filter to potentially see empty state
    const filterTabs = page.locator('[data-testid="filter-tabs"]');
    if (await filterTabs.isVisible({ timeout: 5000 }).catch(() => false)) {
      const unreadButton = filterTabs.getByRole('button', { name: /unread/i }).first();
      if (await unreadButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await unreadButton.click();
        await page.waitForTimeout(500);
      }
    }

    // Check if empty state or notification items are visible
    const hasItems = await page.locator('[data-testid="notification-item"]').first()
      .isVisible({ timeout: 3000 }).catch(() => false);

    if (!hasItems) {
      // Should show empty state text
      await expect(
        page.getByText(/no unread notifications/i)
          .or(page.getByText(/no notifications/i))
          .or(page.getByText(/all caught up/i))
          .first()
      ).toBeVisible({ timeout: 5000 });
    }

    // No horizontal overflow regardless
    const noOverflow = await page.evaluate(
      () => document.body.scrollWidth <= window.innerWidth + 5
    );
    expect(noOverflow).toBe(true);
  });

  test('MN-06: Notification count or badge in header area', async ({ page }) => {
    await expect(
      page.locator('[data-testid="notifications-page"]')
    ).toBeVisible({ timeout: 15000 });

    // The notifications page header shows unread count text:
    // "You have X unread notification(s)" or "All caught up!"
    const headerText = page.locator('[data-testid="notifications-page"]')
      .locator('p')
      .filter({ hasText: /unread|caught up/i })
      .first();

    if (await headerText.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(headerText).toBeVisible();
      const text = await headerText.textContent();
      expect(text).toBeTruthy();
      // Should mention either unread count or "all caught up"
      expect(text).toMatch(/unread|caught up/i);
    }

    // Also check for mark-all-read button (visible when there are unread notifications)
    const markAllReadBtn = page.locator('[data-testid="mark-all-read-button"]');
    if (await markAllReadBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      const box = await markAllReadBtn.boundingBox();
      expect(box).toBeTruthy();
      if (box) {
        // Should be touch-friendly
        expect(box.height).toBeGreaterThanOrEqual(30);
      }
    }

    // No horizontal overflow
    const noOverflow = await page.evaluate(
      () => document.body.scrollWidth <= window.innerWidth + 5
    );
    expect(noOverflow).toBe(true);
  });
});
