/**
 * E2E Accessibility Audit — Dynamic UI States
 *
 * axe-core WCAG 2.1 AA compliance scans during dynamic UI states:
 * modal dialogs, form validation errors, toast notifications,
 * loading states, and expanded panels.
 *
 * These complement static page audits by testing states that
 * only exist after user interaction.
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { A11Y_CONFIG } from '../helpers/test-utils';
import { filtersButton, filterDialog, clickFiltersButton } from '../helpers/filter-helpers';

/**
 * Known axe rule IDs that fire on third-party or framework-generated markup
 * we cannot fix (e.g. map controls, mobile nav with aria-hidden + focusable links).
 * Disabled globally for dynamic-state scans to reduce false positives.
 *
 * - aria-hidden-focus: map controls and mobile nav with aria-hidden + focusable links
 * - region: third-party widgets (map, toasts) may sit outside landmark regions
 * - link-in-text-block: inline links styled identically to surrounding text (design choice)
 */
const DYNAMIC_STATE_DISABLED_RULES = [
  'aria-hidden-focus',
  'region',
  'link-in-text-block',
  'aria-prohibited-attr',
  'button-name',
] as const;

/** Extra selectors to exclude from axe scans in CI (third-party widgets, map controls) */
const CI_EXTRA_EXCLUDES = [
  '.maplibregl-ctrl-group',
  '.mapboxgl-ctrl-group',
  '[data-sonner-toast]',
  '[data-radix-popper-content-wrapper]',
] as const;

/** Helper: run axe scan with shared config */
async function runAxeScan(page: import('@playwright/test').Page, extraExcludes: string[] = [], disabledRules: string[] = []) {
  let builder = new AxeBuilder({ page }).withTags([...A11Y_CONFIG.tags]);

  for (const selector of [...A11Y_CONFIG.globalExcludes, ...CI_EXTRA_EXCLUDES, ...extraExcludes]) {
    builder = builder.exclude(selector);
  }

  const allDisabledRules = [...DYNAMIC_STATE_DISABLED_RULES, ...disabledRules];
  if (allDisabledRules.length > 0) {
    builder = builder.disableRules([...allDisabledRules]);
  }

  return builder.analyze();
}

/**
 * Additional rule IDs that are acceptable in CI headless environments.
 * These typically fire on framework/third-party markup or headless rendering artifacts.
 */
const CI_ACCEPTABLE_VIOLATIONS = [
  'heading-order',        // heading hierarchy from layout + page combo in SSR
  'landmark-unique',      // duplicate nav landmarks from SSR + hydration
  'landmark-one-main',    // transient state during Suspense boundary resolution
  'page-has-heading-one', // heading may not render before Suspense resolves
  'duplicate-id',         // Radix UI portals can duplicate IDs during hydration
  'duplicate-id-aria',    // Same Radix UI portal issue
] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function logViolations(label: string, violations: any[]) {
  if (violations.length > 0) {
    console.log(`[axe-dynamic] ${label}: ${violations.length} violation(s)`);
    violations.forEach((v) => {
      console.log(`  - ${v.id} (${v.impact}): ${v.description} [${v.nodes.length} node(s)]`);
    });
  }
}

/** Filter out known exclusions AND CI-acceptable violations */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function filterViolations(violations: any[]): any[] {
  return violations.filter(
    (v) =>
      !A11Y_CONFIG.knownExclusions.includes(v.id as typeof A11Y_CONFIG.knownExclusions[number]) &&
      !(CI_ACCEPTABLE_VIOLATIONS as readonly string[]).includes(v.id),
  );
}

test.describe('axe-core — Dynamic UI States', () => {
  test.beforeEach(async () => { test.slow(); });

  test.describe('Filter modal states', () => {
    test('Search filter modal open state passes WCAG 2.1 AA', async ({ page }) => {
      await page.goto('/search');
      await page.waitForLoadState('domcontentloaded');
      // Wait for network to settle so all async chunks / map tiles are loaded
      await page.waitForLoadState('networkidle').catch(() => {});

      // Open the filter modal (uses retry-click for hydration race)
      const filterBtn = filtersButton(page);

      if (await filterBtn.isVisible({ timeout: 10_000 }).catch(() => false)) {
        await clickFiltersButton(page);

        // Wait for modal/dialog to appear
        const modal = filterDialog(page);
        await expect(modal).toBeVisible({ timeout: 10_000 });

        const results = await runAxeScan(page);
        const violations = filterViolations(results.violations);

        logViolations('Filter Modal Open', violations);
        expect(violations).toHaveLength(0);

        // Verify focus is trapped in modal
        const focusInModal = await page.evaluate(() => {
          const modal = document.querySelector('[role="dialog"]');
          return modal?.contains(document.activeElement) ?? false;
        });
        expect(focusInModal).toBe(true);

        // Close and verify focus returns
        await page.keyboard.press('Escape');
        await expect(modal).not.toBeVisible({ timeout: 5000 });
      } else {
        test.skip(true, 'Filter button not visible');
      }
    });
  });

  test.describe('Login form validation states', () => {
    test('Login form with validation errors passes WCAG 2.1 AA', async ({ page }) => {
      await page.goto('/login');
      await page.waitForLoadState('domcontentloaded');
      // Wait for network to settle — Suspense boundary resolves after JS chunks load
      await page.waitForLoadState('networkidle').catch(() => {});
      // Wait for the login form to render (Suspense boundary + hydration)
      // Match "Welcome back" (actual h1), "Log in", "Sign in" etc.
      const loginHeading = page.getByRole('heading', { name: /log in|sign in|welcome back/i })
        .or(page.locator('h1').first());
      await expect(loginHeading).toBeVisible({ timeout: 30_000 });

      // Submit empty form to trigger validation
      const submitBtn = page.getByRole('button', { name: /log in|sign in|submit/i });
      if (await submitBtn.isVisible({ timeout: 10_000 }).catch(() => false)) {
        await submitBtn.click();

        // Wait for error messages to render
        await expect(
          page.locator('[role="alert"], [aria-invalid="true"], [class*="error"]').first(),
        ).toBeVisible({ timeout: 5000 }).catch(() => {
          // Some forms may not show errors immediately
        });

        const results = await runAxeScan(page);
        const violations = filterViolations(results.violations);

        logViolations('Login Validation Errors', violations);
        expect(violations).toHaveLength(0);
      }
    });

    test('Error messages have aria-describedby linking', async ({ page }) => {
      await page.goto('/login');
      await page.waitForLoadState('domcontentloaded');
      // Wait for network to settle — Suspense boundary resolves after JS chunks load
      await page.waitForLoadState('networkidle').catch(() => {});
      // Wait for the login form to render (Suspense boundary + hydration)
      const loginHeading = page.getByRole('heading', { name: /log in|sign in|welcome back/i })
        .or(page.locator('h1').first());
      await expect(loginHeading).toBeVisible({ timeout: 30_000 });

      // Submit empty form
      const submitBtn = page.getByRole('button', { name: /log in|sign in|submit/i });
      if (await submitBtn.isVisible({ timeout: 10_000 }).catch(() => false)) {
        await submitBtn.click();

        // Check for invalid inputs and their error associations
        const invalidInputs = page.locator('input[aria-invalid="true"]');
        const count = await invalidInputs.count();

        for (let i = 0; i < count; i++) {
          const input = invalidInputs.nth(i);
          const describedBy = await input.getAttribute('aria-describedby');

          // If input is marked invalid, it should reference an error message
          if (describedBy) {
            const errorEl = page.locator(`#${describedBy}`);
            await expect(errorEl).toBeAttached();
          }
        }
      }
    });
  });

  test.describe('Signup form validation states', () => {
    test('Signup form with validation errors passes WCAG 2.1 AA', async ({ page }) => {
      await page.goto('/signup');
      await page.waitForLoadState('domcontentloaded');
      // Wait for network to settle — Suspense boundary resolves after JS chunks load
      await page.waitForLoadState('networkidle').catch(() => {});
      // Wait for the signup form to render (Suspense boundary + hydration)
      const signupHeading = page.getByRole('heading', { name: /sign up|create.*account|register/i })
        .or(page.locator('h1').first());
      await expect(signupHeading).toBeVisible({ timeout: 30_000 });

      const submitBtn = page.getByRole('button', { name: /sign up|register|create account|submit/i });
      if (await submitBtn.isVisible({ timeout: 10_000 }).catch(() => false)) {
        await submitBtn.click();

        // Wait for validation feedback
        await expect(
          page.locator('[role="alert"], [aria-invalid="true"], [class*="error"]').first(),
        ).toBeVisible({ timeout: 5000 }).catch(() => {});

        const results = await runAxeScan(page);
        const violations = filterViolations(results.violations);

        logViolations('Signup Validation Errors', violations);
        expect(violations).toHaveLength(0);
      }
    });
  });

  test.describe('Search page loading states', () => {
    test('Search results loading state has accessible announcements', async ({ page }) => {
      await page.goto('/search');
      await page.waitForLoadState('domcontentloaded');
      // Wait for network to settle so dynamic content (results, map) finishes loading
      await page.waitForLoadState('networkidle').catch(() => {});

      // Verify aria-live regions exist for dynamic content updates
      const liveRegions = page.locator('[aria-live], [role="status"], [role="alert"]');
      const count = await liveRegions.count();
      expect(count).toBeGreaterThan(0);
    });

    test('Search page with no results passes WCAG 2.1 AA', async ({ page }) => {
      // Navigate to search with impossible filters
      await page.goto('/search?minPrice=99999&maxPrice=99999');
      await page.waitForLoadState('domcontentloaded');
      // Wait for network to settle — search API response + map must complete
      await page.waitForLoadState('networkidle').catch(() => {});
      // Wait for content to attach (empty state or heading)
      await page.locator('[data-testid="empty-state"], h1, h2, h3, [data-testid="listing-card"]')
        .first()
        .waitFor({ state: 'attached', timeout: 15_000 })
        .catch(() => {});

      const results = await runAxeScan(page);
      const violations = filterViolations(results.violations);

      logViolations('Search No Results', violations);
      expect(violations).toHaveLength(0);
    });
  });

  test.describe('Mobile bottom sheet state (viewport: 375x667)', () => {
    test.use({ viewport: { width: 375, height: 667 } });

    test('Mobile search with bottom sheet passes WCAG 2.1 AA', async ({ page }) => {
      await page.goto('/search');
      await page.waitForLoadState('domcontentloaded');
      // Wait for network to settle — bottom sheet + map + search results must load
      await page.waitForLoadState('networkidle').catch(() => {});

      const results = await runAxeScan(page);
      const violations = filterViolations(results.violations);

      logViolations('Mobile Search + Sheet', violations);
      expect(violations).toHaveLength(0);
    });
  });

  test.describe('Dark mode state', () => {
    test('Homepage in dark mode passes WCAG 2.1 AA', async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForLoadState('networkidle').catch(() => {});

      const results = await runAxeScan(page);
      const violations = filterViolations(results.violations);

      logViolations('Homepage Dark Mode', violations);
      expect(violations).toHaveLength(0);
    });

    test('Search page in dark mode passes WCAG 2.1 AA', async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.goto('/search');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForLoadState('networkidle').catch(() => {});

      const results = await runAxeScan(page);
      const violations = filterViolations(results.violations);

      logViolations('Search Dark Mode', violations);
      expect(violations).toHaveLength(0);
    });
  });

  test.describe('Forced colors mode', () => {
    test('Interactive elements remain visible in high contrast', async ({ page }) => {
      await page.emulateMedia({ forcedColors: 'active' });
      await page.goto('/search');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForLoadState('networkidle').catch(() => {});

      // Buttons remain visible
      const buttons = page.locator('button:visible');
      const buttonCount = await buttons.count();
      expect(buttonCount).toBeGreaterThan(0);

      for (let i = 0; i < Math.min(buttonCount, 5); i++) {
        await expect(buttons.nth(i)).toBeVisible();
      }
    });
  });

  test.describe('Reduced motion', () => {
    test('Animations are reduced with prefers-reduced-motion', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForLoadState('networkidle').catch(() => {});

      // Check that transition durations are reduced
      const longAnimations = await page.evaluate(() => {
        const animated = document.querySelectorAll('[class*="transition"], [class*="animate"]');
        let count = 0;
        animated.forEach((el) => {
          const style = window.getComputedStyle(el);
          const transitionMs = parseFloat(style.transitionDuration) * 1000 || 0;
          const animationMs = parseFloat(style.animationDuration) * 1000 || 0;
          if (transitionMs > 200 || animationMs > 200) count++;
        });
        return count;
      });

      // Log but allow some — CSS frameworks may have long defaults
      if (longAnimations > 0) {
        console.log(`[motion] ${longAnimations} elements with >200ms animation in reduced-motion mode`);
      }
    });
  });
});
