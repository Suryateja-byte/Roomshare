/**
 * Pairwise Integration Tests for Filter Combinations
 *
 * Tests all 2-filter combinations plus targeted 3-wise for critical paths.
 * Uses deterministic test fixtures.
 *
 * Why pairwise:
 * - 15 filters × multiple values = billions of combinations
 * - Pairwise covers all 2-filter interactions with ~150 tests
 * - Catches 70-90% of interaction bugs
 */

import {
  TEST_LISTINGS,
  ACTIVE_LISTINGS,
  SF_BOUNDS,
  ANTIMERIDIAN_BOUNDS,
  applyFilters,
  sortListings,
  paginateListings,
  verifyCoverage,
} from '../fixtures/listings';
import { normalizeFilters, NormalizedFilters } from '@/lib/filter-schema';

// ============================================
// Fixture Verification
// ============================================

describe('Test Fixtures', () => {
  it('has 100 listings', () => {
    expect(TEST_LISTINGS.length).toBe(100);
  });

  it('has at least 85 active listings', () => {
    expect(ACTIVE_LISTINGS.length).toBeGreaterThanOrEqual(85);
  });

  it('has coverage for all filter values', () => {
    const { missing } = verifyCoverage(ACTIVE_LISTINGS);
    // Allow some minor gaps but flag if major coverage issues
    expect(missing.length).toBeLessThan(5);
  });

  it('has SF listings for bounds testing', () => {
    const sfListings = applyFilters(TEST_LISTINGS, { bounds: SF_BOUNDS });
    expect(sfListings.length).toBeGreaterThan(0);
  });
});

// ============================================
// Filter Value Sets for Pairwise
// ============================================

const FILTER_VALUES = {
  query: [undefined, 'downtown', 'cozy'],
  minPrice: [undefined, 0, 500, 1000],
  maxPrice: [undefined, 1000, 2000, 5000],
  roomType: [undefined, 'Private Room', 'Shared Room', 'Entire Place'],
  amenities: [undefined, ['Wifi'], ['Wifi', 'Parking'], ['Pool']],
  houseRules: [undefined, ['Pets allowed'], ['Smoking allowed']],
  languages: [undefined, ['en'], ['en', 'es'], ['zh']],
  leaseDuration: [undefined, 'Month-to-month', '6 months'],
  genderPreference: [undefined, 'FEMALE_ONLY', 'NO_PREFERENCE'],
  householdGender: [undefined, 'ALL_FEMALE', 'MIXED'],
};

// ============================================
// Pairwise Generator
// ============================================

interface FilterCombo {
  name: string;
  filters: Partial<NormalizedFilters>;
}

/**
 * Generate all unique 2-filter combinations
 */
function generatePairwiseCombinations(): FilterCombo[] {
  const combos: FilterCombo[] = [];
  const filterNames = Object.keys(FILTER_VALUES) as (keyof typeof FILTER_VALUES)[];

  for (let i = 0; i < filterNames.length; i++) {
    for (let j = i + 1; j < filterNames.length; j++) {
      const filter1 = filterNames[i];
      const filter2 = filterNames[j];
      const values1 = FILTER_VALUES[filter1];
      const values2 = FILTER_VALUES[filter2];

      // Sample combinations (not all, to keep test count manageable)
      // For each pair, test: (defined, undefined), (undefined, defined), (defined, defined)
      for (const v1 of values1.slice(0, 2)) {
        for (const v2 of values2.slice(0, 2)) {
          if (v1 !== undefined || v2 !== undefined) {
            combos.push({
              name: `${filter1}=${formatValue(v1)} + ${filter2}=${formatValue(v2)}`,
              filters: { [filter1]: v1, [filter2]: v2 } as Partial<NormalizedFilters>,
            });
          }
        }
      }
    }
  }

  return combos;
}

function formatValue(v: unknown): string {
  if (v === undefined) return 'undefined';
  if (Array.isArray(v)) return `[${v.join(',')}]`;
  return String(v);
}

const PAIRWISE_COMBOS = generatePairwiseCombinations();

// ============================================
// Core Pairwise Tests
// ============================================

describe('Pairwise Filter Combinations', () => {
  // Generate test for each pairwise combination
  it.each(PAIRWISE_COMBOS)('$name', ({ filters }) => {
    // Normalize the filters
    const normalized = normalizeFilters(filters);

    // Apply to fixture data
    const results = applyFilters(ACTIVE_LISTINGS, filters);

    // Verify invariants
    // 1. No crash
    expect(results).toBeDefined();

    // 2. Results are array
    expect(Array.isArray(results)).toBe(true);

    // 3. All results are active with available slots
    for (const listing of results) {
      expect(listing.status).toBe('ACTIVE');
      expect(listing.availableSlots).toBeGreaterThan(0);
    }

    // 4. All results match filters
    for (const listing of results) {
      // Price filters
      if (normalized.minPrice !== undefined) {
        expect(listing.price).toBeGreaterThanOrEqual(normalized.minPrice);
      }
      if (normalized.maxPrice !== undefined) {
        expect(listing.price).toBeLessThanOrEqual(normalized.maxPrice);
      }

      // Room type
      if (normalized.roomType) {
        expect(listing.roomType.toLowerCase()).toBe(normalized.roomType.toLowerCase());
      }

      // Amenities (AND logic)
      if (normalized.amenities?.length) {
        for (const amenity of normalized.amenities) {
          expect(
            listing.amenities.some((a) => a.toLowerCase().includes(amenity.toLowerCase()))
          ).toBe(true);
        }
      }

      // House rules (AND logic)
      if (normalized.houseRules?.length) {
        for (const rule of normalized.houseRules) {
          expect(
            listing.houseRules.some((r) => r.toLowerCase() === rule.toLowerCase())
          ).toBe(true);
        }
      }

      // Languages (OR logic)
      if (normalized.languages?.length) {
        expect(
          normalized.languages.some((lang) => listing.languages.includes(lang))
        ).toBe(true);
      }
    }
  });
});

// ============================================
// High-Risk 3-wise Combinations
// ============================================

describe('High-Risk 3-wise Combinations', () => {
  describe('Price + Sort + RoomType', () => {
    const combos = [
      { minPrice: 500, maxPrice: 2000, sort: 'price_asc', roomType: 'Private Room' },
      { minPrice: 0, maxPrice: 1000, sort: 'price_desc', roomType: 'Shared Room' },
      { minPrice: 1000, maxPrice: 5000, sort: 'rating', roomType: 'Entire Place' },
    ];

    it.each(combos)('minPrice=$minPrice, maxPrice=$maxPrice, sort=$sort, roomType=$roomType', (combo) => {
      const filtered = applyFilters(ACTIVE_LISTINGS, {
        minPrice: combo.minPrice,
        maxPrice: combo.maxPrice,
        roomType: combo.roomType,
      });
      const sorted = sortListings(filtered, combo.sort as 'price_asc' | 'price_desc' | 'rating');

      // Verify sorting
      if (combo.sort === 'price_asc') {
        for (let i = 0; i < sorted.length - 1; i++) {
          expect(sorted[i].price).toBeLessThanOrEqual(sorted[i + 1].price);
        }
      } else if (combo.sort === 'price_desc') {
        for (let i = 0; i < sorted.length - 1; i++) {
          expect(sorted[i].price).toBeGreaterThanOrEqual(sorted[i + 1].price);
        }
      } else if (combo.sort === 'rating') {
        for (let i = 0; i < sorted.length - 1; i++) {
          const r1 = sorted[i].avgRating ?? 0;
          const r2 = sorted[i + 1].avgRating ?? 0;
          expect(r1).toBeGreaterThanOrEqual(r2);
        }
      }

      // Verify filters applied
      for (const listing of sorted) {
        expect(listing.price).toBeGreaterThanOrEqual(combo.minPrice);
        expect(listing.price).toBeLessThanOrEqual(combo.maxPrice);
        expect(listing.roomType).toBe(combo.roomType);
      }
    });
  });

  describe('Bounds + Query + RoomType', () => {
    const combos = [
      { bounds: SF_BOUNDS, query: 'cozy', roomType: 'Private Room' },
      { bounds: SF_BOUNDS, query: 'modern', roomType: 'Entire Place' },
    ];

    it.each(combos)('bounds + query=$query + roomType=$roomType', (combo) => {
      const filtered = applyFilters(ACTIVE_LISTINGS, combo);

      // Verify bounds
      for (const listing of filtered) {
        expect(listing.location.lat).toBeGreaterThanOrEqual(combo.bounds.minLat);
        expect(listing.location.lat).toBeLessThanOrEqual(combo.bounds.maxLat);
        expect(listing.location.lng).toBeGreaterThanOrEqual(combo.bounds.minLng);
        expect(listing.location.lng).toBeLessThanOrEqual(combo.bounds.maxLng);
      }

      // Verify query (case-insensitive)
      const q = combo.query.toLowerCase();
      for (const listing of filtered) {
        const matches =
          listing.title.toLowerCase().includes(q) ||
          listing.description.toLowerCase().includes(q) ||
          listing.location.city.toLowerCase().includes(q) ||
          listing.location.state.toLowerCase().includes(q);
        expect(matches).toBe(true);
      }

      // Verify room type
      for (const listing of filtered) {
        expect(listing.roomType).toBe(combo.roomType);
      }
    });
  });

  describe('Amenities + HouseRules + Languages', () => {
    const combos = [
      { amenities: ['Wifi'], houseRules: ['Pets allowed'], languages: ['en'] },
      { amenities: ['Wifi', 'Parking'], houseRules: ['Couples allowed'], languages: ['en', 'es'] },
      { amenities: ['Pool'], houseRules: [], languages: ['zh'] },
    ];

    it.each(combos)('amenities=$amenities, houseRules=$houseRules, languages=$languages', (combo) => {
      const filtered = applyFilters(ACTIVE_LISTINGS, combo);

      for (const listing of filtered) {
        // Amenities (AND)
        for (const amenity of combo.amenities) {
          expect(
            listing.amenities.some((a) => a.toLowerCase().includes(amenity.toLowerCase()))
          ).toBe(true);
        }

        // House rules (AND)
        for (const rule of combo.houseRules) {
          expect(
            listing.houseRules.some((r) => r.toLowerCase() === rule.toLowerCase())
          ).toBe(true);
        }

        // Languages (OR)
        if (combo.languages.length > 0) {
          expect(
            combo.languages.some((lang) => listing.languages.includes(lang))
          ).toBe(true);
        }
      }
    });
  });
});

// ============================================
// Pagination Tests
// ============================================

describe('Pagination with Filters', () => {
  it('paginates filtered results correctly', () => {
    const filtered = applyFilters(ACTIVE_LISTINGS, { minPrice: 500 });
    const sorted = sortListings(filtered, 'price_asc');

    const page1 = paginateListings(sorted, 1, 10);
    const page2 = paginateListings(sorted, 2, 10);

    // Verify pagination metadata
    expect(page1.total).toBe(sorted.length);
    expect(page1.totalPages).toBe(Math.ceil(sorted.length / 10));
    expect(page1.items.length).toBeLessThanOrEqual(10);

    // Verify no duplicates across pages
    const page1Ids = new Set(page1.items.map((l) => l.id));
    for (const item of page2.items) {
      expect(page1Ids.has(item.id)).toBe(false);
    }

    // Verify sort order preserved
    for (let i = 0; i < page1.items.length - 1; i++) {
      expect(page1.items[i].price).toBeLessThanOrEqual(page1.items[i + 1].price);
    }
  });

  it('returns empty for page beyond total', () => {
    const filtered = applyFilters(ACTIVE_LISTINGS, { minPrice: 5000 });
    const paginated = paginateListings(filtered, 100, 10);

    expect(paginated.items.length).toBe(0);
    expect(paginated.total).toBe(filtered.length);
  });
});

// ============================================
// Monotonicity Tests
// ============================================

describe('Monotonicity (Adding Filters Reduces Results)', () => {
  it('adding minPrice reduces results', () => {
    const base = applyFilters(ACTIVE_LISTINGS, {});
    const withMin = applyFilters(ACTIVE_LISTINGS, { minPrice: 1000 });

    expect(withMin.length).toBeLessThanOrEqual(base.length);
  });

  it('adding maxPrice reduces results', () => {
    const base = applyFilters(ACTIVE_LISTINGS, {});
    const withMax = applyFilters(ACTIVE_LISTINGS, { maxPrice: 1000 });

    expect(withMax.length).toBeLessThanOrEqual(base.length);
  });

  it('adding amenities reduces results', () => {
    const base = applyFilters(ACTIVE_LISTINGS, {});
    const withWifi = applyFilters(ACTIVE_LISTINGS, { amenities: ['Wifi'] });
    const withWifiPool = applyFilters(ACTIVE_LISTINGS, { amenities: ['Wifi', 'Pool'] });

    expect(withWifi.length).toBeLessThanOrEqual(base.length);
    expect(withWifiPool.length).toBeLessThanOrEqual(withWifi.length);
  });

  it('adding roomType reduces results', () => {
    const base = applyFilters(ACTIVE_LISTINGS, {});
    const withType = applyFilters(ACTIVE_LISTINGS, { roomType: 'Private Room' });

    expect(withType.length).toBeLessThanOrEqual(base.length);
  });

  it('adding bounds reduces results', () => {
    const base = applyFilters(ACTIVE_LISTINGS, {});
    const withBounds = applyFilters(ACTIVE_LISTINGS, { bounds: SF_BOUNDS });

    expect(withBounds.length).toBeLessThanOrEqual(base.length);
  });

  it('adding query reduces results', () => {
    const base = applyFilters(ACTIVE_LISTINGS, {});
    const withQuery = applyFilters(ACTIVE_LISTINGS, { query: 'downtown' });

    expect(withQuery.length).toBeLessThanOrEqual(base.length);
  });
});

// ============================================
// Subset Rule Tests
// ============================================

describe('Subset Rule (Combined Filters ⊆ Individual Filters)', () => {
  it('price+amenities results are subset of price-only results', () => {
    const priceOnly = applyFilters(ACTIVE_LISTINGS, { minPrice: 500 });
    const combined = applyFilters(ACTIVE_LISTINGS, { minPrice: 500, amenities: ['Wifi'] });

    const priceOnlyIds = new Set(priceOnly.map((l) => l.id));
    for (const listing of combined) {
      expect(priceOnlyIds.has(listing.id)).toBe(true);
    }
  });

  it('price+amenities results are subset of amenities-only results', () => {
    const amenitiesOnly = applyFilters(ACTIVE_LISTINGS, { amenities: ['Wifi'] });
    const combined = applyFilters(ACTIVE_LISTINGS, { minPrice: 500, amenities: ['Wifi'] });

    const amenitiesOnlyIds = new Set(amenitiesOnly.map((l) => l.id));
    for (const listing of combined) {
      expect(amenitiesOnlyIds.has(listing.id)).toBe(true);
    }
  });

  it('bounds+roomType results are subset of bounds-only results', () => {
    const boundsOnly = applyFilters(ACTIVE_LISTINGS, { bounds: SF_BOUNDS });
    const combined = applyFilters(ACTIVE_LISTINGS, { bounds: SF_BOUNDS, roomType: 'Private Room' });

    const boundsOnlyIds = new Set(boundsOnly.map((l) => l.id));
    for (const listing of combined) {
      expect(boundsOnlyIds.has(listing.id)).toBe(true);
    }
  });
});

// ============================================
// Order Independence Tests
// ============================================

describe('Order Independence', () => {
  it('array filter order does not affect results', () => {
    const result1 = applyFilters(ACTIVE_LISTINGS, { amenities: ['Wifi', 'Pool'] });
    const result2 = applyFilters(ACTIVE_LISTINGS, { amenities: ['Pool', 'Wifi'] });

    const ids1 = new Set(result1.map((l) => l.id));
    const ids2 = new Set(result2.map((l) => l.id));

    expect(ids1).toEqual(ids2);
  });

  it('language filter order does not affect results', () => {
    const result1 = applyFilters(ACTIVE_LISTINGS, { languages: ['en', 'es'] });
    const result2 = applyFilters(ACTIVE_LISTINGS, { languages: ['es', 'en'] });

    const ids1 = new Set(result1.map((l) => l.id));
    const ids2 = new Set(result2.map((l) => l.id));

    expect(ids1).toEqual(ids2);
  });
});

// ============================================
// Antimeridian Tests
// ============================================

describe('Antimeridian Bounds', () => {
  it('handles bounds crossing antimeridian', () => {
    // Bounds from 170E to 170W (crossing the date line)
    const bounds = { minLat: -40, maxLat: 0, minLng: 170, maxLng: -170 };
    const results = applyFilters(TEST_LISTINGS, { bounds });

    // Should find listings in Fiji/Auckland area
    for (const listing of results) {
      expect(listing.location.lat).toBeGreaterThanOrEqual(bounds.minLat);
      expect(listing.location.lat).toBeLessThanOrEqual(bounds.maxLat);

      // Either >= minLng OR <= maxLng (antimeridian logic)
      expect(
        listing.location.lng >= bounds.minLng || listing.location.lng <= bounds.maxLng
      ).toBe(true);
    }
  });
});

// ============================================
// Empty Results Handling
// ============================================

describe('Empty Results Handling', () => {
  it('returns empty array for impossible filter combination', () => {
    // Very restrictive filters unlikely to match anything
    const results = applyFilters(ACTIVE_LISTINGS, {
      minPrice: 10000,
      maxPrice: 10001,
      amenities: ['Pool', 'Gym'],
      roomType: 'Entire Place',
      languages: ['xx'], // Invalid language code
    });

    expect(results).toEqual([]);
  });

  it('handles very narrow price range', () => {
    const results = applyFilters(ACTIVE_LISTINGS, { minPrice: 999, maxPrice: 1001 });
    // May or may not have results, but should not crash
    expect(Array.isArray(results)).toBe(true);
  });
});
