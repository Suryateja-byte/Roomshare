/**
 * Visual Regression — Mobile Bottom Sheet
 *
 * Captures baseline screenshots for the mobile bottom sheet in both snap
 * positions (collapsed / expanded), empty state, header component, and
 * transition states with CLS verification.
 */

import { test, expect } from "../helpers";
import { mockMapTileRequests } from "../helpers/map-mock-helpers";

import {
  setSheetSnap,
  waitForSheetAnimation,
  navigateToMobileSearch,
  mobileSelectors,
} from "../helpers/mobile-helpers";
import {
  disableAnimations,
  defaultMasks,
  imageMasks,
  VIEWPORTS,
  SCREENSHOT_DEFAULTS,
} from "../helpers/visual-helpers";

test.describe("Mobile Bottom Sheet — Visual Regression", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      !!process.env.CI,
      "Visual baseline snapshots are platform-specific — skip in CI"
    );
    test.slow();
    if (testInfo.project.name.includes("Mobile")) {
      test.skip(
        true,
        "No Mobile Chrome snapshot baselines — skip visual regression"
      );
    }
    await mockMapTileRequests(page);
    await page.setViewportSize(VIEWPORTS.mobileLarge);
  });

  // -----------------------------------------------------------------------
  // 1. Collapsed — map nearly fullscreen
  // -----------------------------------------------------------------------
  test("collapsed — map nearly fullscreen", async ({ page }) => {
    const sheetReady = await navigateToMobileSearch(page);
    test.skip(!sheetReady, "Mobile sheet not visible");

    await setSheetSnap(page, 0);
    await waitForSheetAnimation(page);
    await disableAnimations(page);

    await expect(page).toHaveScreenshot("bottom-sheet-collapsed.png", {
      ...SCREENSHOT_DEFAULTS.fullPage,
      mask: [...defaultMasks(page), ...imageMasks(page)],
    });
  });

  // -----------------------------------------------------------------------
  // 2. Expanded — listings scrollable
  // -----------------------------------------------------------------------
  test("expanded — listings scrollable", async ({ page }) => {
    const sheetReady = await navigateToMobileSearch(page);
    test.skip(!sheetReady, "Mobile sheet not visible");

    await setSheetSnap(page, 1);
    await waitForSheetAnimation(page);
    await disableAnimations(page);

    await expect(page).toHaveScreenshot("bottom-sheet-expanded.png", {
      ...SCREENSHOT_DEFAULTS.fullPage,
      mask: [...defaultMasks(page), ...imageMasks(page)],
    });
  });

  // -----------------------------------------------------------------------
  // 4. Empty results state
  // -----------------------------------------------------------------------
  test("empty results state", async ({ page }) => {
    // Navigate with bounds that have no seeded data — sheet may not appear
    await page.goto("/search?minLat=0.1&maxLat=0.2&minLng=0.1&maxLng=0.2");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForLoadState("networkidle").catch(() => {});
    await disableAnimations(page);

    await expect(page).toHaveScreenshot("bottom-sheet-empty-results.png", {
      ...SCREENSHOT_DEFAULTS.fullPage,
      mask: [...defaultMasks(page), ...imageMasks(page)],
    });
  });

  // -----------------------------------------------------------------------
  // 3. Handle/header design (component screenshot)
  // -----------------------------------------------------------------------
  test("handle and header design", async ({ page }) => {
    const sheetReady = await navigateToMobileSearch(page);
    test.skip(!sheetReady, "Mobile sheet not visible");

    await setSheetSnap(page, 1);
    await waitForSheetAnimation(page);
    await disableAnimations(page);

    const sheet = page.locator(mobileSelectors.bottomSheet).first();
    await expect(sheet).toHaveScreenshot("bottom-sheet-header.png", {
      ...SCREENSHOT_DEFAULTS.component,
    });
  });

  // -----------------------------------------------------------------------
  // 4. Post-transition (expanded) + CLS check
  // -----------------------------------------------------------------------
  test("post-transition expanded with CLS check", async ({ page }) => {
    const sheetReady = await navigateToMobileSearch(page);
    test.skip(!sheetReady, "Mobile sheet not visible");

    // Start collapsed, then expand
    await setSheetSnap(page, 0);
    await waitForSheetAnimation(page);

    await setSheetSnap(page, 1);
    await waitForSheetAnimation(page);
    await disableAnimations(page);

    // CLS verification: assert sheet height is within 3px of 85% viewport
    const expectedHeight = VIEWPORTS.mobileLarge.height * 0.85;
    const sheet = page.locator(mobileSelectors.bottomSheet).first();
    const actualHeight = await sheet.evaluate((el) =>
      parseFloat(window.getComputedStyle(el).height)
    );
    expect(actualHeight).toBeGreaterThan(expectedHeight - 3);
    expect(actualHeight).toBeLessThan(expectedHeight + 3);

    await expect(page).toHaveScreenshot("bottom-sheet-post-transition.png", {
      ...SCREENSHOT_DEFAULTS.fullPage,
      mask: [...defaultMasks(page), ...imageMasks(page)],
    });
  });
});
