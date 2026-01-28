/**
 * E2E Tests for Critical Search Filter Paths
 *
 * Tests the complete filter pipeline from API request through to results.
 * Validates critical user journeys and filter combinations that must always work.
 */

import { TEST_LISTINGS, ACTIVE_LISTINGS, applyFilters, sortListings, paginateListings } from '../fixtures/listings.fixture';
import type { TestListing } from '../fixtures/listings.fixture';
import { normalizeFilters, type FilterParams } from '@/lib/filter-schema';
import {
  filterByPrice,
  filterByAmenities,
  filterByHouseRules,
  filterByLanguages,
  filterByRoomType,
  filterByLeaseDuration,
  filterByMoveInDate,
  filterByGenderPreference,
  filterByHouseholdGender,
  filterByBounds,
  filterByQuery,
  sortListings as realSortListings,
  sanitizeSearchQuery,
  isValidQuery,
  crossesAntimeridian,
} from '@/lib/data';

// ============================================
// Critical User Journeys
// ============================================

describe('Critical User Journeys', () => {
  describe('Journey: Budget-conscious student searching for affordable rooms', () => {
    it('finds rooms under $1000 with shared room type', () => {
      const filters = normalizeFilters({
        maxPrice: 1000,
        roomType: 'Shared Room', // Fixture uses 'Shared Room'
      });

      const results = applyFilters(ACTIVE_LISTINGS, filters);

      // All results must match criteria
      results.forEach((listing) => {
        expect(listing.price).toBeLessThanOrEqual(1000);
        expect(listing.roomType?.toLowerCase()).toContain('shared');
      });

      // Should find at least some results in our test data
      expect(results.length).toBeGreaterThan(0);
    });

    it('sorts by price ascending to find cheapest first', () => {
      const filters = normalizeFilters({
        maxPrice: 1500,
        sort: 'price_asc',
      });

      const filtered = applyFilters(ACTIVE_LISTINGS, filters);
      const sorted = sortListings(filtered, filters.sort);

      // Verify ascending price order
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i].price).toBeGreaterThanOrEqual(sorted[i - 1].price);
      }
    });

    it('paginates results correctly for browsing', () => {
      const filters = normalizeFilters({
        maxPrice: 2000,
        page: 1,
        limit: 10,
      });

      const filtered = applyFilters(ACTIVE_LISTINGS, filters);
      const page1 = paginateListings(filtered, 1, 10);
      const page2 = paginateListings(filtered, 2, 10);

      // No duplicates across pages
      const page1Ids = new Set(page1.items.map((l) => l.id));
      const page2Ids = new Set(page2.items.map((l) => l.id));
      page2Ids.forEach((id) => {
        expect(page1Ids.has(id)).toBe(false);
      });

      // Total matches
      expect(page1.total).toBe(filtered.length);
    });
  });

  describe('Journey: International student seeking language-compatible housing', () => {
    it('finds rooms where Spanish is spoken', () => {
      // Fixture uses ISO codes: 'es' for Spanish
      const filters = normalizeFilters({
        languages: ['es'],
      });

      const results = applyFilters(ACTIVE_LISTINGS, filters);

      // All results must have Spanish speakers (OR logic)
      results.forEach((listing) => {
        const hasSpanish = listing.languages.some(
          (lang) => lang.toLowerCase() === 'es'
        );
        expect(hasSpanish).toBe(true);
      });
    });

    it('finds rooms where either Spanish OR Mandarin is spoken', () => {
      // Fixture uses ISO codes: 'es' for Spanish, 'zh' for Mandarin/Chinese
      const filters = normalizeFilters({
        languages: ['es', 'zh'],
      });

      const results = applyFilters(ACTIVE_LISTINGS, filters);

      // All results must have at least one of the languages (OR logic)
      results.forEach((listing) => {
        const hasLanguage = listing.languages.some(
          (lang) => lang.toLowerCase() === 'es' || lang.toLowerCase() === 'zh'
        );
        expect(hasLanguage).toBe(true);
      });
    });

    it('combines language preference with price filter', () => {
      // Fixture uses ISO codes: 'en' for English
      const filters = normalizeFilters({
        languages: ['en'],
        maxPrice: 1500,
      });

      const results = applyFilters(ACTIVE_LISTINGS, filters);

      results.forEach((listing) => {
        expect(listing.price).toBeLessThanOrEqual(1500);
        const hasEnglish = listing.languages.some(
          (lang) => lang.toLowerCase() === 'en'
        );
        expect(hasEnglish).toBe(true);
      });
    });
  });

  describe('Journey: Professional seeking private room with specific amenities', () => {
    it('finds private rooms with Wifi and AC', () => {
      // Fixture uses 'Private Room' and 'Wifi' (not 'WiFi')
      const filters = normalizeFilters({
        roomType: 'Private Room',
        amenities: ['Wifi', 'AC'],
      });

      const results = applyFilters(ACTIVE_LISTINGS, filters);

      // All results must have BOTH amenities (AND logic) and be PRIVATE
      results.forEach((listing) => {
        expect(listing.roomType?.toLowerCase()).toContain('private');
        const amenitiesLower = listing.amenities.map((a) => a.toLowerCase());
        expect(
          amenitiesLower.some((a) => a.includes('wifi'))
        ).toBe(true);
        expect(
          amenitiesLower.some((a) => a.includes('ac'))
        ).toBe(true);
      });
    });

    it('filters by multiple amenities using AND logic', () => {
      // Fixture uses 'Wifi', 'Parking', 'Washer' (not 'Laundry')
      const filters = normalizeFilters({
        amenities: ['Wifi', 'Parking'],
      });

      const results = applyFilters(ACTIVE_LISTINGS, filters);

      // Must have ALL amenities
      results.forEach((listing) => {
        const amenitiesLower = listing.amenities.map((a) => a.toLowerCase());
        expect(amenitiesLower.some((a) => a.includes('wifi'))).toBe(true);
        expect(amenitiesLower.some((a) => a.includes('parking'))).toBe(true);
      });
    });
  });

  describe('Journey: User with specific housing requirements', () => {
    it('finds female-only housing', () => {
      // Fixture uses 'FEMALE_ONLY' for genderPreference
      const filters = normalizeFilters({
        genderPreference: 'FEMALE_ONLY',
      });

      const results = applyFilters(ACTIVE_LISTINGS, filters);

      results.forEach((listing) => {
        expect(listing.genderPreference?.toUpperCase()).toBe('FEMALE_ONLY');
      });
    });

    it('finds listings with pets allowed', () => {
      // Fixture uses 'Pets allowed' as a house rule
      const filters = normalizeFilters({
        houseRules: ['Pets allowed'],
      });

      const results = applyFilters(ACTIVE_LISTINGS, filters);

      results.forEach((listing) => {
        const hasPetsAllowed = listing.houseRules.some(
          (rule) => rule.toLowerCase() === 'pets allowed'
        );
        expect(hasPetsAllowed).toBe(true);
      });
    });

    it('finds flexible leases with specific move-in date', () => {
      // Use a far future date to ensure we get results with any move-in dates
      const moveInDate = '2027-12-31';
      // Fixture uses 'Flexible', 'Month-to-month', '3 months', '6 months', '12 months'
      const filters = normalizeFilters({
        leaseDuration: 'Flexible',
        moveInDate,
      });

      const results = applyFilters(ACTIVE_LISTINGS, filters);

      results.forEach((listing) => {
        expect(listing.leaseDuration?.toLowerCase()).toBe('flexible');
        if (listing.moveInDate) {
          // Listing must be available by our target move-in date
          expect(new Date(listing.moveInDate) <= new Date(moveInDate)).toBe(true);
        }
      });
    });
  });
});

// ============================================
// Geographic Search E2E
// ============================================

describe('Geographic Search E2E', () => {
  describe('San Francisco Bay Area search', () => {
    const SF_BOUNDS = {
      minLat: 37.7,
      maxLat: 37.85,
      minLng: -122.5,
      maxLng: -122.35,
    };

    it('finds listings within SF bounds', () => {
      const filters = normalizeFilters({ bounds: SF_BOUNDS });
      const results = applyFilters(ACTIVE_LISTINGS, filters);

      results.forEach((listing) => {
        expect(listing.location.lat).toBeGreaterThanOrEqual(SF_BOUNDS.minLat);
        expect(listing.location.lat).toBeLessThanOrEqual(SF_BOUNDS.maxLat);
        expect(listing.location.lng).toBeGreaterThanOrEqual(SF_BOUNDS.minLng);
        expect(listing.location.lng).toBeLessThanOrEqual(SF_BOUNDS.maxLng);
      });
    });

    it('combines bounds with price filter', () => {
      const filters = normalizeFilters({
        bounds: SF_BOUNDS,
        minPrice: 1000,
        maxPrice: 2000,
      });

      const results = applyFilters(ACTIVE_LISTINGS, filters);

      results.forEach((listing) => {
        // Geographic bounds
        expect(listing.location.lat).toBeGreaterThanOrEqual(SF_BOUNDS.minLat);
        expect(listing.location.lat).toBeLessThanOrEqual(SF_BOUNDS.maxLat);
        // Price range
        expect(listing.price).toBeGreaterThanOrEqual(1000);
        expect(listing.price).toBeLessThanOrEqual(2000);
      });
    });
  });

  describe('Antimeridian crossing (Pacific region)', () => {
    // Bounds that cross the international date line (e.g., Alaska to Japan)
    const ANTIMERIDIAN_BOUNDS = {
      minLat: 30,
      maxLat: 60,
      minLng: 170, // West side (Asia)
      maxLng: -150, // East side (Alaska) - note: minLng > maxLng
    };

    it('correctly identifies antimeridian crossing', () => {
      expect(crossesAntimeridian(170, -150)).toBe(true);
      expect(crossesAntimeridian(-122.5, -122.35)).toBe(false);
    });

    it('normalizeFilters preserves antimeridian bounds (does not swap)', () => {
      const filters = normalizeFilters({ bounds: ANTIMERIDIAN_BOUNDS });

      // Longitude should NOT be swapped for antimeridian crossing
      expect(filters.bounds?.minLng).toBe(170);
      expect(filters.bounds?.maxLng).toBe(-150);
    });
  });
});

// ============================================
// Query Search E2E
// ============================================

describe('Query Search E2E', () => {
  describe('Text search functionality', () => {
    it('sanitizes search query safely', () => {
      // SQL injection attempts should be sanitized
      expect(sanitizeSearchQuery("'; DROP TABLE users; --")).not.toContain("'");
      expect(sanitizeSearchQuery("'; DROP TABLE users; --")).not.toContain(';');
      expect(sanitizeSearchQuery("'; DROP TABLE users; --")).not.toContain('--');

      // XSS attempts should be escaped
      expect(sanitizeSearchQuery('<script>alert(1)</script>')).not.toContain('<');
      expect(sanitizeSearchQuery('<script>alert(1)</script>')).not.toContain('>');

      // Valid queries should work
      expect(sanitizeSearchQuery('San Francisco')).toBe('San Francisco');
      expect(sanitizeSearchQuery('  trimmed  ')).toBe('trimmed');
    });

    it('validates minimum query length', () => {
      expect(isValidQuery('ab')).toBe(true);
      expect(isValidQuery('a')).toBe(false);
      expect(isValidQuery('')).toBe(false);
      expect(isValidQuery('   ')).toBe(false);
    });

    it('combines query with other filters', () => {
      // Use 'San' which appears in 'San Francisco', 'San Diego' city names
      const filters = normalizeFilters({
        query: 'San',
        maxPrice: 2000,
        roomType: 'Private Room',
      });

      const results = applyFilters(ACTIVE_LISTINGS, filters);

      results.forEach((listing) => {
        expect(listing.price).toBeLessThanOrEqual(2000);
        expect(listing.roomType?.toLowerCase()).toContain('private');
        // Query matches title, description, city, or state
        const queryLower = 'san';
        const matches =
          listing.title.toLowerCase().includes(queryLower) ||
          listing.description.toLowerCase().includes(queryLower) ||
          listing.location.city.toLowerCase().includes(queryLower) ||
          listing.location.state.toLowerCase().includes(queryLower);
        expect(matches).toBe(true);
      });
    });
  });
});

// ============================================
// Sorting E2E
// ============================================

describe('Sorting E2E', () => {
  const testSorting = (sortOption: string, compareFn: (a: TestListing, b: TestListing) => boolean) => {
    const filters = normalizeFilters({ sort: sortOption });
    const sorted = sortListings(ACTIVE_LISTINGS, filters.sort);

    for (let i = 1; i < sorted.length; i++) {
      expect(compareFn(sorted[i - 1], sorted[i])).toBe(true);
    }
  };

  it('sorts by price ascending correctly', () => {
    testSorting('price_asc', (a, b) => a.price <= b.price);
  });

  it('sorts by price descending correctly', () => {
    testSorting('price_desc', (a, b) => a.price >= b.price);
  });

  it('sorts by newest correctly', () => {
    testSorting('newest', (a, b) =>
      new Date(a.createdAt).getTime() >= new Date(b.createdAt).getTime()
    );
  });

  it('sorts by rating correctly', () => {
    testSorting('rating', (a, b) => (a.avgRating ?? 0) >= (b.avgRating ?? 0));
  });

  it('maintains sort order through pagination', () => {
    const filters = normalizeFilters({ sort: 'price_asc', limit: 5 });
    const sorted = sortListings(ACTIVE_LISTINGS, filters.sort);

    const page1 = paginateListings(sorted, 1, 5);
    const page2 = paginateListings(sorted, 2, 5);

    // Last item of page 1 should have price <= first item of page 2
    if (page1.items.length > 0 && page2.items.length > 0) {
      expect(page1.items[page1.items.length - 1].price).toBeLessThanOrEqual(
        page2.items[0].price
      );
    }
  });
});

// ============================================
// Pagination E2E
// ============================================

describe('Pagination E2E', () => {
  it('returns correct page metadata', () => {
    const pageSize = 10;
    const totalItems = ACTIVE_LISTINGS.length;
    const expectedPages = Math.ceil(totalItems / pageSize);

    const page1 = paginateListings(ACTIVE_LISTINGS, 1, pageSize);

    expect(page1.total).toBe(totalItems);
    expect(page1.totalPages).toBe(expectedPages);
    // Note: paginateListings returns { items, total, totalPages } only
    expect(page1.items.length).toBeLessThanOrEqual(pageSize);
  });

  it('handles edge cases for pagination', () => {
    // Very large page number returns empty items
    const pageLarge = paginateListings(ACTIVE_LISTINGS, 9999, 10);
    expect(pageLarge.items.length).toBe(0);
    expect(pageLarge.total).toBe(ACTIVE_LISTINGS.length);

    // Page 0 uses offset formula (0-1)*10 = -10, slice(-10, 0) returns empty
    // This is expected behavior - invalid pages return empty
    const page0 = paginateListings(ACTIVE_LISTINGS, 0, 10);
    expect(page0.total).toBe(ACTIVE_LISTINGS.length);
  });

  it('ensures complete coverage across all pages', () => {
    const pageSize = 7; // Odd number to test edge cases
    const allIds = new Set<string>();
    const expectedTotal = ACTIVE_LISTINGS.length;

    let page = 1;
    while (true) {
      const result = paginateListings(ACTIVE_LISTINGS, page, pageSize);
      if (result.items.length === 0) break;

      result.items.forEach((item) => {
        expect(allIds.has(item.id)).toBe(false); // No duplicates
        allIds.add(item.id);
      });

      page++;
      if (page > 100) break; // Safety limit
    }

    expect(allIds.size).toBe(expectedTotal);
  });
});

// ============================================
// Filter Combination E2E
// ============================================

describe('Complex Filter Combinations E2E', () => {
  it('handles maximum filter complexity (all filters applied)', () => {
    // Use fixture-compatible values
    const filters = normalizeFilters({
      query: 'room',
      minPrice: 500,
      maxPrice: 3000,
      roomType: 'Private Room',
      amenities: ['Wifi'],
      houseRules: ['Pets allowed'],
      languages: ['en'],
      genderPreference: 'NO_PREFERENCE',
      leaseDuration: 'Flexible',
      moveInDate: '2025-06-01',
      bounds: {
        minLat: 30,
        maxLat: 50,
        minLng: -130,
        maxLng: -70,
      },
      sort: 'price_asc',
      page: 1,
      limit: 20,
    });

    // Should not throw
    expect(() => applyFilters(ACTIVE_LISTINGS, filters)).not.toThrow();

    const results = applyFilters(ACTIVE_LISTINGS, filters);

    // Verify price filters are applied
    results.forEach((listing) => {
      expect(listing.price).toBeGreaterThanOrEqual(500);
      expect(listing.price).toBeLessThanOrEqual(3000);
    });
  });

  it('handles empty results gracefully', () => {
    // Impossible combination - very restrictive
    const filters = normalizeFilters({
      minPrice: 9999999,
      maxPrice: 9999999,
    });

    const results = applyFilters(ACTIVE_LISTINGS, filters);

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(0);
  });

  it('filter application order does not affect results', () => {
    const filterSet1 = normalizeFilters({
      maxPrice: 2000,
      roomType: 'PRIVATE',
      amenities: ['WiFi'],
    });

    const filterSet2 = normalizeFilters({
      amenities: ['WiFi'],
      maxPrice: 2000,
      roomType: 'PRIVATE',
    });

    const results1 = applyFilters(ACTIVE_LISTINGS, filterSet1);
    const results2 = applyFilters(ACTIVE_LISTINGS, filterSet2);

    expect(results1.map((r) => r.id).sort()).toEqual(
      results2.map((r) => r.id).sort()
    );
  });
});

// ============================================
// Edge Cases and Error Handling
// ============================================

describe('Edge Cases and Error Handling', () => {
  it('handles undefined/null filter values gracefully', () => {
    const filters = normalizeFilters({
      query: undefined,
      minPrice: null as unknown as number,
      maxPrice: undefined,
      amenities: undefined,
      roomType: null as unknown as string,
    });

    expect(() => applyFilters(ACTIVE_LISTINGS, filters)).not.toThrow();
  });

  it('handles empty arrays in filters', () => {
    const filters = normalizeFilters({
      amenities: [],
      houseRules: [],
      languages: [],
    });

    const results = applyFilters(ACTIVE_LISTINGS, filters);

    // Empty arrays should not filter anything
    expect(results.length).toBe(ACTIVE_LISTINGS.length);
  });

  it('handles inverted price range (throws validation error)', () => {
    // P1-13: Inverted price ranges now throw error instead of silently swapping
    expect(() => normalizeFilters({
      minPrice: 2000,
      maxPrice: 1000, // Inverted - should throw error
    })).toThrow('minPrice cannot exceed maxPrice');
  });

  it('handles inverted latitude bounds (normalizer swaps)', () => {
    const filters = normalizeFilters({
      bounds: {
        minLat: 40,
        maxLat: 30, // Inverted
        minLng: -122,
        maxLng: -120,
      },
    });

    // Latitude should be swapped
    expect(filters.bounds?.minLat).toBeLessThanOrEqual(filters.bounds?.maxLat!);
  });

  it('clamps extreme values to safe ranges', () => {
    const filters = normalizeFilters({
      minPrice: -1000, // Negative price
      maxPrice: 999999999, // Extremely high
      bounds: {
        minLat: -200, // Invalid latitude
        maxLat: 200,
        minLng: -400, // Invalid longitude
        maxLng: 400,
      },
    });

    // Price clamped to 0
    expect(filters.minPrice).toBeGreaterThanOrEqual(0);
    // Latitude clamped to [-90, 90]
    expect(filters.bounds?.minLat).toBeGreaterThanOrEqual(-90);
    expect(filters.bounds?.maxLat).toBeLessThanOrEqual(90);
    // Longitude clamped to [-180, 180]
    expect(filters.bounds?.minLng).toBeGreaterThanOrEqual(-180);
    expect(filters.bounds?.maxLng).toBeLessThanOrEqual(180);
  });
});

// ============================================
// Performance Smoke Tests
// ============================================

describe('Performance Smoke Tests', () => {
  it('processes 100 listings with all filters in reasonable time', () => {
    const filters = normalizeFilters({
      minPrice: 500,
      maxPrice: 3000,
      roomType: 'PRIVATE',
      amenities: ['WiFi', 'Parking'],
      sort: 'price_asc',
    });

    const start = performance.now();

    for (let i = 0; i < 100; i++) {
      const results = applyFilters(TEST_LISTINGS, filters);
      sortListings(results, filters.sort);
    }

    const elapsed = performance.now() - start;

    // 100 iterations should complete in < 1 second
    expect(elapsed).toBeLessThan(1000);
  });

  it('normalizeFilters is fast for repeated calls', () => {
    const rawFilters = {
      minPrice: 500,
      maxPrice: 3000,
      amenities: ['WiFi', 'Parking', 'Laundry'],
      roomType: 'PRIVATE',
      sort: 'price_asc',
    };

    const start = performance.now();

    for (let i = 0; i < 1000; i++) {
      normalizeFilters(rawFilters);
    }

    const elapsed = performance.now() - start;

    // 1000 normalizations should complete in < 500ms
    expect(elapsed).toBeLessThan(500);
  });
});
