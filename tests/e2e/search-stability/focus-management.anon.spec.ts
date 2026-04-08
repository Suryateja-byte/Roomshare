/**
 * Focus Management Stability Tests
 *
 * Verifies that focus moves to #search-results-heading on filter changes
 * but does NOT move on bounds-only URL changes (map pan).
 *
 * IMPORTANT: These tests use client-side navigation (clicking category buttons)
 * rather than page.goto(), because page.goto() causes a full remount which
 * resets the isInitialMount guard and prevents the focus effect from firing.
 *
 * Run:
 *   pnpm playwright test tests/e2e/search-stability/focus-management.anon.spec.ts --project=chromium-anon
 */

import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SF_BOUNDS = {
  minLat: 37.7,
  maxLat: 37.85,
  minLng: -122.52,
  maxLng: -122.35,
};

const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;
const SEARCH_URL = `/search?${boundsQS}`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wait for the search page to load. Uses .first() for dual-container compat. */
async function waitForSearchReady(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator("#search-results-heading").first()).toBeAttached({
    timeout: 30_000,
  });
}

/** Get the ID of the currently focused element */
async function getFocusedElementId(page: Page): Promise<string | null> {
  return page.evaluate(() => document.activeElement?.id || null);
}

/** Get the first visible category bar (scoped to avoid dual-container issues) */
function categoryBar(page: Page) {
  return page.locator('[aria-label="Category filters"]').first();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// CategoryBar was removed in Phase 1 search redesign. Focus management tests
// need to be rewritten to use InlineFilterStrip filter interactions.
test.describe.skip("Focus Management: search-results-heading", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async () => {
    test.slow();
  });

  test("clicking a category filter moves focus to search-results-heading", async ({
    page,
  }) => {
    // Load search page (initial mount — isInitialMount guard skips focus)
    await page.goto(SEARCH_URL);
    await waitForSearchReady(page);

    // Verify focus is NOT on the heading after initial load
    const focusAfterLoad = await getFocusedElementId(page);
    expect(focusAfterLoad).not.toBe("search-results-heading");

    // Click "Pet Friendly" category — triggers router.push() (client-side navigation)
    const petButton = categoryBar(page).getByRole("button", {
      name: /Pet Friendly/i,
    });
    await petButton.click();

    // Wait for URL to update (confirms client-side navigation happened)
    await expect
      .poll(() => page.url().includes("houseRules"), {
        timeout: 10_000,
        message: "URL should contain houseRules after clicking Pet Friendly",
      })
      .toBe(true);

    // Focus should have moved to the heading
    await expect
      .poll(() => getFocusedElementId(page), {
        timeout: 10_000,
        message:
          "Focus should move to search-results-heading after filter change",
      })
      .toBe("search-results-heading");
  });

  test("toggling a category off and on re-triggers focus each time", async ({
    page,
  }) => {
    await page.goto(SEARCH_URL);
    await waitForSearchReady(page);

    const petButton = categoryBar(page).getByRole("button", {
      name: /Pet Friendly/i,
    });

    // Toggle ON — focus should move
    await petButton.click();
    await expect
      .poll(() => page.url().includes("houseRules"), { timeout: 10_000 })
      .toBe(true);
    await expect
      .poll(() => getFocusedElementId(page), { timeout: 10_000 })
      .toBe("search-results-heading");

    // Blur focus by focusing a real interactive element (body.focus() is unreliable)
    await petButton.focus();
    await expect
      .poll(() => getFocusedElementId(page), {
        timeout: 5_000,
        message: "Focus should move away from heading after focusing button",
      })
      .not.toBe("search-results-heading");

    // Toggle OFF — filter change should move focus again
    await petButton.click();
    await expect
      .poll(() => !page.url().includes("houseRules"), {
        timeout: 10_000,
        message: "URL should no longer contain houseRules",
      })
      .toBe(true);
    await expect
      .poll(() => getFocusedElementId(page), { timeout: 10_000 })
      .toBe("search-results-heading");
  });

  test("bounds-only URL change does NOT move focus to heading", async ({
    page,
  }) => {
    // Load search page with a filter already applied
    await page.goto(`${SEARCH_URL}&houseRules=Pets+allowed`);
    await waitForSearchReady(page);

    // Toggle a different category to exit isInitialMount (need at least one client-side nav)
    const entireButton = categoryBar(page).getByRole("button", {
      name: /Entire Place/i,
    });
    await entireButton.click();

    // Wait for focus to move to heading
    await expect
      .poll(() => getFocusedElementId(page), { timeout: 10_000 })
      .toBe("search-results-heading");

    // Blur focus away from heading by focusing a real interactive element
    await entireButton.focus();
    await expect
      .poll(() => getFocusedElementId(page), {
        timeout: 5_000,
        message: "Focus should move away from heading after focusing button",
      })
      .not.toBe("search-results-heading");

    // Simulate a bounds-only URL change via pushState (client-side, no remount)
    // Next.js App Router intercepts pushState, updating useSearchParams()
    await page.evaluate(() => {
      const url = new URL(window.location.href);
      url.searchParams.set("minLat", "37.72");
      url.searchParams.set("maxLat", "37.87");
      url.searchParams.set("minLng", "-122.48");
      url.searchParams.set("maxLng", "-122.31");
      window.history.pushState(window.history.state, "", url.toString());
      window.dispatchEvent(
        new PopStateEvent("popstate", { state: window.history.state })
      );
    });

    // Wait for any potential (incorrect) focus effect to fire
    await page.waitForLoadState("domcontentloaded");

    // Focus should NOT have moved to heading — bounds are stripped from filterParamsKey
    const focusAfterBoundsChange = await getFocusedElementId(page);
    expect(focusAfterBoundsChange).not.toBe("search-results-heading");
  });

  test("initial page load does NOT auto-focus the heading", async ({
    page,
  }) => {
    // Navigate directly with filters — fresh mount, isInitialMount guard prevents focus
    await page.goto(`${SEARCH_URL}&roomType=Private+Room&amenities=Wifi`);
    await waitForSearchReady(page);

    // Wait for any effects to settle
    await page.waitForLoadState("domcontentloaded");

    // Focus should NOT be on the heading (isInitialMount skips first render)
    const focusId = await getFocusedElementId(page);
    expect(focusId).not.toBe("search-results-heading");
  });
});
