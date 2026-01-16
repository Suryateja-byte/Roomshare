/**
 * Performance and Safety Tests for Filter System
 *
 * Tests performance characteristics and safety bounds:
 * - Timing benchmarks for normalization and filtering
 * - Memory usage and allocation patterns
 * - DoS/ReDoS protection
 * - Input validation stress tests
 * - Concurrency behavior
 */

import { normalizeFilters, type FilterParams } from '@/lib/filter-schema';
import { TEST_LISTINGS, ACTIVE_LISTINGS, applyFilters, sortListings } from '../fixtures/listings.fixture';
import { sanitizeSearchQuery, isValidQuery } from '@/lib/data';

// ============================================
// Performance Benchmarks
// ============================================

describe('Performance Benchmarks', () => {
  describe('normalizeFilters performance', () => {
    it('completes single normalization in under 5ms', () => {
      const filters = {
        minPrice: 500,
        maxPrice: 3000,
        roomType: 'Private Room',
        amenities: ['Wifi', 'AC', 'Parking'],
        houseRules: ['Pets allowed'],
        languages: ['en', 'es'],
        sort: 'price_asc',
      };

      const start = performance.now();
      normalizeFilters(filters);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(5);
    });

    it('handles 1000 normalizations in under 100ms', () => {
      const filters = {
        minPrice: 500,
        maxPrice: 3000,
        roomType: 'Private Room',
        amenities: ['Wifi', 'AC'],
        sort: 'price_asc',
      };

      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        normalizeFilters(filters);
      }
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(100);
    });

    it('performance degrades gracefully with complex input', () => {
      // Create a complex input with max arrays
      const complexFilters = {
        minPrice: 100,
        maxPrice: 5000,
        roomType: 'Private Room',
        amenities: Array(50).fill('Wifi'),
        houseRules: Array(50).fill('Pets allowed'),
        languages: Array(50).fill('en'),
        query: 'a'.repeat(200),
        bounds: { minLat: 30, maxLat: 50, minLng: -130, maxLng: -70 },
        sort: 'price_asc',
        page: 1,
        limit: 100,
      };

      const start = performance.now();
      normalizeFilters(complexFilters);
      const elapsed = performance.now() - start;

      // Should still complete in reasonable time even with complex input
      expect(elapsed).toBeLessThan(50);
    });
  });

  describe('applyFilters performance', () => {
    it('filters 100 listings in under 10ms', () => {
      const filters = normalizeFilters({
        minPrice: 500,
        maxPrice: 3000,
        roomType: 'Private Room',
        amenities: ['Wifi'],
      });

      const start = performance.now();
      applyFilters(TEST_LISTINGS, filters);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(10);
    });

    it('handles repeated filter applications efficiently', () => {
      const filters = normalizeFilters({
        maxPrice: 2000,
        sort: 'price_asc',
      });

      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        const results = applyFilters(TEST_LISTINGS, filters);
        sortListings(results, filters.sort);
      }
      const elapsed = performance.now() - start;

      // 100 iterations should complete in under 500ms
      expect(elapsed).toBeLessThan(500);
    });

    it('performance scales linearly with dataset size', () => {
      const filters = normalizeFilters({
        maxPrice: 3000,
        amenities: ['Wifi'],
      });

      // Time with 50 listings
      const small = ACTIVE_LISTINGS.slice(0, 50);
      const startSmall = performance.now();
      for (let i = 0; i < 10; i++) {
        applyFilters(small, filters);
      }
      const elapsedSmall = performance.now() - startSmall;

      // Time with all listings
      const startFull = performance.now();
      for (let i = 0; i < 10; i++) {
        applyFilters(ACTIVE_LISTINGS, filters);
      }
      const elapsedFull = performance.now() - startFull;

      // Should scale roughly linearly (allow 4x for full vs half)
      const ratio = elapsedFull / elapsedSmall;
      expect(ratio).toBeLessThan(4);
    });
  });

  describe('sortListings performance', () => {
    it('sorts 100 listings in under 5ms', () => {
      const start = performance.now();
      sortListings(TEST_LISTINGS, 'price_asc');
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(5);
    });

    it('all sort options have similar performance', () => {
      const sortOptions = ['price_asc', 'price_desc', 'newest', 'rating', 'recommended'] as const;
      const times: Record<string, number> = {};

      sortOptions.forEach((sort) => {
        const start = performance.now();
        for (let i = 0; i < 100; i++) {
          sortListings(TEST_LISTINGS, sort);
        }
        times[sort] = performance.now() - start;
      });

      // All sort options should complete within 200ms for 100 iterations
      Object.entries(times).forEach(([sort, time]) => {
        expect(time).toBeLessThan(200);
      });
    });
  });
});

// ============================================
// Memory Usage Tests
// ============================================

describe('Memory Usage', () => {
  it('normalizeFilters does not leak memory on repeated calls', () => {
    // Run garbage collection if available (V8 flag --expose-gc)
    if (global.gc) {
      global.gc();
    }

    const initialMemory = process.memoryUsage().heapUsed;

    // Run many normalizations
    for (let i = 0; i < 10000; i++) {
      normalizeFilters({
        minPrice: i,
        maxPrice: i * 2,
        amenities: ['Wifi', 'AC'],
      });
    }

    if (global.gc) {
      global.gc();
    }

    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB

    // Should not increase memory excessively
    // Note: Without explicit GC control, this is approximate
    // 50MB is a reasonable upper bound for 10K operations
    expect(memoryIncrease).toBeLessThan(50);
  });

  it('applyFilters does not mutate original array', () => {
    const originalLength = ACTIVE_LISTINGS.length;
    const originalFirst = ACTIVE_LISTINGS[0];

    const filters = normalizeFilters({ maxPrice: 1000 });
    applyFilters(ACTIVE_LISTINGS, filters);

    expect(ACTIVE_LISTINGS.length).toBe(originalLength);
    expect(ACTIVE_LISTINGS[0]).toBe(originalFirst);
  });

  it('sortListings does not mutate original array', () => {
    const originalOrder = ACTIVE_LISTINGS.map((l) => l.id);

    sortListings(ACTIVE_LISTINGS, 'price_asc');

    const currentOrder = ACTIVE_LISTINGS.map((l) => l.id);
    expect(currentOrder).toEqual(originalOrder);
  });
});

// ============================================
// DoS/ReDoS Protection Tests
// ============================================

describe('DoS/ReDoS Protection', () => {
  describe('Query sanitization', () => {
    it('handles extremely long queries without hanging', () => {
      const longQuery = 'a'.repeat(100000); // 100KB string

      const start = performance.now();
      const result = sanitizeSearchQuery(longQuery);
      const elapsed = performance.now() - start;

      // Should complete quickly even with huge input
      expect(elapsed).toBeLessThan(100);
      // Should be truncated
      expect(result.length).toBeLessThan(1000);
    });

    it('handles ReDoS attack patterns', () => {
      // Classic ReDoS patterns that cause exponential backtracking
      const redosPatterns = [
        'a'.repeat(30) + '!', // (a+)+$ pattern
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaab', // Backtracking bomb
        '((((((((((a))))))))))', // Nested groups
        'a]]]]]]]]]]]]]]]]]]]]]]]]]]]]]', // Unbalanced brackets
      ];

      redosPatterns.forEach((pattern) => {
        const start = performance.now();
        sanitizeSearchQuery(pattern);
        const elapsed = performance.now() - start;

        // Each pattern should complete in under 10ms
        expect(elapsed).toBeLessThan(10);
      });
    });

    it('handles unicode edge cases', () => {
      const unicodePatterns = [
        '\u0000'.repeat(1000), // Null bytes
        '\u200B'.repeat(1000), // Zero-width spaces
        '\uFEFF'.repeat(1000), // BOM characters
        '👨‍👩‍👧‍👦'.repeat(100), // Complex emoji
        'مرحبا'.repeat(100), // RTL text
        '日本語'.repeat(100), // CJK characters
      ];

      unicodePatterns.forEach((pattern) => {
        const start = performance.now();
        const result = sanitizeSearchQuery(pattern);
        const elapsed = performance.now() - start;

        expect(elapsed).toBeLessThan(50);
        expect(typeof result).toBe('string');
      });
    });
  });

  describe('normalizeFilters safety', () => {
    it('handles deeply nested objects', () => {
      // Create deeply nested object
      let nested: any = { value: 'base' };
      for (let i = 0; i < 100; i++) {
        nested = { inner: nested };
      }

      const start = performance.now();
      normalizeFilters({ bounds: nested });
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(50);
    });

    it('handles circular reference attempts', () => {
      const circular: any = { a: 1 };
      circular.self = circular;

      // Should not throw or hang
      expect(() => normalizeFilters(circular)).not.toThrow();
    });

    it('handles prototype pollution attempts', () => {
      const malicious = JSON.parse('{"__proto__": {"polluted": true}}');

      normalizeFilters(malicious);

      // Verify prototype was not polluted
      expect(({} as any).polluted).toBeUndefined();
    });

    it('handles array with millions of elements', () => {
      const hugeArray = new Array(100000).fill('Wifi');

      const start = performance.now();
      const result = normalizeFilters({ amenities: hugeArray });
      const elapsed = performance.now() - start;

      // Should complete quickly and truncate
      expect(elapsed).toBeLessThan(500);
      expect(result.amenities?.length ?? 0).toBeLessThan(1000);
    });
  });
});

// ============================================
// Input Validation Stress Tests
// ============================================

describe('Input Validation Stress Tests', () => {
  describe('Price filter edge cases', () => {
    const edgeCasePrices = [
      0,
      0.001,
      0.999,
      Number.MIN_SAFE_INTEGER,
      Number.MAX_SAFE_INTEGER,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      NaN,
      -0,
      1e308,
      1e-308,
    ];

    it('handles all numeric edge cases', () => {
      edgeCasePrices.forEach((price) => {
        expect(() =>
          normalizeFilters({ minPrice: price, maxPrice: price })
        ).not.toThrow();
      });
    });

    it('produces valid output for all edge cases', () => {
      edgeCasePrices.forEach((price) => {
        const result = normalizeFilters({ minPrice: price });
        // Invalid values (NaN, Infinity) are dropped (undefined)
        // Valid values are kept as finite numbers
        if (result.minPrice !== undefined) {
          expect(typeof result.minPrice).toBe('number');
          expect(Number.isFinite(result.minPrice)).toBe(true);
        }
      });
    });
  });

  describe('Bounds filter edge cases', () => {
    const edgeCaseBounds = [
      // Valid edge cases
      { minLat: -90, maxLat: 90, minLng: -180, maxLng: 180 },
      { minLat: 0, maxLat: 0, minLng: 0, maxLng: 0 },
      // Antimeridian
      { minLat: 0, maxLat: 50, minLng: 170, maxLng: -170 },
      // Invalid values
      { minLat: -200, maxLat: 200, minLng: -400, maxLng: 400 },
      // Mixed types
      { minLat: '37' as any, maxLat: null as any, minLng: undefined, maxLng: NaN },
    ];

    it('handles all bounds edge cases', () => {
      edgeCaseBounds.forEach((bounds) => {
        expect(() => normalizeFilters({ bounds })).not.toThrow();
      });
    });

    it('produces clamped output for out-of-range values', () => {
      const result = normalizeFilters({
        bounds: { minLat: -200, maxLat: 200, minLng: -400, maxLng: 400 },
      });

      expect(result.bounds?.minLat).toBeGreaterThanOrEqual(-90);
      expect(result.bounds?.maxLat).toBeLessThanOrEqual(90);
      expect(result.bounds?.minLng).toBeGreaterThanOrEqual(-180);
      expect(result.bounds?.maxLng).toBeLessThanOrEqual(180);
    });
  });

  describe('Array filter edge cases', () => {
    it('handles empty arrays', () => {
      const result = normalizeFilters({
        amenities: [],
        houseRules: [],
        languages: [],
      });

      // Empty arrays are either omitted (undefined) or empty
      // The normalizer may drop empty arrays as they don't filter anything
      expect(result.amenities === undefined || result.amenities.length === 0).toBe(true);
      expect(result.houseRules === undefined || result.houseRules.length === 0).toBe(true);
      expect(result.languages === undefined || result.languages.length === 0).toBe(true);
    });

    it('handles arrays with mixed types', () => {
      const result = normalizeFilters({
        amenities: ['Wifi', 123, null, undefined, {}, []] as any,
      });

      // Should filter to only valid strings
      expect(result.amenities?.every((a) => typeof a === 'string') ?? true).toBe(true);
    });

    it('handles arrays with duplicate values', () => {
      const result = normalizeFilters({
        amenities: ['Wifi', 'Wifi', 'wifi', 'WIFI', 'AC', 'AC'],
      });

      // Should deduplicate
      const amenities = result.amenities ?? [];
      const uniqueCount = new Set(amenities.map((a) => a.toLowerCase())).size;
      expect(amenities.length).toBeLessThanOrEqual(uniqueCount + 1);
    });

    it('handles arrays with whitespace strings', () => {
      const result = normalizeFilters({
        amenities: ['  ', '\t', '\n', '  Wifi  ', ''],
      });

      // Should filter empty strings and trim others
      (result.amenities ?? []).forEach((a) => {
        expect(a.trim()).toBe(a);
        expect(a.length).toBeGreaterThan(0);
      });
    });
  });
});

// ============================================
// Concurrency Behavior Tests
// ============================================

describe('Concurrency Behavior', () => {
  it('handles parallel normalization calls', async () => {
    const filters = { minPrice: 500, maxPrice: 3000 };

    const promises = Array(100)
      .fill(null)
      .map(() => Promise.resolve(normalizeFilters(filters)));

    const results = await Promise.all(promises);

    // All results should be identical
    const firstResult = JSON.stringify(results[0]);
    results.forEach((result) => {
      expect(JSON.stringify(result)).toBe(firstResult);
    });
  });

  it('handles parallel filter applications', async () => {
    const filters = normalizeFilters({ maxPrice: 2000 });

    const promises = Array(50)
      .fill(null)
      .map(() => Promise.resolve(applyFilters(ACTIVE_LISTINGS, filters)));

    const results = await Promise.all(promises);

    // All results should have same count
    const firstCount = results[0].length;
    results.forEach((result) => {
      expect(result.length).toBe(firstCount);
    });
  });

  it('isolated execution - one call does not affect another', () => {
    // Run two filter operations with different parameters
    const filters1 = normalizeFilters({ maxPrice: 1000 });
    const filters2 = normalizeFilters({ minPrice: 2000 });

    const results1 = applyFilters(ACTIVE_LISTINGS, filters1);
    const results2 = applyFilters(ACTIVE_LISTINGS, filters2);

    // Results should not overlap (mutually exclusive price ranges)
    const ids1 = new Set(results1.map((r) => r.id));
    const overlap = results2.filter((r) => ids1.has(r.id));

    expect(overlap.length).toBe(0);
  });
});

// ============================================
// Stability Tests
// ============================================

describe('Stability Tests', () => {
  it('produces stable output across runs', () => {
    const filters = {
      minPrice: 500,
      maxPrice: 3000,
      amenities: ['AC', 'Wifi', 'Parking'],
      roomType: 'Private Room',
      sort: 'price_asc',
    };

    const results: string[] = [];
    for (let i = 0; i < 10; i++) {
      const normalized = normalizeFilters(filters);
      const filtered = applyFilters(ACTIVE_LISTINGS, normalized);
      const sorted = sortListings(filtered, normalized.sort);
      results.push(JSON.stringify(sorted.map((s) => s.id)));
    }

    // All runs should produce identical results
    const first = results[0];
    results.forEach((result) => {
      expect(result).toBe(first);
    });
  });

  it('array order in input does not affect output order', () => {
    const amenities1 = ['Wifi', 'AC', 'Parking'];
    const amenities2 = ['Parking', 'AC', 'Wifi'];
    const amenities3 = ['AC', 'Parking', 'Wifi'];

    const result1 = normalizeFilters({ amenities: amenities1 });
    const result2 = normalizeFilters({ amenities: amenities2 });
    const result3 = normalizeFilters({ amenities: amenities3 });

    // Normalized arrays should be identical (sorted)
    expect(result1.amenities).toEqual(result2.amenities);
    expect(result2.amenities).toEqual(result3.amenities);
  });

  it('maintains determinism with random-like input', () => {
    // Create "random-looking" but deterministic input
    const filters = {
      minPrice: Math.floor(12345 % 1000),
      maxPrice: Math.floor(67890 % 5000),
      amenities: ['Wifi', 'AC'].sort(),
      page: 1,
    };

    const results: string[] = [];
    for (let i = 0; i < 5; i++) {
      const filtered = applyFilters(ACTIVE_LISTINGS, normalizeFilters(filters));
      results.push(JSON.stringify(filtered.map((f) => f.id)));
    }

    // All iterations should be identical
    expect(new Set(results).size).toBe(1);
  });
});
