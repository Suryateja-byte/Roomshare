/**
 * Mobile Layout Constants
 *
 * Shared snap point values for MobileBottomSheet and FloatingMapButton.
 * These must stay in sync — changing a snap point here updates both components.
 *
 * @see MobileBottomSheet.tsx — consumes these for sheet positioning
 * @see FloatingMapButton.tsx — consumes SNAP_COLLAPSED for button positioning
 */

/** Bottom sheet collapsed snap point as fraction of viewport height (~11vh) */
export const SNAP_COLLAPSED = 0.11;

/** Bottom sheet preview snap point as fraction of viewport height (~42vh) */
export const SNAP_PEEK = 0.42;

/** Bottom sheet fully expanded snap point as fraction of viewport height (~84vh) */
export const SNAP_EXPANDED = 0.84;

/**
 * Mobile search floating toggle offset when the results sheet is expanded.
 * Search owns the mobile screen, so this no longer compensates for the global
 * bottom navigation bar.
 */
export const SEARCH_MOBILE_LIST_TOGGLE_OFFSET =
  "calc(1rem + env(safe-area-inset-bottom, 0px))";

/**
 * Mobile search floating toggle offset when the results sheet is collapsed and
 * the map is the primary focus.
 */
export const SEARCH_MOBILE_MAP_TOGGLE_OFFSET = `calc(${SNAP_COLLAPSED * 100}dvh + 0.875rem + env(safe-area-inset-bottom, 0px))`;

/**
 * Keeps the selected listing preview card above both the collapsed sheet and
 * the floating map/list toggle.
 */
export const SEARCH_MOBILE_PREVIEW_CARD_OFFSET = `calc(${SNAP_COLLAPSED * 100}dvh + 4.75rem + env(safe-area-inset-bottom, 0px))`;

/**
 * Bottom-centered mobile map status cards sit above the collapsed sheet and
 * the floating map/list toggle without overlapping either control.
 */
export const SEARCH_MOBILE_STATUS_CARD_OFFSET =
  SEARCH_MOBILE_PREVIEW_CARD_OFFSET;
