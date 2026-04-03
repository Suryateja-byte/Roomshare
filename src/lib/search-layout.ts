/**
 * Search layout breakpoints shared by the search map/list UI.
 *
 * Search intentionally switches to the bottom-sheet layout below lg (1024px),
 * even though the broader app still uses the default md breakpoint in places.
 */

/** Phone-first map preview interactions stop at 767px. */
export const SEARCH_PHONE_MAX_WIDTH_PX = 767;

/** Media query used by search components to detect phone-only behavior. */
export const SEARCH_PHONE_MAX_QUERY = `(max-width: ${SEARCH_PHONE_MAX_WIDTH_PX}px)`;

/** Desktop split-view starts at 1024px for search map/list interactions. */
export const SEARCH_SPLIT_LAYOUT_MIN_WIDTH_PX = 1024;

/** Media query used by search components to detect the split-view layout. */
export const SEARCH_SPLIT_LAYOUT_MIN_QUERY = `(min-width: ${SEARCH_SPLIT_LAYOUT_MIN_WIDTH_PX}px)`;

/** Media query used by search components to detect the sheet layout. */
export const SEARCH_SHEET_LAYOUT_MAX_QUERY = `(max-width: ${SEARCH_SPLIT_LAYOUT_MIN_WIDTH_PX - 1}px)`;
