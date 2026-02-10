/**
 * E2E Test Suite: Create Listing — Visual Regression Tests
 * Tests V-001 through V-005
 *
 * Captures baseline screenshots for the create listing form across
 * desktop and mobile viewports, covering empty state, validation errors,
 * filled form, image uploads, and progress indicator.
 */

import { test, expect, tags, timeouts } from '../helpers/test-utils';
import { CreateListingPage, CreateListingData } from '../page-objects/create-listing.page';

test.describe('Create Listing — Visual Regression Tests', () => {
  test.use({ storageState: 'playwright/.auth/user.json' });
  test.beforeEach(async () => { test.slow(); });

  // ────────────────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────────────────

  function validData(overrides?: Partial<CreateListingData>): CreateListingData {
    // Use fixed data (no timestamps) for deterministic screenshots
    return {
      title: 'Sunny Room in Mission District',
      description: 'A comfortable room in a sunny apartment near downtown. Perfect for students or young professionals looking for a great living situation.',
      price: '1200',
      totalSlots: '3',
      address: '123 Test Street',
      city: 'San Francisco',
      state: 'CA',
      zipCode: '94102',
      ...overrides,
    };
  }

  /** Disable CSS animations and transitions for stable screenshots. */
  async function disableAnimations(page: import('@playwright/test').Page) {
    await page.addStyleTag({
      content: `
        *, *::before, *::after {
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          transition-duration: 0s !important;
          transition-delay: 0s !important;
        }
      `,
    });
  }

  // ────────────────────────────────────────────────────────
  // P1 — Core visual baselines
  // ────────────────────────────────────────────────────────

  test(`V-001: empty form — desktop viewport ${tags.slow}`, async ({ page }) => {
    const clp = new CreateListingPage(page);
    await clp.goto();
    await disableAnimations(page);
    await page.waitForLoadState('domcontentloaded');

    await expect(page).toHaveScreenshot('create-listing-empty-desktop.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });

  test(`V-001m: empty form — mobile viewport ${tags.slow} ${tags.mobile}`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      storageState: 'playwright/.auth/user.json',
    });
    const page = await context.newPage();
    const clp = new CreateListingPage(page);
    await clp.goto();
    await disableAnimations(page);
    await page.waitForLoadState('domcontentloaded');

    await expect(page).toHaveScreenshot('create-listing-empty-mobile.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });

    await context.close();
  });

  test(`V-002: validation errors — desktop viewport ${tags.slow}`, async ({ page }) => {
    const clp = new CreateListingPage(page);
    await clp.goto();

    // Submit empty form to trigger validation errors
    await clp.submit();
    await page.waitForTimeout(500);
    await disableAnimations(page);
    await page.waitForLoadState('domcontentloaded');

    await expect(page).toHaveScreenshot('create-listing-errors-desktop.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });

  test(`V-002m: validation errors — mobile viewport ${tags.slow} ${tags.mobile}`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      storageState: 'playwright/.auth/user.json',
    });
    const page = await context.newPage();
    const clp = new CreateListingPage(page);
    await clp.goto();

    await clp.submit();
    await page.waitForTimeout(500);
    await disableAnimations(page);
    await page.waitForLoadState('domcontentloaded');

    await expect(page).toHaveScreenshot('create-listing-errors-mobile.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });

    await context.close();
  });

  // ────────────────────────────────────────────────────────
  // P2 — Extended visual states
  // ────────────────────────────────────────────────────────

  test(`V-003: filled form — desktop viewport ${tags.slow}`, async ({ page }) => {
    const clp = new CreateListingPage(page);
    await clp.goto();
    await disableAnimations(page);

    const data = validData();
    await clp.fillRequiredFields(data);
    await page.waitForLoadState('domcontentloaded');

    // Mask the date value since it varies between runs
    const dateMask = page.locator('[data-testid="move-in-date"], input[name*="date"]');
    const maskElements = (await dateMask.count()) > 0 ? [dateMask] : [];

    await expect(page).toHaveScreenshot('create-listing-filled-desktop.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
      mask: maskElements,
    });
  });

  test(`V-004: image uploader with images ${tags.slow}`, async ({ page }) => {
    const clp = new CreateListingPage(page);
    await clp.goto();
    await clp.mockImageUpload();
    await clp.uploadTestImage();
    await page.waitForTimeout(500);
    await disableAnimations(page);
    await page.waitForLoadState('domcontentloaded');

    // Mask actual image content since it can render differently
    const imagePreviews = page.locator('img[src*="supabase"], img[src*="blob:"]');
    const maskElements = (await imagePreviews.count()) > 0 ? [imagePreviews] : [];

    await expect(page).toHaveScreenshot('create-listing-images-desktop.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
      mask: maskElements,
    });
  });

  test(`V-005: progress indicator — partial completion ${tags.slow}`, async ({ page }) => {
    const clp = new CreateListingPage(page);
    await clp.goto();
    await disableAnimations(page);

    // Fill only the basics section to get partial progress
    await clp.fillBasics({
      title: 'Sunny Room in Mission District',
      description: 'A comfortable room in a sunny apartment near downtown.',
      price: '1200',
      totalSlots: '3',
    });

    // Tab out to trigger progress update
    await page.keyboard.press('Tab');
    await page.waitForTimeout(300);
    await page.waitForLoadState('domcontentloaded');

    // Capture just the progress section area
    const progressArea = clp.progressSection;
    if (await progressArea.isVisible()) {
      await expect(progressArea).toHaveScreenshot('create-listing-progress-partial.png', {
        maxDiffPixelRatio: 0.02,
      });
    } else {
      // Fallback: full page if progress section selector doesn't match
      await expect(page).toHaveScreenshot('create-listing-progress-partial-full.png', {
        fullPage: true,
        maxDiffPixelRatio: 0.01,
      });
    }
  });
});
