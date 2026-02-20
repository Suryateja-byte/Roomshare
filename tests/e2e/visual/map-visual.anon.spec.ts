/**
 * Visual Regression — Map Component
 *
 * Captures baseline screenshots for the search page map in various states:
 * desktop split view, markers, popups, banners, overlays, dark mode, and
 * mobile viewports with bottom sheet positions.
 */

import { test, expect, SF_BOUNDS, waitForMapMarkers } from '../helpers';
import { mockMapTileRequests } from '../helpers/map-mock-helpers';
import { activateDarkMode } from '../helpers/dark-mode-helpers';
import {
  setSheetSnap,
  waitForSheetAnimation,
  navigateToMobileSearch,
} from '../helpers/mobile-helpers';
import {
  disableAnimations,
  defaultMasks,
  imageMasks,
  VIEWPORTS,
  SCREENSHOT_DEFAULTS,
} from '../helpers/visual-helpers';

const searchUrl = `/search?minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;

test.describe('Map — Visual Regression', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(!!process.env.CI, 'Visual baseline snapshots are platform-specific — skip in CI');
    test.slow();
    if (testInfo.project.name.includes('Mobile')) {
      test.skip(true, 'No Mobile Chrome snapshot baselines — skip visual regression');
    }
    await mockMapTileRequests(page);
    await page.setViewportSize(VIEWPORTS.desktop);
  });

  // -----------------------------------------------------------------------
  // 1. Desktop split view layout (55/45 list/map)
  // -----------------------------------------------------------------------
  test('desktop split view layout', async ({ page }) => {
    await page.goto(searchUrl);
    await page.waitForLoadState('domcontentloaded');
    await disableAnimations(page);

    await expect(page).toHaveScreenshot('map-desktop-split-view.png', {
      ...SCREENSHOT_DEFAULTS.fullPage,
      mask: [...defaultMasks(page), ...imageMasks(page)],
    });
  });

  // -----------------------------------------------------------------------
  // 2. Map with price pill markers visible
  // -----------------------------------------------------------------------
  test('map with price pill markers', async ({ page }) => {
    await page.goto(searchUrl);
    await page.waitForLoadState('domcontentloaded');

    // Wait for markers to render (DOM elements, not canvas-drawn)
    await waitForMapMarkers(page, { minCount: 1, timeout: 15_000 }).catch(() => {});
    await disableAnimations(page);

    await expect(page).toHaveScreenshot('map-desktop-markers.png', {
      ...SCREENSHOT_DEFAULTS.fullPage,
      mask: [
        // Mask canvas only — keep marker DOM elements visible for regression
        page.locator('.maplibregl-canvas'),
        ...imageMasks(page),
      ],
    });
  });

  // -----------------------------------------------------------------------
  // 3. Listing popup after marker click
  // -----------------------------------------------------------------------
  test('listing popup after marker click', async ({ page }) => {
    await page.goto(searchUrl);
    await page.waitForLoadState('domcontentloaded');

    await waitForMapMarkers(page, { minCount: 1, timeout: 15_000 }).catch(() => {});

    const marker = page.locator('.maplibregl-marker').first();
    const isVisible = await marker.isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!isVisible, 'No markers visible');

    await marker.click();
    // Wait for popup to appear
    await page.locator('.maplibregl-popup').first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    await disableAnimations(page);

    await expect(page).toHaveScreenshot('map-desktop-popup.png', {
      ...SCREENSHOT_DEFAULTS.fullPage,
      mask: [
        page.locator('.maplibregl-canvas'),
        ...imageMasks(page),
      ],
    });
  });

  // -----------------------------------------------------------------------
  // 4. "Search this area" banner
  // -----------------------------------------------------------------------
  test('search this area banner', async ({ page }) => {
    await page.goto(searchUrl);
    await page.waitForLoadState('domcontentloaded');

    // Turn OFF "search as I move" so panning triggers the banner
    const toggle = page.locator('button[role="switch"]').filter({ hasText: /search as i move/i });
    const toggleVisible = await toggle.isVisible({ timeout: 5000 }).catch(() => false);
    if (toggleVisible) {
      const isChecked = await toggle.getAttribute('aria-checked');
      if (isChecked === 'true') {
        await toggle.click();
      }
    }

    // Pan the map programmatically to trigger "Search this area" banner
    await page.waitForFunction(
      () => !!(window as any).__e2eMapRef,
      null,
      { timeout: 10_000 },
    ).catch(() => {});

    await page.evaluate(() => {
      const map = (window as any).__e2eMapRef;
      if (map) map.panBy([150, 0], { duration: 0 });
    });

    // Wait for the banner to appear
    const banner = page.getByText('Search this area').first();
    await banner.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
    await disableAnimations(page);

    const bannerContainer = banner.locator('..').locator('..');
    await expect(bannerContainer).toHaveScreenshot('map-banner-search-area.png', {
      ...SCREENSHOT_DEFAULTS.component,
    });
  });

  // -----------------------------------------------------------------------
  // 5. "No listings in this area" overlay
  // -----------------------------------------------------------------------
  test('no listings in this area overlay', async ({ page }) => {
    // Navigate to empty area (no seeded data)
    const emptyUrl = '/search?minLat=0.1&maxLat=0.2&minLng=0.1&maxLng=0.2';
    await page.goto(emptyUrl);
    await page.waitForLoadState('domcontentloaded');

    // Wait for the empty state to appear
    const emptyOverlay = page.getByText('No listings in this area').first();
    await emptyOverlay.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
    await disableAnimations(page);

    const overlayContainer = emptyOverlay.locator('..').locator('..');
    await expect(overlayContainer).toHaveScreenshot('map-empty-overlay.png', {
      ...SCREENSHOT_DEFAULTS.component,
    });
  });

  // -----------------------------------------------------------------------
  // 6. Mobile gesture hint ("Pinch to zoom")
  // -----------------------------------------------------------------------
  test('mobile gesture hint', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobileSmall);

    // Emulate touch device so the hint appears
    await page.addInitScript(() => {
      Object.defineProperty(window, 'ontouchstart', { value: null, writable: true });
    });
    // Clear the sessionStorage key so the hint is shown
    await page.addInitScript(() => {
      sessionStorage.removeItem('roomshare-map-hints-seen');
    });

    await page.goto(searchUrl);
    await page.waitForLoadState('domcontentloaded');

    const hint = page.getByText('Pinch to zoom').first();
    await hint.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
    await disableAnimations(page);

    const hintContainer = hint.locator('..').locator('..');
    await expect(hintContainer).toHaveScreenshot('map-gesture-hint.png', {
      ...SCREENSHOT_DEFAULTS.component,
    });
  });

  // -----------------------------------------------------------------------
  // 7. WebGL fallback UI
  // -----------------------------------------------------------------------
  test('webgl fallback UI', async ({ page }) => {
    // Intercept canvas getContext to return null for webgl/webgl2
    await page.addInitScript(() => {
      const origGetContext = HTMLCanvasElement.prototype.getContext;
      (HTMLCanvasElement.prototype as any).getContext = function (this: HTMLCanvasElement, type: string, ...args: any[]) {
        if (type === 'webgl' || type === 'webgl2') return null;
        return origGetContext.apply(this, [type, ...args] as any);
      };
    });

    await page.goto(searchUrl);
    await page.waitForLoadState('domcontentloaded');

    // Wait for the fallback to render (loading fallback or context lost overlay)
    await page.waitForTimeout(3000);
    await disableAnimations(page);

    // The map region should show a fallback state
    const mapRegion = page.locator('[role="region"][aria-label*="map"]').first()
      .or(page.locator('[data-testid="map-loading-fallback"]').first())
      .or(page.locator('.maplibregl-map').first());

    const isVisible = await mapRegion.isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!isVisible, 'Map region not found for webgl fallback');

    await expect(mapRegion).toHaveScreenshot('map-webgl-fallback.png', {
      ...SCREENSHOT_DEFAULTS.component,
    });
  });

  // -----------------------------------------------------------------------
  // 8. Dark mode map panel
  // -----------------------------------------------------------------------
  test('dark mode map panel', async ({ page }) => {
    await activateDarkMode(page);
    await page.goto(searchUrl);
    await page.waitForLoadState('domcontentloaded');
    await disableAnimations(page);

    await expect(page).toHaveScreenshot('map-dark-desktop.png', {
      ...SCREENSHOT_DEFAULTS.fullPage,
      mask: [
        page.locator('.maplibregl-canvas'),
        ...imageMasks(page),
      ],
    });
  });

  // -----------------------------------------------------------------------
  // 9. Mobile map with sheet collapsed
  // -----------------------------------------------------------------------
  test('mobile map with sheet collapsed', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobileSmall);

    const sheetReady = await navigateToMobileSearch(page);
    test.skip(!sheetReady, 'Mobile sheet not visible');

    await setSheetSnap(page, 0);
    await waitForSheetAnimation(page);
    await disableAnimations(page);

    await expect(page).toHaveScreenshot('map-mobile-sheet-collapsed.png', {
      ...SCREENSHOT_DEFAULTS.fullPage,
      mask: [...defaultMasks(page), ...imageMasks(page)],
    });
  });

  // -----------------------------------------------------------------------
  // 10. Mobile map with sheet half
  // -----------------------------------------------------------------------
  test('mobile map with sheet half', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobileSmall);

    const sheetReady = await navigateToMobileSearch(page);
    test.skip(!sheetReady, 'Mobile sheet not visible');

    await setSheetSnap(page, 1);
    await waitForSheetAnimation(page);
    await disableAnimations(page);

    await expect(page).toHaveScreenshot('map-mobile-sheet-half.png', {
      ...SCREENSHOT_DEFAULTS.fullPage,
      mask: [...defaultMasks(page), ...imageMasks(page)],
    });
  });
});
