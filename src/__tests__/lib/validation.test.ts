/**
 * Tests for Bounds Validation Utility
 *
 * P1-4: Bounds derivation should be unified
 * P1-5: Both list and map should use clamp policy
 * P1-6: No double clamping
 */

import {
  validateAndParseBounds,
  clampBoundsToMaxSpan,
  deriveBoundsFromPoint,
  MapBounds,
  MAX_LAT_SPAN,
  MAX_LNG_SPAN,
} from '@/lib/validation';

describe('Bounds Validation', () => {
  describe('validateAndParseBounds', () => {
    it('returns valid bounds for correct input', () => {
      const result = validateAndParseBounds(
        '-122.5',
        '-122.4',
        '37.7',
        '37.8'
      );
      expect(result.valid).toBe(true);
      expect(result.bounds).toEqual({
        minLng: -122.5,
        maxLng: -122.4,
        minLat: 37.7,
        maxLat: 37.8,
      });
    });

    it('rejects missing parameters', () => {
      const result = validateAndParseBounds(null, '-122', '37', '38');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('required');
    });

    it('rejects NaN values', () => {
      const result = validateAndParseBounds('abc', '-122', '37', '38');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid');
    });

    it('rejects inverted latitude', () => {
      const result = validateAndParseBounds('-122', '-121', '38', '37');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('latitude');
    });

    it('clamps oversized bounds instead of rejecting (P1-5)', () => {
      // 10 degree span - larger than MAX_LAT_SPAN (5)
      const result = validateAndParseBounds(
        '-122',
        '-112', // 10 degree lng span
        '30',
        '40'    // 10 degree lat span
      );

      // P1-5: Should clamp, not reject
      expect(result.valid).toBe(true);
      expect(result.bounds).toBeDefined();

      // Bounds should be clamped to max span
      const latSpan = result.bounds!.maxLat - result.bounds!.minLat;
      const lngSpan = result.bounds!.maxLng - result.bounds!.minLng;

      expect(latSpan).toBeLessThanOrEqual(MAX_LAT_SPAN);
      expect(lngSpan).toBeLessThanOrEqual(MAX_LNG_SPAN);
    });

    it('preserves antimeridian crossing when within span limits', () => {
      // minLng > maxLng indicates antimeridian crossing
      // 178 to -178 = 4 degrees (within MAX_LNG_SPAN of 5)
      const result = validateAndParseBounds('178', '-178', '35', '38');
      expect(result.valid).toBe(true);
      expect(result.bounds?.minLng).toBe(178);
      expect(result.bounds?.maxLng).toBe(-178);
    });

    it('clamps oversized antimeridian crossing bounds', () => {
      // 170 to -170 = 20 degrees (exceeds MAX_LNG_SPAN of 5)
      const result = validateAndParseBounds('170', '-170', '35', '38');
      expect(result.valid).toBe(true);

      // Should be clamped, center preserved at 180/-180
      const span = result.bounds!.minLng > result.bounds!.maxLng
        ? (180 - result.bounds!.minLng) + (result.bounds!.maxLng + 180)
        : result.bounds!.maxLng - result.bounds!.minLng;
      expect(span).toBeLessThanOrEqual(MAX_LNG_SPAN);
    });
  });

  describe('clampBoundsToMaxSpan', () => {
    it('returns unchanged bounds if within limits', () => {
      const bounds: MapBounds = {
        minLat: 37.7,
        maxLat: 37.8,
        minLng: -122.5,
        maxLng: -122.4,
      };
      const result = clampBoundsToMaxSpan(bounds);
      expect(result).toEqual(bounds);
    });

    it('clamps oversized latitude span to MAX_LAT_SPAN', () => {
      const bounds: MapBounds = {
        minLat: 30,
        maxLat: 40, // 10 degree span
        minLng: -122.5,
        maxLng: -122.4,
      };
      const result = clampBoundsToMaxSpan(bounds);
      const latSpan = result.maxLat - result.minLat;
      expect(latSpan).toBe(MAX_LAT_SPAN);
    });

    it('clamps oversized longitude span to MAX_LNG_SPAN', () => {
      const bounds: MapBounds = {
        minLat: 37,
        maxLat: 38,
        minLng: -130,
        maxLng: -120, // 10 degree span
      };
      const result = clampBoundsToMaxSpan(bounds);
      const lngSpan = result.maxLng - result.minLng;
      expect(lngSpan).toBe(MAX_LNG_SPAN);
    });

    it('preserves center when clamping', () => {
      const bounds: MapBounds = {
        minLat: 30,
        maxLat: 40, // center at 35
        minLng: -130,
        maxLng: -120, // center at -125
      };
      const result = clampBoundsToMaxSpan(bounds);

      const centerLat = (result.minLat + result.maxLat) / 2;
      const centerLng = (result.minLng + result.maxLng) / 2;

      expect(centerLat).toBeCloseTo(35, 5);
      expect(centerLng).toBeCloseTo(-125, 5);
    });
  });

  describe('deriveBoundsFromPoint (P1-4)', () => {
    it('creates ~10km radius bounds from point', () => {
      const result = deriveBoundsFromPoint(37.7749, -122.4194); // San Francisco

      expect(result).toBeDefined();
      expect(result.minLat).toBeLessThan(37.7749);
      expect(result.maxLat).toBeGreaterThan(37.7749);
      expect(result.minLng).toBeLessThan(-122.4194);
      expect(result.maxLng).toBeGreaterThan(-122.4194);
    });

    it('clamps to valid latitude range', () => {
      // Near North Pole
      const result = deriveBoundsFromPoint(89.9, 0);
      expect(result.maxLat).toBeLessThanOrEqual(90);
    });

    it('clamps to valid longitude range', () => {
      // Near date line
      const result = deriveBoundsFromPoint(0, 179.9);
      expect(result.maxLng).toBeLessThanOrEqual(180);
    });

    it('adjusts longitude offset based on latitude', () => {
      // At equator, 1 degree lat ≈ 1 degree lng in km
      const equatorResult = deriveBoundsFromPoint(0, 0);
      const latSpan = equatorResult.maxLat - equatorResult.minLat;
      const lngSpan = equatorResult.maxLng - equatorResult.minLng;

      // At equator, spans should be approximately equal
      expect(Math.abs(latSpan - lngSpan)).toBeLessThan(0.01);

      // At high latitude, lng span should be larger
      const highLatResult = deriveBoundsFromPoint(60, 0);
      const highLatLngSpan = highLatResult.maxLng - highLatResult.minLng;

      expect(highLatLngSpan).toBeGreaterThan(lngSpan);
    });

    it('handles extreme latitudes near poles', () => {
      // Near pole, lng span approaches 180 due to cosine factor
      const result = deriveBoundsFromPoint(89, 0);

      // Should not exceed bounds
      expect(result.minLng).toBeGreaterThanOrEqual(-180);
      expect(result.maxLng).toBeLessThanOrEqual(180);
    });
  });
});
