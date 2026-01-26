/**
 * Property-Based Tests for Filter System
 *
 * Uses fast-check to verify invariants hold for ANY valid input.
 * Based on FILTER_INVARIANTS.md - 12 core invariants.
 */

import * as fc from 'fast-check';
import {
  normalizeFilters,
  NormalizedFilters,
  VALID_AMENITIES,
  VALID_HOUSE_RULES,
  VALID_ROOM_TYPES,
  VALID_LEASE_DURATIONS,
  VALID_GENDER_PREFERENCES,
  VALID_HOUSEHOLD_GENDERS,
  VALID_SORT_OPTIONS,
  MAX_SAFE_PRICE,
  MAX_SAFE_PAGE,
  MAX_PAGE_SIZE,
  Amenity,
  HouseRule,
  RoomType,
  SortOption,
} from '@/lib/filter-schema';
import {
  TEST_LISTINGS,
  ACTIVE_LISTINGS,
  applyFilters,
  sortListings,
  paginateListings,
} from '../fixtures/listings.fixture';

// ============================================
// Arbitraries (Random Value Generators)
// ============================================

/**
 * Generate valid language codes
 */
const languageCodeArb = fc.constantFrom(
  'en', 'es', 'zh', 'fr', 'de', 'ja', 'ko', 'pt', 'ru', 'ar',
  'hi', 'it', 'nl', 'pl', 'tr', 'vi', 'th', 'id', 'ms', 'tl'
);

/**
 * Generate valid amenity
 */
const amenityArb = fc.constantFrom(...VALID_AMENITIES) as fc.Arbitrary<Amenity>;

/**
 * Generate valid house rule
 */
const houseRuleArb = fc.constantFrom(...VALID_HOUSE_RULES) as fc.Arbitrary<HouseRule>;

/**
 * Generate valid room type (excluding 'any')
 */
const roomTypeArb = fc.constantFrom(
  ...VALID_ROOM_TYPES.filter((t) => t !== 'any')
) as fc.Arbitrary<Exclude<RoomType, 'any'>>;

/**
 * Generate valid sort option
 */
const sortArb = fc.constantFrom(...VALID_SORT_OPTIONS) as fc.Arbitrary<SortOption>;

/**
 * Generate valid price (0 to MAX_SAFE_PRICE)
 */
const priceArb = fc.integer({ min: 0, max: 10000 });

/**
 * Generate valid latitude (-90 to 90)
 */
const latArb = fc.double({ min: -90, max: 90, noNaN: true, noDefaultInfinity: true });

/**
 * Generate valid longitude (-180 to 180)
 */
const lngArb = fc.double({ min: -180, max: 180, noNaN: true, noDefaultInfinity: true });

/**
 * Generate valid bounds
 */
const boundsArb = fc.record({
  minLat: latArb,
  maxLat: latArb,
  minLng: lngArb,
  maxLng: lngArb,
});

/**
 * Generate valid date string (YYYY-MM-DD format)
 */
const futureDateArb = fc.integer({ min: 1, max: 365 }).map((daysFromNow) => {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().split('T')[0];
});

/**
 * Generate valid query string
 */
const queryArb = fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0);

/**
 * Generate valid price range (ensures minPrice <= maxPrice)
 */
const validPriceRangeArb = fc.tuple(priceArb, priceArb).map(([p1, p2]) => ({
  minPrice: Math.min(p1, p2),
  maxPrice: Math.max(p1, p2),
}));

/**
 * Generate valid filter params (for property testing)
 * Note: Uses validPriceRangeArb to ensure minPrice <= maxPrice (P1-13 fix throws on inverted ranges)
 */
const validFilterParamsArb = validPriceRangeArb.chain((priceRange) =>
  fc.record(
    {
      query: fc.option(queryArb, { nil: undefined }),
      minPrice: fc.constant(priceRange.minPrice) as fc.Arbitrary<number | undefined>,
      maxPrice: fc.constant(priceRange.maxPrice) as fc.Arbitrary<number | undefined>,
      roomType: fc.option(roomTypeArb, { nil: undefined }),
      amenities: fc.option(fc.array(amenityArb, { maxLength: 5 }), { nil: undefined }),
      houseRules: fc.option(fc.array(houseRuleArb, { maxLength: 3 }), { nil: undefined }),
      languages: fc.option(fc.array(languageCodeArb, { maxLength: 5 }), { nil: undefined }),
      sort: fc.option(sortArb, { nil: undefined }),
      page: fc.option(fc.integer({ min: 1, max: 10 }), { nil: undefined }),
      limit: fc.option(fc.integer({ min: 1, max: 50 }), { nil: undefined }),
    },
    { requiredKeys: [] }
  ).map((filters) => ({
    ...filters,
    // Apply price range only if both are defined, otherwise use undefined
    minPrice: filters.minPrice !== undefined ? priceRange.minPrice : undefined,
    maxPrice: filters.maxPrice !== undefined ? priceRange.maxPrice : undefined,
  }))
);

// ============================================
// Invariant 1: Idempotence
// ============================================

describe('Invariant 1: Idempotence', () => {
  it('normalizing twice produces same result as normalizing once', () => {
    fc.assert(
      fc.property(validFilterParamsArb, (input) => {
        const once = normalizeFilters(input);
        const twice = normalizeFilters(once);
        expect(twice).toEqual(once);
      }),
      { numRuns: 100 }
    );
  });

  it('handles arbitrary input without mutation', () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        // Skip undefined/null for deep copy test (focus on objects)
        if (input === undefined || input === null) {
          const result = normalizeFilters(input);
          expect(result).toBeDefined();
          return;
        }

        // For objects, verify no mutation
        let inputCopy: unknown;
        try {
          inputCopy = JSON.parse(JSON.stringify(input));
        } catch {
          // Skip inputs that can't be serialized (functions, circular refs)
          const result = normalizeFilters(input);
          expect(result).toBeDefined();
          return;
        }

        const result1 = normalizeFilters(input);
        const result2 = normalizeFilters(input);

        // Results should be equal
        expect(result1).toEqual(result2);

        // Input should not be mutated
        if (typeof input === 'object' && input !== null) {
          expect(JSON.stringify(input)).toEqual(JSON.stringify(inputCopy));
        }
      }),
      { numRuns: 50 }
    );
  });
});

// ============================================
// Invariant 2: Order Independence
// ============================================

describe('Invariant 2: Order Independence', () => {
  it('array filter order does not affect normalized results', () => {
    fc.assert(
      fc.property(fc.array(amenityArb, { minLength: 2, maxLength: 5 }), (amenities) => {
        const shuffled = [...amenities].sort(() => Math.random() - 0.5);

        const result1 = normalizeFilters({ amenities });
        const result2 = normalizeFilters({ amenities: shuffled });

        // After normalization, arrays should be sorted and equal
        expect(result1.amenities?.sort()).toEqual(result2.amenities?.sort());
      }),
      { numRuns: 50 }
    );
  });

  it('language filter order does not affect normalized results', () => {
    fc.assert(
      fc.property(fc.array(languageCodeArb, { minLength: 2, maxLength: 5 }), (languages) => {
        const shuffled = [...languages].sort(() => Math.random() - 0.5);

        const result1 = normalizeFilters({ languages });
        const result2 = normalizeFilters({ languages: shuffled });

        expect(result1.languages?.sort()).toEqual(result2.languages?.sort());
      }),
      { numRuns: 50 }
    );
  });

  it('applying filters in different order yields same results', () => {
    fc.assert(
      fc.property(
        fc.record({
          minPrice: fc.option(priceArb, { nil: undefined }),
          amenities: fc.option(fc.array(amenityArb, { maxLength: 3 }), { nil: undefined }),
          roomType: fc.option(roomTypeArb, { nil: undefined }),
        }),
        (filters) => {
          const result1 = applyFilters(ACTIVE_LISTINGS, filters);
          const result2 = applyFilters(ACTIVE_LISTINGS, {
            roomType: filters.roomType,
            minPrice: filters.minPrice,
            amenities: filters.amenities,
          });

          const ids1 = new Set(result1.map((l) => l.id));
          const ids2 = new Set(result2.map((l) => l.id));
          expect(ids1).toEqual(ids2);
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ============================================
// Invariant 3: Monotonicity (Restriction)
// ============================================

describe('Invariant 3: Monotonicity', () => {
  it('adding minPrice filter reduces or equals result count', () => {
    fc.assert(
      fc.property(priceArb, (minPrice) => {
        const base = applyFilters(ACTIVE_LISTINGS, {});
        const restricted = applyFilters(ACTIVE_LISTINGS, { minPrice });

        expect(restricted.length).toBeLessThanOrEqual(base.length);
      }),
      { numRuns: 30 }
    );
  });

  it('adding amenity filter reduces or equals result count', () => {
    fc.assert(
      fc.property(amenityArb, (amenity) => {
        const base = applyFilters(ACTIVE_LISTINGS, {});
        const restricted = applyFilters(ACTIVE_LISTINGS, { amenities: [amenity] });

        expect(restricted.length).toBeLessThanOrEqual(base.length);
      }),
      { numRuns: 30 }
    );
  });

  it('adding more amenities reduces or equals result count', () => {
    fc.assert(
      fc.property(
        fc.array(amenityArb, { minLength: 1, maxLength: 3 }),
        amenityArb,
        (existing, extra) => {
          const base = applyFilters(ACTIVE_LISTINGS, { amenities: existing });
          const restricted = applyFilters(ACTIVE_LISTINGS, {
            amenities: [...existing, extra],
          });

          expect(restricted.length).toBeLessThanOrEqual(base.length);
        }
      ),
      { numRuns: 30 }
    );
  });

  it('adding roomType filter reduces or equals result count', () => {
    fc.assert(
      fc.property(roomTypeArb, (roomType) => {
        const base = applyFilters(ACTIVE_LISTINGS, {});
        const restricted = applyFilters(ACTIVE_LISTINGS, { roomType });

        expect(restricted.length).toBeLessThanOrEqual(base.length);
      }),
      { numRuns: 20 }
    );
  });
});

// ============================================
// Invariant 4: Subset Rule
// ============================================

describe('Invariant 4: Subset Rule', () => {
  it('combined filter results are subset of individual filter results', () => {
    fc.assert(
      fc.property(
        fc.option(priceArb, { nil: undefined }),
        fc.option(fc.array(amenityArb, { maxLength: 3 }), { nil: undefined }),
        (minPrice, amenities) => {
          const combined = applyFilters(ACTIVE_LISTINGS, { minPrice, amenities });

          if (minPrice !== undefined) {
            const priceOnly = applyFilters(ACTIVE_LISTINGS, { minPrice });
            const priceOnlyIds = new Set(priceOnly.map((l) => l.id));

            for (const listing of combined) {
              expect(priceOnlyIds.has(listing.id)).toBe(true);
            }
          }

          if (amenities?.length) {
            const amenitiesOnly = applyFilters(ACTIVE_LISTINGS, { amenities });
            const amenitiesOnlyIds = new Set(amenitiesOnly.map((l) => l.id));

            for (const listing of combined) {
              expect(amenitiesOnlyIds.has(listing.id)).toBe(true);
            }
          }
        }
      ),
      { numRuns: 30 }
    );
  });
});

// ============================================
// Invariant 5: Pagination Consistency
// ============================================

describe('Invariant 5: Pagination Consistency', () => {
  it('no duplicates across pages', () => {
    fc.assert(
      fc.property(
        fc.record({
          minPrice: fc.option(priceArb, { nil: undefined }),
          roomType: fc.option(roomTypeArb, { nil: undefined }),
        }),
        (filters) => {
          const filtered = applyFilters(ACTIVE_LISTINGS, filters);
          const sorted = sortListings(filtered, 'price_asc');

          const allIds = new Set<string>();
          const pageSize = 10;
          const maxPages = Math.min(5, Math.ceil(sorted.length / pageSize));

          for (let page = 1; page <= maxPages; page++) {
            const { items } = paginateListings(sorted, page, pageSize);
            for (const item of items) {
              expect(allIds.has(item.id)).toBe(false);
              allIds.add(item.id);
            }
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  it('total coverage - all items appear exactly once across pages', () => {
    const filtered = applyFilters(ACTIVE_LISTINGS, { minPrice: 500 });
    const sorted = sortListings(filtered, 'price_asc');
    const pageSize = 10;

    const allItems: typeof sorted = [];
    const totalPages = Math.ceil(sorted.length / pageSize);

    for (let page = 1; page <= totalPages; page++) {
      const { items } = paginateListings(sorted, page, pageSize);
      allItems.push(...items);
    }

    expect(allItems.length).toBe(sorted.length);
    const allIds = allItems.map((l) => l.id);
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(allIds.length);
  });
});

// ============================================
// Invariant 6: Count Consistency
// ============================================

describe('Invariant 6: Count Consistency', () => {
  it('total matches actual item count', () => {
    fc.assert(
      fc.property(
        fc.record({
          minPrice: fc.option(priceArb, { nil: undefined }),
          maxPrice: fc.option(priceArb, { nil: undefined }),
        }),
        (filters) => {
          const filtered = applyFilters(ACTIVE_LISTINGS, filters);
          const { total, items, totalPages } = paginateListings(filtered, 1, 100);

          expect(total).toBe(filtered.length);
          if (total <= 100) {
            expect(items.length).toBe(total);
          }
          expect(totalPages).toBe(Math.ceil(total / 100));
        }
      ),
      { numRuns: 30 }
    );
  });
});

// ============================================
// Invariant 7: Sorting Correctness
// ============================================

describe('Invariant 7: Sorting Correctness', () => {
  it('price_asc sorts by price ascending', () => {
    fc.assert(
      fc.property(
        fc.record({
          minPrice: fc.option(priceArb, { nil: undefined }),
        }),
        (filters) => {
          const filtered = applyFilters(ACTIVE_LISTINGS, filters);
          const sorted = sortListings(filtered, 'price_asc');

          for (let i = 0; i < sorted.length - 1; i++) {
            expect(sorted[i].price).toBeLessThanOrEqual(sorted[i + 1].price);
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  it('price_desc sorts by price descending', () => {
    fc.assert(
      fc.property(
        fc.record({
          maxPrice: fc.option(priceArb, { nil: undefined }),
        }),
        (filters) => {
          const filtered = applyFilters(ACTIVE_LISTINGS, filters);
          const sorted = sortListings(filtered, 'price_desc');

          for (let i = 0; i < sorted.length - 1; i++) {
            expect(sorted[i].price).toBeGreaterThanOrEqual(sorted[i + 1].price);
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  it('newest sorts by createdAt descending', () => {
    const filtered = applyFilters(ACTIVE_LISTINGS, {});
    const sorted = sortListings(filtered, 'newest');

    for (let i = 0; i < sorted.length - 1; i++) {
      expect(sorted[i].createdAt.getTime()).toBeGreaterThanOrEqual(
        sorted[i + 1].createdAt.getTime()
      );
    }
  });

  it('rating sorts by avgRating descending', () => {
    const filtered = applyFilters(ACTIVE_LISTINGS, {});
    const sorted = sortListings(filtered, 'rating');

    for (let i = 0; i < sorted.length - 1; i++) {
      const r1 = sorted[i].avgRating ?? 0;
      const r2 = sorted[i + 1].avgRating ?? 0;
      expect(r1).toBeGreaterThanOrEqual(r2);
    }
  });
});

// ============================================
// Invariant 8: Safety (No Crashes on Valid Input)
// ============================================

describe('Invariant 8: Safety', () => {
  it('normalizeFilters handles arbitrary input gracefully (throws only for invalid price ranges)', () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        try {
          const result = normalizeFilters(input);
          expect(result).toBeDefined();
        } catch (error) {
          // P1-13: Only expected error is for inverted price ranges
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toContain('minPrice cannot exceed maxPrice');
        }
      }),
      { numRuns: 100 }
    );
  });

  it('handles extreme numbers gracefully', () => {
    const extremes = [
      Number.MAX_SAFE_INTEGER,
      Number.MIN_SAFE_INTEGER,
      Number.MAX_VALUE,
      Number.MIN_VALUE,
      -0,
      0,
      NaN,
      Infinity,
      -Infinity,
    ];

    for (const extreme of extremes) {
      expect(() => normalizeFilters({ minPrice: extreme })).not.toThrow();
      expect(() => normalizeFilters({ page: extreme })).not.toThrow();
    }
  });

  it('throws for inverted price ranges (P1-13 security fix)', () => {
    expect(() => normalizeFilters({ minPrice: 1000, maxPrice: 500 })).toThrow(
      'minPrice cannot exceed maxPrice'
    );
  });

  it('handles malformed objects gracefully', () => {
    const malformed = [
      { query: { nested: 'object' } },
      { amenities: 'not-an-array' },
      { bounds: 'invalid' },
      { page: 'string' },
      { minPrice: [1, 2, 3] },
      { __proto__: { polluted: true } },
      Object.create(null),
    ];

    for (const input of malformed) {
      expect(() => normalizeFilters(input)).not.toThrow();
    }
  });
});

// ============================================
// Invariant 9: Determinism
// ============================================

describe('Invariant 9: Determinism', () => {
  it('same input always produces same output', () => {
    fc.assert(
      fc.property(validFilterParamsArb, (input) => {
        const result1 = normalizeFilters(input);
        const result2 = normalizeFilters(input);
        expect(result1).toEqual(result2);
      }),
      { numRuns: 50 }
    );
  });

  it('applyFilters produces same results for same filters', () => {
    fc.assert(
      fc.property(
        fc.record({
          minPrice: fc.option(priceArb, { nil: undefined }),
          amenities: fc.option(fc.array(amenityArb, { maxLength: 3 }), { nil: undefined }),
        }),
        (filters) => {
          const result1 = applyFilters(ACTIVE_LISTINGS, filters);
          const result2 = applyFilters(ACTIVE_LISTINGS, filters);

          const ids1 = result1.map((l) => l.id);
          const ids2 = result2.map((l) => l.id);
          expect(ids1).toEqual(ids2);
        }
      ),
      { numRuns: 30 }
    );
  });
});

// ============================================
// Invariant 10: Bounds Integrity
// ============================================

describe('Invariant 10: Bounds Integrity', () => {
  it('all results fall within specified bounds', () => {
    fc.assert(
      fc.property(boundsArb, (bounds) => {
        const normalized = normalizeFilters({ bounds });
        if (!normalized.bounds) return; // Invalid bounds normalized away

        const results = applyFilters(ACTIVE_LISTINGS, { bounds: normalized.bounds });

        for (const listing of results) {
          expect(listing.location.lat).toBeGreaterThanOrEqual(normalized.bounds.minLat);
          expect(listing.location.lat).toBeLessThanOrEqual(normalized.bounds.maxLat);

          // Handle antimeridian
          if (normalized.bounds.minLng <= normalized.bounds.maxLng) {
            expect(listing.location.lng).toBeGreaterThanOrEqual(normalized.bounds.minLng);
            expect(listing.location.lng).toBeLessThanOrEqual(normalized.bounds.maxLng);
          } else {
            expect(
              listing.location.lng >= normalized.bounds.minLng ||
                listing.location.lng <= normalized.bounds.maxLng
            ).toBe(true);
          }
        }
      }),
      { numRuns: 30 }
    );
  });

  it('normalizes inverted latitude bounds', () => {
    fc.assert(
      fc.property(latArb, latArb, (lat1, lat2) => {
        const normalized = normalizeFilters({
          bounds: { minLat: lat1, maxLat: lat2, minLng: 0, maxLng: 10 },
        });

        if (normalized.bounds) {
          expect(normalized.bounds.minLat).toBeLessThanOrEqual(normalized.bounds.maxLat);
        }
      }),
      { numRuns: 30 }
    );
  });
});

// ============================================
// Invariant 11: Filter Match Accuracy
// ============================================

describe('Invariant 11: Filter Match Accuracy', () => {
  it('all results match price filters', () => {
    fc.assert(
      fc.property(priceArb, priceArb, (price1, price2) => {
        const minPrice = Math.min(price1, price2);
        const maxPrice = Math.max(price1, price2);

        const results = applyFilters(ACTIVE_LISTINGS, { minPrice, maxPrice });

        for (const listing of results) {
          expect(listing.price).toBeGreaterThanOrEqual(minPrice);
          expect(listing.price).toBeLessThanOrEqual(maxPrice);
        }
      }),
      { numRuns: 30 }
    );
  });

  it('all results match roomType filter', () => {
    fc.assert(
      fc.property(roomTypeArb, (roomType) => {
        const results = applyFilters(ACTIVE_LISTINGS, { roomType });

        for (const listing of results) {
          expect(listing.roomType.toLowerCase()).toBe(roomType.toLowerCase());
        }
      }),
      { numRuns: 20 }
    );
  });

  it('all results match amenities filter (AND logic)', () => {
    fc.assert(
      fc.property(fc.array(amenityArb, { minLength: 1, maxLength: 3 }), (amenities) => {
        const results = applyFilters(ACTIVE_LISTINGS, { amenities });

        for (const listing of results) {
          for (const amenity of amenities) {
            expect(
              listing.amenities.some((a) => a.toLowerCase().includes(amenity.toLowerCase()))
            ).toBe(true);
          }
        }
      }),
      { numRuns: 30 }
    );
  });

  it('all results match languages filter (OR logic)', () => {
    fc.assert(
      fc.property(fc.array(languageCodeArb, { minLength: 1, maxLength: 3 }), (languages) => {
        const results = applyFilters(ACTIVE_LISTINGS, { languages });

        for (const listing of results) {
          expect(languages.some((lang) => listing.languages.includes(lang))).toBe(true);
        }
      }),
      { numRuns: 30 }
    );
  });
});

// ============================================
// Invariant 12: SQL Injection Resistance
// ============================================

describe('Invariant 12: SQL Injection Resistance', () => {
  const sqlInjectionPayloads = [
    "'; DROP TABLE listings; --",
    "1' OR '1'='1",
    "1; SELECT * FROM users",
    "' UNION SELECT password FROM users --",
    "\\'; DROP TABLE listings; --",
    "1'; EXEC xp_cmdshell('dir'); --",
    "' OR 1=1--",
    "admin'--",
    "1' AND '1'='1",
    "'; UPDATE users SET role='admin' WHERE '1'='1",
  ];

  it('handles SQL injection in query field', () => {
    for (const payload of sqlInjectionPayloads) {
      const normalized = normalizeFilters({ query: payload });
      // Should not crash and should preserve (but parameterize in DB)
      expect(() => applyFilters(ACTIVE_LISTINGS, { query: payload })).not.toThrow();
    }
  });

  it('handles SQL injection in array fields', () => {
    for (const payload of sqlInjectionPayloads) {
      expect(() => normalizeFilters({ amenities: [payload] })).not.toThrow();
      expect(() => normalizeFilters({ languages: [payload] })).not.toThrow();
      expect(() => normalizeFilters({ houseRules: [payload] })).not.toThrow();

      // Invalid values should be dropped
      const normalized = normalizeFilters({ amenities: [payload] });
      expect(normalized.amenities).toBeUndefined();
    }
  });

  it('handles SQL injection in enum fields', () => {
    for (const payload of sqlInjectionPayloads) {
      expect(() => normalizeFilters({ roomType: payload })).not.toThrow();

      // Invalid values should be dropped
      const normalized = normalizeFilters({ roomType: payload });
      expect(normalized.roomType).toBeUndefined();
    }
  });
});

// ============================================
// Additional Fuzz Tests
// ============================================

describe('Fuzz Testing', () => {
  it('random filter combinations handle gracefully (throw only for invalid price ranges)', () => {
    fc.assert(
      fc.property(
        fc.record(
          {
            query: fc.option(fc.string(), { nil: undefined }),
            minPrice: fc.option(fc.oneof(fc.integer(), fc.double(), fc.string()), {
              nil: undefined,
            }),
            maxPrice: fc.option(fc.oneof(fc.integer(), fc.double(), fc.string()), {
              nil: undefined,
            }),
            amenities: fc.option(fc.array(fc.oneof(fc.string(), fc.anything())), {
              nil: undefined,
            }),
            roomType: fc.option(fc.string(), { nil: undefined }),
            languages: fc.option(fc.array(fc.string()), { nil: undefined }),
            page: fc.option(fc.oneof(fc.integer(), fc.string()), { nil: undefined }),
            limit: fc.option(fc.oneof(fc.integer(), fc.string()), { nil: undefined }),
          },
          { requiredKeys: [] }
        ),
        (input) => {
          try {
            const normalized = normalizeFilters(input);
            expect(normalized).toBeDefined();
            expect(typeof normalized.page).toBe('number');
            expect(typeof normalized.limit).toBe('number');
          } catch (error) {
            // P1-13: Only expected error is for inverted price ranges
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toContain('minPrice cannot exceed maxPrice');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('completely random objects handle gracefully (throw only for invalid price ranges)', () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        try {
          const result = normalizeFilters(input);
          expect(result).toBeDefined();
        } catch (error) {
          // P1-13: Only expected error is for inverted price ranges
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toContain('minPrice cannot exceed maxPrice');
        }
      }),
      { numRuns: 200 }
    );
  });
});
