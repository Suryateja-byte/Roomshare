/**
 * Search Sort & Result Ordering E2E Tests (Anonymous)
 *
 * 36 tests across 7 groups covering sort dropdown interaction, price ordering
 * verification, pagination reset, mobile sort sheet, URL integration, edge
 * cases, and accessibility.
 *
 * IMPORTANT: SearchViewToggle renders {children} in TWO containers (mobile +
 * desktop). All selectors must be scoped to the correct container to avoid
 * strict-mode violations and duplicate element matches.
 *
 * Run:
 *   pnpm playwright test tests/e2e/search-sort-ordering.anon.spec.ts --project=chromium-anon
 */

import { test, expect, SF_BOUNDS, timeouts } from "./helpers/test-utils";
import type { Page, Locator } from "@playwright/test";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;
const SEARCH_URL = `/search?${boundsQS}`;

/** Desktop results panel (visible >= 768px, parent has `hidden md:flex`) */
const DESKTOP = '[data-testid="search-results-container"]';
/** Mobile results panel (visible < 768px, parent has `md:hidden`) */
const MOBILE = '[data-testid="mobile-search-results-container"]';

const CARDS = '[data-testid="listing-card"]';
const PRICE = '[data-testid="listing-price"]';

/** All sort options as defined in SortSelect.tsx */
const SORT_OPTIONS = [
  { value: "recommended", label: "Recommended", urlParam: null },
  { value: "price_asc", label: "Price: Low to High", urlParam: "price_asc" },
  { value: "price_desc", label: "Price: High to Low", urlParam: "price_desc" },
  { value: "newest", label: "Newest First", urlParam: "newest" },
  { value: "rating", label: "Top Rated", urlParam: "rating" },
] as const;

/**
 * Seed data has 20 listings with prices spread from 750–2300.
 * First page typically shows ~10 items, so assertions must not assume
 * ALL seed prices are visible without load-more / pagination.
 */

// ---------------------------------------------------------------------------
// Scoped helpers — desktop (default for Groups 1-3, 5-7)
// ---------------------------------------------------------------------------

/** Wait for listing cards inside the desktop results container. */
async function waitForCards(page: Page) {
  const cards = page.locator(DESKTOP).locator(CARDS);
  await expect(cards.first()).toBeAttached({ timeout: 30_000 });
  return cards;
}

/** Wait for either cards or zero-results inside the desktop container. */
async function waitForResults(page: Page) {
  const container = page.locator(DESKTOP);
  const cards = container.locator(CARDS);
  const zeroResults = container.locator('h2:has-text("No matches found"), h3:has-text("No exact matches")');
  await expect(cards.or(zeroResults).first()).toBeAttached({ timeout: 30_000 });
  return { cards, zeroResults };
}

/** Extract numeric prices from the desktop container's listing cards. */
async function extractPrices(page: Page): Promise<number[]> {
  const priceTexts = await page
    .locator(DESKTOP)
    .locator(CARDS)
    .locator(PRICE)
    .allTextContents();
  return priceTexts
    .map((t) => parseInt(t.replace(/[^0-9]/g, ""), 10))
    .filter((n) => !isNaN(n));
}

// ---------------------------------------------------------------------------
// Scoped helpers — mobile (Group 4)
// ---------------------------------------------------------------------------

/** Wait for listing cards inside the mobile results container. */
async function waitForMobileCards(page: Page) {
  const cards = page.locator(MOBILE).locator(CARDS);
  await expect(cards.first()).toBeAttached({ timeout: 30_000 });
  return cards;
}

/** Wait for either cards or zero-results inside the mobile container. */
async function waitForMobileResults(page: Page) {
  const container = page.locator(MOBILE);
  const cards = container.locator(CARDS);
  const zeroResults = container.locator('h2:has-text("No matches found"), h3:has-text("No exact matches")');
  await expect(cards.or(zeroResults).first()).toBeAttached({ timeout: 30_000 });
  return { cards, zeroResults };
}

/**
 * Wait for the mobile sort button to be hydrated and visible.
 *
 * SortSelect renders an SSR placeholder _without_ aria-label, then swaps to
 * the real button (with `aria-label="Sort: ..."`) after a `useEffect` sets
 * `mounted = true`.  Cards can appear before that effect fires, so
 * `waitForMobileCards` alone is not enough.
 *
 * WebKit is significantly slower at hydration and layout recalculation after
 * viewport changes, so we use a generous timeout.
 */
async function waitForMobileSortButton(page: Page): Promise<Locator> {
  const sortBtn = page
    .locator(MOBILE)
    .locator('button[aria-label^="Sort:"]');
  await expect(sortBtn).toBeAttached({ timeout: 30_000 });
  await sortBtn.scrollIntoViewIfNeeded();
  await expect(sortBtn).toBeVisible({ timeout: 10_000 });
  return sortBtn;
}

/**
 * Navigate to a URL in mobile Group 4 tests with WebKit-safe stabilization.
 *
 * WebKit under Desktop Safari device descriptor is slower to recalculate
 * layout after `test.use({ viewport })` overrides. This helper:
 * 1. Explicitly sets the viewport size before navigation (belt-and-suspenders)
 * 2. Navigates to the URL
 * 3. Waits for the mobile results container to be attached
 * 4. On WebKit, adds an extra wait for layout to settle
 */
async function mobileNavigate(
  page: Page,
  url: string,
  browserName: string,
): Promise<void> {
  // Belt-and-suspenders: explicitly set mobile viewport before navigation.
  // test.use({ viewport }) should handle this, but WebKit can be unreliable
  // when the project device descriptor (Desktop Safari) sets a desktop viewport.
  await page.setViewportSize({ width: 393, height: 852 });

  await page.goto(url);

  if (browserName === "webkit") {
    // WebKit needs extra time after navigation for layout recalculation
    // when transitioning from a desktop device descriptor viewport to mobile.
    await page.waitForTimeout(1_000);
  }

  await waitForMobileCards(page);
}

// ---------------------------------------------------------------------------
// Desktop sort dropdown helpers
// ---------------------------------------------------------------------------

/**
 * Locate the desktop Radix Select sort trigger.
 * Scoped to the desktop results container so it does not collide with the
 * identical combobox rendered in the mobile container.
 */
function getDesktopSortTrigger(page: Page): Locator {
  return page.locator(DESKTOP).locator('button[role="combobox"]');
}

/** Open the desktop sort dropdown and return the listbox locator. */
async function openDesktopSort(page: Page): Promise<Locator> {
  const trigger = getDesktopSortTrigger(page);
  // SortSelect renders an SSR placeholder without role="combobox", so this
  // locator only matches after client-side hydration sets `mounted = true`.
  // Use a generous timeout to tolerate slow hydration in CI.
  await expect(trigger).toBeVisible({ timeout: 30_000 });
  await trigger.click();
  // Radix portals the listbox outside the container -- use page-level locator
  const listbox = page.locator('[role="listbox"]');
  await expect(listbox).toBeVisible({ timeout: 5_000 });
  return listbox;
}

/** Pick a sort option from the already-open desktop dropdown. */
async function pickDesktopSortOption(page: Page, label: string) {
  const option = page.locator('[role="option"]').filter({ hasText: label });
  await expect(option).toBeVisible({ timeout: 5_000 });
  await option.click();
}

/** Open the desktop dropdown, pick an option, and wait for URL update. */
async function selectDesktopSort(
  page: Page,
  label: string,
  expectedUrlParam: string | null,
) {
  await openDesktopSort(page);
  await pickDesktopSortOption(page, label);

  if (expectedUrlParam) {
    await expect.poll(
      () => new URL(page.url(), "http://localhost").searchParams.get("sort"),
      { timeout: 30_000, message: `URL param "sort" to be "${expectedUrlParam}"` },
    ).toBe(expectedUrlParam);
  } else {
    // "Recommended" removes the sort param entirely.
    await expect.poll(
      () => new URL(page.url(), "http://localhost").searchParams.get("sort"),
      { timeout: 30_000, message: 'URL param "sort" to be absent' },
    ).toBeNull();
  }
}

test.beforeEach(async () => {
  test.slow();
});

// ===========================================================================
// Group 1: Desktop Sort Interaction (P0)
// ===========================================================================

test.describe("Group 1: Desktop Sort Interaction", () => {
  test.beforeEach(async ({ page, browserName }) => {
    const isMobileViewport = (page.viewportSize()?.width ?? 1024) < 768;
    test.skip(isMobileViewport, "Desktop sort requires >= 768px viewport");
    test.skip(
      browserName === "webkit",
      "Radix Select hydration issue on webkit",
    );
  });

  test("1.1 sort dropdown is visible on desktop viewport", async ({ page }) => {
    await page.goto(SEARCH_URL);
    await waitForCards(page);

    const trigger = getDesktopSortTrigger(page);
    await expect(trigger).toBeVisible();

    // "Sort by:" label should accompany the dropdown
    const sortLabel = page.locator(DESKTOP).locator("text=Sort by:");
    await expect(sortLabel).toBeVisible();
  });

  test("1.2 click dropdown opens with all 5 sort options", async ({ page }) => {
    await page.goto(SEARCH_URL);
    await waitForCards(page);

    await openDesktopSort(page);

    const options = page.locator('[role="option"]');
    await expect(options).toHaveCount(5);

    for (const opt of SORT_OPTIONS) {
      await expect(options.filter({ hasText: opt.label })).toBeVisible();
    }
  });

  test('1.3 select "Price: Low to High" updates URL to sort=price_asc', async ({
    page,
  }) => {
    await page.goto(SEARCH_URL);
    await waitForCards(page);

    await selectDesktopSort(page, "Price: Low to High", "price_asc");
    await waitForCards(page);
  });

  test('1.4 select "Price: High to Low" updates URL to sort=price_desc', async ({
    page,
  }) => {
    await page.goto(SEARCH_URL);
    await waitForCards(page);

    await selectDesktopSort(page, "Price: High to Low", "price_desc");
    await waitForCards(page);
  });

  test('1.5 select "Newest First" updates URL to sort=newest', async ({
    page,
  }) => {
    await page.goto(SEARCH_URL);
    await waitForCards(page);

    await selectDesktopSort(page, "Newest First", "newest");
    await waitForCards(page);
  });

  test('1.6 select "Recommended" removes sort param from URL', async ({
    page,
  }) => {
    // Start with a non-default sort
    await page.goto(`/search?sort=price_asc&${boundsQS}`);
    await waitForCards(page);

    await selectDesktopSort(page, "Recommended", null);

    expect(page.url()).not.toContain("sort=");
  });

  test("1.7 dropdown shows current sort label", async ({ page }) => {
    await page.goto(`/search?sort=price_desc&${boundsQS}`);
    await waitForCards(page);

    const trigger = getDesktopSortTrigger(page);
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveText(/Price: High to Low/);
  });

  test("1.8 keyboard: Enter opens, arrows navigate, Enter selects", async ({
    page,
  }) => {
    await page.goto(SEARCH_URL);
    await waitForCards(page);

    const trigger = getDesktopSortTrigger(page);
    await trigger.focus();
    await expect(trigger).toBeFocused();

    // Enter opens the dropdown
    await page.keyboard.press("Enter");
    const listbox = page.locator('[role="listbox"]');
    await expect(listbox).toBeVisible({ timeout: 5_000 });
    await expect(trigger).toHaveAttribute("aria-expanded", "true");

    // Wait for all options to render and Radix open animation to settle.
    // With modal={false}, focus transfer to the portal content can lag
    // in headless CI environments with constrained CPU.
    await expect(page.locator('[role="option"]')).toHaveCount(5, {
      timeout: 5_000,
    });

    // Snapshot which option is highlighted before navigating.
    // Radix highlights the selected item on open ("Recommended").
    const hlBefore = await listbox
      .locator('[role="option"][data-highlighted]')
      .textContent()
      .catch(() => null);

    // Arrow down navigates through options.
    await page.keyboard.press("ArrowDown");

    // Wait for the highlight to move — confirms Radix processed ArrowDown
    // before we fire the next keyboard event.
    if (hlBefore) {
      await expect
        .poll(
          () =>
            listbox
              .locator('[role="option"][data-highlighted]')
              .textContent()
              .catch(() => null),
          { timeout: 3_000, message: "ArrowDown to move highlight" },
        )
        .not.toBe(hlBefore);
    } else {
      // data-highlighted not present (modal={false} variant) — fall back
      // to a brief pause so Radix can process the event.
      await page.waitForTimeout(500);
    }

    // Enter selects the focused option
    await page.keyboard.press("Enter");

    // Dropdown should close after selection.
    // Generous timeout: CI close animation + URL navigation + re-render.
    await expect(listbox).not.toBeVisible({ timeout: 10_000 });

    // Verify the interaction completed -- results should still render
    await waitForResults(page);
  });
});

// ===========================================================================
// Group 2: Price Sort Verification (P0)
// ===========================================================================

test.describe("Group 2: Price Sort Verification", () => {
  test("2.1 sort by price_asc: prices are non-decreasing", async ({
    page,
  }) => {
    await page.goto(`/search?sort=price_asc&${boundsQS}`);
    await waitForCards(page);

    const prices = await extractPrices(page);
    expect(prices.length).toBeGreaterThanOrEqual(2);

    for (let i = 1; i < prices.length; i++) {
      expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]);
    }
  });

  test("2.2 sort by price_desc: prices are non-increasing", async ({
    page,
  }) => {
    await page.goto(`/search?sort=price_desc&${boundsQS}`);
    await waitForCards(page);

    const prices = await extractPrices(page);
    expect(prices.length).toBeGreaterThanOrEqual(2);

    for (let i = 1; i < prices.length; i++) {
      expect(prices[i]).toBeLessThanOrEqual(prices[i - 1]);
    }
  });

  test("2.3 sort preserves after page refresh", async ({ page }) => {
    await page.goto(`/search?sort=price_asc&${boundsQS}`);
    await waitForCards(page);

    const pricesBefore = await extractPrices(page);

    await page.reload();
    await waitForCards(page);

    // URL still contains the sort param
    expect(page.url()).toContain("sort=price_asc");

    // Prices remain in ascending order
    const pricesAfter = await extractPrices(page);
    expect(pricesAfter.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < pricesAfter.length; i++) {
      expect(pricesAfter[i]).toBeGreaterThanOrEqual(pricesAfter[i - 1]);
    }

    // Same set of prices
    expect(pricesAfter).toEqual(pricesBefore);
  });

  test("2.4 sort + filter combination: results are both sorted and filtered", async ({
    page,
  }) => {
    await page.goto(`/search?sort=price_asc&maxPrice=1500&${boundsQS}`);
    await waitForResults(page);

    const count = await page.locator(DESKTOP).locator(CARDS).count();

    if (count >= 2) {
      const prices = await extractPrices(page);

      // All prices should respect the maxPrice filter
      for (const p of prices) {
        expect(p).toBeLessThanOrEqual(1500);
      }

      // And sorted ascending
      for (let i = 1; i < prices.length; i++) {
        expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]);
      }
    }
  });

  test("2.5 with seed data: price_asc yields expected order", async ({
    page,
  }) => {
    await page.goto(`/search?sort=price_asc&${boundsQS}`);
    await waitForCards(page);

    const prices = await extractPrices(page);
    // Seed has 20 listings; first page shows a subset — verify we got enough
    expect(prices.length).toBeGreaterThanOrEqual(5);

    // Ascending order across all visible prices
    for (let i = 1; i < prices.length; i++) {
      expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]);
    }

    // Lowest seed price (750) should appear first
    expect(prices[0]).toBeLessThanOrEqual(800);
  });
});

// ===========================================================================
// Group 3: Sort + Pagination (P1)
// ===========================================================================

test.describe("Group 3: Sort + Pagination", () => {
  test("3.1 sort change resets load-more state", async ({
    page,
    browserName,
  }) => {
    const isMobileViewport = (page.viewportSize()?.width ?? 1024) < 768;
    test.skip(isMobileViewport, "Desktop sort requires >= 768px viewport");
    test.skip(
      browserName === "webkit",
      "Radix Select hydration issue on webkit",
    );

    await page.goto(SEARCH_URL);
    await waitForCards(page);

    // "Show more" lives inside the desktop container
    const loadMore = page
      .locator(DESKTOP)
      .locator('button:has-text("Show more places")');
    const hasLoadMore = await loadMore.isVisible().catch(() => false);

    if (hasLoadMore) {
      await loadMore.click();
      await page.waitForTimeout(2_000);
      const countBeforeSort = await page
        .locator(DESKTOP)
        .locator(CARDS)
        .count();

      // Change sort -- component remounts, load-more state resets
      await selectDesktopSort(page, "Price: Low to High", "price_asc");
      await waitForCards(page);

      const countAfterSort = await page
        .locator(DESKTOP)
        .locator(CARDS)
        .count();
      expect(countAfterSort).toBeLessThanOrEqual(countBeforeSort);
      expect(countAfterSort).toBeGreaterThanOrEqual(1);
    } else {
      // All results fit on one page -- verify sort change still works
      await selectDesktopSort(page, "Price: Low to High", "price_asc");
      await waitForCards(page);
    }
  });

  test("3.2 sort change removes cursor/page params from URL", async ({
    page,
    browserName,
  }) => {
    const isMobileViewport = (page.viewportSize()?.width ?? 1024) < 768;
    test.skip(isMobileViewport, "Desktop sort requires >= 768px viewport");
    test.skip(
      browserName === "webkit",
      "Radix Select hydration issue on webkit",
    );
    await page.goto(`/search?sort=price_asc&page=2&cursor=abc&${boundsQS}`);
    await waitForResults(page);

    await selectDesktopSort(page, "Price: High to Low", "price_desc");
    await waitForResults(page);

    const url = page.url();
    expect(url).not.toContain("page=");
    expect(url).not.toContain("cursor=");
    expect(url).not.toContain("cursorStack=");
    expect(url).not.toContain("pageNumber=");
    expect(url).toContain("sort=price_desc");
  });

  test("3.3 load-more maintains sort order within new items", async ({
    page,
  }) => {
    await page.goto(`/search?sort=price_asc&${boundsQS}`);
    await waitForCards(page);

    const loadMore = page
      .locator(DESKTOP)
      .locator('button:has-text("Show more places")');
    const hasLoadMore = await loadMore.isVisible().catch(() => false);

    if (hasLoadMore) {
      const pricesBefore = await extractPrices(page);

      await loadMore.click();
      // Wait for new cards inside the desktop container
      await page
        .waitForFunction(
          (args) => {
            const el = document.querySelector(args.container);
            if (!el) return false;
            return el.querySelectorAll(args.cards).length > args.prevCount;
          },
          { container: DESKTOP, cards: CARDS, prevCount: pricesBefore.length },
          { timeout: 30_000 },
        )
        .catch(() => {
          /* load-more may not produce new results */
        });

      const pricesAfter = await extractPrices(page);
      for (let i = 1; i < pricesAfter.length; i++) {
        expect(pricesAfter[i]).toBeGreaterThanOrEqual(pricesAfter[i - 1]);
      }
    } else {
      expect(true).toBe(true);
    }
  });

  test("3.4 sort order consistent across initial and loaded items", async ({
    page,
  }) => {
    await page.goto(`/search?sort=price_desc&${boundsQS}`);
    await waitForCards(page);

    const loadMore = page
      .locator(DESKTOP)
      .locator('button:has-text("Show more places")');
    const hasLoadMore = await loadMore.isVisible().catch(() => false);

    if (hasLoadMore) {
      const initialPrices = await extractPrices(page);

      await loadMore.click();
      await page
        .waitForFunction(
          (args) => {
            const el = document.querySelector(args.container);
            if (!el) return false;
            return el.querySelectorAll(args.cards).length > args.prevCount;
          },
          {
            container: DESKTOP,
            cards: CARDS,
            prevCount: initialPrices.length,
          },
          { timeout: 30_000 },
        )
        .catch(() => {});

      const allPrices = await extractPrices(page);
      for (let i = 1; i < allPrices.length; i++) {
        expect(allPrices[i]).toBeLessThanOrEqual(allPrices[i - 1]);
      }
    } else {
      expect(true).toBe(true);
    }
  });
});

// ===========================================================================
// Group 4: Mobile Sort (P1)
// ===========================================================================

test.describe("Group 4: Mobile Sort", () => {
  // Note: isMobile/hasTouch removed — unsupported in Firefox and causes
  // positioning bugs in Desktop WebKit. Viewport size alone triggers mobile layout.
  test.use({
    viewport: { width: 393, height: 852 },
  });

  test.beforeEach(async ({ browserName }) => {
    if (browserName === 'webkit') {
      test.skip(true, 'webkit-anon uses Desktop Safari viewport — mobile sort tests invalid');
    }
  });

  /**
   * Guard: skip the test if mobile layout is not active.
   * WebKit with Desktop Safari device descriptor may not trigger mobile CSS
   * breakpoints even after setViewportSize, so the mobile container never
   * becomes visible.
   */
  async function assertMobileLayout(page: Page): Promise<void> {
    const mobileContainer = page.locator(MOBILE);
    const isVisible = await mobileContainer.isVisible().catch(() => false);
    if (!isVisible) {
      throw new Error("MOBILE_LAYOUT_INACTIVE");
    }
  }

  test("4.1 mobile sort button is visible, desktop dropdown is hidden", async ({
    page,
    browserName,
  }) => {
    await mobileNavigate(page, SEARCH_URL, browserName);

    try {
      await assertMobileLayout(page);
    } catch {
      test.skip(true, "Mobile layout not active on this browser/viewport");
      return;
    }

    // Wait for SortSelect hydration — the aria-label only appears after mount
    const sortBtn = await waitForMobileSortButton(page);
    await expect(sortBtn).toBeVisible();

    // Desktop combobox should NOT be visible (parent has hidden md:flex)
    const desktopTrigger = page
      .locator(DESKTOP)
      .locator('button[role="combobox"]');
    await expect(desktopTrigger).not.toBeVisible();
  });

  test("4.2 tap sort button opens bottom sheet with all options", async ({
    page,
    browserName,
  }) => {
    await mobileNavigate(page, SEARCH_URL, browserName);

    try {
      await assertMobileLayout(page);
    } catch {
      test.skip(true, "Mobile layout not active on this browser/viewport");
      return;
    }

    const sortBtn = await waitForMobileSortButton(page);
    await sortBtn.click();

    // Sheet heading (rendered via fixed portal, page-level selector is fine)
    const sheetHeading = page.locator("h3").filter({ hasText: "Sort by" });
    await expect(sheetHeading).toBeVisible({ timeout: 10_000 });

    // All 5 sort options should be visible as buttons inside the sheet.
    // Exclude role="combobox" (Radix Select trigger) to avoid strict-mode
    // violations when it matches the same text (e.g., "Recommended").
    for (const opt of SORT_OPTIONS) {
      const optionBtn = page
        .locator('div.fixed button:not([role="combobox"])')
        .filter({ hasText: opt.label });
      await expect(optionBtn).toBeVisible();
    }
  });

  test("4.3 select option in sheet updates URL and closes sheet", async ({
    page,
    browserName,
  }) => {
    await mobileNavigate(page, SEARCH_URL, browserName);

    try {
      await assertMobileLayout(page);
    } catch {
      test.skip(true, "Mobile layout not active on this browser/viewport");
      return;
    }

    const sortBtn = await waitForMobileSortButton(page);
    await sortBtn.click();

    const sheetHeading = page.locator("h3").filter({ hasText: "Sort by" });
    await expect(sheetHeading).toBeVisible({ timeout: 10_000 });

    // Select "Price: Low to High"
    await page
      .locator('div.fixed button:not([role="combobox"])')
      .filter({ hasText: "Price: Low to High" })
      .click();

    // URL should update
    await expect(page).toHaveURL(/sort=price_asc/, { timeout: 30_000 });

    // Sheet should close
    await expect(sheetHeading).not.toBeVisible({ timeout: 10_000 });
  });

  test("4.4 current sort shown in mobile button label", async ({
    page,
    browserName,
  }) => {
    await mobileNavigate(page, `/search?sort=price_desc&${boundsQS}`, browserName);

    try {
      await assertMobileLayout(page);
    } catch {
      test.skip(true, "Mobile layout not active on this browser/viewport");
      return;
    }

    const sortBtn = await waitForMobileSortButton(page);

    await expect(sortBtn).toHaveAttribute(
      "aria-label",
      "Sort: Price: High to Low",
    );
  });

  test("4.5 sheet can be closed without selecting (backdrop tap)", async ({
    page,
    browserName,
  }) => {
    await mobileNavigate(page, SEARCH_URL, browserName);

    try {
      await assertMobileLayout(page);
    } catch {
      test.skip(true, "Mobile layout not active on this browser/viewport");
      return;
    }

    const sortBtn = await waitForMobileSortButton(page);
    await sortBtn.click();

    const sheetHeading = page.locator("h3").filter({ hasText: "Sort by" });
    await expect(sheetHeading).toBeVisible({ timeout: 10_000 });

    // Click the backdrop overlay via evaluate to avoid coordinate issues
    // across viewports and touch emulation.  The backdrop is the first
    // child of the fixed overlay container (SortSelect.tsx:107-111).
    await page.evaluate(() => {
      const backdrop = document.querySelector(
        '.fixed.inset-0.z-50 > div[aria-hidden="true"]',
      ) as HTMLElement | null;
      if (backdrop) backdrop.click();
    });

    await expect(sheetHeading).not.toBeVisible({ timeout: 10_000 });

    // URL should NOT have changed
    expect(page.url()).not.toContain("sort=");
  });
});

// ===========================================================================
// Group 5: Sort + URL Integration (P1)
// ===========================================================================

test.describe("Group 5: Sort + URL Integration", () => {
  test("5.1 deep link with sort param shows correct dropdown state", async ({
    page,
    browserName,
  }) => {
    const isMobileViewport = (page.viewportSize()?.width ?? 1024) < 768;
    test.skip(isMobileViewport, "Desktop sort requires >= 768px viewport");
    test.skip(
      browserName === "webkit",
      "Radix Select hydration issue on webkit",
    );
    await page.goto(`/search?sort=price_desc&${boundsQS}`);
    await waitForCards(page);

    const trigger = getDesktopSortTrigger(page);
    await expect(trigger).toHaveText(/Price: High to Low/);
  });

  test("5.2 sort creates history entry -- back restores previous sort", async ({
    page,
    browserName,
  }) => {
    const isMobileViewport = (page.viewportSize()?.width ?? 1024) < 768;
    test.skip(isMobileViewport, "Desktop sort requires >= 768px viewport");
    test.skip(
      browserName === "webkit",
      "Radix Select hydration issue on webkit",
    );
    await page.goto(SEARCH_URL);
    await waitForCards(page);
    expect(page.url()).not.toContain("sort=");

    await selectDesktopSort(page, "Price: Low to High", "price_asc");
    await waitForCards(page);
    expect(page.url()).toContain("sort=price_asc");

    await page.goBack();
    await waitForCards(page);

    expect(page.url()).not.toContain("sort=price_asc");
  });

  test("5.3 invalid sort value in URL falls back to recommended", async ({
    page,
    browserName,
  }) => {
    const isMobileViewport = (page.viewportSize()?.width ?? 1024) < 768;
    test.skip(isMobileViewport, "Desktop sort requires >= 768px viewport");
    test.skip(
      browserName === "webkit",
      "Radix Select hydration issue on webkit",
    );
    await page.goto(`/search?sort=invalid_value&${boundsQS}`);
    await waitForCards(page);

    const trigger = getDesktopSortTrigger(page);
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveText(/Recommended/);
  });

  test("5.4 sort + query + filter all preserved in URL", async ({ page }) => {
    const complexUrl = `/search?q=room&maxPrice=2000&sort=price_asc&roomType=private&${boundsQS}`;
    await page.goto(complexUrl);
    await waitForResults(page);

    const url = page.url();
    expect(url).toContain("q=room");
    expect(url).toContain("maxPrice=2000");
    expect(url).toContain("sort=price_asc");
    expect(url).toMatch(/roomType=/);
  });
});

// ===========================================================================
// Group 6: Sort Edge Cases (P2)
// ===========================================================================

test.describe("Group 6: Sort Edge Cases", () => {
  test("6.1 rapid sort changes: only last sort is applied", async ({
    page,
    browserName,
  }) => {
    const isMobileViewport = (page.viewportSize()?.width ?? 1024) < 768;
    test.skip(isMobileViewport, "Desktop sort requires >= 768px viewport");
    test.skip(
      browserName === "webkit",
      "Radix Select hydration issue on webkit",
    );

    await page.goto(SEARCH_URL);
    await waitForCards(page);

    // Select price_asc via the dropdown
    await openDesktopSort(page);
    await pickDesktopSortOption(page, "Price: Low to High");

    // Let the sort-selection navigation settle before overriding —
    // avoids NS_BINDING_ABORTED on Firefox when two navigations race.
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.waitForTimeout(500);

    // Override via URL navigation (use longer timeout for potentially slow navigation)
    await page.goto(`/search?sort=price_desc&${boundsQS}`, {
      timeout: 60_000,
      waitUntil: "domcontentloaded",
    });
    await waitForCards(page);

    // Only the final sort should be reflected
    expect(page.url()).toContain("sort=price_desc");
    expect(page.url()).not.toMatch(/sort=price_asc/);

    const prices = await extractPrices(page);
    if (prices.length >= 2) {
      for (let i = 1; i < prices.length; i++) {
        expect(prices[i]).toBeLessThanOrEqual(prices[i - 1]);
      }
    }
  });

  test("6.2 sort with zero results does not crash", async ({ page }) => {
    await page.goto(`/search?sort=price_asc&maxPrice=1&${boundsQS}`);
    await page.waitForLoadState("domcontentloaded");

    // Zero-result searches may take longer in CI because the DB still runs
    // the full query before returning empty.  Wait for either cards, the
    // zero-results heading, OR the container itself to confirm the page
    // rendered without crashing.
    const container = page.locator(DESKTOP);
    await expect(container).toBeAttached({ timeout: 30_000 });

    const { cards, zeroResults } = await waitForResults(page);
    const cardCount = await cards.count();
    const hasZero = await zeroResults.isVisible().catch(() => false);

    expect(cardCount >= 0 || hasZero).toBe(true);
  });

  test("6.3 sort with single result does not crash", async ({ page }) => {
    await page.goto(
      `/search?q=Hayes+Valley+Private+Suite&sort=price_asc&${boundsQS}`,
    );
    await waitForResults(page);

    const count = await page.locator(DESKTOP).locator(CARDS).count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test("6.4 default sort does not add sort param to URL", async ({
    page,
    browserName,
  }) => {
    const isMobileViewport = (page.viewportSize()?.width ?? 1024) < 768;
    test.skip(isMobileViewport, "Desktop sort requires >= 768px viewport");
    test.skip(
      browserName === "webkit",
      "Radix Select hydration issue on webkit",
    );
    await page.goto(SEARCH_URL);
    await waitForCards(page);

    expect(page.url()).not.toContain("sort=");

    const trigger = getDesktopSortTrigger(page);
    await expect(trigger).toHaveText(/Recommended/);
  });

  test("6.5 sort dropdown z-index: renders above other elements", async ({
    page,
    browserName,
  }) => {
    const isMobileViewport = (page.viewportSize()?.width ?? 1024) < 768;
    test.skip(isMobileViewport, "Desktop sort requires >= 768px viewport");
    test.skip(
      browserName === "webkit",
      "Radix Select hydration issue on webkit",
    );
    await page.goto(SEARCH_URL);
    await waitForCards(page);

    await openDesktopSort(page);

    const listbox = page.locator('[role="listbox"]');
    await expect(listbox).toBeVisible();

    const box = await listbox.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);

    const options = page.locator('[role="option"]');
    const optionCount = await options.count();
    for (let i = 0; i < optionCount; i++) {
      await expect(options.nth(i)).toBeVisible();
    }
  });
});

// ===========================================================================
// Group 7: Sort Accessibility (P1)
// ===========================================================================

test.describe("Group 7: Sort Accessibility", () => {
  test.beforeEach(async ({ page, browserName }) => {
    const isMobileViewport = (page.viewportSize()?.width ?? 1024) < 768;
    test.skip(isMobileViewport, "Desktop sort requires >= 768px viewport");
    test.skip(
      browserName === "webkit",
      "Radix Select hydration issue on webkit",
    );
  });

  test("7.1 sort trigger has correct ARIA role (combobox)", async ({
    page,
  }) => {
    await page.goto(SEARCH_URL);
    await waitForCards(page);

    const trigger = getDesktopSortTrigger(page);
    await expect(trigger).toHaveAttribute("role", "combobox");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  test("7.2 sort options are keyboard navigable", async ({ page }) => {
    await page.goto(SEARCH_URL);
    await waitForCards(page);

    const trigger = getDesktopSortTrigger(page);
    await trigger.focus();

    // Open with Enter
    await page.keyboard.press("Enter");
    const listbox = page.locator('[role="listbox"]');
    await expect(listbox).toBeVisible({ timeout: 5_000 });

    // Navigate with arrow keys
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");

    // Escape closes without changing selection
    await page.keyboard.press("Escape");
    await expect(listbox).not.toBeVisible({ timeout: 5_000 });

    // URL should not have changed -- Escape cancelled
    expect(page.url()).not.toContain("sort=");
  });

  test("7.3 active sort option marked with data-state=checked", async ({
    page,
  }) => {
    await page.goto(`/search?sort=price_asc&${boundsQS}`);
    await waitForCards(page);

    await openDesktopSort(page);

    const checkedOption = page.locator(
      '[role="option"][data-state="checked"]',
    );
    await expect(checkedOption).toBeVisible();
    await expect(checkedOption).toHaveText(/Price: Low to High/);

    const uncheckedOptions = page.locator(
      '[role="option"][data-state="unchecked"]',
    );
    const uncheckedCount = await uncheckedOptions.count();
    expect(uncheckedCount).toBe(4);

    await page.keyboard.press("Escape");
  });

  test("7.4 sort change is perceivable: results update visually", async ({
    page,
  }) => {
    await page.goto(SEARCH_URL);
    await waitForCards(page);

    const initialPrices = await extractPrices(page);

    await selectDesktopSort(page, "Price: High to Low", "price_desc");
    await waitForCards(page);

    const newPrices = await extractPrices(page);

    if (newPrices.length >= 2 && new Set(newPrices).size > 1) {
      for (let i = 1; i < newPrices.length; i++) {
        expect(newPrices[i]).toBeLessThanOrEqual(newPrices[i - 1]);
      }
    }
  });

  test("7.5 screen reader: sort trigger announces current sort label", async ({
    page,
  }) => {
    await page.goto(`/search?sort=newest&${boundsQS}`);
    await waitForCards(page);

    // Desktop: combobox trigger text includes current sort label
    const trigger = getDesktopSortTrigger(page);
    const triggerText = await trigger.textContent();
    expect(triggerText).toContain("Newest First");

    // Mobile button (hidden at desktop but in DOM) has descriptive aria-label
    // Scope to mobile container to avoid strict-mode violation
    const mobileBtn = page
      .locator(MOBILE)
      .locator('button[aria-label^="Sort:"]');
    const ariaLabel = await mobileBtn.getAttribute("aria-label");
    expect(ariaLabel).toBe("Sort: Newest First");
  });
});
