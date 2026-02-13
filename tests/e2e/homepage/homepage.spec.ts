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
    const viewport = page.viewportSize();
    const isMobile = viewport && viewport.width < 768;

    if (isMobile) {
      // On mobile, open the hamburger menu to reveal user info
      const hamburger = page.getByLabel(/open menu/i);
      await expect(hamburger).toBeVisible({ timeout: 10000 });
      await hamburger.click();
      await page.waitForTimeout(500);

      // Mobile menu shows "View Profile" link for authenticated users
      await expect(
        page.getByRole('link', { name: /view profile/i })
      ).toBeVisible({ timeout: 10000 });
    } else {
      // Desktop: user-menu button is directly visible in the navbar
      await expect(
        page.locator('[data-testid="user-menu"]')
      ).toBeVisible({ timeout: 10000 });
    }
  });

  test('HP-12: List a Room CTA in navbar links to /listings/create', async ({ page }) => {
    const viewport = page.viewportSize();
    const isMobile = viewport && viewport.width < 768;

    if (isMobile) {
      // On mobile, open the hamburger menu to reveal "List a Room"
      const hamburger = page.getByLabel(/open menu/i);
      await expect(hamburger).toBeVisible({ timeout: 10000 });
      await hamburger.click();
      await page.waitForTimeout(500);
    }

    // The navbar (or mobile menu) has a "List a Room" button/link
    const listLink = page.getByRole('link', { name: /list a room/i }).first();
    await expect(listLink).toBeVisible({ timeout: 10000 });
    const href = await listLink.getAttribute('href');
    expect(href).toMatch(/\/listings\/create/);
  });
});
