/**
 * Visual Regression — Dark Mode
 *
 * Captures baseline screenshots for key pages in dark mode.
 * Verifies consistent dark theme rendering across routes.
 */

import { test, expect, SF_BOUNDS, selectors } from '../helpers';
import {
  disableAnimations,
  defaultMasks,
  imageMasks,
  VIEWPORTS,
  SCREENSHOT_DEFAULTS,
} from '../helpers/visual-helpers';

test.describe('Dark Mode — Visual Regression', () => {
  test.beforeEach(async ({ page }) => {
    test.slow();
    // Set localStorage so next-themes applies .dark class on mount
    // (emulateMedia alone only sets CSS media query, not the class)
    await page.addInitScript(() => {
      localStorage.setItem('theme', 'dark');
    });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.setViewportSize(VIEWPORTS.desktop);
  });

  test('homepage dark mode — desktop', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await disableAnimations(page);

    await expect(page).toHaveScreenshot('homepage-dark-desktop.png', {
      ...SCREENSHOT_DEFAULTS.fullPage,
      mask: [...defaultMasks(page), ...imageMasks(page)],
    });
  });

  test('search page dark mode — desktop', async ({ page }) => {
    const searchUrl = `/search?minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;
    await page.goto(searchUrl);
    await page.waitForLoadState('domcontentloaded');
    await disableAnimations(page);

    await expect(page).toHaveScreenshot('search-dark-desktop.png', {
      ...SCREENSHOT_DEFAULTS.fullPage,
      mask: [...defaultMasks(page), ...imageMasks(page)],
    });
  });

  test('login page dark mode — desktop', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');
    await disableAnimations(page);

    await expect(page).toHaveScreenshot('login-dark-desktop.png', {
      ...SCREENSHOT_DEFAULTS.fullPage,
    });
  });

  test('signup page dark mode — desktop', async ({ page }) => {
    await page.goto('/signup');
    await page.waitForLoadState('domcontentloaded');
    await disableAnimations(page);

    await expect(page).toHaveScreenshot('signup-dark-desktop.png', {
      ...SCREENSHOT_DEFAULTS.fullPage,
    });
  });

  test('homepage dark mode — mobile (375x667)', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobileSmall);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await disableAnimations(page);

    await expect(page).toHaveScreenshot('homepage-dark-mobile.png', {
      ...SCREENSHOT_DEFAULTS.fullPage,
      mask: [...defaultMasks(page), ...imageMasks(page)],
    });
  });

  test('search page dark mode — mobile', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobileSmall);
    const searchUrl = `/search?minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;
    await page.goto(searchUrl);
    await page.waitForLoadState('domcontentloaded');
    await disableAnimations(page);

    await expect(page).toHaveScreenshot('search-dark-mobile.png', {
      ...SCREENSHOT_DEFAULTS.fullPage,
      mask: [...defaultMasks(page), ...imageMasks(page)],
    });
  });

  test('listing detail dark mode — desktop', async ({ page }) => {
    // Navigate to first available listing
    await page.goto('/search');
    await page.waitForLoadState('domcontentloaded');

    const firstCard = page.locator(selectors.listingCard).first();
    const listingId = await firstCard.getAttribute('data-listing-id').catch(() => null);
    test.skip(!listingId, 'No listings available');

    await page.goto(`/listings/${listingId}`);
    await page.waitForLoadState('domcontentloaded');
    await disableAnimations(page);

    await expect(page).toHaveScreenshot('listing-detail-dark-desktop.png', {
      ...SCREENSHOT_DEFAULTS.withImages,
      mask: [...defaultMasks(page), ...imageMasks(page)],
    });
  });
});
