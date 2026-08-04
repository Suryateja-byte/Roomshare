/**
 * Unit coverage for the alert viewport predicate (P1-5).
 *
 * The envelope parameter ORDER is the easy thing to get wrong and the hard
 * thing to notice: ST_MakeEnvelope takes (xmin, ymin, xmax, ymax) — longitude
 * first — while every filter type in this repo lists lat before lng. Swapping
 * them yields a valid query that silently matches the wrong part of the world.
 */

jest.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: jest.fn() } }));

import {
  boundsFromAlertFilters,
  buildBoundsPredicate,
  isWithinAlertBounds,
} from "@/lib/search/alert-bounds";

const AUSTIN = { minLat: 30.1, maxLat: 30.4, minLng: -97.9, maxLng: -97.5 };
// minLng > maxLng: a box straddling the 180th meridian (Fiji-ish).
const ANTIMERIDIAN = { minLat: -18.5, maxLat: -17.5, minLng: 177, maxLng: -179 };

describe("boundsFromAlertFilters", () => {
  it("reads a complete viewport from flat filter keys", () => {
    expect(boundsFromAlertFilters({ ...AUSTIN, maxPrice: 900 })).toEqual(AUSTIN);
  });

  it("returns undefined when any edge is missing", () => {
    expect(
      boundsFromAlertFilters({ minLat: 30.1, maxLat: 30.4, minLng: -97.9 })
    ).toBeUndefined();
  });

  it("returns undefined for a filter set with no viewport", () => {
    expect(boundsFromAlertFilters({ maxPrice: 900 })).toBeUndefined();
  });
});

describe("buildBoundsPredicate", () => {
  it("emits one envelope in lng/lat/lng/lat order for a normal box", () => {
    const predicate = buildBoundsPredicate(AUSTIN);

    expect(predicate.values).toEqual([
      AUSTIN.minLng,
      AUSTIN.minLat,
      AUSTIN.maxLng,
      AUSTIN.maxLat,
    ]);
    expect(predicate.sql).toContain("ST_Intersects");
    expect(predicate.sql).toContain("ST_MakeEnvelope");
    // SRID is a literal, not a bind parameter.
    expect(predicate.sql).toContain("4326");
  });

  it("splits an antimeridian-crossing box into two envelopes", () => {
    const predicate = buildBoundsPredicate(ANTIMERIDIAN);

    // Eastern envelope runs minLng -> 180, western runs -180 -> maxLng.
    expect(predicate.values).toEqual([
      ANTIMERIDIAN.minLng,
      ANTIMERIDIAN.minLat,
      ANTIMERIDIAN.maxLat,
      ANTIMERIDIAN.minLat,
      ANTIMERIDIAN.maxLng,
      ANTIMERIDIAN.maxLat,
    ]);
    expect(predicate.sql).toContain(" OR ");
    expect(predicate.sql).toContain("180");
    expect(predicate.sql).toContain("-180");
  });

  it("binds coordinates as parameters rather than inlining them", () => {
    const predicate = buildBoundsPredicate(AUSTIN);

    expect(predicate.sql).not.toContain("30.1");
    expect(predicate.sql).not.toContain("-97.9");
  });
});

describe("isWithinAlertBounds", () => {
  it("accepts a point inside the box", () => {
    expect(isWithinAlertBounds({ lat: 30.2672, lng: -97.7431 }, AUSTIN)).toBe(
      true
    );
  });

  it("rejects a point outside the box", () => {
    expect(isWithinAlertBounds({ lat: 47.6062, lng: -122.3321 }, AUSTIN)).toBe(
      false
    );
  });

  it("is inclusive on the edges, matching ST_Intersects", () => {
    expect(isWithinAlertBounds({ lat: 30.1, lng: -97.9 }, AUSTIN)).toBe(true);
    expect(isWithinAlertBounds({ lat: 30.4, lng: -97.5 }, AUSTIN)).toBe(true);
  });

  it("rejects missing or non-finite coordinates", () => {
    expect(isWithinAlertBounds({}, AUSTIN)).toBe(false);
    expect(isWithinAlertBounds({ lat: null, lng: null }, AUSTIN)).toBe(false);
    expect(isWithinAlertBounds({ lat: Number.NaN, lng: -97.7 }, AUSTIN)).toBe(
      false
    );
  });

  it("rejects null island so unset coordinates never match", () => {
    expect(
      isWithinAlertBounds({ lat: 0, lng: 0 }, {
        minLat: -1,
        maxLat: 1,
        minLng: -1,
        maxLng: 1,
      })
    ).toBe(false);
  });

  it("handles an antimeridian-crossing box on both sides", () => {
    expect(isWithinAlertBounds({ lat: -18, lng: 179 }, ANTIMERIDIAN)).toBe(true);
    expect(isWithinAlertBounds({ lat: -18, lng: -179.5 }, ANTIMERIDIAN)).toBe(
      true
    );
    // Longitude in the excluded middle of the world.
    expect(isWithinAlertBounds({ lat: -18, lng: 0 }, ANTIMERIDIAN)).toBe(false);
  });
});
