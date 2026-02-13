/**
 * E2E Test Helpers - Central Export
 *
 * Usage:
 * ```typescript
 * import { test, expect, selectors, timeouts } from '../helpers';
 *
 * test('my test', async ({ page, auth, nav, network, assert, data }) => {
 *   // Use fixtures directly
 *   await nav.goHome();
 *   await assert.isLoggedIn();
 * });
 * ```
 */

// Main test fixture with all helpers
export {
  test,
  expect,
  selectors,
  timeouts,
  tags,
  SF_BOUNDS,
  A11Y_CONFIG,
  waitForStable,
  waitForMapMarkers,
  waitForMapReady,
  waitForDebounceAndResponse,
  takeScreenshot,
  logStep,
  searchResultsContainer,
  scopedCards,
  waitForSortHydrated,
} from "./test-utils";

// Map-list sync helpers (polling-based assertions)
export {
  pollForMarkers,
  pollForUrlParam,
  pollForUrlParamPresent,
  pollForCardCount,
} from "./sync-helpers";

// Individual helpers for direct import if needed
export { authHelpers, MOCK_SESSION_TOKEN } from "./auth-helpers";
export { navigationHelpers } from "./navigation-helpers";
export { networkHelpers, type NetworkCondition } from "./network-helpers";
export { assertionHelpers } from "./assertions";
export {
  dataHelpers,
  type ListingData,
  type UserData,
  type BookingData,
  type ReviewData,
} from "./data-helpers";

// Mobile helpers for bottom sheet and viewport utilities
export {
  mobileSelectors,
  getSheetSnapIndex,
  getSheetHeightFraction,
  setSheetSnap,
  waitForSheetAnimation,
  isMobileViewport,
  waitForMobileSheet,
  navigateToMobileSearch,
  SNAP_COLLAPSED,
  SNAP_HALF,
  SNAP_EXPANDED,
  SNAP_POINTS,
} from "./mobile-helpers";

// Filter test helpers for search filter E2E tests
export * from "./filter-helpers";

// Map tile mocking for CI stability (auto-applied via test fixture)
export { mockMapTileRequests } from "./map-mock-helpers";

// Booking helpers for race condition and booking tests
export { selectBookingDates, createBookingAsUser } from "./booking-helpers";

// Mobile auth helpers for mobile authenticated tests
export { setupMobileAuthViewport, navigateWithMobileNav } from "./mobile-auth-helpers";

// Dark mode helpers for authenticated page dark mode tests
export {
  activateDarkMode,
  assertDarkClassPresent,
  getStoredTheme,
  waitForAuthPageReady,
  authPageMasks,
} from "./dark-mode-helpers";

// Session expiry helpers for mid-session auth token expiry testing
export {
  expireSession,
  mockApi401,
  triggerSessionPoll,
  expectLoginRedirect,
  expectDraftSaved,
} from "./session-expiry-helpers";
