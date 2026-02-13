/**
 * Dark Mode Helpers for Authenticated Page Tests
 *
 * Shared utilities for dark mode E2E tests across /bookings, /messages,
 * /settings, /profile, and /profile/edit. Extracts the dual-method
 * activation pattern (localStorage + emulateMedia) used by next-themes.
 */

import { Page, Locator } from '@playwright/test';

/**
 * Activate dark mode via both localStorage (next-themes class) and CSS media query.
 * Must be called BEFORE page.goto() for addInitScript to take effect.
 */
export async function activateDarkMode(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('theme', 'dark');
  });
  await page.emulateMedia({ colorScheme: 'dark' });
}

/**
 * Assert that <html> has the .dark class applied by next-themes.
 */
export async function assertDarkClassPresent(page: Page): Promise<boolean> {
  return page.locator('html.dark').count().then((c) => c > 0);
}

/**
 * Get the stored theme value from localStorage.
 */
export async function getStoredTheme(page: Page): Promise<string | null> {
  return page.evaluate(() => localStorage.getItem('theme'));
}

/**
 * Wait for an authenticated page to be ready (not redirected to login).
 * Returns false if redirected to a login/auth page.
 */
export async function waitForAuthPageReady(
  page: Page,
  path: string,
): Promise<boolean> {
  await page.goto(path);
  await page.waitForLoadState('domcontentloaded');
  // Give auth redirect a moment to fire
  await page.waitForTimeout(1500);
  const url = page.url();
  return !url.includes('/login') && !url.includes('/auth');
}

/**
 * Extra mask locators for authenticated page screenshots.
 * Masks dynamic content that changes between runs (avatars, timestamps, counts).
 */
export function authPageMasks(page: Page): Locator[] {
  return [
    page.locator('[data-testid="user-avatar"]'),
    page.locator('time'),
    page.locator('[data-testid="unread-count"]'),
    page.locator('[data-testid="notification-badge"]'),
  ];
}
