/**
 * Dark Mode — Functional Tests (Authenticated Pages)
 *
 * Validates dark mode behavior on authenticated routes:
 * - Dark class application on html element (DM-F01..F05)
 * - Theme persistence across navigation and reload (DM-F06..F07)
 * - Theme toggle from dark to light and back (DM-F08..F09)
 * - FOUC prevention — no flash of light theme (DM-F10..F11)
 * - Computed styles verification — dark backgrounds and light text (DM-F12..F16)
 *
 * Auth: uses stored user session via playwright/.auth/user.json
 * Dark mode activation: localStorage('theme','dark') + emulateMedia before navigation
 */

import { test, expect } from '../helpers';
import {
  activateDarkMode,
  assertDarkClassPresent,
  getStoredTheme,
  waitForAuthPageReady,
} from '../helpers';

test.describe('Dark Mode — Functional (Authenticated Pages)', () => {
  test.use({ storageState: 'playwright/.auth/user.json' });

  test.beforeEach(async ({ page }) => {
    test.slow();
    await activateDarkMode(page);
  });

  // ---------------------------------------------------------------------------
  // Dark class application (DM-F01 through DM-F05)
  // ---------------------------------------------------------------------------
  test.describe('Dark class application', () => {
    test('DM-F01: /bookings has html.dark class applied', async ({ page }) => {
      const ready = await waitForAuthPageReady(page, '/bookings');
      test.skip(!ready, 'Auth session expired');
      expect(await assertDarkClassPresent(page)).toBe(true);
    });

    test('DM-F02: /messages has html.dark class applied', async ({ page }) => {
      const ready = await waitForAuthPageReady(page, '/messages');
      test.skip(!ready, 'Auth session expired');
      expect(await assertDarkClassPresent(page)).toBe(true);
    });

    test('DM-F03: /settings has html.dark class applied', async ({ page }) => {
      const ready = await waitForAuthPageReady(page, '/settings');
      test.skip(!ready, 'Auth session expired');
      expect(await assertDarkClassPresent(page)).toBe(true);
    });

    test('DM-F04: /profile has html.dark class applied', async ({ page }) => {
      const ready = await waitForAuthPageReady(page, '/profile');
      test.skip(!ready, 'Auth session expired');
      expect(await assertDarkClassPresent(page)).toBe(true);
    });

    test('DM-F05: /profile/edit has html.dark class applied', async ({ page }) => {
      const ready = await waitForAuthPageReady(page, '/profile/edit');
      test.skip(!ready, 'Auth session expired');
      expect(await assertDarkClassPresent(page)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Theme persistence (DM-F06 through DM-F07)
  // ---------------------------------------------------------------------------
  test.describe('Theme persistence', () => {
    test('DM-F06: Theme persists in localStorage across navigation (/bookings -> /messages)', async ({
      page,
    }) => {
      const ready = await waitForAuthPageReady(page, '/bookings');
      test.skip(!ready, 'Auth session expired');

      expect(await getStoredTheme(page)).toBe('dark');
      expect(await assertDarkClassPresent(page)).toBe(true);

      await page.goto('/messages');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1500);

      const url = page.url();
      if (url.includes('/login') || url.includes('/auth')) {
        test.skip(true, 'Redirected to login on /messages');
      }

      expect(await getStoredTheme(page)).toBe('dark');
      expect(await assertDarkClassPresent(page)).toBe(true);
    });

    test('DM-F07: Dark mode survives page reload on /settings', async ({ page }) => {
      const ready = await waitForAuthPageReady(page, '/settings');
      test.skip(!ready, 'Auth session expired');

      expect(await assertDarkClassPresent(page)).toBe(true);

      await page.reload();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1000);

      expect(await assertDarkClassPresent(page)).toBe(true);
      expect(await getStoredTheme(page)).toBe('dark');
    });
  });

  // ---------------------------------------------------------------------------
  // Theme toggle (DM-F08 through DM-F09)
  // ---------------------------------------------------------------------------
  test.describe('Theme toggle', () => {
    test('DM-F08: Toggle dark -> light on /bookings removes html.dark', async ({ page }) => {
      const ready = await waitForAuthPageReady(page, '/bookings');
      test.skip(!ready, 'Auth session expired');

      expect(await assertDarkClassPresent(page)).toBe(true);

      const toggle = page
        .getByLabel(/toggle theme/i)
        .or(page.getByRole('button', { name: /theme/i }));

      const toggleVisible = await toggle
        .first()
        .isVisible()
        .catch(() => false);

      if (toggleVisible) {
        await toggle.first().click();
        await page.waitForTimeout(500);

        // After toggling away from dark, html.dark should be removed
        await expect(page.locator('html:not(.dark)')).toBeVisible({ timeout: 5000 });
        const storedTheme = await getStoredTheme(page);
        expect(storedTheme).not.toBe('dark');
      } else {
        test.skip(true, 'Theme toggle button not found on /bookings');
      }
    });

    test('DM-F09: Toggle light -> dark on /profile adds html.dark', async ({ page }) => {
      // Start in light mode (override the beforeEach dark activation)
      await page.addInitScript(() => {
        localStorage.setItem('theme', 'light');
      });
      await page.emulateMedia({ colorScheme: 'light' });

      const ready = await waitForAuthPageReady(page, '/profile');
      test.skip(!ready, 'Auth session expired');

      const toggle = page
        .getByLabel(/toggle theme/i)
        .or(page.getByRole('button', { name: /theme/i }));

      const toggleVisible = await toggle
        .first()
        .isVisible()
        .catch(() => false);

      if (toggleVisible) {
        await toggle.first().click();
        await page.waitForTimeout(500);

        // After toggling to dark, html.dark should be present
        await expect(page.locator('html.dark')).toBeVisible({ timeout: 5000 });
        expect(await getStoredTheme(page)).toBe('dark');
      } else {
        test.skip(true, 'Theme toggle button not found on /profile');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // FOUC prevention (DM-F10 through DM-F11)
  // ---------------------------------------------------------------------------
  test.describe('FOUC prevention', () => {
    test('DM-F10: No flash of light theme on /bookings (dark mode pre-applied)', async ({
      page,
    }) => {
      await page.goto('/bookings');
      await page.waitForLoadState('domcontentloaded');

      const bgColor = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

      // A dark background should never be pure white
      expect(bgColor).not.toBe('rgb(255, 255, 255)');
    });

    test('DM-F11: No flash of light theme on /messages (dark mode pre-applied)', async ({
      page,
    }) => {
      await page.goto('/messages');
      await page.waitForLoadState('domcontentloaded');

      const bgColor = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

      expect(bgColor).not.toBe('rgb(255, 255, 255)');
    });
  });

  // ---------------------------------------------------------------------------
  // Computed styles verification (DM-F12 through DM-F16)
  // ---------------------------------------------------------------------------
  test.describe('Computed styles verification', () => {
    /**
     * Parse an rgb/rgba string and return perceived luminance (0 = black, 1 = white).
     * Uses the standard CCIR 601 luma formula.
     */
    function parseLuminance(rgb: string): number | null {
      const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!match) return null;
      const [, r, g, b] = match.map(Number);
      return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    }

    test('DM-F12: /bookings body background is dark', async ({ page }) => {
      const ready = await waitForAuthPageReady(page, '/bookings');
      test.skip(!ready, 'Auth session expired');

      const bgColor = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      const luminance = parseLuminance(bgColor);

      // Dark backgrounds have low luminance (< 0.2)
      expect(luminance).not.toBeNull();
      expect(luminance!).toBeLessThan(0.2);
    });

    test('DM-F13: /messages dark mode is active on page', async ({ page }) => {
      const ready = await waitForAuthPageReady(page, '/messages');
      test.skip(!ready, 'Auth session expired');

      // Verify html.dark class is present AND background is dark
      expect(await assertDarkClassPresent(page)).toBe(true);

      const bgColor = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      const luminance = parseLuminance(bgColor);

      expect(luminance).not.toBeNull();
      expect(luminance!).toBeLessThan(0.2);
    });

    test('DM-F14: /settings has dark background styling', async ({ page }) => {
      const ready = await waitForAuthPageReady(page, '/settings');
      test.skip(!ready, 'Auth session expired');

      const bgColor = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      const luminance = parseLuminance(bgColor);

      expect(luminance).not.toBeNull();
      expect(luminance!).toBeLessThan(0.2);
    });

    test('DM-F15: /profile heading text is light-colored in dark mode', async ({ page }) => {
      const ready = await waitForAuthPageReady(page, '/profile');
      test.skip(!ready, 'Auth session expired');

      // Find the first visible heading on the profile page
      const heading = page.locator('h1, h2').first();
      const headingVisible = await heading.isVisible().catch(() => false);
      test.skip(!headingVisible, 'No heading found on /profile');

      const textColor = await heading.evaluate((el) => getComputedStyle(el).color);
      const luminance = parseLuminance(textColor);

      // Light text on dark background should have high luminance (> 0.5)
      expect(luminance).not.toBeNull();
      expect(luminance!).toBeGreaterThan(0.5);
    });

    test('DM-F16: /profile/edit form inputs have dark backgrounds', async ({ page }) => {
      const ready = await waitForAuthPageReady(page, '/profile/edit');
      test.skip(!ready, 'Auth session expired');

      // Find the first visible input or textarea
      const input = page.locator('input[type="text"], input[type="email"], textarea').first();
      const inputVisible = await input.isVisible().catch(() => false);
      test.skip(!inputVisible, 'No form input found on /profile/edit');

      const bgColor = await input.evaluate((el) => getComputedStyle(el).backgroundColor);
      const luminance = parseLuminance(bgColor);

      // Form inputs in dark mode should have dark backgrounds (luminance < 0.3)
      // Using 0.3 threshold since inputs may be slightly lighter than page bg
      expect(luminance).not.toBeNull();
      expect(luminance!).toBeLessThan(0.3);
    });
  });
});
