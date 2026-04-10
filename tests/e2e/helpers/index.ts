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
  waitForHydration,
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

export {
  SEARCH_SCENARIO_HEADER,
  applyFilterModal,
  applySearchScenario,
  assertNoDuplicateListingIds,
  cancelFilterModal,
  defaultSearchUrl,
  getListingIds,
  gotoSearchPage,
  isSearchReleaseGateEnabled,
  isSearchReleaseGateProject,
  loadMoreButton,
  mapShell,
  mobileExpandSearchButton,
  mobileSearchDialog,
  openMobileSearchOverlay,
  openSortMenu,
  readSearchShellMeta,
  searchShell,
  searchStatus,
  selectSortOption,
  scenarioHeaders,
  type SearchScenario,
  waitForSearchResolution,
} from "./search-release-gate-helpers";

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
export {
  setupMobileAuthViewport,
  navigateWithMobileNav,
} from "./mobile-auth-helpers";



// Shared axe-core a11y scan helpers (runAxeScan, filterViolations, logViolations)
export {
  runAxeScan,
  filterViolations,
  logViolations,
  CI_EXTRA_EXCLUDES,
  CI_DISABLED_RULES,
  CI_ACCEPTABLE_VIOLATIONS,
} from "./a11y-helpers";

// Session expiry helpers for mid-session auth token expiry testing
export {
  expireSession,
  mockApi401,
  triggerSessionPoll,
  expectLoginRedirect,
  expectDraftSaved,
} from "./session-expiry-helpers";

// Stability contract test helpers (UI + API helpers for stability tests)
export {
  testApi,
  createExpiredHold,
  cleanupTestBookings,
  getSlotInfoViaApi,
  invokeSweeper,
  getGroundTruthSlots,
  updateListingPrice,
  createPendingBooking,
  createAcceptedBooking,
  setListingBookingMode,
  navigateToBookingsTab,
  setupRequestCounter,
  readSlotBadge,
  getSlotBadgeForListing,
  clearBookingSession,
  clearBookingSessionForListing,
  getMonthOffset,
  selectStabilityDates,
  submitBookingViaUI,
  extractListingId,
  findBookableListingUrl,
} from "./stability-helpers";
