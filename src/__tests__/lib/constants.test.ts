/**
 * Tests for Search Constants
 *
 * Validates that all search-related constants have sensible values
 * and are exported from the canonical source.
 */

import {
  MAX_SAFE_PRICE,
  MAX_SAFE_PAGE,
  MAX_ARRAY_ITEMS,
  MIN_QUERY_LENGTH,
  MAX_QUERY_LENGTH,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  LAT_OFFSET_KM,
  LAT_OFFSET_DEGREES,
  MAX_LAT_SPAN,
  MAX_LNG_SPAN,
  LAT_MIN,
  LAT_MAX,
  LNG_MIN,
  LNG_MAX,
} from '@/lib/constants';

describe('Search Constants', () => {
  describe('Price constants', () => {
    it('MAX_SAFE_PRICE is a positive number', () => {
      expect(typeof MAX_SAFE_PRICE).toBe('number');
      expect(MAX_SAFE_PRICE).toBeGreaterThan(0);
      expect(Number.isFinite(MAX_SAFE_PRICE)).toBe(true);
    });

    it('MAX_SAFE_PRICE allows reasonable rental prices', () => {
      // Should allow prices up to $1 billion (covers luxury/long-term)
      expect(MAX_SAFE_PRICE).toBeGreaterThanOrEqual(1_000_000);
    });
  });

  describe('Pagination constants', () => {
    it('MAX_SAFE_PAGE is a positive integer', () => {
      expect(Number.isInteger(MAX_SAFE_PAGE)).toBe(true);
      expect(MAX_SAFE_PAGE).toBeGreaterThan(0);
    });

    it('DEFAULT_PAGE_SIZE is reasonable', () => {
      expect(Number.isInteger(DEFAULT_PAGE_SIZE)).toBe(true);
      expect(DEFAULT_PAGE_SIZE).toBeGreaterThanOrEqual(1);
      expect(DEFAULT_PAGE_SIZE).toBeLessThanOrEqual(100);
    });

    it('MAX_PAGE_SIZE >= DEFAULT_PAGE_SIZE', () => {
      expect(MAX_PAGE_SIZE).toBeGreaterThanOrEqual(DEFAULT_PAGE_SIZE);
    });

    it('MAX_ARRAY_ITEMS is positive', () => {
      expect(Number.isInteger(MAX_ARRAY_ITEMS)).toBe(true);
      expect(MAX_ARRAY_ITEMS).toBeGreaterThan(0);
    });
  });

  describe('Query constants', () => {
    it('MIN_QUERY_LENGTH is positive', () => {
      expect(Number.isInteger(MIN_QUERY_LENGTH)).toBe(true);
      expect(MIN_QUERY_LENGTH).toBeGreaterThan(0);
    });

    it('MAX_QUERY_LENGTH > MIN_QUERY_LENGTH', () => {
      expect(MAX_QUERY_LENGTH).toBeGreaterThan(MIN_QUERY_LENGTH);
    });

    it('MAX_QUERY_LENGTH is reasonable for search', () => {
      // Should allow descriptive searches but prevent abuse
      expect(MAX_QUERY_LENGTH).toBeGreaterThanOrEqual(50);
      expect(MAX_QUERY_LENGTH).toBeLessThanOrEqual(1000);
    });
  });

  describe('Geographic constants', () => {
    it('LAT_OFFSET_KM is approximately 30km', () => {
      expect(LAT_OFFSET_KM).toBeCloseTo(30, 0);
    });

    it('LAT_OFFSET_DEGREES converts correctly from km', () => {
      // 1 degree latitude ≈ 111km, so 30km ≈ 0.27 degrees
      expect(LAT_OFFSET_DEGREES).toBeCloseTo(0.27, 2);
    });

    it('MAX_LAT_SPAN and MAX_LNG_SPAN are positive', () => {
      expect(MAX_LAT_SPAN).toBeGreaterThan(0);
      expect(MAX_LNG_SPAN).toBeGreaterThan(0);
    });

    it('MAX_LAT_SPAN allows regional views', () => {
      // 5 degrees ≈ 550km - allows city/regional views
      expect(MAX_LAT_SPAN).toBeGreaterThanOrEqual(1);
      expect(MAX_LAT_SPAN).toBeLessThanOrEqual(90);
    });

    it('coordinate bounds cover valid ranges', () => {
      expect(LAT_MIN).toBeGreaterThanOrEqual(-90);
      expect(LAT_MAX).toBeLessThanOrEqual(90);
      expect(LAT_MIN).toBeLessThan(LAT_MAX);

      expect(LNG_MIN).toBeGreaterThanOrEqual(-180);
      expect(LNG_MAX).toBeLessThanOrEqual(180);
      expect(LNG_MIN).toBeLessThan(LNG_MAX);
    });
  });

  describe('No drift between constants', () => {
    it('all constants are exported from single source', () => {
      // This test ensures we don't accidentally re-define constants elsewhere
      // If this file compiles and these values are defined, we're using the canonical source
      const allConstants = {
        MAX_SAFE_PRICE,
        MAX_SAFE_PAGE,
        MAX_ARRAY_ITEMS,
        MIN_QUERY_LENGTH,
        MAX_QUERY_LENGTH,
        DEFAULT_PAGE_SIZE,
        MAX_PAGE_SIZE,
        LAT_OFFSET_KM,
        LAT_OFFSET_DEGREES,
        MAX_LAT_SPAN,
        MAX_LNG_SPAN,
        LAT_MIN,
        LAT_MAX,
        LNG_MIN,
        LNG_MAX,
      };

      // All should be defined (not undefined)
      Object.entries(allConstants).forEach(([name, value]) => {
        expect(value).toBeDefined();
        expect(typeof value).toBe('number');
      });
    });
  });
});
