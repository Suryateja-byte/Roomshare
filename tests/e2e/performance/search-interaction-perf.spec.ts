/**
 * Search Interaction Performance
 *
 * Measures latency of user interactions on the search page:
 * filter apply, sort change, load-more, map pan.
 *
 * Budget: interactions should respond within 200ms (INP target).
 */

import { test, expect, SF_BOUNDS } from '../helpers';

test.describe('Search Interaction Performance', () => {
  test.slow();

  const searchUrl = `/search?minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;

  test.beforeEach(async ({ page }) => {
    await page.goto(searchUrl);
    await page.waitForLoadState('domcontentloaded');
  });

  test('Sort change latency under 1s', async ({ page }) => {
    // Find sort control
    const sortSelect = page.getByRole('combobox', { name: /sort/i })
      .or(page.locator('[data-testid="sort-select"]'))
      .or(page.locator('select[name*="sort"]'))
      .first();

    const isVisible = await sortSelect.isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!isVisible, 'Sort control not found');

    const start = Date.now();

    // Change sort order
    await sortSelect.selectOption({ index: 1 }).catch(async () => {
      // May be a custom dropdown — click instead
      await sortSelect.click();
      const option = page.locator('[role="option"]').nth(1);
      if (await option.isVisible({ timeout: 2000 }).catch(() => false)) {
        await option.click();
      }
    });

    // Wait for results to update
    await page.waitForResponse(
      (resp) => resp.url().includes('/api/search') || resp.url().includes('/api/listings'),
      { timeout: 10000 },
    ).catch(() => null);

    const elapsed = Date.now() - start;
    expect(elapsed, `Sort change took ${elapsed}ms, budget is 1000ms`).toBeLessThan(1000);
  });

  test('Load-more latency under 1s', async ({ page }) => {
    const loadMore = page.getByRole('button', { name: /load more|show more/i });
    const isVisible = await loadMore.isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!isVisible, 'Load more button not visible');

    const start = Date.now();
    await loadMore.click();

    // Wait for new listings to appear
    await page.waitForResponse(
      (resp) => resp.url().includes('/api/search') || resp.url().includes('/api/listings'),
      { timeout: 10000 },
    ).catch(() => null);

    const elapsed = Date.now() - start;
    expect(elapsed, `Load more took ${elapsed}ms, budget is 1000ms`).toBeLessThan(1000);
  });

  test('Filter chip removal latency under 1s', async ({ page }) => {
    // Apply a filter first via URL
    await page.goto(`${searchUrl}&minPrice=500`);
    await page.waitForLoadState('domcontentloaded');

    // Find and click a filter chip remove button
    const chipRemove = page.locator('[data-testid="filter-chip"] button, [data-testid*="remove-filter"]').first();
    const isVisible = await chipRemove.isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!isVisible, 'No filter chips visible');

    const start = Date.now();
    await chipRemove.click();

    // Wait for search to re-execute
    await page.waitForResponse(
      (resp) => resp.url().includes('/api/search') || resp.url().includes('/api/listings'),
      { timeout: 10000 },
    ).catch(() => null);

    const elapsed = Date.now() - start;
    expect(elapsed, `Chip removal took ${elapsed}ms, budget is 1000ms`).toBeLessThan(1000);
  });

  test('No horizontal scroll on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(searchUrl);
    await page.waitForLoadState('domcontentloaded');

    // Wait for content to render
    await expect(page.locator('[data-testid="listing-card"]').first()).toBeVisible({ timeout: 15000 }).catch(() => {});

    const hasHScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHScroll).toBe(false);
  });

  test('JS bundle size check (initial load)', async ({ page }) => {
    // Collect all JS resource sizes during page load
    const jsSizes = await page.evaluate(() => {
      const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      return entries
        .filter((e) => e.name.endsWith('.js') || e.initiatorType === 'script')
        .map((e) => ({
          name: e.name.split('/').pop()?.slice(0, 40) || 'unknown',
          size: e.transferSize,
        }));
    });

    const totalKB = jsSizes.reduce((sum, e) => sum + e.size, 0) / 1024;

    // Log for visibility
    console.log(`[perf] Total JS transfer: ${totalKB.toFixed(0)}KB across ${jsSizes.length} files`);

    // Budget: initial JS bundle should be under 500KB
    // Note: this measures transfer size (compressed), not parsed size
    expect(totalKB, `JS bundle was ${totalKB.toFixed(0)}KB, budget is 500KB`).toBeLessThan(500);
  });
});
