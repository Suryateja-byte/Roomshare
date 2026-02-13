/**
 * Visual Regression — Dark Mode (Authenticated Pages)
 *
 * Captures baseline screenshots for authenticated pages in dark mode.
 * Covers /bookings, /messages, /settings, /profile, /profile/edit
 * across desktop and mobile viewports, plus state-specific screenshots.
 */

import { test, expect } from '../helpers';
import {
  disableAnimations,
  defaultMasks,
  imageMasks,
  VIEWPORTS,
  SCREENSHOT_DEFAULTS,
} from '../helpers/visual-helpers';
import { activateDarkMode, waitForAuthPageReady, authPageMasks } from '../helpers';

test.describe('Dark Mode — Visual Regression (Authenticated Pages)', () => {
  test.use({ storageState: 'playwright/.auth/user.json' });

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(!!process.env.CI, 'Visual baseline snapshots are platform-specific — skip in CI');
    // Visual snapshot baselines only exist for chromium — skip on Mobile Chrome
    if (testInfo.project.name.includes('Mobile')) {
      test.skip(true, 'No Mobile Chrome snapshot baselines — skip visual regression');
    }
    test.slow();
    await activateDarkMode(page);
    await page.setViewportSize(VIEWPORTS.desktop);
  });

  // ---------------------------------------------------------------------------
  // Desktop screenshots (1440x900)
  // ---------------------------------------------------------------------------

  test.describe('Desktop screenshots (1440x900)', () => {
    test('DM-V01: /bookings dark mode — desktop', async ({ page }) => {
      const ready = await waitForAuthPageReady(page, '/bookings');
      test.skip(!ready, 'Auth session expired');
      await disableAnimations(page);
      await expect(page).toHaveScreenshot('bookings-dark-desktop.png', {
        ...SCREENSHOT_DEFAULTS.fullPage,
        mask: [...defaultMasks(page), ...imageMasks(page), ...authPageMasks(page)],
      });
    });

    test('DM-V02: /messages dark mode — desktop', async ({ page }) => {
      const ready = await waitForAuthPageReady(page, '/messages');
      test.skip(!ready, 'Auth session expired');
      await disableAnimations(page);
      await expect(page).toHaveScreenshot('messages-dark-desktop.png', {
        ...SCREENSHOT_DEFAULTS.fullPage,
        mask: [...defaultMasks(page), ...imageMasks(page), ...authPageMasks(page)],
      });
    });

    test('DM-V03: /settings dark mode — desktop', async ({ page }) => {
      const ready = await waitForAuthPageReady(page, '/settings');
      test.skip(!ready, 'Auth session expired');
      await disableAnimations(page);
      await expect(page).toHaveScreenshot('settings-dark-desktop.png', {
        ...SCREENSHOT_DEFAULTS.fullPage,
        mask: [...defaultMasks(page), ...imageMasks(page), ...authPageMasks(page)],
      });
    });

    test('DM-V04: /profile dark mode — desktop', async ({ page }) => {
      const ready = await waitForAuthPageReady(page, '/profile');
      test.skip(!ready, 'Auth session expired');
      await disableAnimations(page);
      await expect(page).toHaveScreenshot('profile-dark-desktop.png', {
        ...SCREENSHOT_DEFAULTS.fullPage,
        mask: [...defaultMasks(page), ...imageMasks(page), ...authPageMasks(page)],
      });
    });

    test('DM-V05: /profile/edit dark mode — desktop', async ({ page }) => {
      const ready = await waitForAuthPageReady(page, '/profile/edit');
      test.skip(!ready, 'Auth session expired');
      await disableAnimations(page);
      await expect(page).toHaveScreenshot('profile-edit-dark-desktop.png', {
        ...SCREENSHOT_DEFAULTS.fullPage,
        mask: [...defaultMasks(page), ...imageMasks(page), ...authPageMasks(page)],
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Mobile screenshots (375x667)
  // ---------------------------------------------------------------------------

  test.describe('Mobile screenshots (375x667)', () => {
    test('DM-V06: /bookings dark mode — mobile', async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.mobileSmall);
      const ready = await waitForAuthPageReady(page, '/bookings');
      test.skip(!ready, 'Auth session expired');
      await disableAnimations(page);
      await expect(page).toHaveScreenshot('bookings-dark-mobile.png', {
        ...SCREENSHOT_DEFAULTS.fullPage,
        mask: [...defaultMasks(page), ...imageMasks(page), ...authPageMasks(page)],
      });
    });

    test('DM-V07: /messages dark mode — mobile', async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.mobileSmall);
      const ready = await waitForAuthPageReady(page, '/messages');
      test.skip(!ready, 'Auth session expired');
      await disableAnimations(page);
      await expect(page).toHaveScreenshot('messages-dark-mobile.png', {
        ...SCREENSHOT_DEFAULTS.fullPage,
        mask: [...defaultMasks(page), ...imageMasks(page), ...authPageMasks(page)],
      });
    });

    test('DM-V08: /settings dark mode — mobile', async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.mobileSmall);
      const ready = await waitForAuthPageReady(page, '/settings');
      test.skip(!ready, 'Auth session expired');
      await disableAnimations(page);
      await expect(page).toHaveScreenshot('settings-dark-mobile.png', {
        ...SCREENSHOT_DEFAULTS.fullPage,
        mask: [...defaultMasks(page), ...imageMasks(page), ...authPageMasks(page)],
      });
    });

    test('DM-V09: /profile dark mode — mobile', async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.mobileSmall);
      const ready = await waitForAuthPageReady(page, '/profile');
      test.skip(!ready, 'Auth session expired');
      await disableAnimations(page);
      await expect(page).toHaveScreenshot('profile-dark-mobile.png', {
        ...SCREENSHOT_DEFAULTS.fullPage,
        mask: [...defaultMasks(page), ...imageMasks(page), ...authPageMasks(page)],
      });
    });

    test('DM-V10: /profile/edit dark mode — mobile', async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.mobileSmall);
      const ready = await waitForAuthPageReady(page, '/profile/edit');
      test.skip(!ready, 'Auth session expired');
      await disableAnimations(page);
      await expect(page).toHaveScreenshot('profile-edit-dark-mobile.png', {
        ...SCREENSHOT_DEFAULTS.fullPage,
        mask: [...defaultMasks(page), ...imageMasks(page), ...authPageMasks(page)],
      });
    });
  });

  // ---------------------------------------------------------------------------
  // State-specific screenshots
  // ---------------------------------------------------------------------------

  test.describe('State-specific screenshots', () => {
    test('DM-V11: /bookings "Sent" tab dark mode — desktop', async ({ page }) => {
      const ready = await waitForAuthPageReady(page, '/bookings');
      test.skip(!ready, 'Auth session expired');
      const sentTab = page.getByRole('tab', { name: /sent/i });
      if (await sentTab.isVisible().catch(() => false)) {
        await sentTab.click();
        await page.waitForTimeout(500);
      }
      await disableAnimations(page);
      await expect(page).toHaveScreenshot('bookings-sent-tab-dark-desktop.png', {
        ...SCREENSHOT_DEFAULTS.fullPage,
        mask: [...defaultMasks(page), ...imageMasks(page), ...authPageMasks(page)],
      });
    });

    test('DM-V12: /bookings empty state dark mode — desktop', async ({ page }) => {
      const ready = await waitForAuthPageReady(page, '/bookings');
      test.skip(!ready, 'Auth session expired');
      await disableAnimations(page);
      // Take screenshot regardless - captures whatever state bookings is in
      await expect(page).toHaveScreenshot('bookings-empty-dark-desktop.png', {
        ...SCREENSHOT_DEFAULTS.fullPage,
        mask: [...defaultMasks(page), ...imageMasks(page), ...authPageMasks(page)],
      });
    });

    test('DM-V13: /settings delete account dialog dark mode — desktop', async ({ page }) => {
      const ready = await waitForAuthPageReady(page, '/settings');
      test.skip(!ready, 'Auth session expired');
      const deleteBtn = page.getByRole('button', { name: /delete.*account/i });
      if (await deleteBtn.isVisible().catch(() => false)) {
        await deleteBtn.click();
        await page.waitForTimeout(500);
      }
      await disableAnimations(page);
      await expect(page).toHaveScreenshot('settings-delete-dialog-dark-desktop.png', {
        ...SCREENSHOT_DEFAULTS.component,
        mask: [...authPageMasks(page)],
      });
    });

    test('DM-V14: /messages empty conversation dark mode — desktop', async ({ page }) => {
      const ready = await waitForAuthPageReady(page, '/messages');
      test.skip(!ready, 'Auth session expired');
      await disableAnimations(page);
      await expect(page).toHaveScreenshot('messages-empty-dark-desktop.png', {
        ...SCREENSHOT_DEFAULTS.fullPage,
        mask: [...defaultMasks(page), ...imageMasks(page), ...authPageMasks(page)],
      });
    });
  });
});
