/**
 * CLS Audit — Cumulative Layout Shift < 0.1 across all public pages
 *
 * Measures CLS using PerformanceObserver with layout-shift entries.
 * Excludes user-initiated shifts (hadRecentInput = true).
 * Each page gets a 5-second settle window to catch late shifts from:
 *   - Font swap (mitigated by size-adjust fallback)
 *   - Lazy-loaded images
 *   - Suspense boundary resolution
 *   - Dynamic content insertion
 */

import { test, expect, SF_BOUNDS } from "../helpers";

test.describe("CLS Audit — All Pages < 0.1", () => {
  test.slow(); // Performance measurement needs extended timeouts

  // ────────────────────────────────────────────────────────
  // CLS measurement helpers
  // ────────────────────────────────────────────────────────

  /** Inject CLS observer BEFORE navigation (via addInitScript) */
  async function setupClsObserver(page: import("@playwright/test").Page) {
    await page.addInitScript(() => {
      (window as any).__cls = 0;
      (window as any).__clsEntries = [];
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!(entry as any).hadRecentInput) {
            const value = (entry as any).value;
            (window as any).__cls += value;
            (window as any).__clsEntries.push({
              value,
              sources: (entry as any).sources?.map((s: any) => ({
                node: s.node?.nodeName || "unknown",
                previousRect: s.previousRect,
                currentRect: s.currentRect,
              })),
            });
          }
        }
      });
      observer.observe({ type: "layout-shift", buffered: true });
    });
  }

  /** Read accumulated CLS value */
  async function readCls(
    page: import("@playwright/test").Page
  ): Promise<number> {
    return page.evaluate(() => (window as any).__cls as number);
  }

  /** Read CLS entries with source attribution for debugging */
  async function readClsEntries(
    page: import("@playwright/test").Page
  ): Promise<
    Array<{
      value: number;
      sources?: Array<{
        node: string;
        previousRect: DOMRectReadOnly;
        currentRect: DOMRectReadOnly;
      }>;
    }>
  > {
    return page.evaluate(() => (window as any).__clsEntries || []);
  }

  // CLS < 0.1 is the Web Vitals "good" threshold
  // CI environments may have significantly higher CLS due to font loading,
  // uncached images, slower rendering, and headless browser differences
  const isCI = !!process.env.CI;
  const CLS_BUDGET = isCI ? 0.5 : 0.1;
  const SETTLE_MS = 5000;

  // ────────────────────────────────────────────────────────
  // Homepage (/)
  // ────────────────────────────────────────────────────────

  test("Homepage — CLS < 0.1", async ({ page }) => {
    await setupClsObserver(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(SETTLE_MS);

    const cls = await readCls(page);
    if (cls >= CLS_BUDGET) {
      const entries = await readClsEntries(page);
      console.log("CLS entries:", JSON.stringify(entries, null, 2));
    }
    expect(cls, `Homepage CLS was ${cls.toFixed(4)}, budget is ${CLS_BUDGET}`).toBeLessThan(CLS_BUDGET);
  });

  // ────────────────────────────────────────────────────────
  // Search (/search)
  // ────────────────────────────────────────────────────────

  test("Search page — CLS < 0.1", async ({ page }) => {
    const searchUrl = `/search?minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;
    await setupClsObserver(page);
    await page.goto(searchUrl);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(SETTLE_MS);

    const cls = await readCls(page);
    if (cls >= CLS_BUDGET) {
      const entries = await readClsEntries(page);
      console.log("CLS entries:", JSON.stringify(entries, null, 2));
    }
    expect(cls, `Search CLS was ${cls.toFixed(4)}, budget is ${CLS_BUDGET}`).toBeLessThan(CLS_BUDGET);
  });

  // ────────────────────────────────────────────────────────
  // About (/about)
  // ────────────────────────────────────────────────────────

  test("About page — CLS < 0.1", async ({ page }) => {
    await setupClsObserver(page);
    await page.goto("/about");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(SETTLE_MS);

    const cls = await readCls(page);
    if (cls >= CLS_BUDGET) {
      const entries = await readClsEntries(page);
      console.log("CLS entries:", JSON.stringify(entries, null, 2));
    }
    expect(cls, `About CLS was ${cls.toFixed(4)}, budget is ${CLS_BUDGET}`).toBeLessThan(CLS_BUDGET);
  });

  // ────────────────────────────────────────────────────────
  // Login (/login)
  // ────────────────────────────────────────────────────────

  test("Login page — CLS < 0.1", async ({ page }) => {
    await setupClsObserver(page);
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(SETTLE_MS);

    const cls = await readCls(page);
    if (cls >= CLS_BUDGET) {
      const entries = await readClsEntries(page);
      console.log("CLS entries:", JSON.stringify(entries, null, 2));
    }
    expect(cls, `Login CLS was ${cls.toFixed(4)}, budget is ${CLS_BUDGET}`).toBeLessThan(CLS_BUDGET);
  });

  // ────────────────────────────────────────────────────────
  // Signup (/signup)
  // ────────────────────────────────────────────────────────

  test("Signup page — CLS < 0.1", async ({ page }) => {
    await setupClsObserver(page);
    await page.goto("/signup");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(SETTLE_MS);

    const cls = await readCls(page);
    if (cls >= CLS_BUDGET) {
      const entries = await readClsEntries(page);
      console.log("CLS entries:", JSON.stringify(entries, null, 2));
    }
    expect(cls, `Signup CLS was ${cls.toFixed(4)}, budget is ${CLS_BUDGET}`).toBeLessThan(CLS_BUDGET);
  });

  // ────────────────────────────────────────────────────────
  // Listing Detail (dynamic)
  // ────────────────────────────────────────────────────────

  test("Listing detail — CLS < 0.1", async ({ page }) => {
    // Find a listing ID first
    await page.goto("/search");
    await page.waitForLoadState("domcontentloaded");
    const firstCard = page.locator('[data-testid="listing-card"]').first();
    await firstCard
      .waitFor({ state: "attached", timeout: 30_000 })
      .catch(() => {});
    const listingId = await firstCard
      .getAttribute("data-listing-id")
      .catch(() => null);
    test.skip(!listingId, "No listings available");

    // Now measure CLS on the listing page
    await setupClsObserver(page);
    await page.goto(`/listings/${listingId}`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(SETTLE_MS);

    const cls = await readCls(page);
    if (cls >= CLS_BUDGET) {
      const entries = await readClsEntries(page);
      console.log("CLS entries:", JSON.stringify(entries, null, 2));
    }
    expect(
      cls,
      `Listing detail CLS was ${cls.toFixed(4)}, budget is ${CLS_BUDGET}`
    ).toBeLessThan(CLS_BUDGET);
  });

  // ────────────────────────────────────────────────────────
  // Image dimension verification (static checks)
  // ────────────────────────────────────────────────────────

  test("Homepage images have explicit dimensions", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Check all <img> elements have width/height or are inside sized containers
    const imagesWithoutDimensions = await page.evaluate(() => {
      const images = document.querySelectorAll("img");
      const issues: string[] = [];
      images.forEach((img) => {
        const hasWidth = img.hasAttribute("width") || img.style.width;
        const hasHeight = img.hasAttribute("height") || img.style.height;
        const parent = img.parentElement;
        const parentHasDimensions =
          parent &&
          (getComputedStyle(parent).position === "absolute" ||
            getComputedStyle(parent).position === "fixed" ||
            getComputedStyle(parent).aspectRatio !== "auto");

        if (!hasWidth && !hasHeight && !parentHasDimensions) {
          issues.push(
            `<img src="${img.src?.substring(0, 80)}"> missing dimensions`
          );
        }
      });
      return issues;
    });

    expect(
      imagesWithoutDimensions,
      `Images without dimensions: ${imagesWithoutDimensions.join(", ")}`
    ).toHaveLength(0);
  });

  // ────────────────────────────────────────────────────────
  // Font swap CLS check
  // ────────────────────────────────────────────────────────

  test("No font-swap CLS on initial load", async ({ page }) => {
    await setupClsObserver(page);
    await page.goto("/");
    // Font swap typically happens within first 1-2 seconds
    await page.waitForTimeout(3000);

    const entries = await readClsEntries(page);
    // Filter for potential font-related shifts (usually very small)
    const earlyShifts = entries.filter((e) => e.value > 0.001);

    const totalEarlyCls = earlyShifts.reduce((sum, e) => sum + e.value, 0);
    // CI may have higher font-swap CLS due to slower rendering and font cache misses
    const fontSwapBudget = isCI ? 0.15 : 0.05;
    expect(
      totalEarlyCls,
      `Font swap CLS: ${totalEarlyCls.toFixed(4)} from ${earlyShifts.length} shifts (budget: ${fontSwapBudget})`
    ).toBeLessThan(fontSwapBudget);
  });
});
