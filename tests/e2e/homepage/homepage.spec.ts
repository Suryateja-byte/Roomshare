/**
 * Homepage E2E Tests — Authenticated user
 *
 * Tests HP-09 through HP-12: auth-specific CTAs, create-listing navigation,
 * user menu visibility, and navbar "List a Room" link.
 *
 * Runs under the default `chromium` project with user auth.
 */

import { test, expect } from '../helpers';

test.describe('Homepage — Authenticated User', () => {
  test.use({ storageState: 'playwright/.auth/user.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
  });

  test('HP-09: Auth user does not see "Sign Up Free" CTA', async ({ page }) => {
    // Wait for hero to render
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15000 });

    // The signup CTA box should be hidden for authenticated users
    // "Sign Up Free" button should NOT be visible in the hero area
    const signUpButton = page.locator('section').first()
      .getByRole('link', { name: /sign up free/i });

    // Allow page to fully render, then verify sign-up is absent
    await page.waitForTimeout(2000);
    await expect(signUpButton).toBeHidden();
  });

  test('HP-10: Auth user can navigate to create listing from navbar', async ({ page }) => {
    // Navbar has "List a Room" link pointing to /listings/create
    const createLink = page.getByRole('link', { name: /list a room/i })
      .or(page.getByRole('link', { name: /post.*listing|create.*listing/i }))
      .first();

    await expect(createLink).toBeVisible({ timeout: 15000 });
    await createLink.click();
    await page.waitForURL(/\/listings\/create/, { timeout: 15000 });
    await expect(page).toHaveURL(/\/listings\/create/);
  });

  test('HP-11: User menu visible in header when authenticated', async ({ page }) => {
    // The user menu button has data-testid="user-menu" and aria-label="User menu"
    await expect(
      page.locator('[data-testid="user-menu"]')
        .or(page.getByRole('button', { name: /user menu/i }))
        .first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('HP-12: List a Room CTA in navbar links to /listings/create', async ({ page }) => {
    // The navbar has a "List a Room" button/link for all users
    const listLink = page.getByRole('link', { name: /list a room/i }).first();

    await expect(listLink).toBeVisible({ timeout: 10000 });
    const href = await listLink.getAttribute('href');
    expect(href).toMatch(/\/listings\/create/);
  });
});
