/**
 * Distance Edge Cases Tests
 *
 * Tests for geospatial edge cases in the distance calculation utilities.
 * Covers: NaN/Infinity inputs, pole coordinates, antimeridian crossing,
 * identical points, origin, precise coordinates, and formatDistance boundaries.
 *
 * @see Plan Category A - Input Validation & Geospatial (11 tests)
 */

import {
  haversineMiles,
  haversineMeters,
  formatDistance,
} from '@/lib/geo/distance';

describe('haversineMiles - Edge Cases', () => {
  describe('NaN and Infinity inputs', () => {
    it('returns NaN when lat1 is NaN', () => {
      const result = haversineMiles(NaN, -122.4, 37.8, -122.5);
      expect(Number.isNaN(result)).toBe(true);
    });

    it('returns NaN when lng1 is Infinity', () => {
      const result = haversineMiles(37.7, Infinity, 37.8, -122.5);
      expect(Number.isNaN(result)).toBe(true);
    });

    it('returns NaN when lat2 is -Infinity', () => {
      const result = haversineMiles(37.7, -122.4, -Infinity, -122.5);
      expect(Number.isNaN(result)).toBe(true);
    });

    it('returns NaN when lng2 is NaN', () => {
      const result = haversineMiles(37.7, -122.4, 37.8, NaN);
      expect(Number.isNaN(result)).toBe(true);
    });
  });

  describe('Pole coordinates', () => {
    it('calculates distance from North Pole (90, 0)', () => {
      // Distance from North Pole to some point
      const result = haversineMiles(90, 0, 37.7749, -122.4194);
      // North Pole to San Francisco should be roughly 3,600 miles
      expect(result).toBeGreaterThan(3500);
      expect(result).toBeLessThan(3700);
    });

    it('calculates distance from South Pole (-90, 0)', () => {
      // Distance from South Pole to some point
      const result = haversineMiles(-90, 0, 37.7749, -122.4194);
      // South Pole to San Francisco - roughly 8,800 miles
      expect(result).toBeGreaterThan(8700);
      expect(result).toBeLessThan(9000);
    });

    it('handles North Pole with any longitude', () => {
      // Longitude should not matter at the poles
      const result1 = haversineMiles(90, 0, 37.7749, -122.4194);
      const result2 = haversineMiles(90, 180, 37.7749, -122.4194);
      const result3 = haversineMiles(90, -90, 37.7749, -122.4194);
      // All should give the same distance (within floating point tolerance)
      expect(result1).toBeCloseTo(result2, 5);
      expect(result2).toBeCloseTo(result3, 5);
    });
  });

  describe('Antimeridian crossing', () => {
    it('calculates short distance across antimeridian (-180 to 180)', () => {
      // Two points on opposite sides of the international date line but close together
      // Point 1: Just west of the date line (179.9 E)
      // Point 2: Just east of the date line (179.9 W = -179.9)
      const result = haversineMiles(0, 179.9, 0, -179.9);
      // Distance should be about 13.8 miles at the equator (0.2 degrees of longitude)
      // 360 degrees ÷ 24,901 miles (Earth circumference at equator) × 0.2 ≈ 13.8 miles
      expect(result).toBeLessThan(150);
      expect(result).toBeGreaterThan(10);
    });

    it('calculates correct distance for Fiji to Samoa (real antimeridian case)', () => {
      // Fiji: approximately -17.7, 178
      // Samoa: approximately -14, -172
      const result = haversineMiles(-17.7, 178, -14, -172);
      // These are relatively close despite being on opposite sides of the date line
      // Expected: roughly 650-700 miles
      expect(result).toBeLessThan(800);
      expect(result).toBeGreaterThan(500);
    });
  });

  describe('Identical coordinates', () => {
    it('returns 0 for identical coordinates', () => {
      const result = haversineMiles(37.7749, -122.4194, 37.7749, -122.4194);
      expect(result).toBe(0);
    });

    it('returns 0 for identical coordinates at origin', () => {
      const result = haversineMiles(0, 0, 0, 0);
      expect(result).toBe(0);
    });

    it('returns effectively 0 for identical coordinates at poles', () => {
      const northPole = haversineMiles(90, 45, 90, -90);
      const southPole = haversineMiles(-90, 0, -90, 180);
      // At poles, any longitude is effectively the same point
      // Use toBeCloseTo for floating point precision
      expect(northPole).toBeCloseTo(0, 10);
      expect(southPole).toBeCloseTo(0, 10);
    });
  });

  describe('Origin coordinates (0, 0)', () => {
    it('calculates distance from Gulf of Guinea origin', () => {
      // 0,0 is in the Gulf of Guinea, off the coast of West Africa
      // Distance to San Francisco
      const result = haversineMiles(0, 0, 37.7749, -122.4194);
      // The great circle distance is approximately 7,950 miles
      expect(result).toBeGreaterThan(7800);
      expect(result).toBeLessThan(8100);
    });

    it('calculates distance between origin and North Pole', () => {
      // 0 to 90 latitude is 1/4 of Earth's circumference
      const result = haversineMiles(0, 0, 90, 0);
      // Expected: ~6,200 miles (1/4 of 24,901 miles)
      expect(result).toBeGreaterThan(6100);
      expect(result).toBeLessThan(6300);
    });
  });

  describe('Extremely precise coordinates', () => {
    it('handles coordinates with many decimal places', () => {
      const result = haversineMiles(
        37.7749295012345678,
        -122.4194155012345678,
        37.7848295012345678,
        -122.4094155012345678
      );
      // These points are about 0.01 degrees apart (roughly 0.7 miles)
      expect(result).toBeGreaterThan(0.5);
      expect(result).toBeLessThan(1.5);
    });

    it('maintains precision for very close points', () => {
      // Two points that are only about 10 meters apart
      const result = haversineMeters(
        37.774929501234567,
        -122.419415501234567,
        37.774929511234567,
        -122.419415511234567
      );
      // Should be a few meters
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(10);
    });
  });
});

describe('formatDistance - Edge Cases', () => {
  it('formats 0 distance as "0 ft"', () => {
    expect(formatDistance(0)).toBe('0 ft');
  });

  it('formats exactly 0.1 miles as "0.1 mi" (boundary case)', () => {
    expect(formatDistance(0.1)).toBe('0.1 mi');
  });

  it('formats values just under 0.1 as feet', () => {
    expect(formatDistance(0.0999)).toMatch(/\d+ ft/);
    // 0.0999 miles * 5280 ≈ 527.5 ft (rounds to 527 or 528 depending on implementation)
    expect(formatDistance(0.0999)).toBe('527 ft');
  });

  it('formats 10.123 miles as "10.1 mi" (rounds to 1 decimal)', () => {
    expect(formatDistance(10.123)).toBe('10.1 mi');
  });

  it('formats very small distances correctly', () => {
    expect(formatDistance(0.001)).toBe('5 ft');
    expect(formatDistance(0.01)).toBe('53 ft');
  });

  it('formats very large distances correctly', () => {
    expect(formatDistance(100)).toBe('100.0 mi');
    expect(formatDistance(1000.567)).toBe('1000.6 mi');
  });

  it('handles negative values gracefully', () => {
    // While negative distances don't make physical sense,
    // the function should still handle them without crashing
    const result = formatDistance(-1);
    expect(typeof result).toBe('string');
  });

  it('formats values at the boundary between feet and miles', () => {
    // Just under 0.1 miles ≈ 528 feet (but depends on exact rounding)
    const justUnder = formatDistance(0.09999);
    expect(justUnder).toMatch(/52[78] ft/);
    // Exactly at 0.1 miles
    expect(formatDistance(0.1)).toBe('0.1 mi');
    // Just over 0.1 miles
    expect(formatDistance(0.10001)).toBe('0.1 mi');
  });
});

describe('haversineMeters - Consistency with haversineMiles', () => {
  it('meters and miles should be proportional', () => {
    const meters = haversineMeters(37.7749, -122.4194, 37.8749, -122.5194);
    const miles = haversineMiles(37.7749, -122.4194, 37.8749, -122.5194);

    // 1 mile = 1609.344 meters
    const expectedMeters = miles * 1609.344;
    expect(meters).toBeCloseTo(expectedMeters, 0);
  });
});
