/**
 * Shared Filter Test Helpers
 *
 * Extracts common patterns from 16+ filter test files into one module.
 * Provides constants, URL helpers, modal interaction, chip inspection,
 * filter-specific toggles, and race condition utilities.
 *
 * Usage:
 * ```typescript
 * import {
 *   SEARCH_URL, boundsQS, waitForSearchReady, openFilterModal,
 *   applyFilters, getUrlParam, expectUrlParam, appliedFiltersRegion,
 * } from "../helpers/filter-helpers";
 * ```
 */

import type { Page, Locator } from "@playwright/test";
import { expect } from "@playwright/test";
import { SF_BOUNDS, selectors, searchResultsContainer } from "./test-utils";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** SF bounds as a URL query string fragment */
export const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;

/** Base search URL with SF bounds */
export const SEARCH_URL = `/search?${boundsQS}`;

/** Valid amenity values matching filter-schema.ts */
export const VALID_AMENITIES = [
  "Wifi",
  "AC",
  "Parking",
  "Washer",
  "Dryer",
  "Kitchen",
  "Gym",
  "Pool",
  "Furnished",
] as const;

/** Valid house rule values */
export const HOUSE_RULES = [
  "Pets allowed",
  "Smoking allowed",
  "Couples allowed",
  "Guests allowed",
] as const;

/** Valid lease duration values */
export const LEASE_DURATIONS = [
  "Month-to-month",
  "3 months",
  "6 months",
  "12 months",
  "Flexible",
] as const;

/** Valid room type values */
export const ROOM_TYPES = [
  "Private Room",
  "Shared Room",
  "Entire Place",
] as const;

/** Valid sort options */
export const SORT_OPTIONS = [
  "recommended",
  "price_asc",
  "price_desc",
  "newest",
  "rating",
] as const;

// ---------------------------------------------------------------------------
// URL Helpers
// ---------------------------------------------------------------------------

/** Read a single URL search param */
export function getUrlParam(page: Page, key: string): string | null {
  return new URL(page.url()).searchParams.get(key);
}

/** Read all URL search params */
export function getUrlParams(page: Page): URLSearchParams {
  return new URL(page.url()).searchParams;
}

/** Check if URL has a specific param */
export function urlHasParam(page: Page, key: string): boolean {
  return new URL(page.url()).searchParams.has(key);
}

/** Build a search URL from params (merges with SF bounds) */
export function buildSearchUrl(params?: Record<string, string>): string {
  if (!params || Object.keys(params).length === 0) return SEARCH_URL;
  const extra = new URLSearchParams(params).toString();
  return `${SEARCH_URL}&${extra}`;
}

/**
 * Wait for URL to contain a param with optional value match.
 * Uses expect.poll() to detect Next.js soft navigation (pushState/replaceState).
 */
export async function waitForUrlParam(
  page: Page,
  key: string,
  value?: string,
  timeout = 30_000
): Promise<void> {
  if (value !== undefined) {
    await expect
      .poll(
        () => new URL(page.url(), "http://localhost").searchParams.get(key),
        { timeout, message: `URL param "${key}" to be "${value}"` }
      )
      .toBe(value);
  } else {
    await expect
      .poll(
        () => new URL(page.url(), "http://localhost").searchParams.get(key),
        { timeout, message: `URL param "${key}" to be present` }
      )
      .not.toBeNull();
  }
}

/**
 * Wait for URL to NOT contain a param.
 * Uses expect.poll() to detect Next.js soft navigation (pushState/replaceState).
 */
export async function waitForNoUrlParam(
  page: Page,
  key: string,
  timeout = 30_000
): Promise<void> {
  await expect
    .poll(() => new URL(page.url(), "http://localhost").searchParams.get(key), {
      timeout,
      message: `URL param "${key}" to be absent`,
    })
    .toBeNull();
}

/**
 * Wait for a filter to be fully committed to both URL and React state.
 *
 * Bridges the gap between URL update (router.push) and React hydration
 * (useBatchedFilters 10-second force-sync window). Waits for:
 * 1. URL parameter to match expected value (or be absent)
 * 2. SearchForm to be hydrated (data-hydrated attribute on filter buttons)
 */
export async function waitForFilterCommit(
  page: Page,
  paramKey: string,
  expectedValue?: string | null,
  timeout = 30_000
): Promise<void> {
  // Step 1: Wait for URL param
  if (expectedValue === null) {
    await waitForNoUrlParam(page, paramKey, Math.floor(timeout * 0.6));
  } else if (expectedValue !== undefined) {
    await waitForUrlParam(page, paramKey, expectedValue, Math.floor(timeout * 0.6));
  } else {
    await waitForUrlParam(page, paramKey, undefined, Math.floor(timeout * 0.6));
  }

  // Step 2: Wait for SearchForm hydration (data-hydrated on filter buttons)
  await page
    .locator(
      'button[data-hydrated][aria-label^="Filters"], button[data-hydrated][data-testid="quick-filter-more-filters"], button[data-hydrated][data-testid="mobile-filter-button"]'
    )
    .first()
    .waitFor({ state: "visible", timeout: Math.floor(timeout * 0.4) })
    .catch(() => {});
}

/**
 * Assert a URL param equals a specific value (auto-retries via waitForURL).
 */
export async function expectUrlParam(
  page: Page,
  key: string,
  value: string,
  timeout = 30_000
): Promise<void> {
  await waitForUrlParam(page, key, value, timeout);
  expect(getUrlParam(page, key)).toBe(value);
}

/**
 * Assert a URL param is absent (auto-retries via waitForURL).
 */
export async function expectNoUrlParam(
  page: Page,
  key: string,
  timeout = 30_000
): Promise<void> {
  await waitForNoUrlParam(page, key, timeout);
  expect(getUrlParam(page, key)).toBeNull();
}

// ---------------------------------------------------------------------------
// Page Readiness
// ---------------------------------------------------------------------------

/**
 * Navigate to the search page and wait for content to attach + hydrate.
 * Waits for domcontentloaded, element attachment, then domcontentloaded
 * to ensure React hydration completes before tests interact with buttons.
 */
export async function waitForSearchReady(
  page: Page,
  extraParams?: string
): Promise<void> {
  const url = extraParams ? `${SEARCH_URL}&${extraParams}` : SEARCH_URL;
  await page.goto(url);
  await page.waitForLoadState("load");
  await page
    .locator(`${selectors.listingCard}, ${selectors.emptyState}, h1, h2, h3`)
    .first()
    .waitFor({ state: "attached", timeout: 30_000 });
  // Wait for Filters button to be visible — confirms SearchForm hydrated.
  // On mobile, the button may be in the collapsed header (scroll-triggered).
  await ensureMobileFilterButton(page);
  await filtersButton(page).waitFor({ state: "visible", timeout: 20_000 });
}

/**
 * Navigate to a search URL with specific filter params and wait for readiness.
 * Waits for element attachment + domcontentloaded to ensure React hydration.
 */
export async function gotoSearchWithFilters(
  page: Page,
  params: Record<string, string>
): Promise<void> {
  const url = buildSearchUrl(params);
  await page.goto(url);
  await page.waitForLoadState("load");
  await page
    .locator(`${selectors.listingCard}, ${selectors.emptyState}, h1, h2, h3`)
    .first()
    .waitFor({ state: "attached", timeout: 30_000 });
  // Wait for Filters button to be visible — confirms SearchForm hydrated.
  // On mobile, the button may be in the collapsed header (scroll-triggered).
  await ensureMobileFilterButton(page);
  await filtersButton(page).waitFor({ state: "visible", timeout: 20_000 });
}

// ---------------------------------------------------------------------------
// Modal Interaction
// ---------------------------------------------------------------------------

/**
 * Locate the Filters trigger button.
 * Uses regex to match both "Filters" and "Filters (N active)" states.
 */
export function filtersButton(page: Page): Locator {
  // On desktop the redesigned filter strip renders a button with
  // data-testid="quick-filter-more-filters" and aria-label^="Filters".
  // On mobile it renders data-testid="mobile-filter-button".
  // Both share aria-label^="Filters", but the mobile one lives inside a
  // md:hidden parent, so we must filter to only the visible button.
  // Using filter({ visible: true }) ensures we don't accidentally resolve
  // to the hidden mobile button when running on a desktop viewport.
  return page
    .locator(
      'button[data-testid="quick-filter-more-filters"], button[data-testid="mobile-filter-button"], button[data-hydrated][aria-label^="Filters"], button[aria-label^="Filters"]'
    )
    .filter({ visible: true })
    .first();
}

/**
 * Ensure filter button is visible on mobile.
 * On mobile viewports, the Filters button lives in CollapsedMobileSearch which
 * appears after useMediaQuery hydrates (may take 1-2s after page load).
 * Falls back to scrolling if the button doesn't appear after waiting.
 */
async function ensureMobileFilterButton(page: Page): Promise<void> {
  const viewport = page.viewportSize();
  if (!viewport || viewport.width >= 768) return; // Desktop: button already visible

  const btn = filtersButton(page);

  // Wait for useMediaQuery hydration to show the collapsed bar
  const visible = await btn.waitFor({ state: "visible", timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  if (visible) return;

  // Fallback: scroll to force collapsed state detection
  await page.evaluate(() => window.scrollBy(0, 200));
  await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollBy(0, -100));
  await page.waitForTimeout(500);
}

/** Locate the filter dialog */
export function filterDialog(page: Page): Locator {
  return page.getByRole("dialog", { name: /filters/i });
}

/**
 * Click the Filters button and wait for the dialog to appear.
 * Retries once if the dialog doesn't appear — handles hydration race
 * where the button is SSR-rendered but onClick isn't attached yet.
 */
export async function clickFiltersButton(page: Page): Promise<void> {
  await ensureMobileFilterButton(page);
  const btn = filtersButton(page);
  await expect(btn).toBeVisible({ timeout: 15_000 });
  await btn.click();

  const dialog = filterDialog(page);
  const visible = await dialog
    .waitFor({ state: "visible", timeout: 30_000 })
    .then(() => true)
    .catch(() => false);

  if (!visible) {
    // Button onClick is setShowFilters(true) — not a toggle. If state is
    // already true, re-clicking is a no-op. Press Escape to reset state
    // to false (via useKeyboardShortcuts), then re-click for a real transition.
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });
    await btn.click({ force: true });
    await expect(dialog).toBeVisible({ timeout: 15_000 });
  }
}

/** Locate the Apply button inside the filter modal */
export function applyButton(page: Page): Locator {
  return page.locator('[data-testid="filter-modal-apply"]');
}

/** Locate the Close button inside the filter dialog */
export function closeButton(page: Page): Locator {
  return filterDialog(page).getByRole("button", { name: /close filters/i });
}

/** Locate the Clear All button inside the filter dialog */
export function clearAllButton(page: Page): Locator {
  return page.locator('[data-testid="filter-modal-clear-all"]');
}

/**
 * Open the filter modal: click Filters button, wait for dialog visible.
 * Also waits for amenity buttons to render (indicates facet data loaded).
 * Returns the dialog locator.
 *
 * Includes a retry-click to handle two CI race conditions:
 * 1. React hydration: button HTML renders via SSR before onClick is attached
 * 2. Dynamic import: FilterModal chunk may not be loaded on first click
 */
export async function openFilterModal(page: Page): Promise<Locator> {
  // On mobile, filter button may be in collapsed header — trigger it
  await ensureMobileFilterButton(page);

  const btn = filtersButton(page);
  await expect(btn).toBeVisible({ timeout: 15_000 });

  const dialog = filterDialog(page);

  // Click and wait for dialog. On CI under load, the modal render
  // may take a few seconds, so we give a generous initial timeout.
  await btn.click();
  let dialogVisible = await dialog
    .waitFor({ state: "visible", timeout: 30_000 })
    .then(() => true)
    .catch(() => false);

  if (!dialogVisible) {
    // Button onClick is setShowFilters(true) — not a toggle. If state is
    // already true, re-clicking is a no-op. Press Escape to reset state
    // to false (via useKeyboardShortcuts), then re-click for a real transition.
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });
    await btn.click({ force: true });
    await expect(dialog).toBeVisible({ timeout: 15_000 });
  }

  // Wait for FilterModal content to fully render — the apply button
  // is always present and is a reliable signal the chunk loaded.
  await applyButton(page).waitFor({ state: "attached", timeout: 30_000 });
  await applyButton(page)
    .scrollIntoViewIfNeeded()
    .catch(() => {});

  return dialog;
}

/**
 * Open filter modal and wait for facet counts to load.
 * Use this when the test interacts with amenity/house-rule buttons that can be
 * disabled by zero-count facets arriving after the 300ms debounce.
 */
export async function openFilterModalAndWaitForFacets(
  page: Page
): Promise<Locator> {
  const facetsPromise = page
    .waitForResponse((r) => r.url().includes("/api/search/facets"), {
      timeout: 10_000,
    })
    .catch(() => null);
  const dialog = await openFilterModal(page);
  await facetsPromise;
  // Wait for amenity buttons to update (disabled attr removed after facet render)
  await page
    .locator('[aria-label="Select amenities"] button:not([disabled])')
    .first()
    .waitFor({ state: "attached", timeout: 5_000 })
    .catch(() => {}); // Fallback: if all buttons are disabled, proceed anyway
  return dialog;
}

/** Close filter modal via close button */
export async function closeFilterModal(page: Page): Promise<void> {
  await closeButton(page).click();
  await expect(filterDialog(page)).not.toBeVisible({ timeout: 30_000 });
}

/**
 * Apply filters: click Apply, wait for dialog to close and URL to settle.
 * Replaces the old pattern that used waitForTimeout(1_500).
 *
 * @param opts.expectUrlChange - Set to false when applying without changing
 *   any filter (e.g. re-applying same state). Defaults to true.
 */
export async function applyFilters(
  page: Page,
  opts?: { expectUrlChange?: boolean }
): Promise<void> {
  const urlBefore = page.url();

  // The Apply button can be temporarily unstable when useBatchedFilters
  // updates the listing count (React re-render detaches the element, or
  // the Radix overlay intercepts pointer events during the transition).
  // Wait for the button to be stable, then try a normal click first;
  // fall back to force-click after a short settle.
  const btn = applyButton(page);
  await btn.waitFor({ state: "attached", timeout: 10_000 });

  try {
    await btn.click({ timeout: 5_000 });
  } catch {
    // Button may be temporarily obscured by Radix overlay during re-render;
    // wait for it to be stable before force-clicking.
    await expect(btn).toBeVisible({ timeout: 5_000 });
    await btn.click({ force: true, timeout: 15_000 });
  }

  // Wait for modal to close
  await expect(filterDialog(page)).not.toBeVisible({ timeout: 30_000 });

  // Increased timeout for CI (soft navigation can be slow on GitHub Actions)
  if (opts?.expectUrlChange !== false) {
    await expect
      .poll(() => page.url(), {
        timeout: 30_000,
        message: "URL to change after applying filters",
      })
      .not.toBe(urlBefore);
  }
}

/**
 * Full filter interaction: open modal, run interaction callback, apply.
 *
 * Example:
 * ```ts
 * await applyFilter(page, async () => {
 *   await toggleAmenity(page, "Wifi");
 * });
 * ```
 */
export async function applyFilter(
  page: Page,
  interactions: (dialog: Locator) => Promise<void>,
  opts?: { expectUrlChange?: boolean }
): Promise<void> {
  const dialog = await openFilterModal(page);
  await interactions(dialog);
  await applyFilters(page, opts);
}

// ---------------------------------------------------------------------------
// Chips Region
// ---------------------------------------------------------------------------

/** Locate the applied filters region (scoped to visible container) */
export function appliedFiltersRegion(page: Page): Locator {
  return searchResultsContainer(page).locator('[aria-label="Applied filters"]');
}

/** Locate the "Clear all filters" button in the chips bar */
export function chipsClearAllButton(page: Page): Locator {
  return appliedFiltersRegion(page).getByRole("button", {
    name: /clear all/i,
  });
}

/** Count the number of active filter chips (via remove buttons) */
export async function chipCount(page: Page): Promise<number> {
  const region = appliedFiltersRegion(page);
  const visible = await region.isVisible().catch(() => false);
  if (!visible) return 0;
  return region.getByRole("button", { name: /^Remove filter/i }).count();
}

// ---------------------------------------------------------------------------
// Filter-Specific Interaction Helpers
// ---------------------------------------------------------------------------

/** Locate the amenities toggle group inside the filter modal */
export function amenitiesGroup(page: Page): Locator {
  return page.locator('[aria-label="Select amenities"]');
}

/** Toggle an amenity button by name */
export async function toggleAmenity(page: Page, name: string): Promise<void> {
  const group = amenitiesGroup(page);
  // Ensure the amenities group is scrolled into view (may be below fold in drawer)
  await group.scrollIntoViewIfNeeded().catch(() => {});
  const btn = group.getByRole("button", { name: new RegExp(`^${name}`, "i") });
  // Wait for the button to exist — FilterModal is dynamically imported and may
  // not have rendered yet even if the dialog container is visible
  await btn.waitFor({ state: "attached", timeout: 30_000 });
  await btn.click();
}

/** Locate the house rules toggle group inside the filter modal */
export function houseRulesGroup(page: Page): Locator {
  return page.locator('[aria-label="Select house rules"]');
}

/** Toggle a house rule button by name */
export async function toggleHouseRule(page: Page, name: string): Promise<void> {
  const group = houseRulesGroup(page);
  await group.scrollIntoViewIfNeeded().catch(() => {});
  const btn = group.getByRole("button", { name: new RegExp(name, "i") });
  await btn.waitFor({ state: "attached", timeout: 30_000 });
  await btn.click();
}

/**
 * Select an option from a Radix Select dropdown inside the filter dialog.
 * Used for roomType, leaseDuration, genderPreference, householdGender.
 */
export async function selectDropdownOption(
  page: Page,
  triggerId: string,
  optionLabel: RegExp
): Promise<void> {
  const selector = triggerId.startsWith("#") ? triggerId : `#${triggerId}`;
  const trigger = page.locator(selector);
  await trigger.click();

  // Scope to the Radix Select portal's listbox for reliable option selection
  const listbox = page.getByRole("listbox");
  await expect(listbox).toBeVisible({ timeout: 5_000 });
  const option = listbox.getByRole("option", { name: optionLabel });
  await option.click();

  // Wait for dropdown to close to confirm selection was processed
  await expect(listbox).not.toBeVisible({ timeout: 5_000 });
}

// ---------------------------------------------------------------------------
// Race Condition Utilities
// ---------------------------------------------------------------------------

/**
 * Wait for URL to stabilize (stop changing) for a given settle period.
 * Useful for race condition tests where multiple navigations may fire.
 */
export async function waitForUrlStable(
  page: Page,
  _settleMs = 500,
  timeout = 10_000
): Promise<string> {
  let lastUrl = page.url();
  await expect
    .poll(
      () => {
        const currentUrl = page.url();
        const stable = currentUrl === lastUrl;
        lastUrl = currentUrl;
        return stable;
      },
      { timeout, message: "URL did not stabilize" }
    )
    .toBe(true);
  return lastUrl;
}

/**
 * Click a locator N times quickly with a short interval between clicks.
 * Used for double-click and rapid-click race condition tests.
 */
export async function rapidClick(
  locator: Locator,
  count: number,
  intervalMs = 50
): Promise<void> {
  for (let i = 0; i < count; i++) {
    await locator.click({ force: true });
    if (i < count - 1 && intervalMs > 0) {
      // INTENTIONAL: simulating rapid user clicks at controlled interval
      await locator.page().waitForTimeout(intervalMs);
    }
  }
}

/**
 * Count navigation events on the page.
 * Returns a function to get the current count.
 */
export function captureNavigationCount(page: Page): () => number {
  let count = 0;
  page.on("framenavigated", () => {
    count++;
  });
  return () => count;
}
