import {
  clampBoundsToMaxSpan,
  MAX_LAT_SPAN,
  MAX_LNG_SPAN,
  type MapBounds,
} from '@/lib/validation';

describe('clampBoundsToMaxSpan', () => {
  describe('bounds within limits', () => {
    it('returns unchanged bounds when within limits', () => {
      const bounds: MapBounds = {
        minLat: 40.0,
        maxLat: 42.0,
        minLng: -74.5,
        maxLng: -71.5,
      };

      const result = clampBoundsToMaxSpan(bounds);

      expect(result).toEqual(bounds);
    });

    it('returns unchanged bounds at exact limit', () => {
      const bounds: MapBounds = {
        minLat: 40.0,
        maxLat: 40.0 + MAX_LAT_SPAN,
        minLng: -74.0,
        maxLng: -74.0 + MAX_LNG_SPAN,
      };

      const result = clampBoundsToMaxSpan(bounds);

      expect(result.maxLat - result.minLat).toBeCloseTo(MAX_LAT_SPAN);
      expect(result.maxLng - result.minLng).toBeCloseTo(MAX_LNG_SPAN);
    });
  });

  describe('oversized latitude span', () => {
    it('clamps oversized latitude span centered on original', () => {
      const bounds: MapBounds = {
        minLat: 30.0,
        maxLat: 50.0, // 20° span - exceeds 5° limit
        minLng: -74.0,
        maxLng: -72.0,
      };

      const result = clampBoundsToMaxSpan(bounds);

      // Should clamp to 5° span
      expect(result.maxLat - result.minLat).toBeCloseTo(MAX_LAT_SPAN);
      // Should be centered on original center (40.0)
      const originalCenter = (bounds.minLat + bounds.maxLat) / 2;
      const newCenter = (result.minLat + result.maxLat) / 2;
      expect(newCenter).toBeCloseTo(originalCenter);
    });
  });

  describe('oversized longitude span', () => {
    it('clamps oversized longitude span centered on original', () => {
      const bounds: MapBounds = {
        minLat: 40.0,
        maxLat: 42.0,
        minLng: -100.0,
        maxLng: -60.0, // 40° span - exceeds 5° limit
      };

      const result = clampBoundsToMaxSpan(bounds);

      // Should clamp to 5° span
      expect(result.maxLng - result.minLng).toBeCloseTo(MAX_LNG_SPAN);
      // Should be centered on original center (-80.0)
      const originalCenter = (bounds.minLng + bounds.maxLng) / 2;
      const newCenter = (result.minLng + result.maxLng) / 2;
      expect(newCenter).toBeCloseTo(originalCenter);
    });
  });

  describe('both spans oversized', () => {
    it('clamps both latitude and longitude spans', () => {
      const bounds: MapBounds = {
        minLat: 20.0,
        maxLat: 60.0, // 40° lat span
        minLng: -120.0,
        maxLng: -60.0, // 60° lng span
      };

      const result = clampBoundsToMaxSpan(bounds);

      expect(result.maxLat - result.minLat).toBeCloseTo(MAX_LAT_SPAN);
      expect(result.maxLng - result.minLng).toBeCloseTo(MAX_LNG_SPAN);
    });

    it('preserves center of original viewport', () => {
      const bounds: MapBounds = {
        minLat: 20.0,
        maxLat: 60.0,
        minLng: -120.0,
        maxLng: -60.0,
      };

      const result = clampBoundsToMaxSpan(bounds);

      const originalLatCenter = (bounds.minLat + bounds.maxLat) / 2;
      const originalLngCenter = (bounds.minLng + bounds.maxLng) / 2;
      const newLatCenter = (result.minLat + result.maxLat) / 2;
      const newLngCenter = (result.minLng + result.maxLng) / 2;

      expect(newLatCenter).toBeCloseTo(originalLatCenter);
      expect(newLngCenter).toBeCloseTo(originalLngCenter);
    });
  });

  describe('antimeridian crossing', () => {
    it('handles antimeridian crossing correctly', () => {
      // Crossing antimeridian: minLng > maxLng
      const bounds: MapBounds = {
        minLat: 40.0,
        maxLat: 42.0,
        minLng: 170.0,
        maxLng: -170.0, // Crosses antimeridian (20° span)
      };

      const result = clampBoundsToMaxSpan(bounds);

      // Should clamp the longitude span
      // Original span: (180 - 170) + (-170 + 180) = 10 + 10 = 20°
      // After clamping should be at most 5°
      const crossesAntimeridian = result.minLng > result.maxLng;
      const resultLngSpan = crossesAntimeridian
        ? (180 - result.minLng) + (result.maxLng + 180)
        : result.maxLng - result.minLng;

      expect(resultLngSpan).toBeLessThanOrEqual(MAX_LNG_SPAN + 0.01);
    });

    it('preserves antimeridian crossing property after clamping (Task #186)', () => {
      // This test specifically verifies that when oversized bounds cross the
      // antimeridian, the crossing property (minLng > maxLng) is preserved
      const bounds: MapBounds = {
        minLat: 40.0,
        maxLat: 42.0,
        minLng: 170.0,
        maxLng: -170.0, // Crosses antimeridian (20° span)
      };

      const result = clampBoundsToMaxSpan(bounds);

      // The crossing property MUST be preserved after clamping
      expect(result.minLng).toBeGreaterThan(result.maxLng);

      // Verify the center is still near the antimeridian (around 180/-180)
      // For a crossing, center is calculated as: (minLng + (maxLng+360)) / 2
      // For original: (170 + (-170+360)) / 2 = (170 + 190) / 2 = 180
      // After clamping, result should still be centered at 180
      const adjustedMaxLng = result.maxLng + 360;
      const resultCenterLng = (result.minLng + adjustedMaxLng) / 2;
      expect(resultCenterLng).toBeCloseTo(180, 0);
    });

    it('returns bounds within [-180, 180] range after antimeridian clamping', () => {
      const bounds: MapBounds = {
        minLat: 40.0,
        maxLat: 42.0,
        minLng: 170.0,
        maxLng: -170.0, // Crosses antimeridian
      };

      const result = clampBoundsToMaxSpan(bounds);

      // Both coordinates should be within valid range
      expect(result.minLng).toBeGreaterThanOrEqual(-180);
      expect(result.minLng).toBeLessThanOrEqual(180);
      expect(result.maxLng).toBeGreaterThanOrEqual(-180);
      expect(result.maxLng).toBeLessThanOrEqual(180);
    });
  });

  describe('edge cases', () => {
    it('respects latitude limits (-85 to 85)', () => {
      const bounds: MapBounds = {
        minLat: 80.0,
        maxLat: 90.0, // Would go above 85 after clamping
        minLng: -74.0,
        maxLng: -72.0,
      };

      const result = clampBoundsToMaxSpan(bounds);

      expect(result.maxLat).toBeLessThanOrEqual(85);
      expect(result.minLat).toBeGreaterThanOrEqual(-85);
    });

    it('respects longitude limits (-180 to 180)', () => {
      const bounds: MapBounds = {
        minLat: 40.0,
        maxLat: 42.0,
        minLng: 175.0,
        maxLng: -175.0, // Large span crossing antimeridian
      };

      const result = clampBoundsToMaxSpan(bounds);

      expect(result.maxLng).toBeLessThanOrEqual(180);
      expect(result.minLng).toBeGreaterThanOrEqual(-180);
    });

    it('handles world-wide bounds (DoS prevention case)', () => {
      const bounds: MapBounds = {
        minLat: -85.0,
        maxLat: 85.0, // 170° span
        minLng: -180.0,
        maxLng: 180.0, // 360° span
      };

      const result = clampBoundsToMaxSpan(bounds);

      expect(result.maxLat - result.minLat).toBeCloseTo(MAX_LAT_SPAN);
      expect(result.maxLng - result.minLng).toBeCloseTo(MAX_LNG_SPAN);
      // Should be centered around 0,0
      expect((result.minLat + result.maxLat) / 2).toBeCloseTo(0);
      expect((result.minLng + result.maxLng) / 2).toBeCloseTo(0);
    });
  });
});
