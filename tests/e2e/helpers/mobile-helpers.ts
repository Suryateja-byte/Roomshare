/**
 * Mobile E2E Test Helpers
 *
 * Reusable utilities for mobile bottom sheet interactions, snap point
 * management, and viewport detection. These helpers abstract the
 * MobileBottomSheet component's behavior for consistent test usage.
 *
 * Key concepts:
 * - Snap indices: 0=collapsed/map, 1=peek/list preview, 2=expanded/list
 * - The sheet uses framer-motion spring animations (~400-600ms)
 * - The slider handle supports keyboard navigation (ArrowUp/Down/Home/End)
 * - data-snap-current attribute on the content area reflects current snap
 */

import { Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Selectors (matching MobileBottomSheet.tsx DOM structure)
// ---------------------------------------------------------------------------

export const mobileSelectors = {
  /** The bottom sheet region container */
  bottomSheet: '[role="region"][aria-label="Search results"]',
  /** Keyboard-accessible drag handle (slider role) */
  sheetHandle: '[role="slider"][aria-label="Results panel size"]:visible',
  /** Content area that exposes data-snap-current attribute */
  snapContent: "[data-snap-current]",
  /** Minimize (X) button to dismiss sheet */
  minimizeButton: 'button[aria-label="Minimize results panel"]',
  /** Listing card elements */
  listingCard: '[data-testid="listing-card"]',
  /** Map container */
  mapContainer: '[data-testid="map"], .maplibregl-map',
  /** Map markers */
  mapMarker: '.maplibregl-marker, [data-testid="map-marker"]',
  /** Floating toggle button (map/list) */
  floatingToggle:
    'button[aria-label="Show map"], button[aria-label="Show list"]',
  /** Mobile sort button */
  sortButton: 'button[aria-label^="Sort:"]',
  /** Sort sheet heading */
  sortSheetHeading: 'h3:has-text("Sort by")',
  /** Mobile filter button in collapsed search bar */
  mobileFilterButton: '[data-testid="mobile-filter-button"]',
  /** Visible filters button on mobile, regardless of whether it renders in the header or sheet */
  filtersButton: '[data-testid="mobile-filter-button"]',
  /** Filter modal dialog */
  filterModal: '[role="dialog"]',
  /** Desktop sidebar results container */
  desktopResults: '[data-testid="search-results-container"]',
  /** Mobile results container inside bottom sheet */
  mobileResults: '[data-testid="mobile-search-results-container"]',
} as const;

function bottomSheetLocator(page: Page) {
  return page.locator(mobileSelectors.bottomSheet).filter({ visible: true }).first();
}

// ---------------------------------------------------------------------------
// Snap point constants (mirroring src/lib/mobile-layout.ts)
// ---------------------------------------------------------------------------

export const SNAP_COLLAPSED = 0.11;
export const SNAP_PEEK = 0.42;
export const SNAP_EXPANDED = 0.84;
export const SNAP_POINTS = [SNAP_COLLAPSED, SNAP_PEEK, SNAP_EXPANDED] as const;

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
  // Wait for framer-motion to constrain height to within viewport bounds
  await page
    .waitForFunction(() => {
      const candidates = Array.from(
        document.querySelectorAll('[role="region"][aria-label="Search results"]')
      ) as HTMLElement[];
      const el =
        candidates.find((candidate) => {
          const rect = candidate.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        }) ?? null;
      if (!el) return false;
      const h = parseFloat(window.getComputedStyle(el).height);
      return h > 0 && h <= window.innerHeight * 1.05;
    }, { timeout: 5000 })
    .catch(() => {
      /* assertion will catch bad values */
    });

  return bottomSheetLocator(page).evaluate((el) => {
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
  targetSnap: 0 | 1 | 2
): Promise<void> {
  const currentSnap = await getSheetSnapIndex(page);
  if (currentSnap === targetSnap) return;

  const handle = page.locator(mobileSelectors.sheetHandle);
  await handle.focus();

  const diff = targetSnap - currentSnap;
  const key = diff > 0 ? "ArrowUp" : "ArrowDown";
  const presses = Math.abs(diff);

  for (let i = 0; i < presses; i++) {
    const prevSnap = await getSheetSnapIndex(page);
    await handle.press(key);
    if (i < presses - 1) {
      // Wait for data-snap-current to update before next press
      await page
        .waitForFunction(
          ({ sel, prev }: { sel: string; prev: number }) => {
            const el = document.querySelector(sel);
            if (!el) return true;
            const curr = parseInt(
              el.getAttribute("data-snap-current") ?? "-1",
              10
            );
            return curr !== prev;
          },
          { sel: mobileSelectors.snapContent, prev: prevSnap },
          { timeout: 3000 }
        )
        .catch(() => {});
    }
  }

  await waitForSheetAnimation(page);
}

/**
 * Open the mobile results sheet to a visible list state when a test needs
 * cards, filters, or sort controls that are hidden in map-first mode.
 */
export async function ensureMobileResultsVisible(
  page: Page,
  targetSnap: 1 | 2 = 1
): Promise<void> {
  if (!(await isMobileViewport(page))) return;

  const results = page.locator(mobileSelectors.mobileResults).first();
  const currentSnap = await getSheetSnapIndex(page);
  if (currentSnap >= targetSnap) {
    await results.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
    return;
  }

  const showListButton = page.locator('button[aria-label="Show list"]').first();
  const canToggle = await showListButton.isVisible().catch(() => false);

  if (canToggle) {
    await showListButton.click();
  } else {
    await setSheetSnap(page, targetSnap);
  }

  await waitForSheetAnimation(page);
  await results.waitFor({ state: "visible", timeout: 10_000 });
}

/**
 * Wait for framer-motion spring animation to complete.
 * Polls the sheet's computed height until it stabilizes (two consecutive
 * readings within 2px tolerance), indicating the spring has settled.
 * Falls back to a short timeout if the sheet element isn't found.
 */
export async function waitForSheetAnimation(page: Page): Promise<void> {
  try {
    await page.waitForFunction(
      () => {
        const candidates = Array.from(
          document.querySelectorAll('[role="region"][aria-label="Search results"]')
        ) as HTMLElement[];
        const el =
          candidates.find((candidate) => {
            const rect = candidate.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          }) ?? null;
        if (!el) return true; // nothing to wait for
        const w = window as any;
        const prev = w.__sheetAnimH as number | undefined;
        const curr = parseFloat(window.getComputedStyle(el).height);
        w.__sheetAnimH = curr;
        if (prev === undefined) return false; // need at least 2 samples
        return Math.abs(curr - prev) < 2; // settled when delta < 2px
      },
      { timeout: 5000, polling: 100 }
    );
  } catch {
    // If polling times out, the animation is likely done anyway
  }
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
 * Wait for the search layout header height to stabilize.
 * The SearchHeaderWrapper uses a ResizeObserver to dynamically set --header-height,
 * and the main content area transitions padding-top over 300ms. This helper
 * polls until the CSS variable stops changing, indicating layout is stable.
 */
export async function waitForLayoutStable(page: Page): Promise<void> {
  await page
    .waitForFunction(
      () => {
        const w = window as any;
        const curr = getComputedStyle(document.documentElement)
          .getPropertyValue("--header-height")
          .trim();
        const prev = w.__prevHeaderHeight as string | undefined;
        w.__prevHeaderHeight = curr;
        if (prev === undefined) return false; // need at least 2 samples
        return curr === prev && curr !== "";
      },
      undefined,
      { timeout: 5000, polling: 150 }
    )
    .catch(() => {
      /* Layout may not use --header-height; continue anyway */
    });
}

/**
 * Wait for the bottom sheet to be visible and listings to load.
 * Also waits for the search header layout to stabilize (ResizeObserver
 * + padding-top transition) to avoid measurement/interaction flakes.
 * Returns true if the sheet is visible, false otherwise (caller should skip).
 */
export async function waitForMobileSheet(
  page: Page,
  options?: { timeout?: number }
): Promise<boolean> {
  const timeout = options?.timeout ?? 30_000;

  // Wait for at least one listing to load
  await page
    .locator(mobileSelectors.listingCard)
    .first()
    .waitFor({ state: "attached", timeout });

  // Wait for header ResizeObserver + padding-top transition to settle
  await waitForLayoutStable(page);

  // Check if bottom sheet is visible
  const sheet = bottomSheetLocator(page);
  return sheet.isVisible({ timeout: 5000 }).catch(() => false);
}

/**
 * Navigate to the search page with SF bounds and wait for mobile sheet readiness.
 * Returns false if the sheet is not visible (caller should skip the test).
 */
export async function navigateToMobileSearch(
  page: Page,
  extraParams?: string
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
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  return waitForMobileSheet(page);
}
