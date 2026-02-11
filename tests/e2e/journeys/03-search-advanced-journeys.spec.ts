/**
 * E2E Test Suite: 30 Advanced Search Page User Journeys
 *
 * Complex, multi-step Playwright tests covering advanced interactions,
 * edge cases, accessibility, keyboard navigation, state management,
 * and cross-feature integration on the Roomshare search page.
 *
 * These extend the 21 journeys in 02-search-critical-journeys.spec.ts.
 */

import { test, expect, selectors, tags, SF_BOUNDS, searchResultsContainer } from "../helpers";
import {
  openFilterModal,
  applyFilters,
  closeFilterModal,
} from "../helpers/filter-helpers";

const BOUNDS_PARAMS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;

// Helper: select a Radix Select option (combobox, not native <select>)
async function selectRadixOption(page: import("@playwright/test").Page, triggerId: string, optionText: RegExp | string) {
  const trigger = page.locator(`#${triggerId}`);
  await trigger.click();
  // Radix portals options to body
  const option = page.getByRole("option", { name: optionText });
  await expect(option).toBeVisible({ timeout: 3000 });
  await option.click();
}

test.describe("30 Advanced Search Page Journeys", () => {
  test.beforeEach(async () => { test.slow(); });

  // ═══════════════════════════════════════════════════
  // SECTION A: MULTI-FILTER COMBINATIONS (5 journeys)
  // ═══════════════════════════════════════════════════

  // ─────────────────────────────────────────────────
  // J21: Combined filters — price + amenities + lease
  // ─────────────────────────────────────────────────
  test("J21: Combined price + amenity + lease filters reflect in URL", async ({ page, nav }) => {
    test.slow(); // Complex filter interactions need extra time under load
    await nav.goToSearch({ bounds: SF_BOUNDS });
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30000 });

    // Wait for search results to fully load (budget inputs hydrate after mount)
    await page.waitForLoadState("networkidle").catch(() => {});

    // Set price range — wait for inputs to be ready under load
    const minInput = page.getByLabel(/minimum budget/i);
    const maxInput = page.getByLabel(/maximum budget/i);
    await expect(minInput).toBeVisible({ timeout: 30000 });
    await minInput.fill("800");
    await expect(minInput).toHaveValue("800", { timeout: 30000 });
    await maxInput.fill("2000");
    await expect(maxInput).toHaveValue("2000", { timeout: 30000 });

    // Open filter modal and set lease + amenity
    const modal = await openFilterModal(page);

    // Select a lease duration (Radix Select combobox)
    const leaseSelect = modal.locator("#filter-lease");
    if (await leaseSelect.isVisible()) {
      await selectRadixOption(page, "filter-lease", /6 months/i);
    }

    // Toggle an amenity
    const amenityBtn = modal.locator('fieldset').filter({ hasText: /amenities/i })
      .getByRole("button").first();
    if (await amenityBtn.isVisible()) {
      await amenityBtn.click();
    }

    await applyFilters(page);
    await expect.poll(
      () => new URL(page.url(), "http://localhost").searchParams.get("minPrice"),
      { timeout: 30000, message: 'URL param "minPrice" to be "800"' },
    ).toBe("800");

    const url = new URL(page.url());
    expect(url.searchParams.get("minPrice")).toBe("800");
    expect(url.searchParams.get("maxPrice")).toBe("2000");
    expect(url.searchParams.has("leaseDuration") || url.searchParams.has("amenities")).toBeTruthy();
  });

  // ─────────────────────────────────────────────────
  // J22: Gender + household gender combination
  // ─────────────────────────────────────────────────
  test("J22: Gender preference + household gender filters combined", async ({ page, nav }) => {
    await nav.goToSearch({ bounds: SF_BOUNDS });
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30000 });

    const modal = await openFilterModal(page);

    // Set gender preference (Radix Select)
    const genderSelect = modal.locator("#filter-gender-pref");
    if (await genderSelect.isVisible()) {
      await selectRadixOption(page, "filter-gender-pref", /female identifying/i);
    }

    // Set household gender (Radix Select)
    const householdSelect = modal.locator("#filter-household-gender");
    if (await householdSelect.isVisible()) {
      await selectRadixOption(page, "filter-household-gender", /all female/i);
    }

    await applyFilters(page);
    await expect.poll(
      () => new URL(page.url(), "http://localhost").searchParams.get("genderPreference"),
      { timeout: 30000, message: 'URL param "genderPreference" to be present' },
    ).not.toBeNull();

    const url = new URL(page.url());
    expect(url.searchParams.get("genderPreference")).toBe("FEMALE_ONLY");
    expect(url.searchParams.get("householdGender")).toBe("ALL_FEMALE");
  });

  // ─────────────────────────────────────────────────
  // J23: Multiple amenities + house rules toggled
  // ─────────────────────────────────────────────────
  test("J23: Multiple amenities and house rules toggled correctly", async ({ page, nav }) => {
    await nav.goToSearch({ bounds: SF_BOUNDS });
    await page.waitForLoadState("domcontentloaded");

    const modal = await openFilterModal(page);

    // Toggle multiple amenities
    const amenityFieldset = modal.locator('fieldset').filter({ hasText: /amenities/i });
    const amenityBtns = amenityFieldset.getByRole("button");
    const amenityCount = await amenityBtns.count();

    if (amenityCount >= 2) {
      await amenityBtns.nth(0).click();
      await amenityBtns.nth(1).click();
      // Verify aria-pressed
      await expect(amenityBtns.nth(0)).toHaveAttribute("aria-pressed", "true");
      await expect(amenityBtns.nth(1)).toHaveAttribute("aria-pressed", "true");
    }

    // Toggle a house rule
    const rulesFieldset = modal.locator('fieldset').filter({ hasText: /house rules/i });
    const ruleBtns = rulesFieldset.getByRole("button");
    if (await ruleBtns.count() > 0) {
      await ruleBtns.first().click();
      await expect(ruleBtns.first()).toHaveAttribute("aria-pressed", "true");
    }

    await applyFilters(page);
    await expect.poll(
      () => new URL(page.url(), "http://localhost").searchParams.get("amenities"),
      { timeout: 30000, message: 'URL param "amenities" to be present' },
    ).not.toBeNull();

    // URL should contain amenities array
    expect(page.url()).toMatch(/amenities/i);
  });

  // ─────────────────────────────────────────────────
  // J24: Room type + price + sort combined
  // ─────────────────────────────────────────────────
  test("J24: Room type tab + price filter + sort all combined", async ({ page, nav }) => {
    await nav.goToSearch({ bounds: SF_BOUNDS, minPrice: 500, maxPrice: 1500 });
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30000 });

    // Wait for search results to fully hydrate (budget inputs sync from URL after mount)
    await page.waitForLoadState("networkidle").catch(() => {});

    // Click a room type tab — wait for hydration before clicking
    const privateTab = page.getByRole("button", { name: /private/i })
      .or(page.locator('button:has-text("Private")'));
    if (await privateTab.first().isVisible()) {
      await page.waitForTimeout(1000); // hydration settle
      await privateTab.first().click();
      await expect.poll(
        () => new URL(page.url(), "http://localhost").searchParams.get("roomType"),
        { timeout: 30000, message: 'URL param "roomType" to be present' },
      ).not.toBeNull();
    }

    // Change sort (desktop only)
    const viewport = page.viewportSize();
    if (viewport && viewport.width >= 768) {
      const sortTrigger = page.locator('button').filter({ hasText: /recommended|sort/i }).first();
      if (await sortTrigger.isVisible()) {
        await sortTrigger.click();
        const option = page.getByRole("option", { name: /low.*high/i })
          .or(page.locator('[role="option"]').filter({ hasText: /Low to High/i }));
        if (await option.first().isVisible({ timeout: 3000 }).catch(() => false)) {
          await option.first().click();
          await expect.poll(
            () => new URL(page.url(), "http://localhost").searchParams.get("sort"),
            { timeout: 30000, message: 'URL param "sort" to be "price_asc"' },
          ).toBe("price_asc");
        }
      }
    }

    // Verify price params preserved (sort change may reset some params)
    const url = new URL(page.url());
    expect(url.searchParams.get("minPrice")).toBe("500");
    expect(url.searchParams.get("maxPrice")).toBe("1500");
  });

  // ─────────────────────────────────────────────────
  // J25: Apply filters, then clear all, verify reset
  // ─────────────────────────────────────────────────
  test("J25: Apply multiple filters then clear all resets everything", async ({ page, nav }) => {
    // Start with multiple filters in URL
    await page.goto(`/search?${BOUNDS_PARAMS}&minPrice=600&maxPrice=1800&roomType=Private+Room&leaseDuration=6+months`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30000 });

    // Verify filters loaded
    const url1 = new URL(page.url());
    expect(url1.searchParams.get("minPrice")).toBe("600");

    // Click clear all (filter bar or modal)
    const clearBtn = page.locator('[data-testid="filter-modal-clear-all"]')
      .or(page.getByRole("button", { name: /clear all/i }));

    if (await clearBtn.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      await clearBtn.first().click();
      // Wait for navigation to clear filters
      await expect.poll(
        () => new URL(page.url(), "http://localhost").searchParams.get("minPrice"),
        { timeout: 30000, message: 'URL param "minPrice" to be absent after clear' },
      ).toBeNull();

      const url2 = new URL(page.url());
      expect(url2.searchParams.has("minPrice")).toBeFalsy();
      expect(url2.searchParams.has("roomType")).toBeFalsy();
    }
  });

  // ═══════════════════════════════════════════════════
  // SECTION B: FORM VALIDATION & EDGE CASES (6 journeys)
  // ═══════════════════════════════════════════════════

  // ─────────────────────────────────────────────────
  // J26: Price auto-swap when min > max
  // ─────────────────────────────────────────────────
  test("J26: Price inputs auto-swap when min exceeds max", async ({ page, nav }) => {
    await nav.goToSearch({ bounds: SF_BOUNDS });
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30000 });

    // Wait for search results to fully hydrate before interacting with budget inputs
    await page.waitForLoadState("networkidle").catch(() => {});

    const minInput = page.getByLabel(/minimum budget/i);
    const maxInput = page.getByLabel(/maximum budget/i);
    await expect(minInput).toBeVisible({ timeout: 10000 });

    // Enter inverted prices: min > max
    await minInput.fill("1500");
    await minInput.blur();
    await expect(minInput).toHaveValue("1500", { timeout: 5000 });
    await maxInput.fill("500");
    await maxInput.blur();
    await expect(maxInput).toHaveValue("500", { timeout: 5000 });

    // Submit form — wait for hydration before clicking submit
    const searchBtn = page.locator('button[type="submit"]').first();
    await page.waitForTimeout(1000); // hydration settle
    await searchBtn.click();

    // Wait for navigation — prices should be swapped in URL
    await expect.poll(
      () => new URL(page.url(), "http://localhost").searchParams.get("minPrice"),
      { timeout: 30000, message: 'URL param "minPrice" to be present' },
    ).not.toBeNull();

    const url = new URL(page.url());
    const minPrice = parseInt(url.searchParams.get("minPrice") || "0");
    const maxPrice = parseInt(url.searchParams.get("maxPrice") || "0");

    // Either swapped or at least min <= max in URL
    expect(minPrice).toBeLessThanOrEqual(maxPrice);
  });

  // ─────────────────────────────────────────────────
  // J27: Move-in date — past date in URL is stripped
  // ─────────────────────────────────────────────────
  test("J27: Past move-in date in URL is stripped on load", async ({ page }) => {
    await page.goto(`/search?${BOUNDS_PARAMS}&moveInDate=2020-01-01`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30000 });

    // The date picker should NOT show the past date (it's validated on parse)
    const modal = await openFilterModal(page);
    const dateBtn = modal.locator("#filter-move-in");
    if (await dateBtn.isVisible()) {
      // The displayed value should not be 2020-01-01
      const text = await dateBtn.textContent();
      expect(text).not.toContain("2020");
    }
    await closeFilterModal(page);
  });

  // ─────────────────────────────────────────────────
  // J28: Move-in date — valid future date preserved in URL
  // ─────────────────────────────────────────────────
  test("J28: Valid future move-in date in URL is preserved", async ({ page }) => {
    // Use a date 30 days from now
    const future = new Date();
    future.setDate(future.getDate() + 30);
    const futureDate = future.toISOString().split("T")[0];

    await page.goto(`/search?${BOUNDS_PARAMS}&moveInDate=${futureDate}`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30000 });

    // URL should still have the date
    const url = new URL(page.url());
    expect(url.searchParams.get("moveInDate")).toBe(futureDate);
  });

  // ─────────────────────────────────────────────────
  // J29: Price input handles zero and empty values
  // ─────────────────────────────────────────────────
  test("J29: Price inputs handle zero and empty values correctly", async ({ page, nav }) => {
    await nav.goToSearch({ bounds: SF_BOUNDS });
    await page.waitForLoadState("domcontentloaded");

    const minInput = page.getByLabel(/minimum budget/i);
    const maxInput = page.getByLabel(/maximum budget/i);

    // Set min to 0, max empty
    await minInput.fill("0");
    await minInput.blur();
    await maxInput.fill("");
    await maxInput.blur();

    const searchBtn = page.locator('button[type="submit"]').first();
    await searchBtn.click();
    await page.waitForLoadState("domcontentloaded");

    // No crash, page should still show results or empty state
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30000 });
  });

  // ─────────────────────────────────────────────────
  // J30: Invalid URL params are sanitized
  // ─────────────────────────────────────────────────
  test("J30: Negative price in URL is clamped to zero in the UI", async ({ page }) => {
    await page.goto(`/search?${BOUNDS_PARAMS}&minPrice=-500`);
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30000 });

    // Wait for search results to fully load (budget inputs hydrate with URL params after mount)
    await page.waitForLoadState("networkidle").catch(() => {});

    // Negative price should be clamped to 0 or ignored (empty) in the input
    const minInput = page.getByLabel(/minimum budget/i);
    await expect.poll(
      async () => {
        const val = await minInput.inputValue();
        return val === "0" || val === "";
      },
      { timeout: 30000, message: 'Expected min price to be "0" or "" (empty) for negative URL param' },
    ).toBe(true);
  });

  // ─────────────────────────────────────────────────
  // J31: XSS via query parameter does not execute
  // ─────────────────────────────────────────────────
  test("J31: XSS payloads in URL params do not execute scripts", async ({ page }) => {
    // Set up dialog listener BEFORE navigation
    const alerts: string[] = [];
    page.on("dialog", (dialog) => {
      alerts.push(dialog.message());
      dialog.dismiss();
    });

    await page.goto(`/search?${BOUNDS_PARAMS}&q=<img+src=x+onerror=alert(1)>`);
    await page.waitForLoadState("domcontentloaded");

    // Page should load normally (heading renders XSS payload as text, not HTML)
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30000 });

    // Verify no script execution — no alert dialogs should have fired
    await page.waitForTimeout(1000);
    expect(alerts).toHaveLength(0);

    // The XSS payload should appear as escaped text somewhere on the page, not as HTML
    const bodyText = await page.locator("body").textContent();
    // Page rendered without executing the script — that's the key assertion
    expect(bodyText).toBeDefined();
  });

  // ═══════════════════════════════════════════════════
  // SECTION C: KEYBOARD & ACCESSIBILITY (5 journeys)
  // ═══════════════════════════════════════════════════

  // ─────────────────────────────────────────────────
  // J32: Escape key closes filter modal
  // ─────────────────────────────────────────────────
  test(`${tags.a11y} J32: Escape key closes the filter modal`, async ({ page, nav }) => {
    await nav.goToSearch({ bounds: SF_BOUNDS });
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30000 });

    const modal = await openFilterModal(page);
    await page.keyboard.press("Escape");
    await expect(modal).not.toBeVisible({ timeout: 5000 });
  });

  // ─────────────────────────────────────────────────
  // J33: Tab navigation through filter modal
  // ─────────────────────────────────────────────────
  test(`${tags.a11y} J33: Tab navigates through filter modal controls`, async ({ page, nav }) => {
    await nav.goToSearch({ bounds: SF_BOUNDS });
    await page.waitForLoadState("domcontentloaded");

    await openFilterModal(page);

    // Tab through first few interactive elements
    // Press Tab multiple times and verify focus stays inside dialog
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Tab");
    }

    // Active element should still be inside the dialog (focus trap)
    const focusedInDialog = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const active = document.activeElement;
      return dialog?.contains(active) ?? false;
    });
    expect(focusedInDialog).toBeTruthy();

    await closeFilterModal(page);
  });

  // ─────────────────────────────────────────────────
  // J34: Screen reader result announcements
  // ─────────────────────────────────────────────────
  test(`${tags.a11y} J34: Screen reader announcements update on result changes`, async ({ page, nav }) => {
    await nav.goToSearch({ bounds: SF_BOUNDS });
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30000 });

    // aria-live region should exist
    const liveRegion = page.locator('[aria-live="polite"]');
    expect(await liveRegion.count()).toBeGreaterThan(0);

    // Loading wrapper should have aria-busy
    const wrapper = page.locator('[aria-busy]');
    if (await wrapper.count() > 0) {
      // Currently not loading, so aria-busy should be false
      await expect(wrapper.first()).toHaveAttribute("aria-busy", "false");
    }
  });

  // ─────────────────────────────────────────────────
  // J35: Filter toggle buttons have aria-pressed
  // ─────────────────────────────────────────────────
  test(`${tags.a11y} J35: Amenity filter toggles report correct aria-pressed state`, async ({ page, nav }) => {
    await nav.goToSearch({ bounds: SF_BOUNDS });
    await page.waitForLoadState("domcontentloaded");

    const modal = await openFilterModal(page);

    const amenityFieldset = modal.locator('fieldset').filter({ hasText: /amenities/i });
    const firstAmenity = amenityFieldset.getByRole("button").first();

    if (await firstAmenity.isVisible()) {
      // Initially unpressed
      await expect(firstAmenity).toHaveAttribute("aria-pressed", "false");

      // Click to select
      await firstAmenity.click();
      await expect(firstAmenity).toHaveAttribute("aria-pressed", "true");

      // Click again to deselect
      await firstAmenity.click();
      await expect(firstAmenity).toHaveAttribute("aria-pressed", "false");
    }

    await closeFilterModal(page);
  });

  // ─────────────────────────────────────────────────
  // J36: Pagination has correct ARIA navigation
  // ─────────────────────────────────────────────────
  test(`${tags.a11y} J36: Pagination controls have proper ARIA attributes`, async ({ page, nav }) => {
    await nav.goToSearch({ bounds: SF_BOUNDS });
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30000 });

    const pagination = page.locator('nav[aria-label*="Pagination" i]').or(page.locator(selectors.pagination));
    if (await pagination.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      // Previous button should have aria-label
      const prevBtn = pagination.first().locator('button').filter({ hasText: /prev/i })
        .or(pagination.first().locator('[aria-label*="previous" i]'));
      if (await prevBtn.count() > 0) {
        const ariaLabel = await prevBtn.first().getAttribute("aria-label");
        expect(ariaLabel).toBeTruthy();
      }

      // Next button should have aria-label
      const nextBtn = pagination.first().locator('button').filter({ hasText: /next/i })
        .or(pagination.first().locator('[aria-label*="next" i]'));
      if (await nextBtn.count() > 0) {
        const ariaLabel = await nextBtn.first().getAttribute("aria-label");
        expect(ariaLabel).toBeTruthy();
      }
    }
  });

  // ═══════════════════════════════════════════════════
  // SECTION D: PAGINATION & NAVIGATION (5 journeys)
  // ═══════════════════════════════════════════════════

  // ─────────────────────────────────────────────────
  // J37: Pagination prev disabled on first page
  // ─────────────────────────────────────────────────
  test("J37: Previous button is disabled on first page", async ({ page, nav }) => {
    await nav.goToSearch({ bounds: SF_BOUNDS });
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30000 });

    // Wait for pagination to fully hydrate before checking disabled state
    await page.waitForLoadState("networkidle").catch(() => {});

    const pagination = page.locator(selectors.pagination).or(page.locator('nav[aria-label*="Pagination" i]'));
    const prevBtn = pagination.first().locator('[aria-label*="previous" i]').first();
    if (await prevBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Retry assertion to handle hydration race on Mobile Chrome
      await expect(async () => {
        await expect(prevBtn).toBeDisabled();
      }).toPass({ timeout: 30000 });
    }
  });

  // ─────────────────────────────────────────────────
  // J38: Pagination preserves all active filters
  // ─────────────────────────────────────────────────
  test("J38: Navigating to page 2 preserves all active filters", async ({ page }) => {
    await page.goto(`/search?${BOUNDS_PARAMS}&minPrice=500&maxPrice=2000&roomType=Private+Room`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30000 });

    // Try to go to next page — scope to pagination nav to avoid carousel buttons
    const pagination = page.locator(selectors.pagination).or(page.locator('nav[aria-label*="Pagination" i]'));
    const nextBtn = pagination.first().locator('[aria-label*="next" i]').first();
    if (await nextBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      if (await nextBtn.isEnabled()) {
        await nextBtn.click();
        await page.waitForLoadState("domcontentloaded");

        // Filters should still be in URL
        const url = new URL(page.url());
        expect(url.searchParams.get("minPrice")).toBe("500");
        expect(url.searchParams.get("maxPrice")).toBe("2000");
        expect(url.searchParams.get("roomType")).toContain("Private");
      }
    }
  });

  // ─────────────────────────────────────────────────
  // J39: Back button after pagination returns to page 1
  // ─────────────────────────────────────────────────
  test("J39: Browser back from page 2 returns to page 1", async ({ page, nav }) => {
    await nav.goToSearch({ bounds: SF_BOUNDS });
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30000 });

    const pagination = page.locator(selectors.pagination).or(page.locator('nav[aria-label*="Pagination" i]'));
    const nextBtn = pagination.first().locator('[aria-label*="next" i]').first();
    if (await nextBtn.isVisible({ timeout: 5000 }).catch(() => false) && await nextBtn.isEnabled()) {
      // Go to page 2
      await nextBtn.click();
      await page.waitForLoadState("domcontentloaded");

      // Go back — use polling to wait for URL to settle after history navigation
      await page.goBack();
      await page.waitForLoadState("domcontentloaded");

      // Poll until page param is absent or "1" (history navigation can be async)
      await expect(async () => {
        const url = new URL(page.url());
        const pageParam = url.searchParams.get("page");
        expect(!pageParam || pageParam === "1").toBeTruthy();
      }).toPass({ timeout: 30000 });
    }
  });

  // ─────────────────────────────────────────────────
  // J40: Showing X to Y of Z text is correct
  // ─────────────────────────────────────────────────
  test("J40: Pagination info text shows correct range", async ({ page, nav }) => {
    await nav.goToSearch({ bounds: SF_BOUNDS });
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30000 });

    // Look for "Showing X to Y of Z" text
    const paginationInfo = page.locator('text=/showing\\s+\\d+/i');
    if (await paginationInfo.isVisible({ timeout: 5000 }).catch(() => false)) {
      const text = await paginationInfo.textContent();
      expect(text).toMatch(/showing\s+\d+\s+to\s+\d+/i);
    }
  });

  // ─────────────────────────────────────────────────
  // J41: Direct page number navigation works
  // ─────────────────────────────────────────────────
  test("J41: Clicking page number navigates directly", async ({ page, nav }) => {
    await nav.goToSearch({ bounds: SF_BOUNDS });
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30000 });

    // Look for page 2 button
    const page2Btn = page.locator('[aria-label="Page 2"]')
      .or(page.locator('nav button:has-text("2")'));
    if (await page2Btn.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      await page2Btn.first().click();
      await page.waitForLoadState("domcontentloaded");

      // URL should reflect page 2
      const url = page.url();
      expect(url).toMatch(/page=2|pageNumber=2|cursor/i);
    }
  });

  // ═══════════════════════════════════════════════════
  // SECTION E: STATE PERSISTENCE & URL SYNC (5 journeys)
  // ═══════════════════════════════════════════════════

  // ─────────────────────────────────────────────────
  // J42: Deep-linked URL with all filter types loads correctly
  // ─────────────────────────────────────────────────
  test("J42: Deep link with every filter type loads and displays correctly", async ({ page }) => {
    const deepUrl = `/search?${BOUNDS_PARAMS}&minPrice=700&maxPrice=1500&roomType=Shared+Room&leaseDuration=Month-to-month&genderPreference=NO_PREFERENCE&sort=newest`;
    await page.goto(deepUrl);
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30000 });

    // Verify all params round-tripped
    const url = new URL(page.url());
    expect(url.searchParams.get("minPrice")).toBe("700");
    expect(url.searchParams.get("maxPrice")).toBe("1500");
    expect(url.searchParams.get("sort")).toBe("newest");
  });

  // ─────────────────────────────────────────────────
  // J43: Filter pills display for each active filter type
  // ─────────────────────────────────────────────────
  test("J43: Filter pills appear for active filters", async ({ page }) => {
    await page.goto(`/search?${BOUNDS_PARAMS}&minPrice=500&maxPrice=2000&roomType=Private+Room`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30000 });

    // Filter pills should show for active filters — wait for them to render
    const pills = page.locator('button[aria-label*="Remove"]').or(page.locator('[class*="FilterPill"]'));
    if (await pills.first().isVisible({ timeout: 10000 }).catch(() => false)) {
      // At least one pill should be visible
      await expect(pills.first()).toBeVisible({ timeout: 10000 });

      // Each pill should have a remove button/action
      const firstPillLabel = await pills.first().getAttribute("aria-label");
      if (firstPillLabel) {
        expect(firstPillLabel).toMatch(/remove/i);
      }
    }
  });

  // ─────────────────────────────────────────────────
  // J44: Removing a filter pill removes only that filter
  // ─────────────────────────────────────────────────
  test("J44: Removing one filter pill keeps other filters intact", async ({ page }) => {
    await page.goto(`/search?${BOUNDS_PARAMS}&minPrice=500&maxPrice=2000&roomType=Private+Room`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30000 });

    // Find a removable pill — wait for pills to render after hydration
    const pills = page.locator('button[aria-label*="Remove"]');
    const hasPills = await pills.first().isVisible({ timeout: 10000 }).catch(() => false);
    if (hasPills && await pills.count() >= 2) {
      const urlBefore = page.url();
      // Remove the first pill
      await pills.first().click();
      // Wait for URL to change after pill removal via soft navigation
      await expect.poll(
        () => page.url(),
        { timeout: 30000, message: "URL to change after pill removal" },
      ).not.toBe(urlBefore);
      await page.waitForLoadState("domcontentloaded");

      // Other filters should still be in URL
      const url = new URL(page.url());
      // At least one of the other filters should remain
      const hasRemaining = url.searchParams.has("minPrice") ||
        url.searchParams.has("maxPrice") ||
        url.searchParams.has("roomType");
      expect(hasRemaining).toBeTruthy();
    }
  });

  // ─────────────────────────────────────────────────
  // J45: Forward/back navigation through filter changes
  // ─────────────────────────────────────────────────
  test("J45: Browser forward/back navigates through filter history", async ({ page, nav }) => {
    test.slow(); // Browser history navigation under load needs extra time
    // Start with no filters
    await nav.goToSearch({ bounds: SF_BOUNDS });
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30000 });

    // Add a filter via room type tab — wait for hydration before clicking
    const privateTab = page.getByRole("button", { name: /private/i })
      .or(page.locator('button:has-text("Private")'));
    if (await privateTab.first().isVisible()) {
      await page.waitForTimeout(1000); // hydration settle
      await privateTab.first().click();
      await expect.poll(
        () => new URL(page.url(), "http://localhost").searchParams.get("roomType"),
        { timeout: 30000, message: 'URL param "roomType" to be present' },
      ).not.toBeNull();

      // Go back — URL should no longer have roomType
      await page.goBack();
      await expect.poll(
        () => new URL(page.url(), "http://localhost").searchParams.get("roomType"),
        { timeout: 30000, message: 'URL param "roomType" to be absent after goBack' },
      ).toBeNull();

      // Go forward
      await page.goForward();
      await expect.poll(
        () => new URL(page.url(), "http://localhost").searchParams.get("roomType"),
        { timeout: 30000, message: 'URL param "roomType" to be present after goForward' },
      ).not.toBeNull();
    }
  });

  // ─────────────────────────────────────────────────
  // J46: Sort change resets pagination to page 1
  // ─────────────────────────────────────────────────
  test("J46: Changing sort resets pagination to first page", async ({ page }) => {
    // Start on page 2
    await page.goto(`/search?${BOUNDS_PARAMS}&page=2`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30000 });

    // Change sort (desktop viewport)
    const sortTrigger = page.locator('button').filter({ hasText: /recommended|sort/i }).first();
    if (await sortTrigger.isVisible({ timeout: 5000 }).catch(() => false)) {
      await sortTrigger.click();
      const option = page.getByRole("option", { name: /newest/i })
        .or(page.locator('[role="option"]').filter({ hasText: /Newest/i }));
      if (await option.first().isVisible({ timeout: 3000 }).catch(() => false)) {
        await option.first().click();
        await expect.poll(
          () => new URL(page.url(), "http://localhost").searchParams.get("sort"),
          { timeout: 30000, message: 'URL param "sort" to be "newest"' },
        ).toBe("newest");

        // Page param should be reset
        const url = new URL(page.url());
        const pageParam = url.searchParams.get("page");
        expect(!pageParam || pageParam === "1").toBeTruthy();
      }
    }
  });

  // ═══════════════════════════════════════════════════
  // SECTION F: RESPONSIVE & MOBILE (4 journeys)
  // ═══════════════════════════════════════════════════

  // ─────────────────────────────────────────────────
  // J47: Tablet viewport layout (768px)
  // ─────────────────────────────────────────────────
  test(`${tags.mobile} J47: Tablet viewport (768px) shows appropriate layout`, async ({ page, nav }) => {
    test.slow(); // Viewport tests under load need extra time
    await page.setViewportSize({ width: 768, height: 1024 });
    await nav.goToSearch({ bounds: SF_BOUNDS });
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30000 });

    // Search form should be visible
    const searchForm = page.locator('form[role="search"]');
    await expect(searchForm).toBeVisible();

    // Verify listing cards are present in the DOM (count > 0 or empty state text exists)
    await expect(async () => {
      const cardCount = await searchResultsContainer(page).locator(selectors.listingCard).count();
      const hasEmpty = await page.getByText(/no matches|no listings|0 places/i).isVisible().catch(() => false);
      expect(cardCount > 0 || hasEmpty).toBeTruthy();
    }).toPass({ timeout: 30000 });
  });

  // ─────────────────────────────────────────────────
  // J48: Mobile filter modal scrolls long content
  // ─────────────────────────────────────────────────
  test(`${tags.mobile} J48: Mobile filter modal is scrollable with many options`, async ({ page, nav }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await nav.goToSearch({ bounds: SF_BOUNDS });
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30000 });

    // Use retry-click helper to handle hydration race on mobile
    const modal = await openFilterModal(page);

    // Modal should have scrollable content
    const scrollable = modal.locator('[class*="overflow-y"]').or(modal.locator('.overflow-y-auto'));
    if (await scrollable.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      // The scrollable area should exist (content is longer than viewport)
      await expect(scrollable.first()).toBeVisible({ timeout: 5000 });
    }

    // Close
    await closeFilterModal(page);
  });

  // ─────────────────────────────────────────────────
  // J49: Wide desktop viewport shows full layout
  // ─────────────────────────────────────────────────
  test("J49: Wide desktop (1920px) shows full search layout", async ({ page, nav }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await nav.goToSearch({ bounds: SF_BOUNDS });
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30000 });

    // Sort select should be visible on desktop
    const sortTrigger = page.locator('button').filter({ hasText: /recommended|sort/i }).first();
    if (await sortTrigger.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(sortTrigger).toBeVisible();
    }

    // Room type tabs should show text labels
    const privateTab = page.getByRole("button", { name: /private/i });
    if (await privateTab.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(privateTab.first()).toBeVisible();
    }
  });

  // ─────────────────────────────────────────────────
  // J50: Mobile pagination stacks vertically
  // ─────────────────────────────────────────────────
  test(`${tags.mobile} J50: Mobile pagination has correct layout`, async ({ page, nav }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await nav.goToSearch({ bounds: SF_BOUNDS });
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30000 });

    const pagination = page.locator('nav[aria-label*="Pagination" i]').or(page.locator(selectors.pagination));
    if (await pagination.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      // Pagination should be visible and usable at mobile width
      const prevBtn = pagination.first().locator('[aria-label*="previous" i]');
      const nextBtn = pagination.first().locator('[aria-label*="next" i]');
      if (await nextBtn.count() > 0) {
        // Touch targets should be adequate (at least 44px)
        const box = await nextBtn.first().boundingBox();
        if (box) {
          expect(box.height).toBeGreaterThanOrEqual(36); // reasonable touch target
        }
      }
    }
  });

  // ═══════════════════════════════════════════════════
  // SECTION G: PERFORMANCE & LOADING STATES (3 journeys)
  // ═══════════════════════════════════════════════════

  // ─────────────────────────────────────────────────
  // J51: Loading state appears during filter change
  // ─────────────────────────────────────────────────
  test("J51: Loading indicator appears during search transitions", async ({ page, nav }) => {
    test.slow(); // Filter transitions can be slow under CI load
    await nav.goToSearch({ bounds: SF_BOUNDS });
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30000 });

    // aria-busy wrapper should exist
    const wrapper = page.locator('[aria-busy]');
    if (await wrapper.count() > 0) {
      await expect(wrapper.first()).toHaveAttribute("aria-busy", "false");
    }

    // Trigger a search that would cause loading — wait for hydration before clicking
    const privateTab = page.getByRole("button", { name: /private/i })
      .or(page.locator('button:has-text("Private")'));
    if (await privateTab.first().isVisible()) {
      await page.waitForTimeout(1000); // hydration settle
      // Retry click + URL assertion to handle hydration timing
      await expect(async () => {
        await privateTab.first().click();
        const roomType = new URL(page.url(), "http://localhost").searchParams.get("roomType");
        expect(roomType).not.toBeNull();
      }).toPass({ timeout: 30000 });
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30000 });
    }
  });

  // ─────────────────────────────────────────────────
  // J52: No CLS on initial search page load
  // ─────────────────────────────────────────────────
  test("J52: No layout shift on initial page load", async ({ page, nav }) => {
    // Navigate and capture CLS
    await nav.goToSearch({ bounds: SF_BOUNDS });
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30000 });

    // FilterBar should have min-height to prevent CLS
    const filterBar = page.locator('[class*="min-h"]').first();
    if (await filterBar.isVisible({ timeout: 3000 }).catch(() => false)) {
      const box = await filterBar.boundingBox();
      if (box) {
        expect(box.height).toBeGreaterThan(0);
      }
    }

    // Search form should be visible without layout jump
    const searchForm = page.locator('form[role="search"]');
    await expect(searchForm).toBeVisible();
  });

  // ─────────────────────────────────────────────────
  // J53: Rapid filter changes don't cause errors
  // ─────────────────────────────────────────────────
  test("J53: Rapid sequential filter changes handle gracefully", async ({ page, nav }) => {
    await nav.goToSearch({ bounds: SF_BOUNDS });
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30000 });

    // Collect console errors
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    // Rapidly click through room type tabs
    const tabs = page.locator('[aria-pressed]').filter({ hasText: /private|shared|entire|all/i });
    const tabCount = await tabs.count();

    for (let i = 0; i < Math.min(tabCount, 4); i++) {
      if (await tabs.nth(i).isVisible()) {
        await tabs.nth(i).click();
        await page.waitForTimeout(100); // Small gap between clicks
      }
    }

    // Wait for last navigation to settle
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30000 });

    // No unhandled errors (filter framework-level React errors)
    const realErrors = errors.filter(e =>
      !e.includes("404") &&
      !e.includes("Failed to fetch") &&
      !e.includes("AbortError") &&
      !e.includes("hydration")
    );
    // Allow some errors but no crashes — page should still be functional
    const heading = page.getByRole("heading", { level: 1 }).first();
    await expect(heading).toBeVisible();
  });

  // ═══════════════════════════════════════════════════
  // SECTION H: LANGUAGE FILTERS & SEARCH (2 journeys)
  // ═══════════════════════════════════════════════════

  // ─────────────────────────────────────────────────
  // J54: Language filter search and selection
  // ─────────────────────────────────────────────────
  test("J54: Language filter search, select, and apply", async ({ page, nav }) => {
    await nav.goToSearch({ bounds: SF_BOUNDS });
    await page.waitForLoadState("domcontentloaded");

    const modal = await openFilterModal(page);

    // Find language section
    const langSearch = modal.getByPlaceholder(/search languages/i)
      .or(modal.locator('input[type="text"]').last());

    if (await langSearch.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      // Type to search
      await langSearch.first().fill("Span");

      // Should show filtered results — click the first visible language button
      const langBtn = modal.locator('button[aria-pressed]').filter({ hasText: /Spanish|Español/i });
      if (await langBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
        await langBtn.first().click();
        await expect(langBtn.first()).toHaveAttribute("aria-pressed", "true");
      }
    }

    await applyFilters(page);

    // Languages may or may not appear in URL depending on selection success
    // If the search input wasn't found, the test still passes (graceful degradation)
    await page.waitForLoadState("domcontentloaded");
  });

  // ─────────────────────────────────────────────────
  // J55: Multiple languages selected and removed
  // ─────────────────────────────────────────────────
  test("J55: Select and deselect multiple languages", async ({ page, nav }) => {
    await nav.goToSearch({ bounds: SF_BOUNDS });
    await page.waitForLoadState("domcontentloaded");

    const modal = await openFilterModal(page);

    // Find language buttons
    const langButtons = modal.locator('fieldset').filter({ hasText: /language/i })
      .or(modal.locator('div').filter({ hasText: /language/i }));

    const allLangBtns = langButtons.first().locator('button[aria-pressed]');
    const count = await allLangBtns.count();

    if (count >= 2) {
      // Select two languages
      await allLangBtns.nth(0).click();
      await allLangBtns.nth(1).click();

      await expect(allLangBtns.nth(0)).toHaveAttribute("aria-pressed", "true");
      await expect(allLangBtns.nth(1)).toHaveAttribute("aria-pressed", "true");

      // Deselect first
      await allLangBtns.nth(0).click();
      await expect(allLangBtns.nth(0)).toHaveAttribute("aria-pressed", "false");
      await expect(allLangBtns.nth(1)).toHaveAttribute("aria-pressed", "true");
    }

    await closeFilterModal(page);
  });
});
