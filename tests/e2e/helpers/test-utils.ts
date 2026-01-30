import { test as base, expect, Page, BrowserContext } from "@playwright/test";
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

  // Listings - match links to listing detail pages (exclude /listings/create)
  listingCard:
    '[data-testid="listing-card"], [class*="ListingCard"], a[href^="/listings/"]:not([href="/listings/create"])',
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
 * Wait for network idle and animations to complete
 */
export async function waitForStable(
  page: Page,
  options?: { timeout?: number },
) {
  await Promise.all([
    page.waitForLoadState("networkidle", { timeout: options?.timeout }),
    page.waitForTimeout(timeouts.animation),
  ]);
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
