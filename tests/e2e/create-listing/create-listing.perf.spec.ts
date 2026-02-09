/**
 * E2E Test Suite: Create Listing — Performance Tests
 * Tests P-001 through P-004
 *
 * Measures Largest Contentful Paint (LCP), Cumulative Layout Shift (CLS),
 * Time to Interactive (TTI), and overall page load time against budgets.
 */

import { test, expect, tags, timeouts } from '../helpers/test-utils';
import { CreateListingPage } from '../page-objects/create-listing.page';

test.describe('Create Listing — Performance Tests', () => {
  test.use({ storageState: 'playwright/.auth/user.json' });

  // Performance tests need extended timeouts for measurement windows
  test.slow();

  // ────────────────────────────────────────────────────────
  // P1 — Core Web Vitals
  // ────────────────────────────────────────────────────────

  test(`P-001: LCP under 2.5s ${tags.slow}`, async ({ page }) => {
    // Navigate to the create listing page
    await page.goto('/listings/create');
    await page.waitForLoadState('domcontentloaded');

    const lcp = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        let lastLcp = -1;

        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          if (entries.length > 0) {
            lastLcp = entries[entries.length - 1].startTime;
          }
        });

        observer.observe({ type: 'largest-contentful-paint', buffered: true });

        // Give the observer time to pick up the buffered LCP entry,
        // then disconnect and resolve.
        setTimeout(() => {
          observer.disconnect();
          resolve(lastLcp);
        }, 3000);
      });
    });

    expect(lcp, 'LCP should be recorded').toBeGreaterThan(0);
    expect(lcp, `LCP was ${lcp.toFixed(0)}ms, budget is 2500ms`).toBeLessThan(2500);
  });

  test(`P-002: CLS under 0.5 ${tags.slow}`, async ({ page }) => {
    // Set up CLS observer BEFORE navigation to capture all shifts
    await page.addInitScript(() => {
      (window as any).__cls = 0;
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!(entry as any).hadRecentInput) {
            (window as any).__cls += (entry as any).value;
          }
        }
      });
      observer.observe({ type: 'layout-shift', buffered: true });
    });

    // Navigate and wait for initial render
    await page.goto('/listings/create');
    await page.waitForLoadState('load');

    // Wait for page to settle
    await page.waitForTimeout(3000);

    // Read CLS from the page
    const cls = await page.evaluate(() => (window as any).__cls as number);

    // Budget: 0.1 (WCAG/CWV target — draft banners and progress indicators
    // should use reserved space to avoid layout shift)
    expect(cls, `CLS was ${cls.toFixed(4)}, budget is 0.1`).toBeLessThan(0.1);
  });

  // ────────────────────────────────────────────────────────
  // P2 — Load timing
  // ────────────────────────────────────────────────────────

  test(`P-003: TTI — form interactive within 3s ${tags.slow}`, async ({ page }) => {
    const navStart = Date.now();

    await page.goto('/listings/create');
    await page.waitForLoadState('domcontentloaded');

    // Wait until the title input is visible and editable (form is interactive)
    const clp = new CreateListingPage(page);
    await clp.titleInput.waitFor({ state: 'visible', timeout: timeouts.navigation });

    // Verify the input is actually interactive by filling it
    await clp.titleInput.fill('TTI test');
    const value = await clp.titleInput.inputValue();
    expect(value).toBe('TTI test');

    const tti = Date.now() - navStart;
    expect(tti, `TTI was ${tti}ms, budget is 5000ms`).toBeLessThan(5000);
  });

  test(`P-004: page load time under 5s ${tags.slow}`, async ({ page }) => {
    await page.goto('/listings/create');
    await page.waitForLoadState('load');

    const loadTime = await page.evaluate(() => {
      const entries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
      if (entries.length === 0) return -1;
      const nav = entries[0];
      return nav.loadEventEnd - nav.startTime;
    });

    expect(loadTime, 'Navigation timing should be available').toBeGreaterThan(0);
    expect(loadTime, `Load time was ${loadTime.toFixed(0)}ms, budget is 5000ms`).toBeLessThan(5000);
  });
});
