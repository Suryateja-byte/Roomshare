/**
 * Core Web Vitals — Anonymous Pages
 *
 * Measures LCP, CLS, and load timing for critical public pages.
 * Budgets per CLAUDE.md: LCP <2500ms, CLS <0.1.
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
  // Homepage (/)
  // ────────────────────────────────────────────────────────

  test.describe('Homepage (/)', () => {
    test('LCP under 2500ms', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');

      const lcp = await measureLcp(page);
      expect(lcp, 'LCP should be recorded').toBeGreaterThan(0);
      expect(lcp, `LCP was ${lcp.toFixed(0)}ms, budget is 2500ms`).toBeLessThan(2500);
    });

    test('CLS under 0.1', async ({ page }) => {
      await setupClsObserver(page);
      await page.goto('/');
      await page.waitForLoadState('load');
      await page.waitForTimeout(3000); // Settle window

      const cls = await readCls(page);
      expect(cls, `CLS was ${cls.toFixed(4)}, budget is 0.1`).toBeLessThan(0.1);
    });

    test('Page load under 5s', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('load');

      const loadTime = await measureLoadTime(page);
      expect(loadTime, 'Navigation timing should be available').toBeGreaterThan(0);
      expect(loadTime, `Load time was ${loadTime.toFixed(0)}ms, budget is 5000ms`).toBeLessThan(5000);
    });
  });

  // ────────────────────────────────────────────────────────
  // Search (/search)
  // ────────────────────────────────────────────────────────

  test.describe('Search (/search)', () => {
    const searchUrl = `/search?minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;

    test('LCP under 2500ms', async ({ page }) => {
      await page.goto(searchUrl);
      await page.waitForLoadState('domcontentloaded');

      const lcp = await measureLcp(page);
      expect(lcp, 'LCP should be recorded').toBeGreaterThan(0);
      expect(lcp, `LCP was ${lcp.toFixed(0)}ms, budget is 2500ms`).toBeLessThan(2500);
    });

    test('CLS under 0.1', async ({ page }) => {
      await setupClsObserver(page);
      await page.goto(searchUrl);
      await page.waitForLoadState('load');
      await page.waitForTimeout(3000);

      const cls = await readCls(page);
      expect(cls, `CLS was ${cls.toFixed(4)}, budget is 0.1`).toBeLessThan(0.1);
    });

    test('DOMContentLoaded under 3s', async ({ page }) => {
      const start = Date.now();
      await page.goto(searchUrl);
      await page.waitForLoadState('domcontentloaded');
      const dcl = Date.now() - start;

      expect(dcl, `DCL was ${dcl}ms, budget is 3000ms`).toBeLessThan(3000);
    });
  });

  // ────────────────────────────────────────────────────────
  // Login (/login)
  // ────────────────────────────────────────────────────────

  test.describe('Login (/login)', () => {
    test('LCP under 2500ms', async ({ page }) => {
      await page.goto('/login');
      await page.waitForLoadState('domcontentloaded');

      const lcp = await measureLcp(page);
      expect(lcp, 'LCP should be recorded').toBeGreaterThan(0);
      expect(lcp, `LCP was ${lcp.toFixed(0)}ms, budget is 2500ms`).toBeLessThan(2500);
    });

    test('CLS under 0.1', async ({ page }) => {
      await setupClsObserver(page);
      await page.goto('/login');
      await page.waitForLoadState('load');
      await page.waitForTimeout(3000);

      const cls = await readCls(page);
      expect(cls, `CLS was ${cls.toFixed(4)}, budget is 0.1`).toBeLessThan(0.1);
    });
  });

  // ────────────────────────────────────────────────────────
  // Listing Detail (/listings/[id])
  // ────────────────────────────────────────────────────────

  test.describe('Listing Detail', () => {
    test('LCP under 2500ms', async ({ page }) => {
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
      expect(lcp, `LCP was ${lcp.toFixed(0)}ms, budget is 2500ms`).toBeLessThan(2500);
    });

    test('CLS under 0.1', async ({ page }) => {
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
      expect(cls, `CLS was ${cls.toFixed(4)}, budget is 0.1`).toBeLessThan(0.1);
    });
  });
});
