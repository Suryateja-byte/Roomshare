import {
  deriveSearchBoundsFromPoint,
  boundsTupleToObject,
} from "@/lib/search/location-bounds";
import { clampBoundsToMaxSpan } from "@/lib/validation";
import {
  MAP_FETCH_MAX_LAT_SPAN,
  MAP_FETCH_MAX_LNG_SPAN,
} from "@/lib/constants";

/** Mirrors how /api/map-listings clamps the lat/lng-derived bounds path. */
function deriveClamped(lat: number, lng: number) {
  return clampBoundsToMaxSpan(
    boundsTupleToObject(deriveSearchBoundsFromPoint(lat, lng)),
    MAP_FETCH_MAX_LAT_SPAN,
    MAP_FETCH_MAX_LNG_SPAN
  );
}

describe("derived map-listings bounds clamp", () => {
  it("clamps the near-pole 360-degree longitude widening to the max span", () => {
    // deriveSearchBoundsFromPoint widens to +/-180 when cos(lat) < 0.01.
    const result = deriveClamped(89.9, 0);

    expect(result.maxLng - result.minLng).toBeLessThanOrEqual(
      MAP_FETCH_MAX_LNG_SPAN + 1e-9
    );
    expect(result.maxLat - result.minLat).toBeLessThanOrEqual(
      MAP_FETCH_MAX_LAT_SPAN + 1e-9
    );
  });

  it("leaves a normal-latitude derived viewport unchanged (no over-clamping)", () => {
    const derived = boundsTupleToObject(deriveSearchBoundsFromPoint(40.7, -74));
    expect(deriveClamped(40.7, -74)).toEqual(derived);
  });
});
