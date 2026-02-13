import { type Page } from '@playwright/test';

/**
 * Set up mobile viewport for authenticated tests.
 */
export async function setupMobileAuthViewport(page: Page): Promise<void> {
  await page.setViewportSize({ width: 390, height: 844 });
}

/**
 * Navigate using mobile hamburger menu.
 * Falls back to direct navigation if menu not found.
 */
export async function navigateWithMobileNav(page: Page, path: string): Promise<void> {
  // Try hamburger menu first
  const hamburger = page.getByRole('button', { name: /menu|navigation/i })
    .or(page.locator('[data-testid="mobile-menu-button"]'))
    .or(page.locator('button[aria-label*="menu"]'))
    .first();

  if (await hamburger.isVisible({ timeout: 3000 }).catch(() => false)) {
    await hamburger.click();
    // Wait for mobile menu to appear
    await page.waitForTimeout(300);

    // Try to find and click the nav link
    const navLink = page.getByRole('link', { name: new RegExp(path.replace('/', ''), 'i') }).first();
    if (await navLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await navLink.click();
      return;
    }
  }

  // Fallback to direct navigation
  await page.goto(path);
  await page.waitForLoadState('domcontentloaded');
}
