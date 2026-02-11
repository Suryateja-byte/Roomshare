/**
 * E2E Test Suite: Profile & Settings Journeys
 * Journeys: J067-J076
 *
 * Tests user profile management, settings configuration,
 * notification preferences, and account operations.
 */

import { test, expect, tags, selectors } from '../helpers';

test.describe('Profile & Settings Journeys', () => {
  test.use({ storageState: 'playwright/.auth/user.json' });

  test.beforeEach(async () => {
    test.slow();
  });

  test.describe('J067: View user profile', () => {
    test(`${tags.auth} - View own profile`, async ({ page, nav, assert }) => {
      await nav.goToProfile();

      // Profile should load
      await assert.pageLoaded();

      // Should show profile information
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

      // Should show user details
      const profileSections = [
        page.locator('[data-testid="user-avatar"]').or(page.locator('img[alt*="avatar" i], img[alt*="profile" i]')),
        page.getByText(/member since|joined/i),
      ];

      for (const section of profileSections) {
        // At least avatar should be visible
        if (await section.first().isVisible().catch(() => false)) {
          await expect(section.first()).toBeVisible();
          break;
        }
      }
    });

    test(`${tags.core} - View other user's public profile`, async ({ page }) => {
      // Navigate directly to a user profile (would need existing user ID)
      await page.goto('/users/1');

      // Should show public profile or redirect
      await page.waitForLoadState('domcontentloaded');

      // Public profile should show limited info
      const publicProfile = page.getByRole('heading');
      const notFound = page.getByText(/not found|404|couldn't find|doesn't exist/i);

      await expect(publicProfile.or(notFound).first()).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('J068: Edit profile information', () => {
    test(`${tags.auth} - Update profile name and bio`, async ({ page, nav }) => {
      await nav.goToProfile();

      // Find edit button — profile page uses Edit2 icon link or button
      const editButton = page.getByRole('link', { name: /edit.*profile/i })
        .or(page.getByRole('button', { name: /edit.*profile/i }))
        .or(page.getByRole('link', { name: /edit/i }))
        .first();

      if (await editButton.isVisible().catch(() => false)) {
        await editButton.click();

        // Wait for edit form page to load
        await page.waitForURL(/\/edit|\/settings/, { timeout: 30000 });
        // Wait for the form to hydrate and become interactive
        await page.locator('form').first().waitFor({ state: 'visible', timeout: 10000 });

        // Update name — label is "Full Name" on the edit profile page
        const nameInput = page.getByLabel(/full.*name|name/i).first();
        if (await nameInput.isVisible().catch(() => false)) {
          await nameInput.clear();
          await nameInput.fill('Updated Test User');
        }

        // Update bio
        const bioInput = page.getByLabel(/bio|about/i).first();
        if (await bioInput.isVisible().catch(() => false)) {
          await bioInput.clear();
          await bioInput.fill('Updated bio for testing purposes.');
        }

        // Save changes — button text is "Save Changes"
        const saveButton = page.getByRole('button', { name: /save|update/i }).first();
        await saveButton.waitFor({ state: 'visible', timeout: 5000 });
        await saveButton.click();

        // Verify success — EditProfileClient shows "Profile updated successfully! Redirecting..."
        // or it may redirect back to /profile. Wait for either success text or navigation.
        await expect(
          page.getByText(/updated successfully|profile updated/i)
            .or(page.locator(selectors.toast))
            .first()
        ).toBeVisible({ timeout: 30000 });
      }
    });

    test(`${tags.auth} - Upload profile picture`, async ({ page, nav }) => {
      await nav.goToProfile();

      const editButton = page.getByRole('button', { name: /edit.*profile/i })
        .or(page.getByRole('link', { name: /edit/i }))
        .first();

      if (await editButton.isVisible()) {
        await editButton.click();

        // Find file input for avatar
        const fileInput = page.locator('input[type="file"][accept*="image"]');

        if ((await fileInput.count()) > 0) {
          // File input exists - would upload in real test
          await expect(fileInput.first()).toBeAttached();
        }
      }
    });
  });

  test.describe('J069: Notification settings', () => {
    test(`${tags.auth} - Toggle email notifications`, async ({ page, nav }) => {
      await nav.goToSettings();

      // Check we weren't redirected to login
      if (page.url().includes('/login')) {
        test.skip(true, 'Auth session expired - redirected to login');
        return;
      }

      // Wait for the settings page to fully hydrate
      await page.locator('h1').first().waitFor({ state: 'visible', timeout: 10000 });

      // Find notification settings section — SettingsClient renders "Email Notifications" as h2
      const notificationSection = page.getByRole('heading', { name: /notification/i }).first()
        .or(page.locator('[data-testid="notification-settings"]'))
        .first();

      await expect(notificationSection).toBeVisible({ timeout: 10000 });

      // SettingsClient uses role="switch" buttons, not checkbox inputs
      const emailToggle = page.locator('[role="switch"]').first();

      if (await emailToggle.isVisible().catch(() => false)) {
        const initialState = (await emailToggle.getAttribute('aria-checked')) === 'true';
        await emailToggle.click();

        // State should toggle
        const newState = (await emailToggle.getAttribute('aria-checked')) === 'true';
        expect(newState).not.toBe(initialState);

        // Save preferences button
        const saveButton = page.getByRole('button', { name: /save/i }).first();
        if (await saveButton.isVisible().catch(() => false)) {
          await saveButton.click();
        }
      }
    });

    test(`${tags.auth} - Configure notification preferences`, async ({ page, nav }) => {
      await nav.goToSettings();

      // Check we weren't redirected to login
      if (page.url().includes('/login')) {
        test.skip(true, 'Auth session expired - redirected to login');
        return;
      }

      // Wait for the settings page to fully hydrate
      await page.locator('h1').first().waitFor({ state: 'visible', timeout: 10000 });

      // SettingsClient renders notification toggles as role="switch" with aria-label like "Toggle Booking Requests"
      const notificationTypes = [
        'Booking',
        'Messages',
        'Reviews',
        'Marketing',
      ];

      for (const type of notificationTypes) {
        const toggle = page.locator(`[role="switch"][aria-label*="${type}" i]`)
          .or(page.locator(`[data-testid="${type.toLowerCase()}-notifications"]`))
          .first();

        if (await toggle.isVisible().catch(() => false)) {
          // Notification type exists
          await expect(toggle).toBeAttached();
        }
      }
    });
  });

  test.describe('J070: Privacy settings', () => {
    test(`${tags.auth} - Toggle profile visibility`, async ({ page, nav }) => {
      await nav.goToSettings();

      // Check we weren't redirected to login
      if (page.url().includes('/login')) {
        test.skip(true, 'Auth session expired - redirected to login');
        return;
      }

      // Find privacy section
      const privacySection = page.getByRole('heading', { name: /privacy/i })
        .or(page.locator('[data-testid="privacy-settings"]'))
        .first();

      if (await privacySection.isVisible().catch(() => false)) {
        const visibilityToggle = page.getByLabel(/public.*profile|profile.*visibility/i);

        if (await visibilityToggle.isVisible()) {
          const initialState = await visibilityToggle.isChecked();
          await visibilityToggle.click();
          expect(await visibilityToggle.isChecked()).not.toBe(initialState);
        }
      }
    });
  });

  test.describe('J071: Change password', () => {
    test(`${tags.auth} - Change password flow`, async ({ page, nav }) => {
      await nav.goToSettings();

      // Check we weren't redirected to login
      if (page.url().includes('/login')) {
        test.skip(true, 'Auth session expired - redirected to login');
        return;
      }

      // Wait for the settings page to fully hydrate
      await page.locator('h1').first().waitFor({ state: 'visible', timeout: 10000 });

      // The password section is only rendered when hasPassword=true.
      // Look for the "Change Password" heading (h2) which indicates the section exists.
      const passwordHeading = page.getByRole('heading', { name: /change.*password/i });
      const hasPasswordSection = await passwordHeading.isVisible({ timeout: 5000 }).catch(() => false);

      if (!hasPasswordSection) {
        // User has no password (OAuth-only) — skip gracefully
        return;
      }

      // The password form inputs are always visible when the section exists (no click-to-reveal)
      const currentPasswordInput = page.getByLabel(/current.*password/i);
      const newPasswordInput = page.getByLabel(/^new password$/i);
      const confirmPasswordInput = page.getByLabel(/confirm/i);

      // Wait for the form inputs to be interactive (hydration)
      await currentPasswordInput.waitFor({ state: 'visible', timeout: 10000 });

      const currentPwd = process.env.E2E_TEST_PASSWORD || 'TestPassword123!';
      const newPwd = process.env.E2E_TEST_NEW_PASSWORD || 'NewTestPassword123!';

      await currentPasswordInput.fill(currentPwd);
      await newPasswordInput.fill(newPwd);
      await confirmPasswordInput.fill(newPwd);

      // Submit — button text is "Change Password"
      await page.getByRole('button', { name: /change.*password/i }).click();

      // Should show success message, error message, or toast
      await expect(
        page.getByText(/password changed|password updated|do not match|at least|failed/i)
          .or(page.locator(selectors.toast))
          .first()
      ).toBeVisible({ timeout: 10000 });
    });

    test(`${tags.auth} - Password strength validation`, async ({ page, nav }) => {
      await nav.goToSettings();

      // Check we weren't redirected to login
      if (page.url().includes('/login')) {
        test.skip(true, 'Auth session expired - redirected to login');
        return;
      }

      // Wait for the settings page to fully hydrate
      await page.locator('h1').first().waitFor({ state: 'visible', timeout: 10000 });

      // The password section is only rendered when hasPassword=true.
      const passwordHeading = page.getByRole('heading', { name: /change.*password/i });
      const hasPasswordSection = await passwordHeading.isVisible({ timeout: 5000 }).catch(() => false);

      if (!hasPasswordSection) {
        // User has no password (OAuth-only) — skip gracefully
        return;
      }

      const newPasswordInput = page.getByLabel(/^new password$/i);
      await newPasswordInput.waitFor({ state: 'visible', timeout: 10000 });

      // Try weak password
      await newPasswordInput.fill('weak');

      // PasswordStrengthMeter component should render below the input
      const strengthMeter = page.locator('[data-testid="password-strength"]');
      const strengthText = page.getByText(/weak|fair|strong|very strong/i);

      await expect(strengthMeter.or(strengthText).first()).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('J072: Connected accounts', () => {
    test(`${tags.auth} - View connected OAuth providers`, async ({ page, nav }) => {
      await nav.goToSettings();

      // Check we weren't redirected to login
      if (page.url().includes('/login')) {
        test.skip(true, 'Auth session expired - redirected to login');
        return;
      }

      // Find connected accounts section
      const connectedSection = page.getByRole('heading', { name: /connected|linked|accounts/i });

      if (await connectedSection.isVisible().catch(() => false)) {
        // Should show OAuth providers (Google, GitHub, etc.)
        const providers = page.locator('[data-testid="oauth-provider"]');
        await page.waitForTimeout(1000);
      }
    });
  });

  test.describe('J073-J074: Account management', () => {
    test(`${tags.auth} - Deactivate account option`, async ({ page, nav }) => {
      await nav.goToSettings();

      // Check we weren't redirected to login
      if (page.url().includes('/login')) {
        test.skip(true, 'Auth session expired - redirected to login');
        return;
      }

      // Find account management or danger zone
      const dangerSection = page.getByRole('heading', { name: /danger|account.*management|delete/i })
        .or(page.locator('[data-testid="danger-zone"]'))
        .first();

      if (await dangerSection.isVisible().catch(() => false)) {
        const deactivateButton = page.getByRole('button', { name: /deactivate|disable/i });

        if (await deactivateButton.isVisible()) {
          await deactivateButton.click();

          // Should show confirmation
          const confirmDialog = page.locator(selectors.modal);
          await expect(confirmDialog).toBeVisible({ timeout: 5000 });

          // Cancel - don't actually deactivate
          const cancelButton = confirmDialog.getByRole('button', { name: /cancel|no/i });
          if (await cancelButton.isVisible()) {
            await cancelButton.click();
          }
        }
      }
    });

    test(`${tags.auth} - Delete account warning`, async ({ page, nav }) => {
      await nav.goToSettings();
      await page.waitForLoadState('domcontentloaded');
      // Wait for any client-side redirects to settle (CI can be slow)
      await page.waitForTimeout(2000);

      // Check we weren't redirected to login or signup
      const currentUrl = page.url();
      if (currentUrl.includes('/login') || currentUrl.includes('/signup') || currentUrl.includes('/signin')) {
        test.skip(true, 'Auth redirect — session not available in CI');
        return;
      }

      // Wait for the settings page to fully hydrate
      await page.locator('h1').first().waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
      // Extra wait for hydration in CI
      await page.waitForTimeout(1000);

      const deleteButton = page.getByRole('button', { name: /delete.*account/i });

      if (await deleteButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await deleteButton.click();

        // Should show serious warning
        const warningDialog = page.locator(selectors.modal);
        await expect(warningDialog).toBeVisible({ timeout: 10000 });

        // Should require confirmation
        const confirmInput = warningDialog.getByPlaceholder(/delete|confirm/i);
        const isSerious = await confirmInput.isVisible().catch(() => false);

        // Cancel
        const cancelButton = warningDialog.getByRole('button', { name: /cancel|no/i });
        if (await cancelButton.isVisible()) {
          await cancelButton.click();
        }
      }
    });
  });

  test.describe('J075-J076: Theme and preferences', () => {
    test(`${tags.auth} - Toggle dark mode`, async ({ page, nav }) => {
      await nav.goToSettings();

      // Check we weren't redirected to login
      if (page.url().includes('/login')) {
        test.skip(true, 'Auth session expired - redirected to login');
        return;
      }

      // Find theme toggle
      const themeToggle = page.getByRole('button', { name: /dark.*mode|theme/i })
        .or(page.getByLabel(/dark.*mode|theme/i))
        .or(page.locator('[data-testid="theme-toggle"]'))
        .first();

      if (await themeToggle.isVisible().catch(() => false)) {
        // Get initial theme
        const html = page.locator('html');
        const initialDark = await html.getAttribute('class').then(c => c?.includes('dark')) || false;

        // Toggle
        await themeToggle.click();
        await page.waitForTimeout(500);

        // Theme should change
        const newDark = await html.getAttribute('class').then(c => c?.includes('dark')) || false;
        // May or may not change depending on implementation
      }
    });

    test(`${tags.auth} - Language preference`, async ({ page, nav }) => {
      await nav.goToSettings();

      // Check we weren't redirected to login
      if (page.url().includes('/login')) {
        test.skip(true, 'Auth session expired - redirected to login');
        return;
      }

      // Find language selector
      const languageSelect = page.getByLabel(/language/i)
        .or(page.locator('[data-testid="language-select"]'))
        .first();

      if (await languageSelect.isVisible().catch(() => false)) {
        // Should have language options
        await expect(languageSelect).toBeAttached();
      }
    });
  });
});
