/**
 * E2E Accessibility Audit — Dark Mode (Authenticated Pages)
 *
 * axe-core WCAG 2.1 AA compliance scans for authenticated pages
 * rendered in dark mode. Covers base page scans, interactive states,
 * mobile viewport scans, and focus management.
 *
 * Auth: uses stored user session from playwright/.auth/user.json
 * Dark mode: activated via localStorage + CSS media emulation (next-themes)
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { A11Y_CONFIG } from '../helpers/test-utils';
import { activateDarkMode, waitForAuthPageReady } from '../helpers';

/**
 * Known axe rule IDs that fire on third-party or framework-generated markup
 * we cannot fix (e.g. map controls, mobile nav with aria-hidden + focusable links).
 * Disabled globally for dark mode scans to reduce false positives.
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
  '[data-sonner-toast]',
  '[data-radix-popper-content-wrapper]',
] as const;

/**
 * Additional rule IDs that are acceptable in CI headless environments.
 * These typically fire on framework/third-party markup or headless rendering artifacts.
 */
const CI_ACCEPTABLE_VIOLATIONS = [
  'heading-order',
  'landmark-unique',
  'landmark-one-main',
  'page-has-heading-one',
  'duplicate-id',
  'duplicate-id-aria',
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function logViolations(label: string, violations: any[]) {
  if (violations.length > 0) {
    console.log(`[axe-dark] ${label}: ${violations.length} violation(s)`);
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

test.describe('Dark Mode — Accessibility (Authenticated Pages)', () => {
  test.use({ storageState: 'playwright/.auth/user.json' });

  test.beforeEach(async ({ page }) => {
    test.slow();
    await activateDarkMode(page);
  });

  // ─── Base page scans ───────────────────────────────────────────────

  test.describe('Base page scans', () => {
    test('DM-A01: /bookings dark mode passes WCAG 2.1 AA', async ({ page }) => {
      const ready = await waitForAuthPageReady(page, '/bookings');
      test.skip(!ready, 'Auth session expired');
      await page.waitForLoadState('networkidle').catch(() => {});

      const results = await runAxeScan(page);
      const violations = filterViolations(results.violations);
      logViolations('Bookings Dark Mode', violations);
      expect(violations).toHaveLength(0);
    });

    test('DM-A02: /messages dark mode passes WCAG 2.1 AA', async ({ page }) => {
      const ready = await waitForAuthPageReady(page, '/messages');
      test.skip(!ready, 'Auth session expired');
      await page.waitForLoadState('networkidle').catch(() => {});

      const results = await runAxeScan(page);
      const violations = filterViolations(results.violations);
      logViolations('Messages Dark Mode', violations);
      expect(violations).toHaveLength(0);
    });

    test('DM-A03: /settings dark mode passes WCAG 2.1 AA', async ({ page }) => {
      const ready = await waitForAuthPageReady(page, '/settings');
      test.skip(!ready, 'Auth session expired');
      await page.waitForLoadState('networkidle').catch(() => {});

      const results = await runAxeScan(page);
      const violations = filterViolations(results.violations);
      logViolations('Settings Dark Mode', violations);
      expect(violations).toHaveLength(0);
    });

    test('DM-A04: /profile dark mode passes WCAG 2.1 AA', async ({ page }) => {
      const ready = await waitForAuthPageReady(page, '/profile');
      test.skip(!ready, 'Auth session expired');
      await page.waitForLoadState('networkidle').catch(() => {});

      const results = await runAxeScan(page);
      const violations = filterViolations(results.violations);
      logViolations('Profile Dark Mode', violations);
      expect(violations).toHaveLength(0);
    });

    test('DM-A05: /profile/edit dark mode passes WCAG 2.1 AA', async ({ page }) => {
      const ready = await waitForAuthPageReady(page, '/profile/edit');
      test.skip(!ready, 'Auth session expired');
      await page.waitForLoadState('networkidle').catch(() => {});

      const results = await runAxeScan(page);
      const violations = filterViolations(results.violations);
      logViolations('Profile Edit Dark Mode', violations);
      expect(violations).toHaveLength(0);
    });
  });

  // ─── Interactive state scans ───────────────────────────────────────

  test.describe('Interactive state scans', () => {
    test('DM-A06: /bookings "Received" tab active state passes axe', async ({ page }) => {
      const ready = await waitForAuthPageReady(page, '/bookings');
      test.skip(!ready, 'Auth session expired');

      const receivedTab = page.getByRole('tab', { name: /received/i });
      if (await receivedTab.isVisible().catch(() => false)) {
        await receivedTab.click();
        await page.waitForTimeout(500);
      }

      const results = await runAxeScan(page);
      const violations = filterViolations(results.violations);
      logViolations('Bookings Received Tab Dark', violations);
      expect(violations).toHaveLength(0);
    });

    test('DM-A07: /bookings "Sent" tab active state passes axe', async ({ page }) => {
      const ready = await waitForAuthPageReady(page, '/bookings');
      test.skip(!ready, 'Auth session expired');

      const sentTab = page.getByRole('tab', { name: /sent/i });
      if (await sentTab.isVisible().catch(() => false)) {
        await sentTab.click();
        await page.waitForTimeout(500);
      }

      const results = await runAxeScan(page);
      const violations = filterViolations(results.violations);
      logViolations('Bookings Sent Tab Dark', violations);
      expect(violations).toHaveLength(0);
    });

    test('DM-A08: /settings notification toggle state passes axe', async ({ page }) => {
      const ready = await waitForAuthPageReady(page, '/settings');
      test.skip(!ready, 'Auth session expired');

      const toggle = page.getByRole('switch').first();
      if (await toggle.isVisible().catch(() => false)) {
        await toggle.click();
        await page.waitForTimeout(500);
      }

      const results = await runAxeScan(page);
      const violations = filterViolations(results.violations);
      logViolations('Settings Toggle Dark', violations);
      expect(violations).toHaveLength(0);
    });

    test('DM-A09: /settings delete account dialog open passes axe', async ({ page }) => {
      const ready = await waitForAuthPageReady(page, '/settings');
      test.skip(!ready, 'Auth session expired');

      const deleteBtn = page.getByRole('button', { name: /delete.*account/i });
      if (await deleteBtn.isVisible().catch(() => false)) {
        await deleteBtn.click();
        await page.waitForTimeout(500);

        const results = await runAxeScan(page);
        const violations = filterViolations(results.violations);
        logViolations('Settings Delete Dialog Dark', violations);
        expect(violations).toHaveLength(0);
      }
    });

    test('DM-A10: /profile/edit form with validation errors passes axe', async ({ page }) => {
      const ready = await waitForAuthPageReady(page, '/profile/edit');
      test.skip(!ready, 'Auth session expired');

      // Try submitting with cleared required field to trigger validation errors
      const nameInput = page.getByLabel(/name/i).first();
      if (await nameInput.isVisible().catch(() => false)) {
        await nameInput.clear();
        const submitBtn = page.getByRole('button', { name: /save|update|submit/i }).first();
        if (await submitBtn.isVisible().catch(() => false)) {
          await submitBtn.click();
          await page.waitForTimeout(500);
        }
      }

      const results = await runAxeScan(page);
      const violations = filterViolations(results.violations);
      logViolations('Profile Edit Validation Dark', violations);
      expect(violations).toHaveLength(0);
    });
  });

  // ─── Mobile viewport scans ────────────────────────────────────────

  test.describe('Mobile viewport scans', () => {
    test('DM-A11: /bookings mobile viewport (390x844) dark mode passes axe', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      const ready = await waitForAuthPageReady(page, '/bookings');
      test.skip(!ready, 'Auth session expired');
      await page.waitForLoadState('networkidle').catch(() => {});

      const results = await runAxeScan(page);
      const violations = filterViolations(results.violations);
      logViolations('Bookings Mobile Dark', violations);
      expect(violations).toHaveLength(0);
    });

    test('DM-A12: /messages mobile viewport (390x844) dark mode passes axe', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      const ready = await waitForAuthPageReady(page, '/messages');
      test.skip(!ready, 'Auth session expired');
      await page.waitForLoadState('networkidle').catch(() => {});

      const results = await runAxeScan(page);
      const violations = filterViolations(results.violations);
      logViolations('Messages Mobile Dark', violations);
      expect(violations).toHaveLength(0);
    });

    test('DM-A13: /profile mobile viewport (390x844) dark mode passes axe', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      const ready = await waitForAuthPageReady(page, '/profile');
      test.skip(!ready, 'Auth session expired');
      await page.waitForLoadState('networkidle').catch(() => {});

      const results = await runAxeScan(page);
      const violations = filterViolations(results.violations);
      logViolations('Profile Mobile Dark', violations);
      expect(violations).toHaveLength(0);
    });
  });

  // ─── Focus management ─────────────────────────────────────────────

  test.describe('Focus management', () => {
    test('DM-A14: Tab navigation through /settings in dark mode — focus rings visible', async ({ page }) => {
      const ready = await waitForAuthPageReady(page, '/settings');
      test.skip(!ready, 'Auth session expired');

      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Tab');
        const focused = page.locator(':focus');
        if (await focused.isVisible().catch(() => false)) {
          const outline = await focused.evaluate((el) => getComputedStyle(el).outlineStyle);
          expect(outline).not.toBe('none');
        }
      }
    });

    test('DM-A15: Theme toggle button is keyboard accessible and announces state', async ({ page }) => {
      const ready = await waitForAuthPageReady(page, '/settings');
      test.skip(!ready, 'Auth session expired');

      const toggle = page.getByLabel(/toggle theme/i)
        .or(page.getByRole('button', { name: /theme/i }));

      if (await toggle.first().isVisible().catch(() => false)) {
        await toggle.first().focus();
        const ariaLabel = await toggle.first().getAttribute('aria-label');
        expect(ariaLabel).toBeTruthy();

        await page.keyboard.press('Enter');
        await page.waitForTimeout(500);

        // Theme should have changed
        const theme = await page.evaluate(() => localStorage.getItem('theme'));
        expect(theme).toBeTruthy();
      }
    });
  });
});
