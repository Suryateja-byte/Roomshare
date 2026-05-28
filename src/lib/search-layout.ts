/**
 * Search layout breakpoints shared by the search map/list UI.
 *
 * The search page keeps desktop list controls from md up, but only renders the
 * side-by-side list/map split when the viewport has enough width for both panes.
 */

/** Phone-first map preview and bottom-sheet interactions stop at 767px. */
export const SEARCH_PHONE_MAX_WIDTH_PX = 767;

/** Media query used by search components to detect phone-only behavior. */
export const SEARCH_PHONE_MAX_QUERY = `(max-width: ${SEARCH_PHONE_MAX_WIDTH_PX}px)`;

/** Inline list/map split starts at Tailwind's xl breakpoint. */
export const SEARCH_SPLIT_VIEW_MIN_WIDTH = 1280;

/** Media query used by search components to detect the inline split view. */
export const SEARCH_SPLIT_VIEW_MEDIA_QUERY = `(min-width: ${SEARCH_SPLIT_VIEW_MIN_WIDTH}px)`;

/** Legacy alias for existing search split-layout consumers. */
export const SEARCH_SPLIT_LAYOUT_MIN_WIDTH_PX = SEARCH_SPLIT_VIEW_MIN_WIDTH;

/** Legacy alias for existing search split-layout consumers. */
export const SEARCH_SPLIT_LAYOUT_MIN_QUERY = SEARCH_SPLIT_VIEW_MEDIA_QUERY;

/** Legacy alias for existing phone-only sheet-layout consumers. */
export const SEARCH_SHEET_LAYOUT_MAX_QUERY = SEARCH_PHONE_MAX_QUERY;
