/**
 * P1-4 regression: parseSavedSearchFilters silently dropped the map viewport.
 *
 * The write path stores the viewport as FLAT keys (minLat/maxLat/minLng/maxLng
 * plus lat/lng — see savedSearchFiltersWriteSchema in app/actions/saved-search.ts).
 * The read path normalises through `normalizeSearchFilters` from
 * @/lib/search-params, whose `normalizeBoundsInput` reads only a NESTED `bounds`
 * object, so `normalized.bounds` was always undefined. `lat`/`lng` were never
 * forwarded into normalizedSearchQueryToSearchFilters at all.
 *
 * Result: reopening a saved search lost its location scope and fell back to a
 * nationwide browse, and every alert email's notificationLink did the same.
 */

import { buildCanonicalSavedSearchMetadata } from "@/lib/search/saved-search-canonical";
import { parseSavedSearchFilters } from "@/lib/search/saved-search-parser";
import { buildSearchUrl, type SearchFilters } from "@/lib/search-utils";

/** Mirrors what app/actions/saved-search.ts persists into SavedSearch.filters. */
function persistedFilters(input: SearchFilters): Record<string, unknown> {
  const canonical = buildCanonicalSavedSearchMetadata(input);
  return JSON.parse(JSON.stringify(canonical.filters)) as Record<
    string,
    unknown
  >;
}

describe("parseSavedSearchFilters — viewport round-trip", () => {
  const austin: SearchFilters = {
    locationLabel: "Austin, TX",
    lat: 30.2672,
    lng: -97.7431,
    minLat: 30.1,
    maxLat: 30.4,
    minLng: -97.9,
    maxLng: -97.5,
    minPrice: 500,
  };

  it("preserves all six viewport fields through save -> store -> reopen", () => {
    const stored = persistedFilters(austin);

    // Guard the premise: the write path really does store flat keys.
    expect(stored).toMatchObject({
      lat: 30.2672,
      lng: -97.7431,
      minLat: 30.1,
      maxLat: 30.4,
      minLng: -97.9,
      maxLng: -97.5,
    });

    const parsed = parseSavedSearchFilters(stored);

    expect(parsed).toMatchObject({
      locationLabel: "Austin, TX",
      minPrice: 500,
      lat: 30.2672,
      lng: -97.7431,
      minLat: 30.1,
      maxLat: 30.4,
      minLng: -97.9,
      maxLng: -97.5,
    });
  });

  it("reads a nested bounds object when a row already has one", () => {
    const parsed = parseSavedSearchFilters({
      locationLabel: "Austin, TX",
      bounds: { minLat: 30.1, maxLat: 30.4, minLng: -97.9, maxLng: -97.5 },
    });

    expect(parsed).toMatchObject({
      minLat: 30.1,
      maxLat: 30.4,
      minLng: -97.9,
      maxLng: -97.5,
    });
  });

  it("drops an inverted latitude range rather than passing it through", () => {
    const parsed = parseSavedSearchFilters({
      locationLabel: "Austin, TX",
      minLat: 30.4,
      maxLat: 30.1,
      minLng: -97.9,
      maxLng: -97.5,
    });

    expect(parsed?.minLat).toBeUndefined();
    expect(parsed?.maxLat).toBeUndefined();
    expect(parsed?.minLng).toBeUndefined();
    expect(parsed?.maxLng).toBeUndefined();
  });

  it("drops a partial viewport (three of four edges)", () => {
    const parsed = parseSavedSearchFilters({
      locationLabel: "Austin, TX",
      minLat: 30.1,
      maxLat: 30.4,
      minLng: -97.9,
    });

    expect(parsed?.minLat).toBeUndefined();
    expect(parsed?.maxLng).toBeUndefined();
  });

  // Clamping (rather than dropping) is the established convention for
  // out-of-range coordinates — both parseSearchParams (safeParseFloat with
  // ±90/±180) and normalizeBoundsInput clamp. The read path matches it.
  it("clamps out-of-range latitude/longitude values", () => {
    const parsed = parseSavedSearchFilters({
      locationLabel: "Nowhere",
      lat: 900,
      lng: -900,
      minLat: -91,
      maxLat: 30.4,
      minLng: -97.9,
      maxLng: 181,
    });

    expect(parsed).toMatchObject({
      lat: 90,
      lng: -180,
      minLat: -90,
      maxLat: 30.4,
      minLng: -97.9,
      maxLng: 180,
    });
  });

  // A non-numeric coordinate fails the read schema outright, so the blob is
  // rejected before clamping is reached. Pinned here so nobody "fixes" the
  // parser into emitting a NaN viewport instead.
  it("rejects the whole filters blob when a coordinate is not a number", () => {
    expect(
      parseSavedSearchFilters({ locationLabel: "Nowhere", lng: "not-a-number" })
    ).toBeNull();
  });

  // The user-visible symptom: SavedSearchList builds the reopen link with
  // buildSearchUrl(search.filters), and every alert email's notificationLink
  // comes from the same call. With the viewport dropped, that URL had no
  // bounds, so parseSearchParams set browseMode and the click landed on a
  // nationwide browse instead of the saved area.
  it("produces a reopen URL that still carries the viewport", () => {
    const parsed = parseSavedSearchFilters(persistedFilters(austin));
    const url = buildSearchUrl(parsed as SearchFilters);

    const params = new URLSearchParams(url.split("?")[1] ?? "");
    expect(params.get("minLat")).toBeTruthy();
    expect(params.get("maxLat")).toBeTruthy();
    expect(params.get("minLng")).toBeTruthy();
    expect(params.get("maxLng")).toBeTruthy();
    expect(Number(params.get("minLat"))).toBeCloseTo(30.1, 2);
    expect(Number(params.get("maxLng"))).toBeCloseTo(-97.5, 2);
  });

  it("leaves a viewport-free saved search untouched", () => {
    const parsed = parseSavedSearchFilters({
      locationLabel: "Austin, TX",
      minPrice: 500,
    });

    expect(parsed).toMatchObject({ locationLabel: "Austin, TX", minPrice: 500 });
    expect(parsed?.minLat).toBeUndefined();
    expect(parsed?.lat).toBeUndefined();
  });
});
