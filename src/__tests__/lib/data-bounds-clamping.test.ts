/**
 * Tests for V1 bounds clamping in getListingsPaginated
 *
 * These tests verify that bounds clamping logic is correctly applied
 * when oversized bounds are passed to search functions.
 *
 * The clamping helper (shouldClampBounds and clampBoundsIfNeeded) are
 * tested directly since they're the core logic that getListingsPaginated
 * will use.
 */

import {
  clampBoundsToMaxSpan,
  MAX_LAT_SPAN,
  MAX_LNG_SPAN,
  type MapBounds,
} from '@/lib/validation';
import { crossesAntimeridian } from '@/lib/data';

/**
 * Helper function to determine if bounds need clamping.
 * This mirrors the logic that will be added to getListingsPaginated.
 */
function shouldClampBounds(bounds: MapBounds): boolean {
  const latSpan = bounds.maxLat - bounds.minLat;
  const lngSpan = crossesAntimeridian(bounds.minLng, bounds.maxLng)
    ? (180 - bounds.minLng) + (bounds.maxLng + 180)
    : bounds.maxLng - bounds.minLng;

  return latSpan > MAX_LAT_SPAN || lngSpan > MAX_LNG_SPAN;
}

/**
 * Helper function that clamps bounds only when needed.
 * This mirrors the logic that will be added to getListingsPaginated.
 */
function clampBoundsIfNeeded(bounds: MapBounds): MapBounds {
  if (shouldClampBounds(bounds)) {
    return clampBoundsToMaxSpan(bounds);
  }
  return bounds;
}

describe('bounds clamping helpers for getListingsPaginated', () => {
  describe('shouldClampBounds', () => {
    it('returns true when latitude span exceeds MAX_LAT_SPAN', () => {
      const oversizedLat: MapBounds = {
        minLat: 20.0,
        maxLat: 60.0, // 40° span - exceeds 5° limit
        minLng: -74.0,
        maxLng: -72.0,
      };

      expect(shouldClampBounds(oversizedLat)).toBe(true);
    });

    it('returns true when longitude span exceeds MAX_LNG_SPAN', () => {
      const oversizedLng: MapBounds = {
        minLat: 40.0,
        maxLat: 42.0,
        minLng: -120.0,
        maxLng: -60.0, // 60° span - exceeds 5° limit
      };

      expect(shouldClampBounds(oversizedLng)).toBe(true);
    });

    it('returns true for world-spanning bounds (DoS case)', () => {
      const worldBounds: MapBounds = {
        minLat: -85.0,
        maxLat: 85.0, // 170° span
        minLng: -180.0,
        maxLng: 180.0, // 360° span
      };

      expect(shouldClampBounds(worldBounds)).toBe(true);
    });

    it('returns false when bounds are within limits', () => {
      const validBounds: MapBounds = {
        minLat: 40.0,
        maxLat: 42.0, // 2° span
        minLng: -74.0,
        maxLng: -72.0, // 2° span
      };

      expect(shouldClampBounds(validBounds)).toBe(false);
    });

    it('returns false when bounds are exactly at limit', () => {
      const exactLimitBounds: MapBounds = {
        minLat: 40.0,
        maxLat: 40.0 + MAX_LAT_SPAN, // Exactly at span limit
        minLng: -74.0,
        maxLng: -74.0 + MAX_LNG_SPAN, // Exactly at span limit
      };

      expect(shouldClampBounds(exactLimitBounds)).toBe(false);
    });

    it('returns true for oversized antimeridian-crossing bounds', () => {
      const oversizedAntimeridian: MapBounds = {
        minLat: 40.0,
        maxLat: 42.0,
        minLng: 160.0,
        maxLng: -160.0, // Crosses antimeridian, 40° span
      };

      expect(shouldClampBounds(oversizedAntimeridian)).toBe(true);
    });

    it('returns false for valid antimeridian-crossing bounds', () => {
      const validAntimeridian: MapBounds = {
        minLat: 40.0,
        maxLat: 42.0,
        minLng: 178.0,
        maxLng: -178.0, // Crosses antimeridian, 4° span (within limit)
      };

      expect(shouldClampBounds(validAntimeridian)).toBe(false);
    });
  });

  describe('clampBoundsIfNeeded', () => {
    it('clamps oversized bounds', () => {
      const oversized: MapBounds = {
        minLat: 20.0,
        maxLat: 60.0, // 40° span
        minLng: -100.0,
        maxLng: -60.0, // 40° span
      };

      const result = clampBoundsIfNeeded(oversized);

      expect(result.maxLat - result.minLat).toBeLessThanOrEqual(MAX_LAT_SPAN + 0.01);
      expect(result.maxLng - result.minLng).toBeLessThanOrEqual(MAX_LNG_SPAN + 0.01);
    });

    it('preserves center when clamping', () => {
      const oversized: MapBounds = {
        minLat: 20.0,
        maxLat: 60.0,
        minLng: -100.0,
        maxLng: -60.0,
      };
      const originalLatCenter = (oversized.minLat + oversized.maxLat) / 2;
      const originalLngCenter = (oversized.minLng + oversized.maxLng) / 2;

      const result = clampBoundsIfNeeded(oversized);
      const newLatCenter = (result.minLat + result.maxLat) / 2;
      const newLngCenter = (result.minLng + result.maxLng) / 2;

      expect(newLatCenter).toBeCloseTo(originalLatCenter);
      expect(newLngCenter).toBeCloseTo(originalLngCenter);
    });

    it('returns original bounds when within limits', () => {
      const valid: MapBounds = {
        minLat: 40.0,
        maxLat: 42.0,
        minLng: -74.0,
        maxLng: -72.0,
      };

      const result = clampBoundsIfNeeded(valid);

      expect(result).toEqual(valid);
    });

    it('clamps world-spanning bounds to MAX dimensions', () => {
      const world: MapBounds = {
        minLat: -85.0,
        maxLat: 85.0,
        minLng: -180.0,
        maxLng: 180.0,
      };

      const result = clampBoundsIfNeeded(world);

      expect(result.maxLat - result.minLat).toBeCloseTo(MAX_LAT_SPAN);
      expect(result.maxLng - result.minLng).toBeCloseTo(MAX_LNG_SPAN);
      // Should be centered around 0,0
      expect((result.minLat + result.maxLat) / 2).toBeCloseTo(0);
      expect((result.minLng + result.maxLng) / 2).toBeCloseTo(0);
    });
  });
});

/**
 * Integration test: Verify the exact clamping logic that will be
 * added to getListingsPaginated matches expected behavior.
 *
 * When we add the fix to data.ts, it will use this exact pattern:
 *
 * ```typescript
 * // At start of getListingsPaginated, after destructuring bounds
 * if (bounds) {
 *   const latSpan = bounds.maxLat - bounds.minLat;
 *   const lngSpan = crossesAntimeridian(bounds.minLng, bounds.maxLng)
 *     ? (180 - bounds.minLng) + (bounds.maxLng + 180)
 *     : bounds.maxLng - bounds.minLng;
 *
 *   if (latSpan > MAX_LAT_SPAN || lngSpan > MAX_LNG_SPAN) {
 *     bounds = clampBoundsToMaxSpan(bounds);
 *   }
 * }
 * ```
 */
describe('getListingsPaginated clamping pattern', () => {
  it('should use clamped bounds for database query when oversized', () => {
    // Simulate the clamping logic that will be in getListingsPaginated
    let bounds: MapBounds | undefined = {
      minLat: -85.0,
      maxLat: 85.0,
      minLng: -180.0,
      maxLng: 180.0,
    };

    // This is the exact code pattern that will be added
    if (bounds) {
      const latSpan = bounds.maxLat - bounds.minLat;
      const lngSpan = crossesAntimeridian(bounds.minLng, bounds.maxLng)
        ? (180 - bounds.minLng) + (bounds.maxLng + 180)
        : bounds.maxLng - bounds.minLng;

      if (latSpan > MAX_LAT_SPAN || lngSpan > MAX_LNG_SPAN) {
        bounds = clampBoundsToMaxSpan(bounds);
      }
    }

    // After clamping, bounds should be MAX_LAT_SPAN x MAX_LNG_SPAN
    expect(bounds!.maxLat - bounds!.minLat).toBeCloseTo(MAX_LAT_SPAN);
    expect(bounds!.maxLng - bounds!.minLng).toBeCloseTo(MAX_LNG_SPAN);
  });

  it('should NOT modify bounds when within limits', () => {
    let bounds: MapBounds | undefined = {
      minLat: 40.0,
      maxLat: 42.0,
      minLng: -74.0,
      maxLng: -72.0,
    };
    const originalBounds = { ...bounds };

    // This is the exact code pattern that will be added
    if (bounds) {
      const latSpan = bounds.maxLat - bounds.minLat;
      const lngSpan = crossesAntimeridian(bounds.minLng, bounds.maxLng)
        ? (180 - bounds.minLng) + (bounds.maxLng + 180)
        : bounds.maxLng - bounds.minLng;

      if (latSpan > MAX_LAT_SPAN || lngSpan > MAX_LNG_SPAN) {
        bounds = clampBoundsToMaxSpan(bounds);
      }
    }

    // Bounds should be unchanged
    expect(bounds).toEqual(originalBounds);
  });
});
