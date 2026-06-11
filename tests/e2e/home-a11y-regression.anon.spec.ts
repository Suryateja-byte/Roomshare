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

  test("hero search inputs show a visible focus indicator on their field cell", async ({
    page,
  }) => {
    await gotoHome(page);
    // SearchForm is lazy-loaded; wait for it
    await page.waitForSelector("#search-what", { timeout: 30000 });

    for (const id of INPUT_IDS) {
      // The indicator lives on the field-cell wrapper (a hairline ring +
      // tint driven by React focus state), not on the input itself — text
      // inputs match :focus-visible on mouse click too, so an input-level
      // ring would flash for pointer users. Focus state only updates once
      // the lazy SearchForm has hydrated, so poll the focus + check.
      await expect
        .poll(
          async () => {
            await page.locator(`#${id}`).focus();
            return page.evaluate(() => {
              const el = document.activeElement as HTMLElement;
              // Walk up to the field cell, stopping before the <form>
              // (the form has its own focus-within shadow).
              let node: HTMLElement | null = el;
              for (let depth = 0; node && depth < 5; depth++) {
                if (node.tagName === "FORM") break;
                const shadow = getComputedStyle(node).boxShadow;
                if (shadow !== "none") {
                  // A real ring entry has a non-transparent color (may
                  // compute as oklab/rgb) AND a non-zero length component.
                  const entries = shadow.split(/,(?![^(]*\))/);
                  const visible = entries.some((entry) => {
                    const color =
                      entry.match(/(rgba?|oklab|oklch|color)\([^)]*\)/)?.[0] ??
                      "";
                    if (!color || color === "rgba(0, 0, 0, 0)") return false;
                    const lengths = entry.match(/-?\d+(\.\d+)?px/g) ?? [];
                    return lengths.some((l) => parseFloat(l) !== 0);
                  });
                  if (visible) return el.id;
                }
                node = node.parentElement;
              }
              return "no-ring:" + el.id;
            });
          },
          {
            timeout: 10000,
            message: `#${id}'s field cell should show the focus ring`,
          }
        )
        .toBe(id);
    }
  });
});
