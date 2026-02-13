import { test as setup, expect } from '@playwright/test';
import path from 'path';
import { waitForTurnstileIfPresent } from './helpers/auth-helpers';

const authFile = path.join(__dirname, '../../playwright/.auth/user.json');

/**
 * Global authentication setup
 * Runs once before all tests to create a shared authenticated session
 */
setup('authenticate', async ({ page }) => {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'E2E_TEST_EMAIL and E2E_TEST_PASSWORD environment variables must be set'
    );
  }

  // Navigate to login page
  await page.goto('/login');

  // Wait for the login form to render (Suspense boundary + hydration)
  await expect(page.getByRole('heading', { name: /log in|sign in|welcome back/i })).toBeVisible({ timeout: 30000 });

  // Fill login form
  await page.getByLabel(/email/i).fill(email);
  await page.locator('input#password').fill(password);

  // Wait for Turnstile widget to auto-solve (skips if widget not rendered)
  await waitForTurnstileIfPresent(page);

  // Set up response waiter before clicking to avoid race conditions
  const loginResponsePromise = page.waitForResponse(
    (response) => response.url().includes('/api/auth') && response.status() === 200,
    { timeout: 30000 }
  );

  // Submit login
  await page.getByRole('button', { name: /sign in|log in|login/i }).click();

  // Wait for API response first (ensures backend processed the request)
  await loginResponsePromise;

  // Then wait for redirect with increased timeout
  await page.waitForURL((url) => !url.pathname.includes('/login'), {
    timeout: 30000,
  });

  // Verify we're logged in by checking for user menu or profile indicator
  await expect(
    page.getByRole('button', { name: /menu|profile|account/i }).or(
      page.locator('[data-testid="user-menu"]')
    ).or(
      page.locator('[aria-label*="user"]')
    )
  ).toBeVisible({ timeout: 10000 });

  // Save authentication state
  await page.context().storageState({ path: authFile });
});

/**
 * Admin authentication setup
 * Creates a separate authenticated session for admin tests
 * Uses seed credentials from scripts/seed-e2e.js
 */
setup('authenticate as admin', async ({ page }) => {
  const adminAuthFile = path.join(__dirname, '../../playwright/.auth/admin.json');

  await page.goto('/login');
  await expect(page.getByRole('heading', { name: /log in|sign in|welcome back/i })).toBeVisible({ timeout: 30000 });

  await page.getByLabel(/email/i).fill('e2e-admin@roomshare.dev');
  await page.locator('input#password').fill('TestPassword123!');

  // Wait for Turnstile widget to auto-solve (skips if widget not rendered)
  await waitForTurnstileIfPresent(page);

  // Set up response waiter before clicking to avoid race conditions
  const loginResponsePromise = page.waitForResponse(
    (response) => response.url().includes('/api/auth') && response.status() === 200,
    { timeout: 30000 }
  );

  await page.getByRole('button', { name: /sign in|log in|login/i }).click();

  await loginResponsePromise;

  await page.waitForURL((url) => !url.pathname.includes('/login'), {
    timeout: 30000,
  });

  // Verify admin access by navigating to admin page
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin/);

  await page.context().storageState({ path: adminAuthFile });
});
