/**
 * Visual Regression — Listing Detail Page
 *
 * Captures baseline screenshots for the listing detail page
 * across desktop and mobile viewports.
 */

import { test, expect, selectors } from '../helpers';
import {
  disableAnimations,
  defaultMasks,
  imageMasks,
  VIEWPORTS,
  SCREENSHOT_DEFAULTS,
} from '../helpers/visual-helpers';

test.describe('Listing Detail — Visual Regression', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(!!process.env.CI, 'Visual baseline snapshots are platform-specific — skip in CI');
    test.slow();
    if (testInfo.project.name.includes('Mobile')) {
      test.skip(true, 'No Mobile Chrome snapshot baselines — skip visual regression');
    }
  });

  /** Navigate to the first available listing */
  async function goToFirstListing(page: import('@playwright/test').Page): Promise<boolean> {
    await page.goto('/search');
    await page.waitForLoadState('domcontentloaded');

    const firstCard = page.locator(selectors.listingCard).first();
    const listingId = await firstCard.getAttribute('data-listing-id').catch(() => null);
    if (!listingId) return false;

    await page.goto(`/listings/${listingId}`);
    await page.waitForLoadState('domcontentloaded');
    return true;
  }

  test('desktop layout (1440x900)', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    const found = await goToFirstListing(page);
    test.skip(!found, 'No listings available');

    await disableAnimations(page);

    await expect(page).toHaveScreenshot('listing-detail-desktop.png', {
      ...SCREENSHOT_DEFAULTS.withImages,
      mask: [...defaultMasks(page), ...imageMasks(page)],
    });
  });

  test('mobile layout (375x667)', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobileSmall);
    const found = await goToFirstListing(page);
    test.skip(!found, 'No listings available');

    await disableAnimations(page);

    await expect(page).toHaveScreenshot('listing-detail-mobile.png', {
      ...SCREENSHOT_DEFAULTS.withImages,
      mask: [...defaultMasks(page), ...imageMasks(page)],
    });
  });

  test('tablet layout (768x1024)', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.tablet);
    const found = await goToFirstListing(page);
    test.skip(!found, 'No listings available');

    await disableAnimations(page);

    await expect(page).toHaveScreenshot('listing-detail-tablet.png', {
      ...SCREENSHOT_DEFAULTS.withImages,
      mask: [...defaultMasks(page), ...imageMasks(page)],
    });
  });
});
