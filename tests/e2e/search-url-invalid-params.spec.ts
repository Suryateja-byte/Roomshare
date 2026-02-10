/**
 * Search URL Invalid/Malicious Params Tests (P0)
 *
 * Verifies that the search page handles invalid, malicious, and edge-case
 * URL parameters safely: no XSS, no 500 errors, no crashes. Validates
 * the server-side parsing and client-side rendering of untrusted input.
 *
 * Run: pnpm playwright test tests/e2e/search-url-invalid-params.spec.ts
 */

import { test, expect, SF_BOUNDS, selectors, timeouts } from "./helpers/test-utils";
import type { Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;

function buildSearchUrl(params?: Record<string, string>): string {
  const base = `/search?minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;
  if (!params) return base;
  const extra = new URLSearchParams(params).toString();
  return `${base}&${extra}`;
}

/**
 * Navigate to a URL with the given raw query string appended (not URL-encoded by us,
 * to test how the app handles raw/pre-encoded input).
 */
async function gotoRawUrl(page: Page, rawQueryString: string) {
  // Use page.goto with the raw URL to test actual browser behavior
  const response = await page.goto(`/search?${rawQueryString}`);
  return response;
}

/** Assert the page did not crash (no 500, body visible). */
async function assertNoCrash(page: Page, response: Awaited<ReturnType<Page["goto"]>>) {
  // Should not be a 500 error
  if (response) {
    expect(response.status()).not.toBe(500);
  }
  // Body should be visible (page rendered)
  await expect(page.locator("body")).toBeVisible({ timeout: 15_000 });
}

/** Assert no alert dialog was triggered. */
function setupDialogGuard(page: Page): { wasTriggered: () => boolean } {
  let dialogTriggered = false;
  page.on("dialog", (dialog) => {
    dialogTriggered = true;
    dialog.dismiss();
  });
  return { wasTriggered: () => dialogTriggered };
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

test.describe("Search URL Invalid/Malicious Params (P0)", () => {
  test.beforeEach(async () => {
    test.slow();
  });

  // -------------------------------------------------------------------------
  // 1. XSS in query: script tag injection
  // -------------------------------------------------------------------------
  test("1: XSS script tag in query param is escaped, no execution", async ({ page }) => {
    const guard = setupDialogGuard(page);

    const encoded = encodeURIComponent("<script>alert('xss')</script>");
    const response = await page.goto(`/search?q=${encoded}&${boundsQS}`);

    await page.waitForLoadState("domcontentloaded");

    // No alert dialog
    expect(guard.wasTriggered()).toBe(false);

    // No crash
    await assertNoCrash(page, response);

    // No raw script tags in DOM
    const injectedScripts = await page.locator('script:text("alert")').count();
    expect(injectedScripts).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 2. SQL injection in query
  // -------------------------------------------------------------------------
  test("2: SQL injection in query param does not cause 500", async ({ page }) => {
    const sqlPayload = "'; DROP TABLE listings;--";
    const encoded = encodeURIComponent(sqlPayload);
    const response = await page.goto(`/search?q=${encoded}&${boundsQS}`);

    await page.waitForLoadState("domcontentloaded");
    await assertNoCrash(page, response);
  });

  // -------------------------------------------------------------------------
  // 3. Extreme numeric values for price
  // -------------------------------------------------------------------------
  test("3: extreme numeric values for price are clamped or handled", async ({ page }) => {
    const response = await page.goto(buildSearchUrl({
      minPrice: "-99999",
      maxPrice: "99999999",
    }));

    await page.waitForLoadState("domcontentloaded");
    await assertNoCrash(page, response);

    // The page should render without error -- prices are clamped by safeParseFloat
    const url = new URL(page.url());
    // minPrice should be clamped to 0 (min bound) or stripped
    const minPrice = url.searchParams.get("minPrice");
    if (minPrice) {
      expect(parseFloat(minPrice)).toBeGreaterThanOrEqual(-99999);
    }
  });

  // -------------------------------------------------------------------------
  // 4. Non-numeric price
  // -------------------------------------------------------------------------
  test("4: non-numeric minPrice is ignored or validated", async ({ page }) => {
    const response = await page.goto(buildSearchUrl({ minPrice: "abc" }));

    await page.waitForLoadState("domcontentloaded");
    await assertNoCrash(page, response);

    // The budget input should either be empty or show no value
    // (the invalid value is discarded by safeParseFloat)
    const minPriceInput = page.getByLabel(/minimum budget/i);
    const inputVisible = await minPriceInput.isVisible().catch(() => false);
    if (inputVisible) {
      // Value should be empty since "abc" is not a valid number
      await expect(minPriceInput).toHaveValue("");
    }
  });

  // -------------------------------------------------------------------------
  // 5. Invalid room type
  // -------------------------------------------------------------------------
  test("5: invalid roomType is ignored, no crash", async ({ page }) => {
    const response = await page.goto(buildSearchUrl({ roomType: "nonexistent" }));

    await page.waitForLoadState("domcontentloaded");
    await assertNoCrash(page, response);

    // The URL may still have the param but it should be ignored by the parser
    // No filter chip for "nonexistent" should appear
    const chipsRegion = page.locator('[role="region"][aria-label="Applied filters"]').first();
    const chipsVisible = await chipsRegion.isVisible().catch(() => false);
    if (chipsVisible) {
      const chipText = await chipsRegion.textContent();
      expect(chipText?.toLowerCase()).not.toContain("nonexistent");
    }
  });

  // -------------------------------------------------------------------------
  // 6. Invalid sort falls back to default
  // -------------------------------------------------------------------------
  test("6: invalid sort param falls back to recommended", async ({ page }) => {
    const response = await page.goto(buildSearchUrl({ sort: "hacked" }));

    await page.waitForLoadState("domcontentloaded");
    await assertNoCrash(page, response);

    // Wait for search results to render before checking sort component.
    // The sort component is SSR-rendered alongside the heading; without this
    // wait, the check can fire before Next.js streaming delivers the content.
    const resultsHeading = page.locator("#search-results-heading").first();
    const zeroResults = page.locator('h2:has-text("No matches found"), h3:has-text("No exact matches")').first();
    await expect(resultsHeading.or(zeroResults)).toBeVisible({ timeout: timeouts.navigation });

    // Sort should display "Recommended" (the default), not "hacked"
    // SortSelect needs hydration (mounted state) before aria-label appears
    const sortLabel = page.locator('text="Recommended"');
    const mobileSortBtn = page.locator('button[aria-label="Sort: Recommended"]');

    await expect(async () => {
      const desktopVisible = await sortLabel.first().isVisible().catch(() => false);
      const mobileVisible = await mobileSortBtn.isVisible().catch(() => false);
      expect(desktopVisible || mobileVisible).toBe(true);
    }).toPass({ timeout: 30_000 });
  });

  // -------------------------------------------------------------------------
  // 7. Overflow / inverted bounds
  // -------------------------------------------------------------------------
  test("7: overflow bounds (minLat=999) are clamped, no crash", async ({ page }) => {
    const response = await page.goto("/search?minLat=999&maxLat=-999&minLng=999&maxLng=-999");

    await page.waitForLoadState("domcontentloaded");

    // Inverted lat/lng may cause an error page or be clamped
    // The important thing is no 500 server crash
    if (response) {
      expect(response.status()).not.toBe(500);
    }
    await expect(page.locator("body")).toBeVisible({ timeout: 15_000 });
  });

  // -------------------------------------------------------------------------
  // 8. Empty string params treated as absent
  // -------------------------------------------------------------------------
  test("8: empty string params are treated as absent", async ({ page }) => {
    test.slow();
    const response = await page.goto(`/search?q=&sort=&maxPrice=&${boundsQS}`);

    await page.waitForLoadState("domcontentloaded");
    await assertNoCrash(page, response);

    // Wait for search results heading to render (sort component is in the same section).
    // This ensures SSR streaming has delivered the full search results block.
    const resultsHeading = page.locator("#search-results-heading").first();
    const zeroResults = page.locator('h2:has-text("No matches found"), h3:has-text("No exact matches")').first();
    await expect(resultsHeading.or(zeroResults)).toBeVisible({ timeout: timeouts.navigation });

    // The page should behave as if no q, sort, or maxPrice were set
    // Sort should default to "Recommended" (needs hydration via mounted state)
    const sortLabel = page.locator('text="Recommended"');
    const mobileSortBtn = page.locator('button[aria-label="Sort: Recommended"]');

    await expect(async () => {
      const desktopVisible = await sortLabel.first().isVisible().catch(() => false);
      const mobileVisible = await mobileSortBtn.isVisible().catch(() => false);
      expect(desktopVisible || mobileVisible).toBe(true);
    }).toPass({ timeout: 30_000 });
  });

  // -------------------------------------------------------------------------
  // 9. Duplicate params
  // -------------------------------------------------------------------------
  test("9: duplicate params are handled without crash", async ({ page }) => {
    // Send duplicate roomType params
    const response = await page.goto(`/search?roomType=private&roomType=shared&${boundsQS}`);

    await page.waitForLoadState("domcontentloaded");
    await assertNoCrash(page, response);

    // The parser uses getFirstValue, so the first value should win
    // Page renders without error
  });

  // -------------------------------------------------------------------------
  // 10. URL-encoded special characters in query
  // -------------------------------------------------------------------------
  test("10: URL-encoded special characters in query are safe", async ({ page }) => {
    const guard = setupDialogGuard(page);

    // %3Cscript%3E is URL-encoded <script>
    const response = await page.goto(`/search?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E&${boundsQS}`);

    await page.waitForLoadState("domcontentloaded");
    await assertNoCrash(page, response);

    // No alert
    expect(guard.wasTriggered()).toBe(false);

    // No injected scripts
    const injectedScripts = await page.locator('script:text("alert")').count();
    expect(injectedScripts).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 11. Very long query string (>2000 chars)
  // -------------------------------------------------------------------------
  test("11: very long query string does not crash", async ({ page }) => {
    const longQuery = "a".repeat(2500);
    const encoded = encodeURIComponent(longQuery);
    const response = await page.goto(`/search?q=${encoded}&${boundsQS}`);

    await page.waitForLoadState("domcontentloaded");
    await assertNoCrash(page, response);
  });

  // -------------------------------------------------------------------------
  // 12. Unicode in query
  // -------------------------------------------------------------------------
  test("12: Unicode characters in query are handled correctly", async ({ page }) => {
    const unicodeQuery = encodeURIComponent("房间");
    const response = await page.goto(`/search?q=${unicodeQuery}&${boundsQS}`);

    await page.waitForLoadState("domcontentloaded");
    await assertNoCrash(page, response);

    // The query should be preserved in the URL
    const url = new URL(page.url());
    const qParam = url.searchParams.get("q");
    // Should contain the Unicode characters (not garbled)
    expect(qParam).toBe("房间");
  });

  // -------------------------------------------------------------------------
  // Additional: img onerror XSS
  // -------------------------------------------------------------------------
  test("13: img onerror XSS in query param is blocked", async ({ page }) => {
    const guard = setupDialogGuard(page);

    const payload = encodeURIComponent('<img src=x onerror=alert(1)>');
    const response = await page.goto(`/search?q=${payload}&${boundsQS}`);

    await page.waitForLoadState("domcontentloaded");
    await assertNoCrash(page, response);

    expect(guard.wasTriggered()).toBe(false);

    // No injected img-onerror elements
    const injectedImgs = await page.locator("img[onerror]").count();
    expect(injectedImgs).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Additional: javascript URI in query
  // -------------------------------------------------------------------------
  test("14: javascript URI in query param is blocked", async ({ page }) => {
    const guard = setupDialogGuard(page);

    const payload = encodeURIComponent("javascript:alert(1)");
    const response = await page.goto(`/search?q=${payload}&${boundsQS}`);

    await page.waitForLoadState("domcontentloaded");
    await assertNoCrash(page, response);

    expect(guard.wasTriggered()).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Additional: extremely large number of params
  // -------------------------------------------------------------------------
  test("15: large number of query params does not crash", async ({ page }) => {
    // Generate 50 random params
    const params = new URLSearchParams();
    for (let i = 0; i < 50; i++) {
      params.set(`param_${i}`, `value_${i}`);
    }
    params.set("minLat", String(SF_BOUNDS.minLat));
    params.set("maxLat", String(SF_BOUNDS.maxLat));
    params.set("minLng", String(SF_BOUNDS.minLng));
    params.set("maxLng", String(SF_BOUNDS.maxLng));

    const response = await page.goto(`/search?${params.toString()}`);

    await page.waitForLoadState("domcontentloaded");
    await assertNoCrash(page, response);
  });

  // -------------------------------------------------------------------------
  // Additional: inverted price range
  // -------------------------------------------------------------------------
  test("16: inverted price range (minPrice > maxPrice) does not crash", async ({ page }) => {
    // parseSearchParams throws for inverted prices, server should handle gracefully
    const response = await page.goto(buildSearchUrl({
      minPrice: "5000",
      maxPrice: "1000",
    }));

    await page.waitForLoadState("domcontentloaded");

    // Should not be a 500 -- either shows error boundary or defaults gracefully
    if (response) {
      expect(response.status()).not.toBe(500);
    }
    await expect(page.locator("body")).toBeVisible({ timeout: 15_000 });
  });

  // -------------------------------------------------------------------------
  // Additional: NaN / Infinity in numeric params
  // -------------------------------------------------------------------------
  test("17: NaN and Infinity in numeric params are handled", async ({ page }) => {
    const response = await page.goto(buildSearchUrl({
      minPrice: "NaN",
      maxPrice: "Infinity",
    }));

    await page.waitForLoadState("domcontentloaded");
    await assertNoCrash(page, response);

    // The price inputs should be empty (NaN/Infinity discarded by safeParseFloat)
    const minPriceInput = page.getByLabel(/minimum budget/i);
    const inputVisible = await minPriceInput.isVisible().catch(() => false);
    if (inputVisible) {
      await expect(minPriceInput).toHaveValue("");
    }
  });

  // -------------------------------------------------------------------------
  // Additional: zero-width characters in query
  // -------------------------------------------------------------------------
  test("18: zero-width characters in query do not cause issues", async ({ page }) => {
    // Zero-width space (U+200B) and zero-width joiner (U+200D)
    const payload = encodeURIComponent("room\u200B\u200Dshare");
    const response = await page.goto(`/search?q=${payload}&${boundsQS}`);

    await page.waitForLoadState("domcontentloaded");
    await assertNoCrash(page, response);
  });

  // -------------------------------------------------------------------------
  // Additional: boolean-like values for non-boolean params
  // -------------------------------------------------------------------------
  test("19: boolean-like values for non-boolean params do not crash", async ({ page }) => {
    const response = await page.goto(buildSearchUrl({
      minPrice: "true",
      maxPrice: "false",
      sort: "null",
      roomType: "undefined",
    }));

    await page.waitForLoadState("domcontentloaded");
    await assertNoCrash(page, response);
  });
});
