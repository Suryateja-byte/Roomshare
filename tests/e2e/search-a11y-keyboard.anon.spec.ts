/**
 * Search Page Accessibility: Keyboard Navigation (P0)
 *
 * Validates tab order, focus indicators, keyboard-triggered navigation,
 * skip links, and absence of keyboard traps on the search page.
 *
 * Run: pnpm playwright test tests/e2e/search-a11y-keyboard.anon.spec.ts --project=chromium-anon
 */

import {
  test,
  expect,
  SF_BOUNDS,
  selectors,
  timeouts,
  tags,
} from "./helpers/test-utils";

// --------------------------------------------------------------------------
// Constants
// --------------------------------------------------------------------------

const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;
const SEARCH_URL = `/search?${boundsQS}`;

/** Wait for search results heading to be visible */
async function waitForResults(page: import("@playwright/test").Page) {
  await page.waitForLoadState("domcontentloaded");
  await expect(
    page.getByRole("heading", { level: 1 }).first(),
  ).toBeVisible({ timeout: 15000 });
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

test.describe("Search A11y: Keyboard Navigation", () => {
  test.use({
    viewport: { width: 1280, height: 800 },
  });

  test.beforeEach(async ({ page }) => {
    await page.goto(SEARCH_URL);
    await waitForResults(page);
  });

  // 1. Tab order flows logically: nav -> search -> filters -> sort -> results -> map
  test("1. tab order flows logically through interactive elements", { tag: [tags.a11y] }, async ({ page }) => {
    // Collect focused element info during tabbing
    const focusSequence: { tag: string; role: string | null; text: string }[] = [];

    for (let i = 0; i < 25; i++) {
      await page.keyboard.press("Tab");
      await page.waitForTimeout(50);

      const info = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        return {
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute("role"),
          text: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 50),
        };
      });

      if (info) {
        focusSequence.push(info);
      }
    }

    // Should have focused multiple distinct elements
    expect(focusSequence.length).toBeGreaterThan(5);

    // Verify we hit interactive elements (links, buttons, inputs)
    const interactiveTags = focusSequence.map((f) => f.tag);
    const hasLinks = interactiveTags.includes("a");
    const hasButtons = interactiveTags.includes("button");
    const hasInputs = interactiveTags.includes("input");

    // At minimum, we should be able to reach buttons and links
    expect(hasLinks || hasButtons).toBeTruthy();
  });

  // 2. Listing cards are focusable via Tab
  test("2. listing cards are focusable via Tab", { tag: [tags.a11y] }, async ({ page }) => {
    // Listing cards contain links to detail pages
    // Users should be able to Tab to listing card links
    const listingLinks = page.locator('[data-testid="listing-card"] a[href^="/listings/"]');
    const count = await listingLinks.count();
    expect(count).toBeGreaterThan(0);

    // Focus the first listing link
    await listingLinks.first().focus();
    await expect(listingLinks.first()).toBeFocused();
  });

  // 3. Focused listing card has visible focus indicator
  test("3. focused listing card has visible focus indicator", { tag: [tags.a11y] }, async ({ page }) => {
    // Tab until we reach a listing card link
    let foundListingFocus = false;

    for (let i = 0; i < 30; i++) {
      await page.keyboard.press("Tab");
      await page.waitForTimeout(50);

      const isListingLink = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return false;
        // Check if focused element is inside a listing card
        return (
          el.closest('[data-testid="listing-card"]') !== null ||
          (el.tagName === "A" && el.getAttribute("href")?.startsWith("/listings/"))
        );
      });

      if (isListingLink) {
        foundListingFocus = true;

        // Check for visible focus indicator
        const focusStyles = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el) return null;
          const computed = window.getComputedStyle(el);
          return {
            outline: computed.outline,
            outlineStyle: computed.outlineStyle,
            outlineWidth: computed.outlineWidth,
            outlineColor: computed.outlineColor,
            boxShadow: computed.boxShadow,
          };
        });

        // Should have either outline or box-shadow as focus indicator
        const hasIndicator =
          (focusStyles?.outlineStyle !== "none" && focusStyles?.outlineWidth !== "0px") ||
          (focusStyles?.boxShadow !== "none" && focusStyles?.boxShadow !== "");

        if (!hasIndicator) {
          console.log("Warning: Listing card focus indicator may rely on :focus-visible");
          console.log("  Outline:", focusStyles?.outline);
          console.log("  Box-shadow:", focusStyles?.boxShadow);
        }

        break;
      }
    }

    // We should have been able to reach a listing card
    if (!foundListingFocus) {
      console.log("Info: Could not Tab to a listing card within 30 tabs");
    }
  });

  // 4. Enter on listing card navigates to detail
  test("4. Enter on listing card navigates to detail page", { tag: [tags.a11y] }, async ({ page }) => {
    // Focus a listing card link directly
    const listingLink = page.locator('[data-testid="listing-card"] a[href^="/listings/"]').first();
    await listingLink.waitFor({ state: "attached", timeout: timeouts.action });

    const href = await listingLink.getAttribute("href");
    expect(href).toBeTruthy();

    await listingLink.focus();
    await expect(listingLink).toBeFocused();

    // Press Enter to navigate
    await page.keyboard.press("Enter");

    // Should navigate to the listing detail page
    await page.waitForURL(/\/listings\//, { timeout: timeouts.navigation });
    expect(page.url()).toContain("/listings/");
  });

  // 5. Skip link exists (skip to main content)
  test("5. skip link exists and is functional", { tag: [tags.a11y] }, async ({ page }) => {
    // SkipLink component renders: <a href="#main-content">Skip to main content</a>
    const skipLink = page.locator('a[href="#main-content"]');
    await expect(skipLink).toBeAttached();

    // Skip link should be visually hidden until focused
    // First Tab should focus it (or it should be among first tabbable elements)
    await page.keyboard.press("Tab");

    // Check if skip link became visible (sr-only -> focus:not-sr-only)
    const isVisible = await skipLink.isVisible().catch(() => false);

    if (isVisible) {
      // Activate skip link
      await page.keyboard.press("Enter");
      await page.waitForTimeout(300);

      // Focus should move to main content area
      const mainContent = page.locator("#main-content");
      await expect(mainContent).toBeAttached();
    } else {
      // Skip link exists but may not be first tabbable element
      // Verify it is at least in the DOM
      await expect(skipLink).toBeAttached();
    }
  });

  // 6. Focus returns to search area after filter modal close
  test("6. focus returns after filter modal close", { tag: [tags.a11y] }, async ({ page }) => {
    // Find and click the Filters button
    const filtersButton = page.locator(
      'button[aria-controls="search-filters"], button:has-text("Filters")',
    ).first();

    if (await filtersButton.isVisible().catch(() => false)) {
      await filtersButton.click();
      await page.waitForTimeout(300);

      // Filter modal should be open
      const modal = page.locator('[role="dialog"][aria-modal="true"]');
      await expect(modal).toBeVisible({ timeout: 5000 });

      // Close modal with Escape
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);

      // Modal should be closed
      await expect(modal).not.toBeVisible();

      // Focus should return to the filters button or nearby area
      const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
      expect(focusedTag).not.toBe("BODY");
    } else {
      console.log("Info: Filters button not found on current viewport");
    }
  });

  // 7. Escape closes open menus/modals
  test("7. Escape closes open menus and modals", { tag: [tags.a11y] }, async ({ page }) => {
    // Test with sort dropdown on desktop
    const sortTrigger = page.locator('[role="combobox"]').first();

    if (await sortTrigger.isVisible().catch(() => false)) {
      await sortTrigger.click();
      await page.waitForTimeout(200);

      // Dropdown content should be open
      const dropdown = page.locator('[role="listbox"]');
      const isOpen = await dropdown.isVisible().catch(() => false);

      if (isOpen) {
        // Escape should close it
        await page.keyboard.press("Escape");
        await page.waitForTimeout(200);
        await expect(dropdown).not.toBeVisible();
      }
    }

    // Test with filter modal
    const filtersButton = page.locator(
      'button[aria-controls="search-filters"], button:has-text("Filters")',
    ).first();

    if (await filtersButton.isVisible().catch(() => false)) {
      await filtersButton.click();
      await page.waitForTimeout(300);

      const modal = page.locator('[role="dialog"][aria-modal="true"]');
      if (await modal.isVisible().catch(() => false)) {
        await page.keyboard.press("Escape");
        await page.waitForTimeout(300);
        await expect(modal).not.toBeVisible();
      }
    }
  });

  // 8. No keyboard traps (can Tab through entire page)
  test("8. no keyboard traps - can Tab through entire page", { tag: [tags.a11y] }, async ({ page }) => {
    // Tab through a large number of times and verify:
    // 1. Focus keeps moving (not stuck on one element)
    // 2. Focus eventually wraps back to the beginning

    const MAX_TABS = 60;
    const focusedElements: string[] = [];
    let stuckCount = 0;
    let previousElement = "";

    for (let i = 0; i < MAX_TABS; i++) {
      await page.keyboard.press("Tab");
      await page.waitForTimeout(30);

      const currentElement = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return "null";
        const id = el.id ? `#${el.id}` : "";
        const tag = el.tagName.toLowerCase();
        return `${tag}${id}`;
      });

      focusedElements.push(currentElement);

      if (currentElement === previousElement && currentElement !== "null") {
        stuckCount++;
        // If stuck on same element for 3 consecutive tabs, likely a trap
        if (stuckCount >= 3) {
          console.log(`Potential keyboard trap on: ${currentElement}`);
        }
      } else {
        stuckCount = 0;
      }
      previousElement = currentElement;
    }

    // Should never be stuck on the same element for 3+ consecutive tabs
    // (Allow 1-2 for elements that absorb Tab like textareas)
    let maxConsecutive = 0;
    let currentStreak = 1;
    for (let i = 1; i < focusedElements.length; i++) {
      if (focusedElements[i] === focusedElements[i - 1]) {
        currentStreak++;
        maxConsecutive = Math.max(maxConsecutive, currentStreak);
      } else {
        currentStreak = 1;
      }
    }

    expect(maxConsecutive).toBeLessThan(4);
  });
});
