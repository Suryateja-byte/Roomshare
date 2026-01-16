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
  waitForStable,
  waitForMapMarkers,
  takeScreenshot,
  logStep,
} from "./test-utils";

// Individual helpers for direct import if needed
export { authHelpers } from "./auth-helpers";
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
