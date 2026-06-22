/**
 * Unit matrix for shouldShowEmptyState — the gate that decides when the
 * map may claim "No listings in this area".
 *
 * Regression context (observed live 2026-06-10): a map-listings fetch
 * timeout left listings=[] and the map showed BOTH the timeout error
 * banner AND the "No listings in this area" empty state while the list
 * pane had 44 results. A failed fetch must never present as emptiness.
 */

import {
  shouldShowEmptyState,
  type EmptyStateInput,
} from "@/lib/maps/map-view-state";

const settledEmpty: EmptyStateInput = {
  isMapLoaded: true,
  isMapInitialized: true,
  areTilesLoading: false,
  isSearching: false,
  suppressEmptyState: false,
  hasFetchError: false,
  isFetchingData: false,
  listingsCount: 0,
};

describe("shouldShowEmptyState", () => {
  it("shows for a settled, successfully-fetched, genuinely empty viewport", () => {
    expect(shouldShowEmptyState(settledEmpty)).toBe(true);
  });

  it("REGRESSION: never shows while the last fetch errored/timed out, even with 0 listings", () => {
    expect(
      shouldShowEmptyState({ ...settledEmpty, hasFetchError: true })
    ).toBe(false);
  });

  it("shows again after a successful retry clears the error", () => {
    const duringError = { ...settledEmpty, hasFetchError: true };
    expect(shouldShowEmptyState(duringError)).toBe(false);

    const afterRetry = { ...duringError, hasFetchError: false };
    expect(shouldShowEmptyState(afterRetry)).toBe(true);
  });

  it("REGRESSION: never shows while a fetch is in flight, even with 0 listings", () => {
    // A filter/query change after a prior zero-result can leave listings=[] with
    // a refetch in flight; the overlay must wait, not flash "No listings".
    expect(
      shouldShowEmptyState({ ...settledEmpty, isFetchingData: true })
    ).toBe(false);
  });

  it("shows again once an in-flight fetch settles to zero results", () => {
    const duringFetch = { ...settledEmpty, isFetchingData: true };
    expect(shouldShowEmptyState(duringFetch)).toBe(false);

    const afterSettle = { ...duringFetch, isFetchingData: false };
    expect(shouldShowEmptyState(afterSettle)).toBe(true);
  });

  it("never shows when listings are present, regardless of error state", () => {
    expect(
      shouldShowEmptyState({ ...settledEmpty, listingsCount: 44 })
    ).toBe(false);
    expect(
      shouldShowEmptyState({
        ...settledEmpty,
        listingsCount: 44,
        hasFetchError: true,
      })
    ).toBe(false);
  });

  describe("unsettled map states suppress the empty claim", () => {
    const unsettledCases: Array<[string, Partial<EmptyStateInput>]> = [
      ["map not loaded", { isMapLoaded: false }],
      ["map not initialized", { isMapInitialized: false }],
      ["tiles loading", { areTilesLoading: true }],
      ["search in flight", { isSearching: true }],
      ["data fetch in flight", { isFetchingData: true }],
      ["caller suppression (info banner)", { suppressEmptyState: true }],
    ];

    it.each(unsettledCases)("%s", (_label, overrides) => {
      expect(shouldShowEmptyState({ ...settledEmpty, ...overrides })).toBe(
        false
      );
      // ...and an error on top of an unsettled state is still suppressed
      expect(
        shouldShowEmptyState({
          ...settledEmpty,
          ...overrides,
          hasFetchError: true,
        })
      ).toBe(false);
    });
  });
});
