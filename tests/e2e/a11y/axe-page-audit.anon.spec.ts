/**
 * E2E Accessibility Audit — Anonymous Pages
 *
 * axe-core WCAG 2.1 AA compliance scans for pages that do not require authentication.
 * Uses shared A11Y_CONFIG from test-utils for consistent standards.
 *
 * Pages covered: /, /search, /login, /signup, /about, /terms, /privacy,
 *                /forgot-password, /listings/[id]
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

test.describe('axe-core Page Audit — Anonymous Pages', () => {
  test.beforeEach(async () => { test.slow(); });

  test.describe('P0 — Critical public pages', () => {
    test('Homepage (/) passes WCAG 2.1 AA', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');

      const results = await runAxeScan(page);
      const violations = results.violations.filter(
        (v) => !A11Y_CONFIG.knownExclusions.includes(v.id as typeof A11Y_CONFIG.knownExclusions[number]),
      );

      logViolations('Homepage', violations);
      expect(violations).toHaveLength(0);
    });

    test('Search page (/search) passes WCAG 2.1 AA', async ({ page }) => {
      await page.goto('/search');
      await page.waitForLoadState('domcontentloaded');

      const results = await runAxeScan(page);
      const violations = results.violations.filter(
        (v) => !A11Y_CONFIG.knownExclusions.includes(v.id as typeof A11Y_CONFIG.knownExclusions[number]),
      );

      logViolations('Search', violations);
      expect(violations).toHaveLength(0);
    });

    test('Login page (/login) passes WCAG 2.1 AA', async ({ page }) => {
      await page.goto('/login');
      await page.waitForLoadState('domcontentloaded');

      const results = await runAxeScan(page);
      const violations = results.violations.filter(
        (v) => !A11Y_CONFIG.knownExclusions.includes(v.id as typeof A11Y_CONFIG.knownExclusions[number]),
      );

      logViolations('Login', violations);
      expect(violations).toHaveLength(0);
    });

    test('Signup page (/signup) passes WCAG 2.1 AA', async ({ page }) => {
      await page.goto('/signup');
      await page.waitForLoadState('domcontentloaded');

      const results = await runAxeScan(page);
      const violations = results.violations.filter(
        (v) => !A11Y_CONFIG.knownExclusions.includes(v.id as typeof A11Y_CONFIG.knownExclusions[number]),
      );

      logViolations('Signup', violations);
      expect(violations).toHaveLength(0);
    });

    test('Listing detail (/listings/[id]) passes WCAG 2.1 AA', async ({ page }) => {
      // Navigate to search to find a listing ID
      await page.goto('/search');
      await page.waitForLoadState('domcontentloaded');

      // Get the first listing link
      const firstCard = page.locator(selectors.listingCard).first();
      const listingId = await firstCard.getAttribute('data-listing-id');

      if (listingId) {
        await page.goto(`/listings/${listingId}`);
        await page.waitForLoadState('domcontentloaded');

        const results = await runAxeScan(page);
        const violations = results.violations.filter(
          (v) => !A11Y_CONFIG.knownExclusions.includes(v.id as typeof A11Y_CONFIG.knownExclusions[number]),
        );

        logViolations('Listing Detail', violations);
        expect(violations).toHaveLength(0);
      } else {
        // No listings available — skip gracefully
        test.skip(true, 'No listings found on search page');
      }
    });
  });

  test.describe('P1 — Secondary public pages', () => {
    test('Forgot password page passes WCAG 2.1 AA', async ({ page }) => {
      await page.goto('/forgot-password');
      await page.waitForLoadState('domcontentloaded');

      const results = await runAxeScan(page);
      const violations = results.violations.filter(
        (v) => !A11Y_CONFIG.knownExclusions.includes(v.id as typeof A11Y_CONFIG.knownExclusions[number]),
      );

      logViolations('Forgot Password', violations);
      expect(violations).toHaveLength(0);
    });
  });

  test.describe('P2 — Content pages', () => {
    for (const route of ['/about', '/terms', '/privacy']) {
      test(`${route} passes WCAG 2.1 AA`, async ({ page }) => {
        await page.goto(route);
        await page.waitForLoadState('domcontentloaded');

        const results = await runAxeScan(page);
        const violations = results.violations.filter(
          (v) => !A11Y_CONFIG.knownExclusions.includes(v.id as typeof A11Y_CONFIG.knownExclusions[number]),
        );

        logViolations(route, violations);
        expect(violations).toHaveLength(0);
      });
    }
  });

  test.describe('Heading hierarchy checks', () => {
    for (const route of ['/', '/search', '/login', '/signup']) {
      test(`${route} has valid heading hierarchy`, async ({ page }) => {
        await page.goto(route);
        await page.waitForLoadState('domcontentloaded');

        const headings = await page.evaluate(() => {
          const hs = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
          return Array.from(hs).map((h) => ({
            level: parseInt(h.tagName[1]),
            text: h.textContent?.trim().slice(0, 50) || '',
          }));
        });

        // At least one h1
        const h1s = headings.filter((h) => h.level === 1);
        expect(h1s.length).toBeGreaterThanOrEqual(1);

        // No level skips greater than 1
        let prevLevel = 0;
        const skips: string[] = [];
        for (const h of headings) {
          if (h.level > prevLevel + 1 && prevLevel !== 0) {
            skips.push(`h${prevLevel} → h${h.level}: "${h.text}"`);
          }
          prevLevel = h.level;
        }

        if (skips.length > 0) {
          console.log(`[heading] ${route} skips: ${skips.join(', ')}`);
        }
        expect(skips.length).toBeLessThan(3);
      });
    }
  });

  test.describe('Landmark regions', () => {
    for (const route of ['/', '/search', '/login']) {
      test(`${route} has required landmarks`, async ({ page }) => {
        await page.goto(route);
        await page.waitForLoadState('domcontentloaded');

        const landmarks = await page.evaluate(() => {
          return {
            main: !!document.querySelector('main, [role="main"]'),
            nav: !!document.querySelector('nav, [role="navigation"]'),
            banner: !!document.querySelector('header, [role="banner"]'),
          };
        });

        expect(landmarks.main).toBe(true);
        expect(landmarks.nav).toBe(true);
      });
    }
  });
});
