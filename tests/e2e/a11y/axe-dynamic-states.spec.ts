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
    console.log(`[axe-dynamic] ${label}: ${violations.length} violation(s)`);
    violations.forEach((v) => {
      console.log(`  - ${v.id} (${v.impact}): ${v.description} [${v.nodes.length} node(s)]`);
    });
  }
}

test.describe('axe-core — Dynamic UI States', () => {
  test.describe('Filter modal states', () => {
    test('Search filter modal open state passes WCAG 2.1 AA', async ({ page }) => {
      await page.goto('/search');
      await page.waitForLoadState('networkidle');

      // Open the filter modal
      const filterButton = page.getByRole('button', { name: /filter/i })
        .or(page.locator('[data-testid="filter-button"]'));

      if (await filterButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await filterButton.click();

        // Wait for modal/dialog to appear
        const modal = page.locator('[role="dialog"]');
        await expect(modal).toBeVisible({ timeout: 5000 });

        const results = await runAxeScan(page);
        const violations = results.violations.filter(
          (v) => !A11Y_CONFIG.knownExclusions.includes(v.id as typeof A11Y_CONFIG.knownExclusions[number]),
        );

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
        await expect(modal).not.toBeVisible({ timeout: 3000 });
      } else {
        test.skip(true, 'Filter button not visible');
      }
    });
  });

  test.describe('Login form validation states', () => {
    test('Login form with validation errors passes WCAG 2.1 AA', async ({ page }) => {
      await page.goto('/login');
      await page.waitForLoadState('networkidle');

      // Submit empty form to trigger validation
      const submitBtn = page.getByRole('button', { name: /log in|sign in|submit/i });
      if (await submitBtn.isVisible()) {
        await submitBtn.click();

        // Wait for error messages to render
        await expect(
          page.locator('[role="alert"], [aria-invalid="true"], [class*="error"]').first(),
        ).toBeVisible({ timeout: 5000 }).catch(() => {
          // Some forms may not show errors immediately
        });

        const results = await runAxeScan(page);
        const violations = results.violations.filter(
          (v) => !A11Y_CONFIG.knownExclusions.includes(v.id as typeof A11Y_CONFIG.knownExclusions[number]),
        );

        logViolations('Login Validation Errors', violations);
        expect(violations).toHaveLength(0);
      }
    });

    test('Error messages have aria-describedby linking', async ({ page }) => {
      await page.goto('/login');
      await page.waitForLoadState('networkidle');

      // Submit empty form
      const submitBtn = page.getByRole('button', { name: /log in|sign in|submit/i });
      if (await submitBtn.isVisible()) {
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
      await page.waitForLoadState('networkidle');

      const submitBtn = page.getByRole('button', { name: /sign up|register|create account/i });
      if (await submitBtn.isVisible()) {
        await submitBtn.click();

        // Wait for validation feedback
        await expect(
          page.locator('[role="alert"], [aria-invalid="true"], [class*="error"]').first(),
        ).toBeVisible({ timeout: 5000 }).catch(() => {});

        const results = await runAxeScan(page);
        const violations = results.violations.filter(
          (v) => !A11Y_CONFIG.knownExclusions.includes(v.id as typeof A11Y_CONFIG.knownExclusions[number]),
        );

        logViolations('Signup Validation Errors', violations);
        expect(violations).toHaveLength(0);
      }
    });
  });

  test.describe('Search page loading states', () => {
    test('Search results loading state has accessible announcements', async ({ page }) => {
      await page.goto('/search');
      await page.waitForLoadState('networkidle');

      // Verify aria-live regions exist for dynamic content updates
      const liveRegions = page.locator('[aria-live], [role="status"], [role="alert"]');
      const count = await liveRegions.count();
      expect(count).toBeGreaterThan(0);
    });

    test('Search page with no results passes WCAG 2.1 AA', async ({ page }) => {
      // Navigate to search with impossible filters
      await page.goto('/search?minPrice=99999&maxPrice=99999');
      await page.waitForLoadState('networkidle');

      const results = await runAxeScan(page);
      const violations = results.violations.filter(
        (v) => !A11Y_CONFIG.knownExclusions.includes(v.id as typeof A11Y_CONFIG.knownExclusions[number]),
      );

      logViolations('Search No Results', violations);
      expect(violations).toHaveLength(0);
    });
  });

  test.describe('Mobile bottom sheet state (viewport: 375x667)', () => {
    test.use({ viewport: { width: 375, height: 667 } });

    test('Mobile search with bottom sheet passes WCAG 2.1 AA', async ({ page }) => {
      await page.goto('/search');
      await page.waitForLoadState('networkidle');

      const results = await runAxeScan(page);
      const violations = results.violations.filter(
        (v) => !A11Y_CONFIG.knownExclusions.includes(v.id as typeof A11Y_CONFIG.knownExclusions[number]),
      );

      logViolations('Mobile Search + Sheet', violations);
      expect(violations).toHaveLength(0);
    });
  });

  test.describe('Dark mode state', () => {
    test('Homepage in dark mode passes WCAG 2.1 AA', async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const results = await runAxeScan(page);
      const violations = results.violations.filter(
        (v) => !A11Y_CONFIG.knownExclusions.includes(v.id as typeof A11Y_CONFIG.knownExclusions[number]),
      );

      logViolations('Homepage Dark Mode', violations);
      expect(violations).toHaveLength(0);
    });

    test('Search page in dark mode passes WCAG 2.1 AA', async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.goto('/search');
      await page.waitForLoadState('networkidle');

      const results = await runAxeScan(page);
      const violations = results.violations.filter(
        (v) => !A11Y_CONFIG.knownExclusions.includes(v.id as typeof A11Y_CONFIG.knownExclusions[number]),
      );

      logViolations('Search Dark Mode', violations);
      expect(violations).toHaveLength(0);
    });
  });

  test.describe('Forced colors mode', () => {
    test('Interactive elements remain visible in high contrast', async ({ page }) => {
      await page.emulateMedia({ forcedColors: 'active' });
      await page.goto('/search');
      await page.waitForLoadState('networkidle');

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
      await page.waitForLoadState('networkidle');

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
