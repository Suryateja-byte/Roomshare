/**
 * Layer 3: Accessibility Tests — Nearby Places
 *
 * Verifies WCAG 2.1 AA compliance via axe-core scans and keyboard navigation.
 * Uses the project's centralized A11Y_CONFIG from test-utils.ts.
 */

import { Page } from '@playwright/test';
import { test, expect, A11Y_CONFIG } from '../helpers/test-utils';
import { NearbyPlacesPage } from './nearby-page.pom';
import AxeBuilder from '@axe-core/playwright';
import {
  mockNearbyApi,
  buildNearbyResponse,
  groceryPlaces,
  errorResponses,
  emptyPlacesResponse,
} from './nearby-mock-factory';

/** Build an axe scanner pre-configured for the nearby section */
function nearbyAxeBuilder(page: Page): AxeBuilder {
  let builder = new AxeBuilder({ page })
    .include('#nearby-places')
    .withTags([...A11Y_CONFIG.tags]);

  for (const selector of A11Y_CONFIG.globalExcludes) {
    builder = builder.exclude(selector);
  }

  return builder.disableRules([...A11Y_CONFIG.knownExclusions]);
}

test.describe('Nearby Places — Accessibility @nearby @a11y', () => {
  let nearby: NearbyPlacesPage;

  test.beforeEach(async ({ page }) => {
    nearby = new NearbyPlacesPage(page);
  });

  // --------------------------------------------------------------------------
  // axe-core scans
  // --------------------------------------------------------------------------

  test('A-001: axe-core scan — initial state (no search)', async ({ page }) => {
    await mockNearbyApi(page, { body: emptyPlacesResponse });
    await nearby.goto();
    await nearby.scrollToSection();

    const results = await nearbyAxeBuilder(page).analyze();
    expect(results.violations).toEqual([]);
  });

  test('A-002: axe-core scan — with search results', async ({ page }) => {
    await mockNearbyApi(page, { body: buildNearbyResponse(groceryPlaces) });
    await nearby.goto();
    await nearby.scrollToSection();

    await nearby.selectCategory('Grocery');
    await nearby.waitForResults();

    const results = await nearbyAxeBuilder(page).analyze();
    expect(results.violations).toEqual([]);
  });

  test('A-003: axe-core scan — error state', async ({ page }) => {
    await mockNearbyApi(page, errorResponses.serverError);
    await nearby.goto();
    await nearby.scrollToSection();

    await nearby.selectCategory('Grocery');
    await nearby.waitForResults();

    const results = await nearbyAxeBuilder(page).analyze();
    expect(results.violations).toEqual([]);
  });

  test('A-004: axe-core scan — empty results', async ({ page }) => {
    await mockNearbyApi(page, { body: emptyPlacesResponse });
    await nearby.goto();
    await nearby.scrollToSection();

    await nearby.selectCategory('Pharmacy');
    await nearby.waitForResults();

    const results = await nearbyAxeBuilder(page).analyze();
    expect(results.violations).toEqual([]);
  });

  // --------------------------------------------------------------------------
  // Keyboard navigation
  // --------------------------------------------------------------------------

  test('A-005: Keyboard — Tab through search, chips, radius', async ({ page }) => {
    await mockNearbyApi(page, { body: emptyPlacesResponse });
    await nearby.goto();
    await nearby.scrollToSection();

    // Focus the search input
    await nearby.searchInput.focus();
    await expect(nearby.searchInput).toBeFocused();

    // Tab to first category chip
    await page.keyboard.press('Tab');
    const firstChip = nearby.categoryChips.first();
    await expect(firstChip).toBeFocused();
  });

  test('A-006: Keyboard — Enter triggers search from input', async ({ page }) => {
    await mockNearbyApi(page, { body: buildNearbyResponse(groceryPlaces) });
    await nearby.goto();
    await nearby.scrollToSection();

    await nearby.searchInput.focus();
    await page.keyboard.type('Coffee');
    await page.keyboard.press('Enter');
    await nearby.waitForResults();

    const count = await nearby.getPlaceCount();
    expect(count).toBeGreaterThan(0);
  });

  test('A-007: Keyboard — Space/Enter activates chips', async ({ page }) => {
    await mockNearbyApi(page, { body: buildNearbyResponse(groceryPlaces) });
    await nearby.goto();
    await nearby.scrollToSection();

    const chip = nearby.chipByName('Grocery');
    await chip.focus();
    await expect(chip).toBeFocused();

    // Press Enter to activate
    await page.keyboard.press('Enter');
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
  });

  // --------------------------------------------------------------------------
  // ARIA attributes
  // --------------------------------------------------------------------------

  test('A-008: aria-busy during loading', async ({ page }) => {
    // Use a delayed response to catch the loading state
    await page.route('**/api/nearby', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildNearbyResponse(groceryPlaces)),
      });
    });

    await nearby.goto();
    await nearby.scrollToSection();

    // Trigger search
    await nearby.selectCategory('Grocery');

    // During loading, aria-busy should be true
    await expect(nearby.resultsArea).toHaveAttribute('aria-busy', 'true', {
      timeout: 5000,
    });

    // After loading completes, aria-busy should be false
    await expect(nearby.resultsArea).toHaveAttribute('aria-busy', 'false', {
      timeout: 10_000,
    });
  });

  test('A-009: Error messages in aria-live region', async ({ page }) => {
    await mockNearbyApi(page, errorResponses.serverError);
    await nearby.goto();
    await nearby.scrollToSection();

    await nearby.selectCategory('Grocery');
    await nearby.waitForResults();

    // The error state container has role="status" and aria-live="polite"
    const errorEl = nearby.errorState;
    await expect(errorEl).toBeVisible();
    await expect(errorEl).toHaveAttribute('role', 'status');
    await expect(errorEl).toHaveAttribute('aria-live', 'polite');
  });

  test('A-010: Focus not lost after search completes', async ({ page }) => {
    await mockNearbyApi(page, { body: buildNearbyResponse(groceryPlaces) });
    await nearby.goto();
    await nearby.scrollToSection();

    // Focus search input and search
    await nearby.searchInput.focus();
    await page.keyboard.type('Coffee');
    await page.keyboard.press('Enter');
    await nearby.waitForResults();

    // Focus should still be within the nearby section (not lost to document body).
    // Poll briefly — useEffect focus restoration runs after React commit.
    await expect(async () => {
      const isInSection = await nearby.section.locator(':focus').count();
      const isOnInput = await nearby.searchInput.evaluate(
        (el) => el === document.activeElement,
      );
      expect(isInSection > 0 || isOnInput).toBe(true);
    }).toPass({ timeout: 5_000, intervals: [100, 200, 500] });
  });
});
