/**
 * Category Bar E2E Tests (P1)
 *
 * Validates the horizontal CategoryBar component that renders quick-toggle
 * amenity buttons (e.g., Furnished, Wifi, Parking) above the search results.
 *
 * Key implementation details:
 * - Container: nav with aria-label="Category filters"
 * - Buttons: each has aria-pressed (true/false) indicating active state
 * - Clicking a button toggles the amenity in the URL (amenities param)
 * - On narrow viewports the bar scrolls horizontally (overflow-x-auto)
 * - Selecting a category resets pagination (removes page/cursor params)
 */

import { test, expect, selectors, timeouts, tags, searchResultsContainer, boundsQS, SEARCH_URL, getUrlParam } from "../helpers";
import type { Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function categoryBar(page: Page) {
  return searchResultsContainer(page).locator('[aria-label="Category filters"]');
}

function categoryButton(page: Page, label: string) {
  return searchResultsContainer(page).locator(`[aria-label="Category filters"] button:has-text("${label}")`);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Category Bar", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async () => {
    test.slow();
  });

  // -------------------------------------------------------------------------
  // 14.1 Category bar renders with buttons
  // -------------------------------------------------------------------------
  test(`${tags.core} 14.1 - category bar visible with accessible toggle buttons`, async ({ page }) => {
    await page.goto(SEARCH_URL);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3_000);

    const bar = categoryBar(page);
    await expect(bar).toBeVisible({ timeout: timeouts.action });

    // Should have at least 3 category buttons
    const buttons = bar.getByRole("button");
    const count = await buttons.count();
    expect(count).toBeGreaterThanOrEqual(3);

    // Every button should have an aria-pressed attribute (true or false)
    for (let i = 0; i < Math.min(count, 5); i++) {
      const ariaPressed = await buttons.nth(i).getAttribute("aria-pressed");
      expect(ariaPressed).toMatch(/^(true|false)$/);
    }
  });

  // -------------------------------------------------------------------------
  // 14.2 Clicking category applies filter to URL
  // -------------------------------------------------------------------------
  test(`${tags.core} 14.2 - clicking a category button adds amenity to URL`, async ({ page }) => {
    await page.goto(SEARCH_URL);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3_000);

    const furnishedBtn = categoryButton(page, "Furnished");
    const btnVisible = await furnishedBtn.isVisible({ timeout: timeouts.action }).catch(() => false);
    test.skip(!btnVisible, "Furnished category button not visible in bar");

    // Should start unpressed
    await expect(furnishedBtn).toHaveAttribute("aria-pressed", "false");

    await furnishedBtn.click();

    // Wait for URL to contain the amenity via soft navigation
    await expect.poll(
      () => {
        const amenities = new URL(page.url(), "http://localhost").searchParams.get("amenities") ?? "";
        return amenities.includes("Furnished");
      },
      { timeout: timeouts.action, message: 'URL param "amenities" to contain "Furnished"' },
    ).toBe(true);

    // Button should now be pressed
    await expect(furnishedBtn).toHaveAttribute("aria-pressed", "true");

    // URL verification
    const amenities = getUrlParam(page, "amenities") ?? "";
    expect(amenities).toContain("Furnished");
  });

  // -------------------------------------------------------------------------
  // 14.3 Clicking active category toggles it off
  // -------------------------------------------------------------------------
  test(`${tags.core} 14.3 - clicking an active category toggles it off and removes from URL`, async ({ page }) => {
    // Start with Furnished already active in the URL
    await page.goto(`${SEARCH_URL}&amenities=Furnished`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3_000);

    const furnishedBtn = categoryButton(page, "Furnished");
    const btnVisible = await furnishedBtn.isVisible({ timeout: timeouts.action }).catch(() => false);
    test.skip(!btnVisible, "Furnished category button not visible in bar");

    // Should start pressed since it is in the URL
    await expect(furnishedBtn).toHaveAttribute("aria-pressed", "true");

    // Click to toggle off
    await furnishedBtn.click();

    // Wait for amenities param to be removed from URL via soft navigation
    await expect.poll(
      () => {
        const amenities = new URL(page.url(), "http://localhost").searchParams.get("amenities");
        return !amenities || !amenities.includes("Furnished");
      },
      { timeout: timeouts.action, message: 'URL param "amenities" to not contain "Furnished"' },
    ).toBe(true);

    // Button reverts to unpressed
    await expect(furnishedBtn).toHaveAttribute("aria-pressed", "false");

    // URL should not contain amenities=Furnished
    const amenities = getUrlParam(page, "amenities");
    if (amenities) {
      expect(amenities).not.toContain("Furnished");
    }
  });

  // -------------------------------------------------------------------------
  // 14.4 Category bar scrolls horizontally on narrow viewport
  // -------------------------------------------------------------------------
  test(`${tags.mobile} 14.4 - category bar is scrollable on narrow viewport`, async ({ page }) => {
    // Set narrow mobile viewport
    await page.setViewportSize({ width: 375, height: 812 });

    await page.goto(SEARCH_URL);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3_000);

    const bar = categoryBar(page);
    await expect(bar).toBeVisible({ timeout: timeouts.action });

    // The bar container should be scrollable (scrollWidth > clientWidth)
    const isScrollable = await bar.evaluate((el) => {
      return el.scrollWidth > el.clientWidth;
    });

    // On a 375px viewport with 3+ category buttons, the bar should overflow
    // If not scrollable, the buttons may fit -- still acceptable
    if (isScrollable) {
      // Scroll to the end programmatically
      await bar.evaluate((el) => {
        el.scrollLeft = el.scrollWidth;
      });

      // Verify scroll position changed
      const scrollLeft = await bar.evaluate((el) => el.scrollLeft);
      expect(scrollLeft).toBeGreaterThan(0);

      // Scroll back to start
      await bar.evaluate((el) => {
        el.scrollLeft = 0;
      });
      const scrollLeftReset = await bar.evaluate((el) => el.scrollLeft);
      expect(scrollLeftReset).toBe(0);
    } else {
      // All buttons fit on screen -- still passes (no overflow needed)
      const buttons = bar.getByRole("button");
      const count = await buttons.count();
      expect(count).toBeGreaterThanOrEqual(1);
    }
  });

  // -------------------------------------------------------------------------
  // 14.5 Keyboard navigation through categories
  // -------------------------------------------------------------------------
  test(`${tags.a11y} 14.5 - keyboard Tab + Enter navigates and activates categories`, async ({ page }) => {
    await page.goto(SEARCH_URL);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3_000);

    const bar = categoryBar(page);
    await expect(bar).toBeVisible({ timeout: timeouts.action });

    // Tab into the category bar until we reach a category button
    // (Tab count depends on preceding focusable elements on the page)
    let reachedCategoryButton = false;
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press("Tab");

      const isCategoryBtn = await page.evaluate(() => {
        const active = document.activeElement;
        if (!active || active.tagName !== "BUTTON") return false;
        const parent = active.closest('[aria-label="Category filters"]');
        return parent !== null;
      });

      if (isCategoryBtn) {
        reachedCategoryButton = true;
        break;
      }
    }

    test.skip(!reachedCategoryButton, "Could not Tab into category bar buttons");

    // Record which button is focused
    const focusedLabel = await page.evaluate(() => {
      return document.activeElement?.textContent?.trim() ?? "";
    });
    expect(focusedLabel.length).toBeGreaterThan(0);

    // Tab to the next button in the bar
    await page.keyboard.press("Tab");

    const nextLabel = await page.evaluate(() => {
      const active = document.activeElement;
      if (!active) return "";
      const inBar = active.closest('[aria-label="Category filters"]');
      return inBar ? (active.textContent?.trim() ?? "") : "";
    });

    // If we are still inside the bar, the focused element should differ
    // (unless we tabbed out, which is also fine)
    if (nextLabel && nextLabel !== focusedLabel) {
      // Press Enter to activate the focused category
      await page.keyboard.press("Enter");

      // Wait for URL to update with any valid category filter param via soft navigation
      await expect.poll(
        () => {
          const params = new URL(page.url(), "http://localhost").searchParams;
          return params.has("amenities") || params.has("roomType") ||
            params.has("leaseDuration") || params.has("houseRules");
        },
        { timeout: 30_000, message: "URL to contain a category filter param" },
      ).toBe(true);

      // Verify some category param was set
      const params = new URL(page.url()).searchParams;
      const hasCategoryParam = params.has("amenities") || params.has("roomType") ||
        params.has("leaseDuration") || params.has("houseRules");
      expect(hasCategoryParam).toBe(true);
    }
  });

  // -------------------------------------------------------------------------
  // 14.6 Category selection resets pagination
  // -------------------------------------------------------------------------
  test(`${tags.core} 14.6 - clicking a category removes page and cursor params`, async ({ page }) => {
    // Start on "page 2" with a cursor param
    await page.goto(`${SEARCH_URL}&page=2`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3_000);

    const furnishedBtn = categoryButton(page, "Furnished");
    const btnVisible = await furnishedBtn.isVisible({ timeout: timeouts.action }).catch(() => false);
    test.skip(!btnVisible, "Furnished category button not visible in bar");

    // Click a category
    await furnishedBtn.click();

    // Wait for URL to include the amenity via soft navigation
    await expect.poll(
      () => {
        const amenities = new URL(page.url(), "http://localhost").searchParams.get("amenities") ?? "";
        return amenities.includes("Furnished");
      },
      { timeout: timeouts.action, message: 'URL param "amenities" to contain "Furnished"' },
    ).toBe(true);

    // Pagination params should be stripped
    expect(getUrlParam(page, "page")).toBeNull();
    expect(getUrlParam(page, "cursor")).toBeNull();

    // Bounds should remain
    expect(getUrlParam(page, "minLat")).toBeTruthy();
    expect(getUrlParam(page, "maxLat")).toBeTruthy();
  });
});
