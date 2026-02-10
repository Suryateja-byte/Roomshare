/**
 * E2E Accessibility Audit — Authenticated Pages
 *
 * axe-core WCAG 2.1 AA compliance scans for pages that require authentication.
 * Uses shared A11Y_CONFIG from test-utils for consistent standards.
 *
 * Pages covered: /bookings, /messages, /profile, /settings, /notifications,
 *                /saved, /saved-searches, /recently-viewed, /listings/create
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { A11Y_CONFIG } from '../helpers/test-utils';

test.use({ storageState: 'playwright/.auth/user.json' });

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

/** Helper: log violations for debugging */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function logViolations(label: string, violations: any[]) {
  if (violations.length > 0) {
    console.log(`[axe] ${label}: ${violations.length} violation(s)`);
    violations.forEach((v) => {
      console.log(`  - ${v.id} (${v.impact}): ${v.description} [${v.nodes.length} node(s)]`);
    });
  }
}

test.describe('axe-core Page Audit — Authenticated Pages', () => {
  test.describe('P0 — Trust & safety critical', () => {
    test('Bookings page (/bookings) passes WCAG 2.1 AA', async ({ page }) => {
      await page.goto('/bookings');
      await page.waitForLoadState('domcontentloaded');

      const results = await runAxeScan(page);
      const violations = results.violations.filter(
        (v) => !A11Y_CONFIG.knownExclusions.includes(v.id as typeof A11Y_CONFIG.knownExclusions[number]),
      );

      logViolations('Bookings', violations);
      expect(violations).toHaveLength(0);
    });

    test('Messages page (/messages) passes WCAG 2.1 AA', async ({ page }) => {
      await page.goto('/messages');
      await page.waitForLoadState('domcontentloaded');

      const results = await runAxeScan(page);
      const violations = results.violations.filter(
        (v) => !A11Y_CONFIG.knownExclusions.includes(v.id as typeof A11Y_CONFIG.knownExclusions[number]),
      );

      logViolations('Messages', violations);
      expect(violations).toHaveLength(0);
    });
  });

  test.describe('P1 — PII & forms', () => {
    test('Profile page (/profile) passes WCAG 2.1 AA', async ({ page }) => {
      await page.goto('/profile');
      await page.waitForLoadState('domcontentloaded');

      const results = await runAxeScan(page);
      const violations = results.violations.filter(
        (v) => !A11Y_CONFIG.knownExclusions.includes(v.id as typeof A11Y_CONFIG.knownExclusions[number]),
      );

      logViolations('Profile', violations);
      expect(violations).toHaveLength(0);
    });

    test('Settings page (/settings) passes WCAG 2.1 AA', async ({ page }) => {
      await page.goto('/settings');
      await page.waitForLoadState('domcontentloaded');

      const results = await runAxeScan(page);
      const violations = results.violations.filter(
        (v) => !A11Y_CONFIG.knownExclusions.includes(v.id as typeof A11Y_CONFIG.knownExclusions[number]),
      );

      logViolations('Settings', violations);
      expect(violations).toHaveLength(0);
    });

    test('Notifications page (/notifications) passes WCAG 2.1 AA', async ({ page }) => {
      await page.goto('/notifications');
      await page.waitForLoadState('domcontentloaded');

      const results = await runAxeScan(page);
      const violations = results.violations.filter(
        (v) => !A11Y_CONFIG.knownExclusions.includes(v.id as typeof A11Y_CONFIG.knownExclusions[number]),
      );

      logViolations('Notifications', violations);
      expect(violations).toHaveLength(0);
    });
  });

  test.describe('P1 — User collections', () => {
    test('Saved listings (/saved) passes WCAG 2.1 AA', async ({ page }) => {
      await page.goto('/saved');
      await page.waitForLoadState('domcontentloaded');

      const results = await runAxeScan(page);
      const violations = results.violations.filter(
        (v) => !A11Y_CONFIG.knownExclusions.includes(v.id as typeof A11Y_CONFIG.knownExclusions[number]),
      );

      logViolations('Saved', violations);
      expect(violations).toHaveLength(0);
    });

    test('Saved searches (/saved-searches) passes WCAG 2.1 AA', async ({ page }) => {
      await page.goto('/saved-searches');
      await page.waitForLoadState('domcontentloaded');

      const results = await runAxeScan(page);
      const violations = results.violations.filter(
        (v) => !A11Y_CONFIG.knownExclusions.includes(v.id as typeof A11Y_CONFIG.knownExclusions[number]),
      );

      logViolations('Saved Searches', violations);
      expect(violations).toHaveLength(0);
    });

    test('Recently viewed (/recently-viewed) passes WCAG 2.1 AA', async ({ page }) => {
      await page.goto('/recently-viewed');
      await page.waitForLoadState('domcontentloaded');

      const results = await runAxeScan(page);
      const violations = results.violations.filter(
        (v) => !A11Y_CONFIG.knownExclusions.includes(v.id as typeof A11Y_CONFIG.knownExclusions[number]),
      );

      logViolations('Recently Viewed', violations);
      expect(violations).toHaveLength(0);
    });
  });

  test.describe('P1 — Listing creation', () => {
    test('Create listing page (/listings/create) passes WCAG 2.1 AA', async ({ page }) => {
      await page.goto('/listings/create');
      await page.waitForLoadState('domcontentloaded');

      // The date picker and select components may have Radix-specific a11y issues
      const results = await runAxeScan(page, [], ['select-name']);
      const violations = results.violations.filter(
        (v) => !A11Y_CONFIG.knownExclusions.includes(v.id as typeof A11Y_CONFIG.knownExclusions[number]),
      );

      logViolations('Create Listing', violations);
      expect(violations).toHaveLength(0);
    });
  });

  test.describe('Form label checks on authenticated pages', () => {
    for (const route of ['/profile/edit', '/settings', '/listings/create']) {
      test(`${route} has labeled form inputs`, async ({ page }) => {
        await page.goto(route);
        await page.waitForLoadState('domcontentloaded');

        const unlabeled = await page.evaluate(() => {
          const inputs = document.querySelectorAll(
            'input:not([type="hidden"]):not([type="file"]):not([tabindex="-1"]):not([role="combobox"]):not([role="searchbox"]), textarea, select:not([aria-hidden="true"]):not([tabindex="-1"])',
          );
          const missing: string[] = [];

          inputs.forEach((input) => {
            const el = input as HTMLInputElement;
            if (!el.offsetParent) return; // skip hidden elements

            const hasLabel =
              !!el.getAttribute('aria-label') ||
              !!el.getAttribute('aria-labelledby') ||
              !!el.getAttribute('title') ||
              (el.id && !!document.querySelector(`label[for="${el.id}"]`)) ||
              !!el.closest('label');

            if (!hasLabel) {
              missing.push(`<${el.tagName.toLowerCase()} name="${el.getAttribute('name')}" id="${el.id}">`);
            }
          });

          return missing;
        });

        if (unlabeled.length > 0) {
          console.log(`[label] ${route}: ${unlabeled.join(', ')}`);
        }
        expect(unlabeled).toHaveLength(0);
      });
    }
  });
});
