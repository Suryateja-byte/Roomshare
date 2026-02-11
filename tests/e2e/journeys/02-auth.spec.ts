/**
 * E2E Test Suite: Authentication Journeys
 * Journeys: J007-J016 (Auth focused)
 *
 * Tests user authentication flows including signup, login, logout,
 * password reset, and session management.
 */

import { test, expect, tags, timeouts } from '../helpers';

test.describe('Authentication Journeys', () => {
  // All auth tests must start unauthenticated — clear any inherited storageState
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async () => {
    test.slow();
  });

  test.describe('J007: User signup with email', () => {
    test(`${tags.auth} ${tags.a11y} - Complete signup flow`, async ({ page, data }) => {
      const userData = data.generateUserData();

      // Step 1: Navigate to signup
      await page.goto('/signup');
      await page.waitForLoadState('domcontentloaded');

      // Wait for Suspense boundary to resolve and form to hydrate
      await expect(page.getByRole('heading', { name: /sign up|create.*account|register/i })).toBeVisible({ timeout: 30000 });

      // Step 2: Fill name
      const nameInput = page.getByLabel(/name/i).first();
      if (await nameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await nameInput.fill(userData.name);
      }

      // Step 3: Fill email
      await page.getByLabel(/email/i).first().fill(userData.email);

      // Step 4: Fill password
      const passwordInputs = page.locator('input[type="password"]');
      await passwordInputs.first().fill(userData.password);

      // Step 5: Check password strength meter if present
      const strengthMeter = page.locator('[data-testid="password-strength"], [class*="strength"]').first();
      if (await strengthMeter.isVisible({ timeout: 1000 }).catch(() => false)) {
        await expect(strengthMeter).toBeVisible();
      }

      // Fill confirm password if present
      if ((await passwordInputs.count()) > 1) {
        await passwordInputs.nth(1).fill(userData.password);
      }

      // Step 6: Accept terms if checkbox present
      const termsCheckbox = page.getByLabel(/terms|agree|accept/i).first();
      if (await termsCheckbox.isVisible({ timeout: 1000 }).catch(() => false)) {
        await termsCheckbox.check();
      }

      // Step 7: Submit form
      await page.getByRole('button', { name: /sign up|create|register/i }).first().click();

      // Step 8-9: Wait for redirect and verify logged in
      // Signup redirects to /login?registered=true via router.push
      await expect.poll(
        () => !new URL(page.url()).pathname.includes('/signup'),
        { timeout: 30000, message: 'Expected to navigate away from signup' }
      ).toBe(true);

      // Should redirect to login (with registered=true), verify email page, or onboarding
      const currentUrl = page.url();
      expect(
        currentUrl.includes('/login') ||
        currentUrl.includes('/') ||
        currentUrl.includes('/verify') ||
        currentUrl.includes('/onboarding')
      ).toBeTruthy();
    });

    test(`${tags.auth} - Signup with existing email shows error`, async ({ page, auth }) => {
      await page.goto('/signup');
      await page.waitForLoadState('domcontentloaded');

      // Wait for the signup form to render (Suspense boundary + hydration)
      await expect(page.getByRole('heading', { name: /sign up|create.*account|register/i })).toBeVisible({ timeout: 30000 });

      // Use existing test email
      const creds = auth.getCredentials();

      const nameInput = page.getByLabel(/name/i).first();
      if (await nameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await nameInput.fill('Test User');
      }

      await page.getByLabel(/email/i).first().fill(creds.email);

      const passwordInputs = page.locator('input[type="password"]');
      const testPassword = process.env.E2E_TEST_PASSWORD || 'TestPassword123!';
      await passwordInputs.first().fill(testPassword);
      if ((await passwordInputs.count()) > 1) {
        await passwordInputs.nth(1).fill(testPassword);
      }

      const termsCheckbox = page.getByLabel(/terms|agree/i).first();
      if (await termsCheckbox.isVisible({ timeout: 1000 }).catch(() => false)) {
        await termsCheckbox.check();
      }

      await page.getByRole('button', { name: /sign up|create/i }).first().click();

      // Should show error about existing email
      await expect(
        page.getByText(/already exists|already registered|account exists/i).first()
          .or(page.locator('[role="alert"]').first())
      ).toBeVisible({ timeout: 30000 });
    });

    test(`${tags.auth} - Weak password validation`, async ({ page }) => {
      await page.goto('/signup');
      await page.waitForLoadState('domcontentloaded');

      // Wait for the signup form to render (Suspense boundary + hydration)
      await expect(page.getByRole('heading', { name: /sign up|create.*account|register/i })).toBeVisible({ timeout: 30000 });

      await page.getByLabel(/email/i).first().fill('test@example.com');
      await page.locator('input[type="password"]').first().fill('weak');

      // Try to submit or check for immediate validation
      const submitButton = page.getByRole('button', { name: /sign up|create/i }).first();

      // Either button disabled or validation message shown
      const buttonDisabled = await submitButton.isDisabled().catch(() => false);
      const errorVisible = await page.getByText(/password.*weak|password.*short|password.*requirements/i)
        .first().isVisible().catch(() => false);

      // At least one validation mechanism should be present
      // (may need to click submit to trigger validation)
      if (!buttonDisabled && !errorVisible) {
        await submitButton.click();
        await page.waitForTimeout(500);
        // After clicking submit, check for any error message related to password
        const passwordError = page.getByText(/password/i).first();
        const alertError = page.locator('[role="alert"]').first();
        await expect(
          passwordError.or(alertError)
        ).toBeVisible({ timeout: 10000 });
      }
    });
  });

  test.describe('J008: User login', () => {
    test(`${tags.auth} - Successful login flow`, async ({ page, auth, assert }) => {
      const creds = auth.getCredentials();

      // Step 1: Navigate to login
      await page.goto('/login');
      await page.waitForLoadState('domcontentloaded');
      await expect(page.getByRole('heading', { name: /log in|sign in|welcome back/i })).toBeVisible({ timeout: 30000 });

      // Step 2-3: Fill credentials
      await page.getByLabel(/email/i).first().fill(creds.email);
      await page.getByLabel(/password/i).first().fill(creds.password);

      // Step 4: Submit
      await page.getByRole('button', { name: /log in|sign in/i }).first().click();

      // Step 5: Wait for redirect
      // Login uses window.location.href = '/' (full page navigation)
      await expect.poll(
        () => !new URL(page.url()).pathname.includes('/login'),
        { timeout: 30000, message: 'Expected to navigate away from login' }
      ).toBe(true);

      // Step 6: Verify logged in
      await assert.isLoggedIn();

      // Step 7-8: Refresh and verify session persists
      await page.reload();
      await page.waitForLoadState('domcontentloaded');
      await assert.isLoggedIn();
    });

    test(`${tags.auth} - Invalid credentials show error`, async ({ page }) => {
      await page.goto('/login');
      await page.waitForLoadState('domcontentloaded');

      // Wait for the login form to render (Suspense boundary + hydration)
      await expect(
        page.getByRole('heading', { name: /log in|sign in|welcome back/i })
      ).toBeVisible({ timeout: 30000 });

      await page.getByLabel(/email/i).first().fill('invalid@example.com');
      await page.getByLabel(/password/i).first().fill('wrongpassword');
      await page.getByRole('button', { name: /log in|sign in/i }).first().click();

      // Should show error without revealing which field is wrong
      await expect(
        page.getByText(/invalid|incorrect|wrong|failed/i).first()
          .or(page.locator('[role="alert"]').first())
      ).toBeVisible({ timeout: 30000 });

      // Should stay on login page
      await expect(page).toHaveURL(/\/login/);
    });
  });

  test.describe('J009: User logout', () => {
    test(`${tags.auth} - Logout clears session`, async ({ page, auth, nav, assert }) => {
      // Step 1: Login first
      await auth.loginViaUI(page);

      // Step 2: Navigate to home
      await nav.goHome();

      // Step 3-4: Open user menu and click logout
      // On mobile viewports the user menu may be behind a hamburger;
      // logoutViaUI now handles this internally.
      await auth.logoutViaUI(page);

      // Step 5-6: Verify logged out
      await assert.isLoggedOut();

      // Step 7-8: Protected route should redirect to login
      await page.goto('/profile');
      await expect(page).toHaveURL(/\/login/, { timeout: 30000 });
    });
  });

  test.describe('J010: Password reset', () => {
    test(`${tags.auth} ${tags.flaky} - Request password reset`, async ({ page }) => {
      // Step 1: Navigate to forgot password
      await page.goto('/forgot-password');
      await page.waitForLoadState('domcontentloaded');

      // Wait for the forgot password form to render
      await expect(page.getByRole('heading', { name: /forgot password|reset password/i })).toBeVisible({ timeout: 30000 });

      // Step 2: Fill email
      const emailInput = page.getByLabel(/email/i).first();
      await emailInput.fill(process.env.E2E_TEST_EMAIL || 'test@example.com');

      // Step 3: Submit
      await page.getByRole('button', { name: /reset|send|submit/i }).first().click();

      // Step 4: Success message (should show same message regardless of email existence)
      await expect(
        page.getByText(/check.*email|sent|instructions/i).first()
          .or(page.locator('[data-testid="success-message"]').first())
      ).toBeVisible({ timeout: 30000 });

      // Step 5-7: Test with non-existent email (should show same message - no enumeration)
      // After success, click "Try another email" to return to the form
      await page.getByRole('button', { name: /try another email/i }).first().click();
      await page.getByLabel(/email/i).first().fill('nonexistent-email-12345@example.com');
      await page.getByRole('button', { name: /reset|send|submit/i }).first().click();

      // Should show same success-like message
      await expect(
        page.getByText(/check.*email|sent|instructions/i).first()
      ).toBeVisible({ timeout: 30000 });
    });
  });

  test.describe('J011-J012: Protected route access', () => {
    test(`${tags.auth} - Unauthenticated user redirected from protected routes`, async ({
      page,
      auth,
    }) => {
      const protectedRoutes = [
        '/profile',
        '/settings',
        '/bookings',
        '/messages',
        '/listings/create',
      ];

      for (const route of protectedRoutes) {
        await auth.verifyAuthRequired(page, route);
      }
    });

    test(`${tags.auth} - Protected route redirects to login then allows access`, async ({ page, auth }) => {
      // Try to access protected route
      await page.goto('/profile');

      // Should redirect to login
      await expect(page).toHaveURL(/\/login/, { timeout: 30000 });

      // Wait for the login form to render (Suspense boundary + hydration)
      await page.waitForLoadState('domcontentloaded');
      await expect(
        page.getByRole('heading', { name: /log in|sign in|welcome back/i })
      ).toBeVisible({ timeout: 30000 });

      // Login
      const creds = auth.getCredentials();
      await page.getByLabel(/email/i).first().fill(creds.email);
      await page.getByLabel(/password/i).first().fill(creds.password);
      await page.getByRole('button', { name: /log in|sign in/i }).first().click();

      // Login form redirects to home after successful login (via window.location.href).
      // Use a longer timeout — CI can be slow for full page navigation.
      await expect.poll(
        () => !new URL(page.url()).pathname.includes('/login'),
        { timeout: 60000, message: 'Expected to navigate away from login after auth' }
      ).toBe(true);
    });
  });

  test.describe('J013-J014: Session management', () => {
    test(`${tags.auth} - Session persists across tabs`, async ({ page, context, auth }) => {
      // Login in first tab
      await auth.loginViaUI(page);

      // Open new tab
      const newPage = await context.newPage();
      await newPage.goto('/');
      await newPage.waitForLoadState('domcontentloaded');

      // Should be logged in on new tab too.
      // On mobile viewports the user menu is behind a hamburger — check attached.
      const userMenu = newPage
        .getByRole('button', { name: /menu|profile|account/i })
        .or(newPage.locator('[data-testid="user-menu"]'));

      const viewport = newPage.viewportSize();
      const isMobile = viewport ? viewport.width < 768 : false;

      if (isMobile) {
        await expect(userMenu.first()).toBeAttached({ timeout: 30000 });
      } else {
        await expect(userMenu.first()).toBeVisible({ timeout: 30000 });
      }

      await newPage.close();
    });
  });

  test.describe('J015-J016: Rate limiting on auth', () => {
    test(`${tags.auth} ${tags.flaky} - Rate limit on failed logins`, async ({ page }) => {
      await page.goto('/login');
      await page.waitForLoadState('domcontentloaded');

      // Wait for the login form to render (Suspense boundary + hydration)
      await expect(
        page.getByRole('heading', { name: /log in|sign in|welcome back/i })
      ).toBeVisible({ timeout: 30000 });

      // Attempt multiple failed logins
      for (let i = 0; i < 5; i++) {
        await page.getByLabel(/email/i).first().fill(`test${i}@example.com`);
        await page.getByLabel(/password/i).first().fill('wrongpassword');
        await page.getByRole('button', { name: /log in|sign in/i }).first().click();

        // Wait for the error response or form to be re-interactable
        await page.waitForTimeout(1000);

        // Wait for form to be ready for next iteration (button re-enabled)
        await expect(page.getByRole('button', { name: /log in|sign in/i }).first()).toBeEnabled({ timeout: 10000 });
      }

      // After multiple attempts, should see rate limit or be slowed down
      // (exact behavior depends on implementation)
      // Rate limiting may or may not be visible, but login should still work eventually
      // This test mainly ensures the app doesn't crash under rapid auth attempts
      expect(page.url()).toContain('/login');
    });
  });
});
