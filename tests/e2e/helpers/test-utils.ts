import { test as base, expect, Page, Locator, BrowserContext } from "@playwright/test";
import { authHelpers } from "./auth-helpers";
import { navigationHelpers } from "./navigation-helpers";
import { networkHelpers, NetworkCondition } from "./network-helpers";
import { assertionHelpers } from "./assertions";
import { dataHelpers } from "./data-helpers";

/**
 * Extended test fixture with custom helpers
 */
export const test = base.extend<{
  auth: typeof authHelpers;
  nav: ReturnType<typeof navigationHelpers>;
  network: ReturnType<typeof networkHelpers>;
  assert: ReturnType<typeof assertionHelpers>;
  data: typeof dataHelpers;
}>({
  auth: async ({}, use) => {
    await use(authHelpers);
  },

  nav: async ({ page }, use) => {
    await use(navigationHelpers(page));
  },

  network: async ({ page, context }, use) => {
    await use(networkHelpers(page, context));
  },

  assert: async ({ page }, use) => {
    await use(assertionHelpers(page));
  },

  data: async ({}, use) => {
    await use(dataHelpers);
  },
});

export { expect };

/**
 * Test tags for filtering
 */
export const tags = {
  auth: "@auth",
  anon: "@anon",
  mobile: "@mobile",
  a11y: "@a11y",
  slow: "@slow",
  flaky: "@flaky",
  offline: "@offline",
  admin: "@admin",
  verified: "@verified",
  core: "@core",
  smoke: "@smoke",
  filter: "@filter",
} as const;

/**
 * San Francisco bounding box for geo-filtered search tests
 */
export const SF_BOUNDS = {
  minLat: 37.7,
  maxLat: 37.85,
  minLng: -122.52,
  maxLng: -122.35,
} as const;

/**
 * Wait for map markers to appear on the page
 * Returns the count of visible markers
 */
export async function waitForMapMarkers(
  page: Page,
  options?: { timeout?: number; minCount?: number },
): Promise<number> {
  const timeout = options?.timeout ?? timeouts.action;
  const minCount = options?.minCount ?? 1;

  await page.waitForSelector(selectors.mapMarker, { timeout });

  // Wait for at least minCount markers
  await page.waitForFunction(
    ({ selector, min }) => {
      const markers = document.querySelectorAll(selector);
      return markers.length >= min;
    },
    { selector: selectors.mapMarker, min: minCount },
    { timeout },
  );

  const markers = page.locator(selectors.mapMarker);
  return markers.count();
}

/**
 * Common test timeouts
 */
export const timeouts = {
  action: 15_000,
  navigation: 30_000,
  animation: 500,
  debounce: 350,
  polling: 5_500, // Message polling interval + buffer
  slowNetwork: 10_000,
  upload: 60_000,
} as const;

/**
 * Common selectors used across tests
 */
export const selectors = {
  // Navigation
  navbar: '[data-testid="navbar"], nav[role="navigation"], nav',
  userMenu: '[data-testid="user-menu"], [aria-label*="user" i]',
  searchForm: '[data-testid="search-form"], form[role="search"]',

  // Listings - match links to listing detail pages
  listingCard: '[data-testid="listing-card"]',
  // NOTE: data-testid="listing-grid" does not exist in the codebase yet; keeping fallback
  listingGrid: '[data-testid="listing-grid"], [class*="listing-grid"]',
  listingImage: '[data-testid="listing-image"], img[alt*="listing" i]',

  // Forms
  submitButton: 'button[type="submit"]',
  loadingSpinner:
    '[data-testid="loading"], [class*="loading"], [aria-busy="true"]',
  errorMessage: '[role="alert"], [data-testid="error"], [class*="error"]',
  successMessage: '[data-testid="success"], [class*="success"]',

  // Toast notifications
  toast: '[data-sonner-toast], [class*="toast"]',
  toastSuccess: '[data-type="success"], [class*="toast-success"]',
  toastError: '[data-type="error"], [class*="toast-error"]',

  // Modals/Dialogs
  modal: '[role="dialog"], [data-testid="modal"]',
  modalClose: '[data-testid="modal-close"], [aria-label="Close"]',

  // Pagination
  pagination: '[data-testid="pagination"], [aria-label="Pagination"]',
  nextPage: '[aria-label*="next" i], [data-testid="next-page"]',
  prevPage: '[aria-label*="previous" i], [data-testid="prev-page"]',

  // Empty states
  emptyState: '[data-testid="empty-state"], [class*="empty-state"]',

  // Map
  map: '[data-testid="map"], [class*="mapboxgl"], .mapboxgl-map',
  mapMarker: '.mapboxgl-marker, [data-testid="map-marker"]',
} as const;

/**
 * Wait for network idle — no more arbitrary animation timeout.
 * Callers needing to wait for specific UI states should use
 * web-first assertions (expect(locator).toBeVisible()) instead.
 */
export async function waitForStable(
  page: Page,
  options?: { timeout?: number },
) {
  await page.waitForLoadState("networkidle", { timeout: options?.timeout });
}

// ---------------------------------------------------------------------------
// Accessibility Configuration
// ---------------------------------------------------------------------------

/**
 * Shared WCAG 2.1 AA compliance configuration for axe-core scans.
 */
export const A11Y_CONFIG = {
  standard: "WCAG 2.1 AA" as const,
  tags: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] as const,
  /** Elements excluded globally (third-party map canvas not controllable) */
  globalExcludes: [".maplibregl-canvas", ".mapboxgl-canvas"] as const,
} as const;

// ---------------------------------------------------------------------------
// Map Wait Helpers (replacements for waitForTimeout in map tests)
// ---------------------------------------------------------------------------

/**
 * Wait for the Mapbox GL map to be fully loaded and idle (not panning/zooming).
 * Replaces `waitForTimeout(2000)` after map initialization and interactions.
 */
export async function waitForMapReady(
  page: Page,
  timeout = 15_000,
): Promise<void> {
  await page.waitForFunction(
    () => {
      const map = (window as any).__e2eMapRef;
      if (!map) return false;
      return map.loaded() && !map.isMoving() && !map.isZooming() && !map.isRotating();
    },
    { timeout },
  ).catch(() => {
    // If map ref isn't exposed yet, fall back to checking canvas visibility
  });
}

/**
 * Wait for a debounced search/API call to complete.
 * Waits the debounce period then gates on the actual network response.
 * Replaces `waitForTimeout(debounce + margin)` patterns.
 */
export async function waitForDebounceAndResponse(
  page: Page,
  opts: {
    debounceMs?: number;
    responsePattern: string | RegExp;
    timeout?: number;
  },
): Promise<void> {
  const debounceMs = opts.debounceMs ?? timeouts.debounce;
  const timeout = opts.timeout ?? timeouts.action;
  const responsePromise = page.waitForResponse(
    (resp) => {
      const url = resp.url();
      return typeof opts.responsePattern === "string"
        ? url.includes(opts.responsePattern)
        : opts.responsePattern.test(url);
    },
    { timeout },
  );
  // Minimal wait for debounce to fire, then gate on actual response
  await page.waitForTimeout(debounceMs + 100);
  await responsePromise;
}

/**
 * Screenshot helper with consistent naming
 */
export async function takeScreenshot(
  page: Page,
  name: string,
  options?: { fullPage?: boolean },
) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  await page.screenshot({
    path: `test-results/screenshots/${name}-${timestamp}.png`,
    fullPage: options?.fullPage ?? false,
  });
}

/**
 * Log helper for debugging
 */
export function logStep(step: string, data?: Record<string, unknown>) {
  console.log(`[E2E] ${step}`, data ? JSON.stringify(data) : "");
}

/**
 * Returns the visible search results container scoped to the current viewport.
 *
 * SearchViewToggle renders {children} in TWO containers (mobile + desktop).
 * On desktop (≥768px), the mobile container has `display: none` via `md:hidden`.
 * On mobile (<768px), the desktop container has `display: none` via `hidden md:flex`.
 *
 * Use this to scope selectors and avoid:
 * - Strict mode violations (2 matching elements)
 * - `.first()` returning the hidden mobile instance on desktop
 * - `.count()` double-counting across both containers
 */
export function searchResultsContainer(page: Page): Locator {
  const viewport = page.viewportSize();
  const isMobile = viewport ? viewport.width < 768 : false;

  if (isMobile) {
    return page.locator('[data-testid="mobile-search-results-container"]');
  }
  return page.locator('[data-testid="search-results-container"]');
}

/**
 * Returns a scoped listing card locator within the visible search container.
 * Equivalent to: searchResultsContainer(page).locator('[data-testid="listing-card"]')
 */
export function scopedCards(page: Page): Locator {
  return searchResultsContainer(page).locator('[data-testid="listing-card"]');
}
