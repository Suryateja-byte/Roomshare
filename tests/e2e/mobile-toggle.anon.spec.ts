/**
 * Mobile Floating Map/List Toggle E2E Tests
 *
 * Tests for scenarios 8.1–8.2: Floating toggle button visibility and view switching.
 *
 * Run: pnpm playwright test tests/e2e/mobile-toggle.spec.ts --project=chromium-anon
 */

import { test, expect, SF_BOUNDS, timeouts } from "./helpers/test-utils";

const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;

// Mobile viewport (iPhone 14 Pro dimensions)
test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});

// Selectors for toggle functionality
const toggleSelectors = {
  floatingToggle: 'button[aria-label="Show map"], button[aria-label="Show list"]',
  showMapButton: 'button[aria-label="Show map"]',
  showListButton: 'button[aria-label="Show list"]',
  bottomSheet: '[role="region"][aria-label="Search results"]',
  mapContainer: '[data-testid="map"], .mapboxgl-map',
} as const;

test.describe("Mobile Floating Toggle — Visibility (8.1)", () => {
  test("toggle button is visible on mobile viewport with fixed position", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto(`/search?${boundsQS}`);

    // Wait for listings to load first
    const listings = page.locator('a[href^="/listings/c"]');
    await expect(listings.first()).toBeAttached({ timeout: timeouts.navigation });

    // Allow UI to stabilize
    await page.waitForTimeout(1000);

    // The floating toggle button should be visible
    const toggleBtn = page.locator(toggleSelectors.floatingToggle).first();
    await expect(toggleBtn).toBeVisible({ timeout: timeouts.action });

    // Verify fixed positioning via CSS class
    const btnClasses = await toggleBtn.getAttribute("class") || "";
    expect(btnClasses).toContain("fixed");

    // Verify button is positioned within viewport (not off-screen)
    const boundingBox = await toggleBtn.boundingBox();
    expect(boundingBox).not.toBeNull();
    if (boundingBox) {
      // Button should be visible within the mobile viewport
      expect(boundingBox.x).toBeGreaterThanOrEqual(0);
      expect(boundingBox.y).toBeGreaterThanOrEqual(0);
      expect(boundingBox.x + boundingBox.width).toBeLessThanOrEqual(390);
      expect(boundingBox.y + boundingBox.height).toBeLessThanOrEqual(844);
    }

    // Verify z-index class for overlay stacking
    expect(btnClasses).toContain("z-50");

    // Filter benign console errors
    const realErrors = errors.filter(
      (e) =>
        !e.includes("mapbox") &&
        !e.includes("webpack") &&
        !e.includes("HMR") &&
        !e.includes("hydrat") &&
        !e.includes("favicon") &&
        !e.includes("ResizeObserver") &&
        !e.includes("Failed to load resource") &&
        !e.includes("net::ERR"),
    );
    expect(realErrors).toHaveLength(0);
  });

  test("toggle button has proper ARIA label", async ({ page }) => {
    await page.goto(`/search?${boundsQS}`);
    await expect(page.locator('a[href^="/listings/c"]').first()).toBeAttached({ timeout: timeouts.navigation });
    await page.waitForTimeout(1000);

    // Button should have one of the expected aria-labels
    const showMapBtn = page.locator(toggleSelectors.showMapButton);
    const showListBtn = page.locator(toggleSelectors.showListButton);

    const mapVisible = await showMapBtn.isVisible().catch(() => false);
    const listVisible = await showListBtn.isVisible().catch(() => false);

    // At least one toggle state should be visible
    expect(mapVisible || listVisible).toBeTruthy();
  });

  test("toggle button remains visible during scroll", async ({ page }) => {
    await page.goto(`/search?${boundsQS}`);
    await expect(page.locator('a[href^="/listings/c"]').first()).toBeAttached({ timeout: timeouts.navigation });
    await page.waitForTimeout(1000);

    const toggleBtn = page.locator(toggleSelectors.floatingToggle).first();
    await expect(toggleBtn).toBeVisible({ timeout: timeouts.action });

    // Get initial position
    const initialBox = await toggleBtn.boundingBox();

    // Scroll the page (if scrollable content exists)
    await page.evaluate(() => {
      const scrollable = document.querySelector('[role="region"][aria-label="Search results"]');
      if (scrollable) {
        scrollable.scrollTop = 200;
      }
    });
    await page.waitForTimeout(500);

    // Toggle should still be visible and in approximately same viewport position (fixed)
    await expect(toggleBtn).toBeVisible();
    const afterScrollBox = await toggleBtn.boundingBox();

    if (initialBox && afterScrollBox) {
      // Fixed position means viewport Y should remain similar
      expect(Math.abs(afterScrollBox.y - initialBox.y)).toBeLessThan(50);
    }
  });
});

test.describe("Mobile Floating Toggle — View Switching (8.2)", () => {
  test("toggle switches from list to map view", async ({ page }) => {
    await page.goto(`/search?${boundsQS}`);
    await expect(page.locator('a[href^="/listings/c"]').first()).toBeAttached({ timeout: timeouts.navigation });
    await page.waitForTimeout(1000);

    const showMapBtn = page.locator(toggleSelectors.showMapButton);

    // If "Show map" is visible, we're in list view
    if (await showMapBtn.isVisible().catch(() => false)) {
      // Click to switch to map view
      await showMapBtn.click();
      await page.waitForTimeout(800);

      // After clicking, button should now show "Show list"
      const showListBtn = page.locator(toggleSelectors.showListButton);
      await expect(showListBtn).toBeVisible({ timeout: timeouts.action });

      // Map container should be visible/prominent
      const mapContainer = page.locator(toggleSelectors.mapContainer).first();
      await expect(mapContainer).toBeVisible({ timeout: 10_000 });
    } else {
      // Already in map view, verify list button is visible
      const showListBtn = page.locator(toggleSelectors.showListButton);
      await expect(showListBtn).toBeVisible({ timeout: timeouts.action });
    }
  });

  test("toggle switches from map to list view", async ({ page }) => {
    await page.goto(`/search?${boundsQS}`);
    await expect(page.locator('a[href^="/listings/c"]').first()).toBeAttached({ timeout: timeouts.navigation });
    await page.waitForTimeout(1000);

    // First ensure we're in map view (click Show map if available)
    const showMapBtn = page.locator(toggleSelectors.showMapButton);
    if (await showMapBtn.isVisible().catch(() => false)) {
      await showMapBtn.click();
      await page.waitForTimeout(800);
    }

    // Now should be in map view with "Show list" button
    const showListBtn = page.locator(toggleSelectors.showListButton);
    if (await showListBtn.isVisible().catch(() => false)) {
      await showListBtn.click();
      await page.waitForTimeout(800);

      // After clicking, should show "Show map" again
      await expect(showMapBtn).toBeVisible({ timeout: timeouts.action });

      // Bottom sheet / list results should be visible
      const bottomSheet = page.locator(toggleSelectors.bottomSheet);
      const sheetVisible = await bottomSheet.isVisible({ timeout: 5000 }).catch(() => false);

      // List view is restored when bottom sheet or listings are visible
      const listingsVisible = await page.locator('a[href^="/listings/c"]').first().isVisible().catch(() => false);
      expect(sheetVisible || listingsVisible).toBeTruthy();
    }
  });

  test("toggle button label changes after each click", async ({ page }) => {
    await page.goto(`/search?${boundsQS}`);
    await expect(page.locator('a[href^="/listings/c"]').first()).toBeAttached({ timeout: timeouts.navigation });
    await page.waitForTimeout(1000);

    const showMapBtn = page.locator(toggleSelectors.showMapButton);
    const showListBtn = page.locator(toggleSelectors.showListButton);

    // Determine initial state
    const initialShowMap = await showMapBtn.isVisible().catch(() => false);
    const initialShowList = await showListBtn.isVisible().catch(() => false);

    expect(initialShowMap || initialShowList).toBeTruthy();

    if (initialShowMap) {
      // Click to show map
      await showMapBtn.click();
      await page.waitForTimeout(800);

      // Should now show "Show list"
      await expect(showListBtn).toBeVisible({ timeout: timeouts.action });
      await expect(showMapBtn).not.toBeVisible();

      // Click again to show list
      await showListBtn.click();
      await page.waitForTimeout(800);

      // Should now show "Show map" again
      await expect(showMapBtn).toBeVisible({ timeout: timeouts.action });
      await expect(showListBtn).not.toBeVisible();
    } else if (initialShowList) {
      // Starting in map view - click to show list
      await showListBtn.click();
      await page.waitForTimeout(800);

      // Should now show "Show map"
      await expect(showMapBtn).toBeVisible({ timeout: timeouts.action });
      await expect(showListBtn).not.toBeVisible();

      // Click again to show map
      await showMapBtn.click();
      await page.waitForTimeout(800);

      // Should now show "Show list" again
      await expect(showListBtn).toBeVisible({ timeout: timeouts.action });
      await expect(showMapBtn).not.toBeVisible();
    }
  });

  test("bottom sheet collapses when switching to map view", async ({ page }) => {
    await page.goto(`/search?${boundsQS}`);
    await expect(page.locator('a[href^="/listings/c"]').first()).toBeAttached({ timeout: timeouts.navigation });
    await page.waitForTimeout(1000);

    const bottomSheet = page.locator(toggleSelectors.bottomSheet);
    const sheetVisible = await bottomSheet.isVisible({ timeout: 5000 }).catch(() => false);

    if (!sheetVisible) {
      // Bottom sheet not implemented or not visible on this viewport
      test.skip();
      return;
    }

    // Get initial sheet height
    const initialBox = await bottomSheet.boundingBox();

    // Click "Show map" to switch to map view
    const showMapBtn = page.locator(toggleSelectors.showMapButton);
    if (await showMapBtn.isVisible().catch(() => false)) {
      await showMapBtn.click();
      await page.waitForTimeout(800);

      // Sheet should be collapsed (smaller height or moved down)
      const afterBox = await bottomSheet.boundingBox();

      if (initialBox && afterBox) {
        // Either height is reduced or Y position is lower (sheet moved down / collapsed)
        const heightReduced = afterBox.height < initialBox.height;
        const movedDown = afterBox.y > initialBox.y;
        expect(heightReduced || movedDown).toBeTruthy();
      }
    }
  });
});

test.describe("Mobile Floating Toggle — Accessibility", () => {
  test("toggle button is keyboard accessible", async ({ page }) => {
    await page.goto(`/search?${boundsQS}`);
    await expect(page.locator('a[href^="/listings/c"]').first()).toBeAttached({ timeout: timeouts.navigation });
    await page.waitForTimeout(1000);

    const toggleBtn = page.locator(toggleSelectors.floatingToggle).first();
    await expect(toggleBtn).toBeVisible({ timeout: timeouts.action });

    // Button should be focusable
    await toggleBtn.focus();
    await expect(toggleBtn).toBeFocused();

    // Should be activatable with Enter key
    const showMapVisible = await page.locator(toggleSelectors.showMapButton).isVisible().catch(() => false);

    await page.keyboard.press("Enter");
    await page.waitForTimeout(800);

    // State should have changed
    if (showMapVisible) {
      await expect(page.locator(toggleSelectors.showListButton)).toBeVisible({ timeout: timeouts.action });
    } else {
      await expect(page.locator(toggleSelectors.showMapButton)).toBeVisible({ timeout: timeouts.action });
    }
  });

  test("toggle button has visual feedback on press", async ({ page }) => {
    await page.goto(`/search?${boundsQS}`);
    await expect(page.locator('a[href^="/listings/c"]').first()).toBeAttached({ timeout: timeouts.navigation });
    await page.waitForTimeout(1000);

    const toggleBtn = page.locator(toggleSelectors.floatingToggle).first();
    if (await toggleBtn.isVisible().catch(() => false)) {
      const btnClasses = await toggleBtn.getAttribute("class") || "";
      // Should have active/pressed state styling
      expect(btnClasses).toContain("active:scale-95");
    }
  });
});
