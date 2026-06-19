/**
 * Regression for search-audit-2026-06-18 finding #2.
 *
 * generateMetadata's noindex signal must match the visible filter-chip count
 * (countActiveFilters, the documented single source of truth). The previous
 * hand-rolled counter counted price as TWO booleans and folded in the
 * always-derived `bounds` (set on essentially every location-based search),
 * which de-indexed high-value "rooms in {city} under ${X}" landing pages that
 * show only one visible price chip.
 *
 * These tests exercise the exact computation generateMetadata now uses
 * (normalizeSearchQuery -> serializeSearchQuery -> countActiveFilters) via the
 * real pure helpers, with no DB/RSC dependencies.
 */

import { countActiveFilters } from "@/components/filters/filter-chip-utils";
import {
  normalizeSearchQuery,
  serializeSearchQuery,
} from "@/lib/search/search-query";
import type { RawSearchParams } from "@/lib/search-params";

// Mirrors the generateMetadata derivation in src/app/search/page.tsx so the
// regression fails if the noindex model diverges from the chip count again.
function computeNoIndexSignal(rawParams: RawSearchParams): {
  activeFilterCount: number;
  isHighlyFiltered: boolean;
} {
  const canonicalParams = serializeSearchQuery(
    normalizeSearchQuery(rawParams),
    { includePagination: false }
  );
  const activeFilterCount = countActiveFilters(canonicalParams);
  return { activeFilterCount, isHighlyFiltered: activeFilterCount >= 3 };
}

describe("generateMetadata noindex / activeFilterCount", () => {
  it("keeps a city + price-range page indexable (price counts once, derived bounds excluded)", () => {
    // location from autocomplete (lat/lng -> derived bounds) + a price range.
    const { activeFilterCount, isHighlyFiltered } = computeNoIndexSignal({
      q: "Austin",
      lat: "30",
      lng: "-97",
      minPrice: "500",
      maxPrice: "1500",
    });

    // One combined price-range chip; bounds (auto-derived) does NOT count.
    expect(activeFilterCount).toBe(1);
    expect(isHighlyFiltered).toBe(false);
  });

  it("counts a city + price + amenity page as 2 visible chips (still indexable)", () => {
    const { activeFilterCount, isHighlyFiltered } = computeNoIndexSignal({
      q: "Austin",
      lat: "30",
      lng: "-97",
      minPrice: "500",
      maxPrice: "1500",
      amenities: "Wifi",
    });

    // price-range chip (1) + Wifi amenity chip (1) = 2 — matches the visible UI.
    expect(activeFilterCount).toBe(2);
    expect(isHighlyFiltered).toBe(false);
  });

  it("noindexes a genuinely highly-filtered URL (>= 3 visible chips)", () => {
    const { activeFilterCount, isHighlyFiltered } = computeNoIndexSignal({
      q: "Austin",
      lat: "30",
      lng: "-97",
      minPrice: "500",
      maxPrice: "1500",
      roomType: "Private Room",
      amenities: ["Wifi", "Parking"],
    });

    // price-range (1) + roomType (1) + two amenity chips (2) = 4 >= 3.
    expect(activeFilterCount).toBeGreaterThanOrEqual(3);
    expect(isHighlyFiltered).toBe(true);
  });
});
