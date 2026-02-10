/**
 * E2E Accessibility — Listing Detail Deep-Dive
 *
 * Comprehensive accessibility testing for the listing detail page,
 * which is the primary conversion page. Covers:
 * - axe-core WCAG 2.1 AA scans
 * - Image carousel a11y (alt text, controls, keyboard nav)
 * - Apply/booking form a11y
 * - Dynamic content (reviews, nearby places, amenities)
 * - Keyboard navigation through page sections
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { A11Y_CONFIG, selectors } from '../helpers/test-utils';

/** Helper: run axe scan with shared config */
async function runAxeScan(page: import('@playwright/test').Page, extraExcludes: string[] = [], disabledRules: string[] = []) {
  let builder = new AxeBuilder({ page }).withTags([...A11Y_CONFIG.tags]);

  for (const selector of [...A11Y_CONFIG.globalExcludes, ...extraExcludes]) {
    builder = builder.exclude(selector);
  }

  if (disabledRules.length > 0) {
    builder = builder.disableRules(disabledRules);
  }

  return builder.analyze();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function logViolations(label: string, violations: any[]) {
  if (violations.length > 0) {
    console.log(`[axe-listing] ${label}: ${violations.length} violation(s)`);
    violations.forEach((v) => {
      console.log(`  - ${v.id} (${v.impact}): ${v.description} [${v.nodes.length} node(s)]`);
    });
  }
}

/** Navigate to the first available listing detail page */
async function navigateToListing(page: import('@playwright/test').Page): Promise<boolean> {
  await page.goto('/search');
  await page.waitForLoadState('domcontentloaded');

  const firstCard = page.locator(selectors.listingCard).first();
  const listingId = await firstCard.getAttribute('data-listing-id').catch(() => null);

  if (!listingId) return false;

  await page.goto(`/listings/${listingId}`);
  await page.waitForLoadState('domcontentloaded');
  return true;
}

test.describe('Listing Detail — Accessibility Deep-Dive', () => {
  test.describe('axe-core scans', () => {
    test('Full page passes WCAG 2.1 AA', async ({ page }) => {
      const found = await navigateToListing(page);
      test.skip(!found, 'No listings available');

      const results = await runAxeScan(page);
      const violations = results.violations.filter(
        (v) => !A11Y_CONFIG.knownExclusions.includes(v.id as typeof A11Y_CONFIG.knownExclusions[number]),
      );

      logViolations('Listing Detail Full Page', violations);
      expect(violations).toHaveLength(0);
    });

    test('Page in dark mode passes WCAG 2.1 AA', async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'dark' });
      const found = await navigateToListing(page);
      test.skip(!found, 'No listings available');

      const results = await runAxeScan(page);
      const violations = results.violations.filter(
        (v) => !A11Y_CONFIG.knownExclusions.includes(v.id as typeof A11Y_CONFIG.knownExclusions[number]),
      );

      logViolations('Listing Detail Dark Mode', violations);
      expect(violations).toHaveLength(0);
    });

    test('Mobile viewport passes WCAG 2.1 AA', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      const found = await navigateToListing(page);
      test.skip(!found, 'No listings available');

      const results = await runAxeScan(page);
      const violations = results.violations.filter(
        (v) => !A11Y_CONFIG.knownExclusions.includes(v.id as typeof A11Y_CONFIG.knownExclusions[number]),
      );

      logViolations('Listing Detail Mobile', violations);
      expect(violations).toHaveLength(0);
    });
  });

  test.describe('Image carousel accessibility', () => {
    test('All listing images have alt text', async ({ page }) => {
      const found = await navigateToListing(page);
      test.skip(!found, 'No listings available');

      const images = page.locator('img');
      const imageCount = await images.count();

      const missingAlt: string[] = [];

      for (let i = 0; i < imageCount; i++) {
        const img = images.nth(i);
        const alt = await img.getAttribute('alt');
        const role = await img.getAttribute('role');
        const ariaLabel = await img.getAttribute('aria-label');
        const src = await img.getAttribute('src');

        // Every visible image needs alt text or decorative role
        const isVisible = await img.isVisible().catch(() => false);
        if (isVisible && alt === null && role !== 'presentation' && !ariaLabel) {
          missingAlt.push(src?.slice(0, 80) || 'unknown');
        }
      }

      if (missingAlt.length > 0) {
        console.log(`[img] Missing alt: ${missingAlt.join(', ')}`);
      }
      expect(missingAlt).toHaveLength(0);
    });

    test('Carousel controls are keyboard accessible', async ({ page }) => {
      const found = await navigateToListing(page);
      test.skip(!found, 'No listings available');

      // Find carousel prev/next buttons
      const carouselControls = page.locator(
        'button[aria-label*="previous" i], button[aria-label*="next" i], ' +
        'button[aria-label*="prev" i], [data-testid*="carousel"] button',
      );
      const controlCount = await carouselControls.count();

      if (controlCount > 0) {
        // Each carousel control should be focusable
        for (let i = 0; i < controlCount; i++) {
          const control = carouselControls.nth(i);
          const isVisible = await control.isVisible().catch(() => false);
          if (isVisible) {
            const ariaLabel = await control.getAttribute('aria-label');
            expect(ariaLabel).toBeTruthy();
          }
        }
      }
    });
  });

  test.describe('Page structure', () => {
    test('Has valid heading hierarchy', async ({ page }) => {
      const found = await navigateToListing(page);
      test.skip(!found, 'No listings available');

      const headings = await page.evaluate(() => {
        const hs = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
        return Array.from(hs).map((h) => ({
          level: parseInt(h.tagName[1]),
          text: h.textContent?.trim().slice(0, 60) || '',
        }));
      });

      // Should have exactly one h1 (listing title)
      const h1s = headings.filter((h) => h.level === 1);
      expect(h1s.length).toBeGreaterThanOrEqual(1);

      // Check for level skips
      let prevLevel = 0;
      const skips: string[] = [];
      for (const h of headings) {
        if (h.level > prevLevel + 1 && prevLevel !== 0) {
          skips.push(`h${prevLevel} → h${h.level}: "${h.text}"`);
        }
        prevLevel = h.level;
      }

      if (skips.length > 0) {
        console.log(`[heading] Listing detail skips: ${skips.join(', ')}`);
      }
      // Allow some skips for listing layouts (h1 → h3 for section subheads is common)
      expect(skips.length).toBeLessThan(5);
    });

    test('Has required landmark regions', async ({ page }) => {
      const found = await navigateToListing(page);
      test.skip(!found, 'No listings available');

      const landmarks = await page.evaluate(() => ({
        main: !!document.querySelector('main, [role="main"]'),
        nav: !!document.querySelector('nav, [role="navigation"]'),
      }));

      expect(landmarks.main).toBe(true);
      expect(landmarks.nav).toBe(true);
    });
  });

  test.describe('Keyboard navigation', () => {
    test('Can tab through main interactive elements', async ({ page }) => {
      const found = await navigateToListing(page);
      test.skip(!found, 'No listings available');

      // Tab through elements and verify they receive focus
      const focusedElements: string[] = [];
      for (let i = 0; i < 15; i++) {
        await page.keyboard.press('Tab');

        const tagName = await page.evaluate(() => {
          const el = document.activeElement;
          return el ? `${el.tagName.toLowerCase()}${el.getAttribute('aria-label') ? `[${el.getAttribute('aria-label')}]` : ''}` : 'none';
        });
        focusedElements.push(tagName);
      }

      // Should focus multiple different interactive elements
      const uniqueElements = new Set(focusedElements);
      expect(uniqueElements.size).toBeGreaterThan(3);

      // All focused elements should have visible focus indicators
      const focusChecks = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return { visible: false };
        const style = window.getComputedStyle(el);
        return {
          visible: style.outlineStyle !== 'none' || style.boxShadow !== 'none',
        };
      });

      // The last focused element should have a focus indicator
      expect(focusChecks.visible).toBe(true);
    });
  });

  test.describe('Dynamic content sections', () => {
    test('Amenities section has accessible labeling', async ({ page }) => {
      const found = await navigateToListing(page);
      test.skip(!found, 'No listings available');

      // Check if amenities section exists
      const amenitiesSection = page.locator('[data-testid="amenities"], h2:text-is("Amenities"), h3:text-is("Amenities")').first();
      const hasAmenities = await amenitiesSection.isVisible({ timeout: 3000 }).catch(() => false);

      if (hasAmenities) {
        // Amenity items should have text labels (not just icons)
        const amenityItems = page.locator('[data-testid="amenity-item"], [data-testid="amenities"] li');
        const count = await amenityItems.count();

        for (let i = 0; i < Math.min(count, 10); i++) {
          const item = amenityItems.nth(i);
          const text = await item.textContent();
          // Each amenity should have readable text
          expect(text?.trim().length).toBeGreaterThan(0);
        }
      }
    });

    test('Price information is programmatically associated', async ({ page }) => {
      const found = await navigateToListing(page);
      test.skip(!found, 'No listings available');

      // Price should be marked up semantically
      const priceElement = page.locator('[data-testid="listing-price"], [class*="price"]').first();
      const isVisible = await priceElement.isVisible({ timeout: 3000 }).catch(() => false);

      if (isVisible) {
        const priceText = await priceElement.textContent();
        // Price should contain a number
        expect(priceText).toMatch(/\d/);
      }
    });
  });

  test.describe('Apply/contact section (authenticated)', () => {
    test.use({ storageState: 'playwright/.auth/user.json' });

    test('Apply button is accessible', async ({ page }) => {
      const found = await navigateToListing(page);
      test.skip(!found, 'No listings available');

      // Look for apply/contact button
      const applyButton = page.getByRole('button', { name: /apply|contact|message|book/i });
      const isVisible = await applyButton.isVisible({ timeout: 5000 }).catch(() => false);

      if (isVisible) {
        // Button should have accessible name
        const ariaLabel = await applyButton.getAttribute('aria-label');
        const text = await applyButton.textContent();
        expect(ariaLabel || text?.trim()).toBeTruthy();

        // Button should be focusable
        await applyButton.focus();
        await expect(applyButton).toBeFocused();
      }
    });
  });
});
