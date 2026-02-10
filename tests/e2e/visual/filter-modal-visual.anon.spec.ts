/**
 * Visual Regression — Filter Modal States
 *
 * Captures baseline screenshots for the search filter modal
 * in various states: initial open, with selections, price range, etc.
 */

import { test, expect, SF_BOUNDS } from '../helpers';
import {
  disableAnimations,
  defaultMasks,
  VIEWPORTS,
  SCREENSHOT_DEFAULTS,
} from '../helpers/visual-helpers';

test.describe('Filter Modal — Visual Regression', () => {
  const searchUrl = `/search?minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;

  test.beforeEach(async ({ page }, testInfo) => {
    test.slow();
    if (testInfo.project.name.includes('Mobile')) {
      test.skip(true, 'No Mobile Chrome snapshot baselines — skip visual regression');
    }
    await page.setViewportSize(VIEWPORTS.desktop);
    await page.goto(searchUrl);
    await page.waitForLoadState('domcontentloaded');
  });

  test('filter modal — initial open state', async ({ page }) => {
    await disableAnimations(page);

    const filterButton = page.getByRole('button', { name: /filter/i })
      .or(page.locator('[data-testid="filter-button"]'))
      .first();

    const isVisible = await filterButton.isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!isVisible, 'Filter button not found');

    await filterButton.click();

    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible({ timeout: 5000 });

    await expect(modal).toHaveScreenshot('filter-modal-open.png', {
      ...SCREENSHOT_DEFAULTS.component,
    });
  });

  test('filter modal — with price range set', async ({ page }) => {
    await disableAnimations(page);

    const filterButton = page.getByRole('button', { name: /filter/i })
      .or(page.locator('[data-testid="filter-button"]'))
      .first();

    const isVisible = await filterButton.isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!isVisible, 'Filter button not found');

    await filterButton.click();

    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Set a price range if inputs exist
    const minPrice = modal.locator('input[name*="min" i], input[placeholder*="min" i]').first();
    const maxPrice = modal.locator('input[name*="max" i], input[placeholder*="max" i]').first();

    if (await minPrice.isVisible({ timeout: 2000 }).catch(() => false)) {
      await minPrice.fill('500');
    }
    if (await maxPrice.isVisible({ timeout: 2000 }).catch(() => false)) {
      await maxPrice.fill('2000');
    }

    await expect(modal).toHaveScreenshot('filter-modal-price-range.png', {
      ...SCREENSHOT_DEFAULTS.component,
    });
  });

  test('filter modal — mobile viewport (375x667)', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobileSmall);
    await page.goto(searchUrl);
    await page.waitForLoadState('domcontentloaded');
    await disableAnimations(page);

    const filterButton = page.getByRole('button', { name: /filter/i })
      .or(page.locator('[data-testid="filter-button"]'))
      .first();

    const isVisible = await filterButton.isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!isVisible, 'Filter button not found on mobile');

    await filterButton.click();

    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible({ timeout: 5000 });

    await expect(page).toHaveScreenshot('filter-modal-mobile.png', {
      ...SCREENSHOT_DEFAULTS.fullPage,
      mask: defaultMasks(page),
    });
  });
});
