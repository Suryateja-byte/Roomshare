/**
 * Homepage A11y Regressions (P0)
 *
 * Pins the two keyboard-accessibility fixes from the 2026-06-10 homepage review:
 *  1. Skip link must scroll the custom scroll container and move focus to
 *     #main-content (native anchor navigation cannot scroll the app container).
 *  2. Hero search inputs must show a visible :focus-visible indicator
 *     (WCAG 2.4.7) — they previously had focus:outline-none with no replacement.
 *
 * Run: pnpm playwright test tests/e2e/home-a11y-regression.anon.spec.ts --project=chromium-anon
 */

import { test, expect, type Page } from "@playwright/test";

const SCROLL_CONTAINER = '[data-app-scroll-container="true"]';

async function gotoHome(page: Page) {
  await page.goto("/");
  await page.waitForSelector('[data-testid="listing-card"]', {
    timeout: 30000,
  });
}

test.describe("Home A11y: skip link", () => {
  test("skip link scrolls the app container and focuses #main-content", async ({
    page,
  }) => {
    await gotoHome(page);

    // Scroll deep into the page inside the custom scroll container
    await page.evaluate((sel) => {
      document.querySelector(sel)!.scrollTo({ top: 3000, behavior: "instant" });
    }, SCROLL_CONTAINER);

    // First Tab focuses the skip link
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("link", { name: "Skip to main content" })
    ).toBeFocused();

    await page.keyboard.press("Enter");

    // Focus moves to main content…
    await expect(page.locator("#main-content")).toBeFocused();

    // …and the scroll container actually scrolled back to the content top
    // (the container uses scroll-smooth, so poll until the animation settles)
    await expect
      .poll(
        () =>
          page.evaluate(
            (sel) => document.querySelector(sel)!.scrollTop,
            SCROLL_CONTAINER
          ),
        { timeout: 5000 }
      )
      .toBeLessThan(1000);
  });
});

test.describe("Home A11y: search input focus indicators", () => {
  const INPUT_IDS = [
    "search-what",
    "search-location",
    "search-budget-min",
    "search-budget-max",
  ];

  test("hero search inputs show a visible focus-visible ring", async ({
    page,
  }) => {
    await gotoHome(page);
    // SearchForm is lazy-loaded; wait for it
    await page.waitForSelector("#search-what", { timeout: 30000 });

    for (const id of INPUT_IDS) {
      // Land on the input via keyboard so :focus-visible applies
      await page.locator(`#${id}`).focus();
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Tab");

      const state = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        return {
          id: el.id,
          focusVisible: el.matches(":focus-visible"),
          boxShadow: getComputedStyle(el).boxShadow,
        };
      });

      expect(state.id, `keyboard tab should land on #${id}`).toBe(id);
      expect(state.focusVisible, `#${id} should match :focus-visible`).toBe(
        true
      );
      expect(
        state.boxShadow,
        `#${id} should have a visible ring (box-shadow)`
      ).not.toBe("none");
    }
  });
});
