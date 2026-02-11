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
  "Wifi", "AC", "Parking", "Washer", "Dryer", "Kitchen", "Gym", "Pool", "Furnished",
] as const;

/** Valid house rule values */
export const HOUSE_RULES = [
  "Pets allowed", "Smoking allowed", "Couples allowed", "Guests allowed",
] as const;

/** Valid lease duration values */
export const LEASE_DURATIONS = [
  "Month-to-month", "3 months", "6 months", "12 months", "Flexible",
] as const;

/** Valid room type values */
export const ROOM_TYPES = [
  "Private Room", "Shared Room", "Entire Place",
] as const;

/** Valid sort options */
export const SORT_OPTIONS = [
  "recommended", "price_asc", "price_desc", "newest", "rating",
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
  timeout = 30_000,
): Promise<void> {
  if (value !== undefined) {
    await expect.poll(
      () => new URL(page.url(), "http://localhost").searchParams.get(key),
      { timeout, message: `URL param "${key}" to be "${value}"` },
    ).toBe(value);
  } else {
    await expect.poll(
      () => new URL(page.url(), "http://localhost").searchParams.get(key),
      { timeout, message: `URL param "${key}" to be present` },
    ).not.toBeNull();
  }
}

/**
 * Wait for URL to NOT contain a param.
 * Uses expect.poll() to detect Next.js soft navigation (pushState/replaceState).
 */
export async function waitForNoUrlParam(
  page: Page,
  key: string,
  timeout = 30_000,
): Promise<void> {
  await expect.poll(
    () => new URL(page.url(), "http://localhost").searchParams.get(key),
    { timeout, message: `URL param "${key}" to be absent` },
  ).toBeNull();
}

/**
 * Assert a URL param equals a specific value (auto-retries via waitForURL).
 */
export async function expectUrlParam(
  page: Page,
  key: string,
  value: string,
  timeout = 30_000,
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
  timeout = 30_000,
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
  extraParams?: string,
): Promise<void> {
  const url = extraParams ? `${SEARCH_URL}&${extraParams}` : SEARCH_URL;
  await page.goto(url);
  await page.waitForLoadState("domcontentloaded");
  await page
    .locator(`${selectors.listingCard}, ${selectors.emptyState}, h1, h2, h3`)
    .first()
    .waitFor({ state: "attached", timeout: 30_000 });
  // Wait for domcontentloaded to ensure React hydration completes —
  // without this, button clicks can fire before event handlers attach
  await page.waitForLoadState("domcontentloaded").catch(() => {});
}

/**
 * Navigate to a search URL with specific filter params and wait for readiness.
 * Waits for element attachment + domcontentloaded to ensure React hydration.
 */
export async function gotoSearchWithFilters(
  page: Page,
  params: Record<string, string>,
): Promise<void> {
  const url = buildSearchUrl(params);
  await page.goto(url);
  await page.waitForLoadState("domcontentloaded");
  await page
    .locator(`${selectors.listingCard}, ${selectors.emptyState}, h1, h2, h3`)
    .first()
    .waitFor({ state: "attached", timeout: 30_000 });
  await page.waitForLoadState("domcontentloaded").catch(() => {});
}

// ---------------------------------------------------------------------------
// Modal Interaction
// ---------------------------------------------------------------------------

/**
 * Locate the Filters trigger button.
 * Uses regex to match both "Filters" and "Filters (N active)" states.
 */
export function filtersButton(page: Page): Locator {
  return page.getByRole("button", { name: /^Filters/ });
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
  const btn = filtersButton(page);
  await expect(btn).toBeVisible({ timeout: 10_000 });
  await btn.click();

  const dialog = filterDialog(page);
  const visible = await dialog
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false);

  if (!visible) {
    await btn.click();
    await expect(dialog).toBeVisible({ timeout: 30_000 });
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
  const btn = filtersButton(page);
  await expect(btn).toBeVisible({ timeout: 10_000 });

  const dialog = filterDialog(page);

  // Click and wait for dialog. If it doesn't appear, the button click may
  // have fired before React hydration attached the onClick handler, or the
  // FilterModal dynamic import chunk hadn't loaded yet. Retry once.
  await btn.click();
  let dialogVisible = await dialog
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false);

  if (!dialogVisible) {
    // Retry: by now hydration + dynamic import should be complete
    await btn.click();
    await expect(dialog).toBeVisible({ timeout: 30_000 });
  }

  // Wait for amenity buttons to render — ensures facet data has loaded
  // (useFacets hook completes async after dialog opens)
  const group = amenitiesGroup(page);
  await group
    .getByRole("button")
    .first()
    .waitFor({ state: "attached", timeout: 30_000 })
    .catch(() => {
      // Amenities group may not be present in all filter modals
    });

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
  opts?: { expectUrlChange?: boolean },
): Promise<void> {
  const urlBefore = page.url();
  await applyButton(page).click();

  // Wait for modal to close
  await expect(filterDialog(page)).not.toBeVisible({ timeout: 30_000 });

  // Increased timeout for CI (soft navigation can be slow on GitHub Actions)
  if (opts?.expectUrlChange !== false) {
    await expect.poll(
      () => page.url(),
      { timeout: 30_000, message: "URL to change after applying filters" },
    ).not.toBe(urlBefore);
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
  opts?: { expectUrlChange?: boolean },
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
  const btn = group.getByRole("button", { name: new RegExp(`^${name}`, "i") });
  await btn.click();
}

/** Locate the house rules toggle group inside the filter modal */
export function houseRulesGroup(page: Page): Locator {
  return page.locator('[aria-label="Select house rules"]');
}

/** Toggle a house rule button by name */
export async function toggleHouseRule(
  page: Page,
  name: string,
): Promise<void> {
  const group = houseRulesGroup(page);
  const btn = group.getByRole("button", { name: new RegExp(name, "i") });
  await btn.click();
}

/**
 * Select an option from a Radix Select dropdown inside the filter dialog.
 * Used for roomType, leaseDuration, genderPreference, householdGender.
 */
export async function selectDropdownOption(
  page: Page,
  triggerId: string,
  optionLabel: RegExp,
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
  settleMs = 500,
  timeout = 30_000,
): Promise<string> {
  const start = Date.now();
  let lastUrl = page.url();
  let lastChangeTime = Date.now();

  while (Date.now() - start < timeout) {
    await page.waitForTimeout(100);
    const currentUrl = page.url();
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      lastChangeTime = Date.now();
    }
    if (Date.now() - lastChangeTime >= settleMs) {
      return lastUrl;
    }
  }
  return lastUrl;
}

/**
 * Click a locator N times quickly with a short interval between clicks.
 * Used for double-click and rapid-click race condition tests.
 */
export async function rapidClick(
  locator: Locator,
  count: number,
  intervalMs = 50,
): Promise<void> {
  for (let i = 0; i < count; i++) {
    await locator.click({ force: true });
    if (i < count - 1 && intervalMs > 0) {
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
