/**
 * Regression for search-audit-2026-06-18 finding #2 (surgical revision).
 *
 * generateMetadata de-indexes "highly filtered" search pages (>= 3 active
 * filters). The original counter also folded in `bounds`, which is auto-derived
 * from any lat/lng (deriveSearchBoundsFromPoint) and is therefore present on
 * essentially every location-based search — so a "rooms in {city} under ${X}"
 * page (one visible price chip) was pushed over the threshold and de-indexed.
 *
 * The fix drops ONLY the `bounds` term from the count; price min/max still count
 * per-field so the existing SEO contract (e2e SEO-07: q + price-range + roomType
 * => noindex) is preserved.
 *
 * Mirrors the activeFilterCount derivation in src/app/search/page.tsx via the real
 * parseSearchParams (which derives bounds), with no DB/RSC dependencies — so it
 * fails if the noindex model regresses (e.g. bounds re-added).
 */

import { parseSearchParams, type RawSearchParams } from "@/lib/search-params";

// Keep in lockstep with the activeFilterCount array in generateMetadata
// (src/app/search/page.tsx) — note the deliberate ABSENCE of filterParams.bounds.
function activeFilterCount(rawParams: RawSearchParams): number {
  const { filterParams } = parseSearchParams(rawParams);
  return [
    filterParams.minPrice !== undefined,
    filterParams.maxPrice !== undefined,
    Boolean(filterParams.roomType),
    Boolean(filterParams.moveInDate),
    Boolean(filterParams.endDate),
    Boolean(filterParams.leaseDuration),
    (filterParams.amenities?.length ?? 0) > 0,
    (filterParams.houseRules?.length ?? 0) > 0,
    (filterParams.languages?.length ?? 0) > 0,
    Boolean(filterParams.genderPreference),
    Boolean(filterParams.householdGender),
    Boolean(filterParams.bookingMode),
    (filterParams.minAvailableSlots ?? 0) > 1,
  ].filter(Boolean).length;
}

const isHighlyFiltered = (raw: RawSearchParams) => activeFilterCount(raw) >= 3;

describe("generateMetadata noindex / activeFilterCount", () => {
  it("keeps a city + price-range page indexable (derived bounds excluded)", () => {
    // location from autocomplete (lat/lng -> derived bounds) + a price range.
    const raw: RawSearchParams = {
      q: "Austin",
      lat: "30",
      lng: "-97",
      minPrice: "500",
      maxPrice: "1500",
    };
    // min + max = 2; the auto-derived bounds must NOT count.
    expect(activeFilterCount(raw)).toBe(2);
    expect(isHighlyFiltered(raw)).toBe(false);
  });

  it("keeps a bare city (lat/lng only) page indexable", () => {
    const raw: RawSearchParams = { q: "Austin", lat: "30", lng: "-97" };
    expect(activeFilterCount(raw)).toBe(0);
    expect(isHighlyFiltered(raw)).toBe(false);
  });

  it("noindexes q + price-range + roomType (preserves SEO-07 contract)", () => {
    // Mirrors tests/e2e/seo/search-seo-meta.anon.spec.ts SEO-07.
    const raw: RawSearchParams = {
      q: "SF",
      minPrice: "500",
      maxPrice: "2000",
      roomType: "Private Room",
    };
    // min + max + roomType = 3.
    expect(activeFilterCount(raw)).toBe(3);
    expect(isHighlyFiltered(raw)).toBe(true);
  });

  it("noindexes a genuinely highly-filtered URL", () => {
    const raw: RawSearchParams = {
      q: "Austin",
      lat: "30",
      lng: "-97",
      minPrice: "500",
      maxPrice: "1500",
      roomType: "Private Room",
      amenities: ["Wifi", "Parking"],
    };
    expect(activeFilterCount(raw)).toBeGreaterThanOrEqual(3);
    expect(isHighlyFiltered(raw)).toBe(true);
  });
});
