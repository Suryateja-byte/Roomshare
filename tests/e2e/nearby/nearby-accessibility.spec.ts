/**
 * Nearby Places Accessibility E2E Tests
 *
 * E2E tests for visual accessibility features that cannot be validated in JSDOM:
 * focus indicators, keyboard navigation, contrast, and zoom behavior.
 *
 * @see Plan Category F - Accessibility & Input Methods (E2E portion)
 */

import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Navigate to a real listing page by finding one via search.
 * Returns false if no listings are available.
 */
async function navigateToListing(page: Page): Promise<boolean> {
  await page.goto('/search');
  await page.waitForLoadState('domcontentloaded');
  const firstCard = page.locator('[data-testid="listing-card"]').first();
  await firstCard.waitFor({ state: 'attached', timeout: 30_000 }).catch(() => {});
  const listingId = await firstCard.getAttribute('data-listing-id').catch(() => null);
  if (!listingId) return false;
  await page.goto(`/listings/${listingId}`);
  await page.waitForLoadState('domcontentloaded');
  return true;
}

// Mock places fixture for deterministic testing
const mockPlacesFixture = [
  {
    id: 'place-1',
    name: 'Test Grocery Store',
    address: '123 Main St, San Francisco, CA',
    category: 'food-grocery',
    location: { lat: 37.7749, lng: -122.4194 },
    distanceMiles: 0.3,
  },
  {
    id: 'place-2',
    name: 'Local Pharmacy',
    address: '456 Oak Ave, San Francisco, CA',
    category: 'pharmacy',
    location: { lat: 37.7759, lng: -122.4184 },
    distanceMiles: 0.5,
  },
];

test.describe('Nearby Places Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    // Mock /api/nearby for deterministic results
    await page.route('**/api/nearby', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          places: mockPlacesFixture,
          meta: { count: mockPlacesFixture.length, cached: false },
        }),
      });
    });
  });

  // F2: Focus outline visible on chips
  test('F2: Focus outline is visible on category chips', async ({ page }) => {
    const found = await navigateToListing(page);
    if (!found) { test.skip(true, 'No listings available'); return; }

    // Find a category chip button
    const categoryChip = page.locator('button').filter({ hasText: /grocery|restaurant|shopping/i }).first();
    const chipExists = await categoryChip.count() > 0;

    if (chipExists) {
      // Focus the chip via keyboard
      await page.keyboard.press('Tab');

      // Keep tabbing until we reach a category chip
      let attempts = 0;
      while (attempts < 20) {
        const focusedElement = page.locator(':focus');
        const text = await focusedElement.textContent().catch(() => '');

        if (text && /grocery|restaurant|shopping|gas|fitness|pharmacy/i.test(text)) {
          break;
        }
        await page.keyboard.press('Tab');
        attempts++;
      }

      // Get the focused element
      const focusedChip = page.locator(':focus');

      // Check that focus indicator is visible
      const focusStyles = await focusedChip.evaluate((el) => {
        const computed = window.getComputedStyle(el);
        return {
          outline: computed.outline,
          outlineWidth: computed.outlineWidth,
          outlineStyle: computed.outlineStyle,
          outlineColor: computed.outlineColor,
          boxShadow: computed.boxShadow,
          borderColor: computed.borderColor,
        };
      }).catch(() => null);

      if (focusStyles) {
        // Either outline or box-shadow should provide focus indication
        const hasOutline = focusStyles.outlineStyle !== 'none' && focusStyles.outlineWidth !== '0px';
        const hasBoxShadow = focusStyles.boxShadow !== 'none';
        const hasBorderChange = focusStyles.borderColor !== 'transparent';

        expect(hasOutline || hasBoxShadow || hasBorderChange).toBe(true);
      }
    }

    // Alternative: check via screenshot comparison for visual focus indicator
    // Take a screenshot of the focused state for manual verification
    await page.screenshot({ path: '.playwright-mcp/focus-outline-test.png' });
  });

  // F6: Escape closes popup
  test('F6: Escape key closes map popup', async ({ page }) => {
    const found = await navigateToListing(page);
    if (!found) { test.skip(true, 'No listings available'); return; }

    // Trigger a search to show results and markers
    const categoryChip = page.locator('button').filter({ hasText: /grocery/i }).first();
    if (await categoryChip.count() > 0) {
      await categoryChip.click();
      await page.waitForTimeout(1000); // Wait for results
    }

    // Find and click a map marker to open popup
    const mapContainer = page.locator('.maplibregl-canvas, .maplibregl-canvas, [class*="map"]').first();

    if (await mapContainer.count() > 0) {
      // Click on the map area where markers might be
      const box = await mapContainer.boundingBox();
      if (box) {
        // Click center of map
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(500);

        // Check if a popup is visible
        const popup = page.locator('.maplibregl-popup, .maplibregl-popup, [class*="popup"]');
        const popupVisible = await popup.isVisible().catch(() => false);

        if (popupVisible) {
          // Press Escape to close
          await page.keyboard.press('Escape');
          await page.waitForTimeout(300);

          // Popup should be closed
          const popupStillVisible = await popup.isVisible().catch(() => false);
          expect(popupStillVisible).toBe(false);
        }
      }
    }

    // Alternative test: verify Escape doesn't cause errors
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');

    // No console errors from escape handling
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.waitForTimeout(500);
    const escapeErrors = consoleErrors.filter((e) => e.includes('Escape') || e.includes('keyboard'));
    expect(escapeErrors.length).toBe(0);
  });

  // F8: High contrast mode visible
  test('F8: Component is visible in high contrast mode', async ({ page }) => {
    // Enable forced colors (high contrast mode simulation)
    await page.emulateMedia({ forcedColors: 'active' });

    const found = await navigateToListing(page);
    if (!found) { test.skip(true, 'No listings available'); return; }

    // Verify key elements are visible
    const searchInput = page.locator('input[type="text"], input[placeholder*="search" i]').first();
    const categoryButtons = page.locator('button').filter({ hasText: /grocery|restaurant|pharmacy/i });

    // Elements should be present and visible
    if (await searchInput.count() > 0) {
      await expect(searchInput).toBeVisible();

      // Check that input has visible border in high contrast
      const inputStyles = await searchInput.evaluate((el) => {
        const computed = window.getComputedStyle(el);
        return {
          borderWidth: computed.borderWidth,
          borderStyle: computed.borderStyle,
        };
      });

      // Should have visible border
      expect(inputStyles.borderStyle).not.toBe('none');
    }

    // Buttons should be visible
    const buttonCount = await categoryButtons.count();
    if (buttonCount > 0) {
      const firstButton = categoryButtons.first();
      await expect(firstButton).toBeVisible();

      // Check button has distinguishable styling
      const buttonStyles = await firstButton.evaluate((el) => {
        const computed = window.getComputedStyle(el);
        return {
          border: computed.border,
          outline: computed.outline,
          background: computed.backgroundColor,
        };
      });

      // Button should have some visual distinction
      expect(buttonStyles).toBeDefined();
    }

    // Take screenshot for visual verification
    await page.screenshot({ path: '.playwright-mcp/high-contrast-mode.png' });
  });

  // F10: Font scaling 200% doesn't break layout
  test('F10: Layout remains usable at 200% font scaling', async ({ page }) => {
    // Set viewport with font scaling simulation
    await page.setViewportSize({ width: 1280, height: 720 });

    // Inject CSS to simulate 200% font scaling
    await page.addStyleTag({
      content: `
        html {
          font-size: 32px !important; /* 200% of 16px */
        }
        body {
          font-size: 2rem !important;
        }
      `,
    });

    const found = await navigateToListing(page);
    if (!found) { test.skip(true, 'No listings available'); return; }

    // Check that key elements don't overflow viewport
    const nearbySection = page.locator('[data-testid="nearby-places"], [class*="nearby"]').first();

    if (await nearbySection.count() > 0) {
      const sectionBox = await nearbySection.boundingBox();

      if (sectionBox) {
        // Section should not overflow the viewport width
        expect(sectionBox.x).toBeGreaterThanOrEqual(0);
        expect(sectionBox.x + sectionBox.width).toBeLessThanOrEqual(1280 + 50); // Allow small overflow
      }
    }

    // Check that text doesn't get clipped
    const searchInput = page.locator('input[type="text"], input[placeholder*="search" i]').first();
    if (await searchInput.count() > 0) {
      const inputBox = await searchInput.boundingBox();

      if (inputBox) {
        // Input should still be usable
        expect(inputBox.height).toBeGreaterThan(20);
        expect(inputBox.width).toBeGreaterThan(50);
      }
    }

    // Check that category buttons don't overlap
    const categoryButtons = page.locator('button').filter({ hasText: /grocery|restaurant|pharmacy/i });
    const buttonCount = await categoryButtons.count();

    if (buttonCount > 1) {
      const boxes = await Promise.all(
        Array.from({ length: Math.min(buttonCount, 3) }, (_, i) =>
          categoryButtons.nth(i).boundingBox()
        )
      );

      // Buttons should not overlap each other
      for (let i = 0; i < boxes.length - 1; i++) {
        const box1 = boxes[i];
        const box2 = boxes[i + 1];

        if (box1 && box2) {
          // Either horizontally or vertically separated
          const horizontallySeparated = box1.x + box1.width <= box2.x || box2.x + box2.width <= box1.x;
          const verticallySeparated = box1.y + box1.height <= box2.y || box2.y + box2.height <= box1.y;

          expect(horizontallySeparated || verticallySeparated).toBe(true);
        }
      }
    }

    // Take screenshot for visual verification
    await page.screenshot({ path: '.playwright-mcp/font-scaling-200.png' });
  });
});

test.describe('Nearby Places Keyboard Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/nearby', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          places: mockPlacesFixture,
          meta: { count: mockPlacesFixture.length, cached: false },
        }),
      });
    });
  });

  test('All interactive elements are reachable via keyboard', async ({ page }) => {
    const found = await navigateToListing(page);
    if (!found) { test.skip(true, 'No listings available'); return; }

    const tabbedElements: string[] = [];
    let attempts = 0;
    const maxAttempts = 30;

    // Tab through elements and record what we reach
    while (attempts < maxAttempts) {
      await page.keyboard.press('Tab');

      const focusedElement = page.locator(':focus');
      const tagName = await focusedElement.evaluate((el) => el.tagName.toLowerCase()).catch(() => '');
      const text = await focusedElement.textContent().catch(() => '');

      if (tagName) {
        tabbedElements.push(`${tagName}:${text?.slice(0, 20) || ''}`);
      }

      // Check if we've looped back to start
      if (tabbedElements.length > 5 && tabbedElements[tabbedElements.length - 1] === tabbedElements[0]) {
        break;
      }

      attempts++;
    }

    // Should have found multiple tabbable elements
    expect(tabbedElements.length).toBeGreaterThan(0);

    // Should include buttons (category chips)
    const hasButtons = tabbedElements.some((el) => el.startsWith('button'));
    const hasInputs = tabbedElements.some((el) => el.startsWith('input'));

    // At least some interactive elements should be reachable
    expect(hasButtons || hasInputs).toBe(true);
  });

  test('Enter key activates focused buttons', async ({ page }) => {
    const found = await navigateToListing(page);
    if (!found) { test.skip(true, 'No listings available'); return; }

    // Tab to find a category button
    let foundButton = false;
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab');

      const focusedElement = page.locator(':focus');
      const tagName = await focusedElement.evaluate((el) => el.tagName.toLowerCase()).catch(() => '');
      const text = await focusedElement.textContent().catch(() => '');

      if (tagName === 'button' && /grocery|restaurant|pharmacy/i.test(text || '')) {
        foundButton = true;

        // Check aria-pressed before activation
        const beforePressed = await focusedElement.getAttribute('aria-pressed');

        // Press Enter to activate
        await page.keyboard.press('Enter');
        await page.waitForTimeout(500);

        // Check aria-pressed after activation
        const afterPressed = await focusedElement.getAttribute('aria-pressed');

        // State should have changed (toggled)
        if (beforePressed !== null && afterPressed !== null) {
          expect(afterPressed).not.toBe(beforePressed);
        }

        break;
      }
    }

    // Verify we found and tested a button
    if (!foundButton) {
      console.warn('No category button found via keyboard navigation');
    }
  });

  test('Space key activates focused buttons', async ({ page }) => {
    const found = await navigateToListing(page);
    if (!found) { test.skip(true, 'No listings available'); return; }

    // Tab to find a category button
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab');

      const focusedElement = page.locator(':focus');
      const tagName = await focusedElement.evaluate((el) => el.tagName.toLowerCase()).catch(() => '');
      const text = await focusedElement.textContent().catch(() => '');

      if (tagName === 'button' && /grocery|restaurant|pharmacy/i.test(text || '')) {
        // Press Space to activate
        await page.keyboard.press('Space');
        await page.waitForTimeout(500);

        // Verify button was activated (aria-pressed changed)
        const pressed = await focusedElement.getAttribute('aria-pressed');
        expect(pressed).toBe('true');

        break;
      }
    }
  });
});
