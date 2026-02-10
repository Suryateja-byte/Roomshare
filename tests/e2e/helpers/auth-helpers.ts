import { Page, expect } from '@playwright/test';

/**
 * Centralized mock session token for route-level auth mocking.
 * Use this instead of hardcoding 'mock-session-token' in specs.
 */
export const MOCK_SESSION_TOKEN = 'mock-session-token';

/**
 * Authentication helper functions
 */
export const authHelpers = {
  /**
   * Get test user credentials from environment
   */
  getCredentials() {
    return {
      email: process.env.E2E_TEST_EMAIL || 'test@example.com',
      password: process.env.E2E_TEST_PASSWORD || 'TestPassword123!',
    };
  },

  /**
   * Get admin credentials from environment
   */
  getAdminCredentials() {
    return {
      email: process.env.E2E_ADMIN_EMAIL || 'admin@example.com',
      password: process.env.E2E_ADMIN_PASSWORD || 'AdminPassword123!',
    };
  },

  /**
   * Login via UI (for tests without pre-authenticated state)
   */
  async loginViaUI(page: Page, email?: string, password?: string) {
    const creds = this.getCredentials();
    const useEmail = email || creds.email;
    const usePassword = password || creds.password;

    await page.goto('/login');

    // Wait for the login form to render (Suspense boundary + hydration)
    await expect(
      page.getByRole('heading', { name: /log in|sign in|welcome back/i })
    ).toBeVisible({ timeout: 30000 });

    await page.getByLabel(/email/i).fill(useEmail);
    await page.getByLabel(/password/i).fill(usePassword);
    await page.getByRole('button', { name: /sign in|log in|login/i }).click();

    // Wait for redirect away from login
    await page.waitForURL((url) => !url.pathname.includes('/login'), {
      timeout: 15000,
    });
  },

  /**
   * Register a new user via UI
   */
  async registerViaUI(
    page: Page,
    options: {
      email: string;
      password: string;
      name?: string;
    }
  ) {
    await page.goto('/signup');

    // Fill registration form
    if (options.name) {
      await page.getByLabel(/name/i).first().fill(options.name);
    }
    await page.getByLabel(/email/i).fill(options.email);

    // Handle password fields (might be "password" and "confirm password")
    const passwordInputs = page.locator('input[type="password"]');
    const count = await passwordInputs.count();

    if (count >= 2) {
      await passwordInputs.first().fill(options.password);
      await passwordInputs.nth(1).fill(options.password);
    } else {
      await passwordInputs.first().fill(options.password);
    }

    await page.getByRole('button', { name: /sign up|register|create account/i }).click();

    // Wait for redirect or success message
    await expect(page).not.toHaveURL(/\/signup/, { timeout: 15000 });
  },

  /**
   * Logout via UI
   */
  async logoutViaUI(page: Page) {
    // Try to find and click user menu
    const userMenuButton = page
      .getByRole('button', { name: /menu|profile|account/i })
      .or(page.locator('[data-testid="user-menu"]'))
      .or(page.locator('[aria-label*="user"]'));

    await userMenuButton.click();

    // Click logout option
    await page
      .getByRole('menuitem', { name: /log ?out|sign ?out/i })
      .or(page.getByRole('button', { name: /log ?out|sign ?out/i }))
      .click();

    // Verify logged out
    await expect(page).toHaveURL(/\/(login)?$/, { timeout: 10000 });
  },

  /**
   * Check if currently logged in
   */
  async isLoggedIn(page: Page): Promise<boolean> {
    try {
      const userMenu = page
        .getByRole('button', { name: /menu|profile|account/i })
        .or(page.locator('[data-testid="user-menu"]'))
        .or(page.locator('[aria-label*="user"]'));

      await userMenu.waitFor({ state: 'visible', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Navigate to a protected route and verify auth redirect
   */
  async verifyAuthRequired(page: Page, protectedUrl: string) {
    await page.goto(protectedUrl);

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  },

  /**
   * Verify admin access
   */
  async verifyAdminAccess(page: Page) {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.locator('h1, h2').filter({ hasText: /admin/i })).toBeVisible();
  },

  /**
   * Verify admin access denied for non-admin
   */
  async verifyAdminDenied(page: Page) {
    await page.goto('/admin');

    // Should redirect away or show access denied
    // Wait for either a redirect away from /admin or an access denied message.
    // Client-side auth redirects may fire after domcontentloaded, so we
    // race a URL change against a visible denial message.
    const redirected = await page
      .waitForURL((url) => !url.pathname.startsWith('/admin'), { timeout: 10_000 })
      .then(() => true)
      .catch(() => false);

    if (!redirected) {
      // Still on /admin — must show access denied
      await expect(
        page.locator('text=/access denied|unauthorized|forbidden/i'),
      ).toBeVisible({ timeout: 5_000 });
    }
  },

  /**
   * Generate unique test email
   */
  generateTestEmail(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    return `test-${timestamp}-${random}@example.com`;
  },
};
