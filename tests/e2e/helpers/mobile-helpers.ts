/**
 * Mobile E2E Test Helpers
 *
 * Reusable utilities for mobile bottom sheet interactions, snap point
 * management, and viewport detection. These helpers abstract the
 * MobileBottomSheet component's behavior for consistent test usage.
 *
 * Key concepts:
 * - Snap indices: 0=collapsed (~15vh), 1=half (~50vh), 2=expanded (~85vh)
 * - The sheet uses framer-motion spring animations (~400-600ms)
 * - The slider handle supports keyboard navigation (ArrowUp/Down/Home/End)
 * - data-snap-current attribute on the content area reflects current snap
 */

import { Page, Locator } from "@playwright/test";

// ---------------------------------------------------------------------------
// Selectors (matching MobileBottomSheet.tsx DOM structure)
// ---------------------------------------------------------------------------

export const mobileSelectors = {
  /** The bottom sheet region container */
  bottomSheet: '[role="region"][aria-label="Search results"]',
  /** Keyboard-accessible drag handle (slider role) */
  sheetHandle: '[role="slider"][aria-label="Results panel size"]',
  /** Content area that exposes data-snap-current attribute */
  snapContent: "[data-snap-current]",
  /** Expand button shown when sheet is at half position */
  expandButton: 'button[aria-label="Expand results"]',
  /** Collapse button shown when sheet is expanded */
  collapseButton: 'button[aria-label="Collapse results"]',
  /** Minimize (X) button to dismiss sheet */
  minimizeButton: 'button[aria-label="Minimize results panel"]',
  /** Listing card links */
  listingCard: 'a[href^="/listings/c"]',
  /** Map container */
  mapContainer: '[data-testid="map"], .mapboxgl-map',
  /** Map markers */
  mapMarker: ".mapboxgl-marker, [data-testid=\"map-marker\"]",
  /** Floating toggle button (map/list) */
  floatingToggle:
    'button[aria-label="Show map"], button[aria-label="Show list"]',
  /** Mobile sort button */
  sortButton: 'button[aria-label^="Sort:"]',
  /** Sort sheet heading */
  sortSheetHeading: "h3:has-text(\"Sort by\")",
  /** Mobile filter button in collapsed search bar */
  mobileFilterButton: '[data-testid="mobile-filter-button"]',
  /** Filters button in the search form */
  filtersButton: 'button[aria-label*="Filters"]',
  /** Filter modal dialog */
  filterModal: '[role="dialog"]',
  /** Desktop sidebar results container */
  desktopResults: '[data-testid="search-results-container"]',
  /** Mobile results container inside bottom sheet */
  mobileResults: '[data-testid="mobile-search-results-container"]',
} as const;

// ---------------------------------------------------------------------------
// Snap point constants (mirroring MobileBottomSheet.tsx)
// ---------------------------------------------------------------------------

export const SNAP_COLLAPSED = 0.15;
export const SNAP_HALF = 0.5;
export const SNAP_EXPANDED = 0.85;
export const SNAP_POINTS = [SNAP_COLLAPSED, SNAP_HALF, SNAP_EXPANDED] as const;

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

/**
 * Read the current snap index from the data-snap-current attribute.
 * Returns -1 if the attribute is not found.
 */
export async function getSheetSnapIndex(page: Page): Promise<number> {
  const content = page.locator(mobileSelectors.snapContent).first();
  const snapAttr = await content.getAttribute("data-snap-current");
  return snapAttr !== null ? parseInt(snapAttr, 10) : -1;
}

/**
 * Calculate the bottom sheet height as a fraction of viewport height.
 * Waits for framer-motion spring animation to settle (height <= viewport).
 */
export async function getSheetHeightFraction(page: Page): Promise<number> {
  const sel = mobileSelectors.bottomSheet;

  // Wait for framer-motion to constrain height to within viewport bounds
  await page
    .waitForFunction(
      (s: string) => {
        const el = document.querySelector(s);
        if (!el) return false;
        const h = parseFloat(window.getComputedStyle(el).height);
        return h > 0 && h <= window.innerHeight * 1.05;
      },
      sel,
      { timeout: 5000 },
    )
    .catch(() => {
      /* assertion will catch bad values */
    });

  return page.locator(sel).evaluate((el) => {
    const height = parseFloat(window.getComputedStyle(el).height);
    return height / window.innerHeight;
  });
}

/**
 * Set the bottom sheet to a specific snap index using the keyboard-accessible
 * slider handle. Calculates the number of ArrowUp/ArrowDown presses needed
 * to reach the target snap from the current position.
 */
export async function setSheetSnap(
  page: Page,
  targetSnap: 0 | 1 | 2,
): Promise<void> {
  const currentSnap = await getSheetSnapIndex(page);
  if (currentSnap === targetSnap) return;

  const handle = page.locator(mobileSelectors.sheetHandle);
  await handle.focus();

  const diff = targetSnap - currentSnap;
  const key = diff > 0 ? "ArrowUp" : "ArrowDown";
  const presses = Math.abs(diff);

  for (let i = 0; i < presses; i++) {
    await page.keyboard.press(key);
    if (i < presses - 1) await page.waitForTimeout(100);
  }

  await waitForSheetAnimation(page);
}

/**
 * Wait for framer-motion spring animation to complete.
 * The spring config uses stiffness=400, damping=30, mass=0.8 which
 * settles in roughly 400-500ms. We use 600ms for safety margin.
 */
export async function waitForSheetAnimation(page: Page): Promise<void> {
  await page.waitForTimeout(600);
}

/**
 * Check if the current viewport width qualifies as mobile (< 768px, the md breakpoint).
 * Uses Playwright's viewport API rather than querying the DOM.
 */
export async function isMobileViewport(page: Page): Promise<boolean> {
  const viewportSize = page.viewportSize();
  return viewportSize ? viewportSize.width < 768 : false;
}

// ---------------------------------------------------------------------------
// Convenience helpers
// ---------------------------------------------------------------------------

/**
 * Wait for the bottom sheet to be visible and listings to load.
 * Returns true if the sheet is visible, false otherwise (caller should skip).
 */
export async function waitForMobileSheet(
  page: Page,
  options?: { timeout?: number },
): Promise<boolean> {
  const timeout = options?.timeout ?? 30_000;

  // Wait for at least one listing to load
  await page
    .locator(mobileSelectors.listingCard)
    .first()
    .waitFor({ state: "attached", timeout });

  // Check if bottom sheet is visible
  const sheet = page.locator(mobileSelectors.bottomSheet);
  return sheet
    .isVisible({ timeout: 5000 })
    .catch(() => false);
}

/**
 * Navigate to the search page with SF bounds and wait for mobile sheet readiness.
 * Returns false if the sheet is not visible (caller should skip the test).
 */
export async function navigateToMobileSearch(
  page: Page,
  extraParams?: string,
): Promise<boolean> {
  const SF_BOUNDS = {
    minLat: 37.7,
    maxLat: 37.85,
    minLng: -122.52,
    maxLng: -122.35,
  };
  const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;
  const url = `/search?${boundsQS}${extraParams ? `&${extraParams}` : ""}`;

  await page.goto(url);
  return waitForMobileSheet(page);
}
