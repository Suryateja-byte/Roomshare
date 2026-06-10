/**
 * Pure view-state predicates for the search map.
 *
 * Extracted from Map.tsx so the "should the empty state show?" decision is
 * unit-testable. The critical invariant: a failed/timed-out map-data fetch
 * must NEVER present as "No listings in this area" — an error banner with
 * retry is the wrapper's job; claiming emptiness would be lying about
 * inventory the list pane may well be showing.
 */

export interface EmptyStateInput {
  /** MapLibre fired onLoad */
  isMapLoaded: boolean;
  /** First listings payload has been applied */
  isMapInitialized: boolean;
  /** Tile fetches in flight (debounced) */
  areTilesLoading: boolean;
  /** A search/filter transition is in progress */
  isSearching: boolean;
  /** Caller-driven suppression (e.g. viewport-too-wide info banner) */
  suppressEmptyState: boolean;
  /** The last map-data fetch failed or timed out (error banner is showing) */
  hasFetchError: boolean;
  /** Listings currently rendered on the map */
  listingsCount: number;
}

/**
 * True only when the viewport is CONFIRMED empty: map settled, no search in
 * flight, no suppression, and — crucially — the last fetch succeeded.
 */
export function shouldShowEmptyState(input: EmptyStateInput): boolean {
  return (
    input.isMapLoaded &&
    input.isMapInitialized &&
    !input.areTilesLoading &&
    !input.isSearching &&
    !input.suppressEmptyState &&
    !input.hasFetchError &&
    input.listingsCount === 0
  );
}
