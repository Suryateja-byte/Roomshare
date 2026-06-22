/**
 * Pure view-state predicates for the search map.
 *
 * Extracted from Map.tsx so the "should the empty state show?" decision is
 * unit-testable. The critical invariant: a failed/timed-out OR still-in-flight
 * map-data fetch must NEVER present as "No listings in this area" — an error
 * banner (failure) or loading bar (in flight) is the wrapper's job; claiming
 * emptiness would be lying about inventory the list pane may well be showing.
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
  /** A map-data fetch is currently in flight (loading bar is showing) */
  isFetchingData: boolean;
  /** Listings currently rendered on the map */
  listingsCount: number;
}

/**
 * True only when the viewport is CONFIRMED empty: map settled, no search in
 * flight, no suppression, and — crucially — the last fetch succeeded AND no
 * fetch is currently in flight.
 */
export function shouldShowEmptyState(input: EmptyStateInput): boolean {
  return (
    input.isMapLoaded &&
    input.isMapInitialized &&
    !input.areTilesLoading &&
    !input.isSearching &&
    !input.suppressEmptyState &&
    !input.hasFetchError &&
    !input.isFetchingData &&
    input.listingsCount === 0
  );
}
