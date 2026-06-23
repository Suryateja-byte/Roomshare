import { padBounds, FETCH_BOUNDS_PADDING } from "@/lib/maps/pad-bounds";
import {
  MAP_FETCH_MAX_LAT_SPAN,
  MAP_FETCH_MAX_LNG_SPAN,
} from "@/lib/constants";
import type { MapBounds } from "@/lib/validation";

/** Crossing-aware longitude span, matching the lib helpers. */
function lngSpanOf(b: MapBounds): number {
  return b.minLng > b.maxLng
    ? 180 - b.minLng + (b.maxLng + 180)
    : b.maxLng - b.minLng;
}

describe("padBounds", () => {
  describe("non-crossing viewport", () => {
    it("pads outward symmetrically by the padding fraction", () => {
      const bounds: MapBounds = {
        minLat: 40,
        maxLat: 42,
        minLng: -74,
        maxLng: -72,
      };

      const result = padBounds(bounds); // FETCH_BOUNDS_PADDING = 0.2

      // latSpan = 2, lngSpan = 2 -> pad 0.4 each edge. Within limits -> no clamp.
      expect(result.minLat).toBeCloseTo(39.6);
      expect(result.maxLat).toBeCloseTo(42.4);
      expect(result.minLng).toBeCloseTo(-74.4);
      expect(result.maxLng).toBeCloseTo(-71.6);
      expect(FETCH_BOUNDS_PADDING).toBe(0.2);
    });

    it("clamps an oversized non-crossing span to the max, centered", () => {
      const bounds: MapBounds = {
        minLat: 0,
        maxLat: 10,
        minLng: -100,
        maxLng: 40, // span 140 -> padded 196 -> exceeds 130
      };

      const result = padBounds(bounds);

      expect(lngSpanOf(result)).toBeLessThanOrEqual(MAP_FETCH_MAX_LNG_SPAN + 1e-9);
      expect(result.maxLat - result.minLat).toBeLessThanOrEqual(
        MAP_FETCH_MAX_LAT_SPAN + 1e-9
      );
      expect(result.minLng).toBeGreaterThanOrEqual(-180);
      expect(result.maxLng).toBeLessThanOrEqual(180);
    });
  });

  describe("antimeridian-crossing viewport (regression for the negative-span bug)", () => {
    it("keeps a valid crossing box instead of producing inverted out-of-range bounds", () => {
      const bounds: MapBounds = {
        minLat: 10,
        maxLat: 20,
        minLng: 170,
        maxLng: -170, // crossing: true 20-degree window across +/-180
      };

      const result = padBounds(bounds);

      // The old buggy code produced minLng=238, maxLng=-238 (out of range).
      expect(result.minLng).toBeGreaterThan(result.maxLng); // crossing preserved
      expect(result.minLng).toBeLessThanOrEqual(180);
      expect(result.minLng).toBeGreaterThanOrEqual(-180);
      expect(result.maxLng).toBeLessThanOrEqual(180);
      expect(result.maxLng).toBeGreaterThanOrEqual(-180);
      // span ~ 20 * (1 + 2*0.2) = 28
      expect(lngSpanOf(result)).toBeCloseTo(28, 5);
      expect(result.minLng).toBeCloseTo(166);
      expect(result.maxLng).toBeCloseTo(-166);
    });

    it("clamps an oversized crossing span and preserves the crossing", () => {
      const bounds: MapBounds = {
        minLat: 10,
        maxLat: 20,
        minLng: 120,
        maxLng: -120, // crossing span 120 -> padded 168 -> exceeds 130
      };

      const result = padBounds(bounds);

      expect(result.minLng).toBeGreaterThan(result.maxLng); // still crossing
      expect(lngSpanOf(result)).toBeLessThanOrEqual(MAP_FETCH_MAX_LNG_SPAN + 1e-9);
      expect(result.minLng).toBeLessThanOrEqual(180);
      expect(result.maxLng).toBeGreaterThanOrEqual(-180);
    });
  });
});
