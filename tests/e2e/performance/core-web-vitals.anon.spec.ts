/**
 * Core Web Vitals — Anonymous Pages
 *
 * Measures LCP, CLS, and load timing for critical public pages.
 * Budgets are CI-friendly (generous) to account for shared CI runners,
 * cold starts, and network latency:
 *   LCP <8000ms, CLS <0.5, Page load <10000ms, DCL <8000ms.
 */

import { test, expect, SF_BOUNDS } from '../helpers';

test.describe('Core Web Vitals — Anonymous Pages', () => {
  test.slow(); // Performance measurement needs extended timeouts

  // ────────────────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────────────────

  /** Inject CLS observer before navigation */
  async function setupClsObserver(page: import('@playwright/test').Page) {
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
  }

  /** Read LCP from buffered PerformanceObserver entries */
  async function measureLcp(page: import('@playwright/test').Page): Promise<number> {
    return page.evaluate(() => {
      return new Promise<number>((resolve) => {
        let lastLcp = -1;
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          if (entries.length > 0) {
            lastLcp = entries[entries.length - 1].startTime;
          }
        });
        observer.observe({ type: 'largest-contentful-paint', buffered: true });
        setTimeout(() => {
          observer.disconnect();
          resolve(lastLcp);
        }, 3000);
      });
    });
  }

  /** Read accumulated CLS from page */
  async function readCls(page: import('@playwright/test').Page): Promise<number> {
    return page.evaluate(() => (window as any).__cls as number);
  }

  /** Measure load event timing */
  async function measureLoadTime(page: import('@playwright/test').Page): Promise<number> {
    return page.evaluate(() => {
      const entries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
      if (entries.length === 0) return -1;
      return entries[0].loadEventEnd - entries[0].startTime;
    });
  }

  // ────────────────────────────────────────────────────────
  // CI-aware budgets (shared CI runners are slower)
  // ────────────────────────────────────────────────────────
  const isCI = !!process.env.CI;
  const LCP_BUDGET = isCI ? 12000 : 8000;
  const CLS_BUDGET = isCI ? 0.8 : 0.5;
  const LOAD_BUDGET = isCI ? 15000 : 10000;
  const DCL_BUDGET = isCI ? 12000 : 8000;

  // ────────────────────────────────────────────────────────
  // Homepage (/)
  // ────────────────────────────────────────────────────────

  test.describe('Homepage (/)', () => {
    test('LCP under budget', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');

      const lcp = await measureLcp(page);
      expect(lcp, 'LCP should be recorded').toBeGreaterThan(0);
      expect(lcp, `LCP was ${lcp.toFixed(0)}ms, budget is ${LCP_BUDGET}ms`).toBeLessThan(LCP_BUDGET);
    });

    test('CLS under budget', async ({ page }) => {
      await setupClsObserver(page);
      await page.goto('/');
      await page.waitForLoadState('load');
      await page.waitForTimeout(3000); // Settle window

      const cls = await readCls(page);
      expect(cls, `CLS was ${cls.toFixed(4)}, budget is ${CLS_BUDGET}`).toBeLessThan(CLS_BUDGET);
    });

    test('Page load under budget', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('load');

      const loadTime = await measureLoadTime(page);
      expect(loadTime, 'Navigation timing should be available').toBeGreaterThan(0);
      expect(loadTime, `Load time was ${loadTime.toFixed(0)}ms, budget is ${LOAD_BUDGET}ms`).toBeLessThan(LOAD_BUDGET);
    });
  });

  // ────────────────────────────────────────────────────────
  // Search (/search)
  // ────────────────────────────────────────────────────────

  test.describe('Search (/search)', () => {
    const searchUrl = `/search?minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;

    test('LCP under budget', async ({ page }) => {
      await page.goto(searchUrl);
      await page.waitForLoadState('domcontentloaded');

      const lcp = await measureLcp(page);
      expect(lcp, 'LCP should be recorded').toBeGreaterThan(0);
      expect(lcp, `LCP was ${lcp.toFixed(0)}ms, budget is ${LCP_BUDGET}ms`).toBeLessThan(LCP_BUDGET);
    });

    test('CLS under budget', async ({ page }) => {
      await setupClsObserver(page);
      await page.goto(searchUrl);
      await page.waitForLoadState('load');
      await page.waitForTimeout(3000);

      const cls = await readCls(page);
      expect(cls, `CLS was ${cls.toFixed(4)}, budget is ${CLS_BUDGET}`).toBeLessThan(CLS_BUDGET);
    });

    test('DOMContentLoaded under budget', async ({ page }) => {
      const start = Date.now();
      await page.goto(searchUrl);
      await page.waitForLoadState('domcontentloaded');
      const dcl = Date.now() - start;

      expect(dcl, `DCL was ${dcl}ms, budget is ${DCL_BUDGET}ms`).toBeLessThan(DCL_BUDGET);
    });
  });

  // ────────────────────────────────────────────────────────
  // Login (/login)
  // ────────────────────────────────────────────────────────

  test.describe('Login (/login)', () => {
    test('LCP under budget', async ({ page }) => {
      await page.goto('/login');
      await page.waitForLoadState('domcontentloaded');

      const lcp = await measureLcp(page);
      expect(lcp, 'LCP should be recorded').toBeGreaterThan(0);
      expect(lcp, `LCP was ${lcp.toFixed(0)}ms, budget is ${LCP_BUDGET}ms`).toBeLessThan(LCP_BUDGET);
    });

    test('CLS under budget', async ({ page }) => {
      await setupClsObserver(page);
      await page.goto('/login');
      await page.waitForLoadState('load');
      await page.waitForTimeout(3000);

      const cls = await readCls(page);
      expect(cls, `CLS was ${cls.toFixed(4)}, budget is ${CLS_BUDGET}`).toBeLessThan(CLS_BUDGET);
    });
  });

  // ────────────────────────────────────────────────────────
  // Listing Detail (/listings/[id])
  // ────────────────────────────────────────────────────────

  test.describe('Listing Detail', () => {
    test('LCP under budget', async ({ page }) => {
      // Find first listing ID
      await page.goto('/search');
      await page.waitForLoadState('domcontentloaded');
      const firstCard = page.locator('[data-testid="listing-card"]').first();
      const listingId = await firstCard.getAttribute('data-listing-id').catch(() => null);
      test.skip(!listingId, 'No listings available');

      await page.goto(`/listings/${listingId}`);
      await page.waitForLoadState('domcontentloaded');

      const lcp = await measureLcp(page);
      expect(lcp, 'LCP should be recorded').toBeGreaterThan(0);
      expect(lcp, `LCP was ${lcp.toFixed(0)}ms, budget is ${LCP_BUDGET}ms`).toBeLessThan(LCP_BUDGET);
    });

    test('CLS under budget', async ({ page }) => {
      await setupClsObserver(page);
      await page.goto('/search');
      await page.waitForLoadState('domcontentloaded');
      const firstCard = page.locator('[data-testid="listing-card"]').first();
      const listingId = await firstCard.getAttribute('data-listing-id').catch(() => null);
      test.skip(!listingId, 'No listings available');

      await page.goto(`/listings/${listingId}`);
      await page.waitForLoadState('load');
      await page.waitForTimeout(3000);

      const cls = await readCls(page);
      expect(cls, `CLS was ${cls.toFixed(4)}, budget is ${CLS_BUDGET}`).toBeLessThan(CLS_BUDGET);
    });
  });
});
