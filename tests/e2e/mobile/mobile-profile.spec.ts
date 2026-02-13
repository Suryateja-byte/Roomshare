import { test, expect } from '../helpers';

test.use({ viewport: { width: 390, height: 844 } });
test.use({ storageState: 'playwright/.auth/user.json' });

test.describe('Mobile Profile', () => {
  test('MP-01: Profile page renders with user info', async ({ page }) => {
    await page.goto('/profile');
    await page.waitForLoadState('domcontentloaded');

    // Wait for profile page to load
    await expect(
      page.locator('[data-testid="profile-page"]')
    ).toBeVisible({ timeout: 15000 });

    // Check profile name is visible — testUser is "E2E Test User"
    const profileName = page.locator('[data-testid="profile-name"]');
    await expect(profileName).toBeVisible({ timeout: 10000 });
    await expect(profileName).toContainText(/test user|e2e/i);

    // No horizontal overflow
    const noOverflow = await page.evaluate(
      () => document.body.scrollWidth <= window.innerWidth + 5
    );
    expect(noOverflow).toBe(true);
  });

  test('MP-02: Edit profile link visible and navigates', async ({ page }) => {
    await page.goto('/profile');
    await page.waitForLoadState('domcontentloaded');

    await expect(
      page.locator('[data-testid="profile-page"]')
    ).toBeVisible({ timeout: 15000 });

    // Find and click the edit profile button
    const editButton = page.locator('[data-testid="edit-profile-link"]');
    await expect(editButton).toBeVisible({ timeout: 10000 });

    // Verify button is touch-friendly (adequate size)
    const box = await editButton.boundingBox();
    expect(box).toBeTruthy();
    if (box) {
      expect(box.height).toBeGreaterThanOrEqual(30);
    }

    // Click navigates to /profile/edit
    await editButton.click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForURL(/\/profile\/edit/, { timeout: 10000 });
    expect(page.url()).toContain('/profile/edit');
  });

  test('MP-03: Edit profile form renders in mobile layout', async ({ page }) => {
    await page.goto('/profile/edit');
    await page.waitForLoadState('domcontentloaded');

    // Wait for the edit form to appear
    await expect(
      page.locator('[data-testid="edit-profile-form"]')
    ).toBeVisible({ timeout: 15000 });

    // No horizontal overflow
    const noOverflow = await page.evaluate(
      () => document.body.scrollWidth <= window.innerWidth + 5
    );
    expect(noOverflow).toBe(true);
  });

  test('MP-04: Form inputs are full-width on mobile', async ({ page }) => {
    await page.goto('/profile/edit');
    await page.waitForLoadState('domcontentloaded');

    await expect(
      page.locator('[data-testid="edit-profile-form"]')
    ).toBeVisible({ timeout: 15000 });

    // Check the name input width
    const nameInput = page.locator('[data-testid="profile-name-input"]');
    await expect(nameInput).toBeVisible({ timeout: 10000 });

    const inputBox = await nameInput.boundingBox();
    expect(inputBox).toBeTruthy();
    if (inputBox) {
      // On mobile (390px), the input inside the form should be at least 250px wide
      // (viewport 390 - padding ~48-64px = ~326-342px)
      expect(inputBox.width).toBeGreaterThan(250);
    }
  });

  test('MP-05: Save button accessible (visible on scroll)', async ({ page }) => {
    await page.goto('/profile/edit');
    await page.waitForLoadState('domcontentloaded');

    await expect(
      page.locator('[data-testid="edit-profile-form"]')
    ).toBeVisible({ timeout: 15000 });

    // The save button is at the bottom of the form
    const saveButton = page.locator('[data-testid="profile-save-button"]');
    await expect(saveButton).toBeVisible({ timeout: 10000 });

    // Scroll to it if needed and verify it's interactable
    await saveButton.scrollIntoViewIfNeeded();
    const box = await saveButton.boundingBox();
    expect(box).toBeTruthy();
    if (box) {
      // Button should be within viewport after scrolling
      expect(box.y).toBeLessThan(844);
      expect(box.y + box.height).toBeGreaterThan(0);
      // Touch-friendly size
      expect(box.height).toBeGreaterThanOrEqual(30);
    }
  });

  test('MP-06: Profile image/avatar displays correctly', async ({ page }) => {
    await page.goto('/profile');
    await page.waitForLoadState('domcontentloaded');

    await expect(
      page.locator('[data-testid="profile-page"]')
    ).toBeVisible({ timeout: 15000 });

    // The avatar is rendered by UserAvatar component inside a w-40 h-40 rounded-full container
    // It could be an img tag or a fallback initial letter div
    const avatarContainer = page.locator('.rounded-full').filter({
      has: page.locator('img').or(page.locator('span'))
    }).first();

    if (await avatarContainer.isVisible({ timeout: 5000 }).catch(() => false)) {
      const box = await avatarContainer.boundingBox();
      expect(box).toBeTruthy();
      if (box) {
        // Avatar should have reasonable dimensions
        expect(box.width).toBeGreaterThan(40);
        expect(box.height).toBeGreaterThan(40);
      }
    }

    // No horizontal overflow
    const noOverflow = await page.evaluate(
      () => document.body.scrollWidth <= window.innerWidth + 5
    );
    expect(noOverflow).toBe(true);
  });
});
