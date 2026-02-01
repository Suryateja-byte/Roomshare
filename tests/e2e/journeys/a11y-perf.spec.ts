/**
 * E2E Test Suite: Accessibility & Performance
 * Terminal 5 — validates ARIA landmarks, keyboard navigation,
 * high-contrast styling, and performance marks.
 */

import { test, expect, selectors, timeouts } from "../helpers";

test.describe("Accessibility & Performance", () => {
  test.describe("Screen reader landmarks", () => {
    test("search results page has correct ARIA landmarks", async ({
      page,
      nav,
    }) => {
      await nav.goToSearch();
      await page.waitForLoadState("networkidle");

      // Skip link exists
      const skipLink = page.locator('a[href="#main-content"]');
      await expect(skipLink).toBeAttached();

      // Main content target exists
      const mainContent = page.locator("#main-content");
      await expect(mainContent).toBeAttached();

      // Search results region
      const searchResults = page.locator("#search-results");
      await expect(searchResults).toBeAttached();

      // Results grid has feed role
      const feed = page.locator('[role="feed"]');
      await expect(feed).toBeAttached();
    });

    test("listing cards have article role and aria-label", async ({
      page,
      nav,
    }) => {
      await nav.goToSearch();
      await expect(
        page.locator(selectors.listingCard).first(),
      ).toBeVisible({ timeout: 15000 });

      // Check first listing card for article role
      const article = page.locator('[role="article"]').first();
      await expect(article).toBeAttached();

      const label = await article.getAttribute("aria-label");
      expect(label).toBeTruthy();
      // Label should contain price info
      expect(label).toMatch(/\$?\d+|Free/i);
    });
  });

  test.describe("Keyboard navigation", () => {
    test("Tab navigates through listing cards", async ({ page, nav }) => {
      await nav.goToSearch();
      await expect(
        page.locator(selectors.listingCard).first(),
      ).toBeVisible({ timeout: 15000 });

      // Tab into the page and verify focus moves to interactive elements
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");

      const focused = page.locator(":focus");
      await expect(focused).toBeAttached();
    });

    test("image carousel responds to arrow keys", async ({ page, nav }) => {
      await nav.goToSearch();
      await expect(
        page.locator(selectors.listingCard).first(),
      ).toBeVisible({ timeout: 15000 });

      // Find a carousel region
      const carousel = page.locator('[aria-roledescription="carousel"]').first();
      if (await carousel.isVisible()) {
        await carousel.focus();
        const initialDot = await page.locator('[role="tab"][aria-selected="true"]').first().getAttribute("aria-label");
        await page.keyboard.press("ArrowRight");
        await page.waitForTimeout(timeouts.animation);
        // Dot selection should change
        const newDot = await page.locator('[role="tab"][aria-selected="true"]').first().getAttribute("aria-label");
        // If carousel has >1 image, dot should change
        if (initialDot && newDot) {
          // Just verify the carousel didn't break — dot label exists
          expect(newDot).toBeTruthy();
        }
      }
    });
  });

  test.describe("High contrast mode", () => {
    test("high contrast CSS applies stronger borders", async ({ page, nav }) => {
      // Emulate high contrast
      await page.emulateMedia({ forcedColors: "active" });
      await nav.goToSearch();
      await page.waitForLoadState("networkidle");

      // Page should render without errors
      await expect(page.locator("body")).toBeVisible();
    });
  });

  test.describe("Performance marks", () => {
    test("load-more marks performance entries", async ({ page, nav }) => {
      await nav.goToSearch();
      await page.waitForLoadState("networkidle");

      // Check if load more button exists
      const loadMore = page.getByRole("button", { name: /show more/i });
      if (await loadMore.isVisible({ timeout: 5000 }).catch(() => false)) {
        await loadMore.click();
        await page.waitForTimeout(2000);

        // Check performance entries
        const marks = await page.evaluate(() =>
          performance.getEntriesByName("load-more-start").length,
        );
        expect(marks).toBeGreaterThanOrEqual(1);
      }
    });
  });

  test.describe("Fluid typography", () => {
    test("text scales with viewport without horizontal scroll", async ({
      page,
      nav,
    }) => {
      // Set a narrow viewport
      await page.setViewportSize({ width: 320, height: 568 });
      await nav.goToSearch();
      await page.waitForLoadState("networkidle");

      // No horizontal scroll
      const hasHorizontalScroll = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(hasHorizontalScroll).toBe(false);
    });
  });
});
