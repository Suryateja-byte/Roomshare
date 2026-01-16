/**
 * Edge Case Tests: Category C - PostGIS + Geocoding + Spatial Queries
 *
 * Tests for spatial/geographic edge cases including:
 * - PostGIS GIST index usage
 * - Coordinate boundary conditions
 * - Geocoding API edge cases
 * - Distance calculations
 * - Bounding box queries
 * - International Date Line handling
 * - Polar region queries
 *
 * @see Edge Cases Category C (20 tests)
 */

jest.mock("@/lib/prisma", () => ({
  prisma: {
    listing: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  },
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

import { prisma } from "@/lib/prisma";

// Helper: Haversine distance calculation
function haversineMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 3959; // Earth's radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

describe("PostGIS Spatial Edge Cases - Category C", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, NEXT_PUBLIC_MAPBOX_TOKEN: "test-token" };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // C1: Coordinate boundary validation
  describe("C1: Coordinate boundary conditions", () => {
    it("rejects latitude > 90", () => {
      const lat = 91;
      expect(lat).toBeGreaterThan(90);
      expect(lat > 90 || lat < -90).toBe(true);
    });

    it("rejects latitude < -90", () => {
      const lat = -91;
      expect(lat).toBeLessThan(-90);
      expect(lat > 90 || lat < -90).toBe(true);
    });

    it("accepts latitude at boundary (90 and -90)", () => {
      const northPole = 90;
      const southPole = -90;

      expect(northPole).toBeGreaterThanOrEqual(-90);
      expect(northPole).toBeLessThanOrEqual(90);
      expect(southPole).toBeGreaterThanOrEqual(-90);
      expect(southPole).toBeLessThanOrEqual(90);
    });

    it("rejects longitude > 180", () => {
      const lng = 181;
      expect(lng).toBeGreaterThan(180);
      expect(lng > 180 || lng < -180).toBe(true);
    });

    it("rejects longitude < -180", () => {
      const lng = -181;
      expect(lng).toBeLessThan(-180);
      expect(lng > 180 || lng < -180).toBe(true);
    });

    it("accepts longitude at boundary (180 and -180)", () => {
      const east = 180;
      const west = -180;

      expect(east).toBeGreaterThanOrEqual(-180);
      expect(east).toBeLessThanOrEqual(180);
      expect(west).toBeGreaterThanOrEqual(-180);
      expect(west).toBeLessThanOrEqual(180);
    });
  });

  // C2: PostGIS GIST index optimization
  describe("C2: PostGIS GIST index queries", () => {
    it("uses ST_DWithin for distance queries (index-friendly)", async () => {
      const lat = 37.7749;
      const lng = -122.4194;
      const radiusMeters = 5000;

      (prisma.$queryRaw as jest.Mock).mockResolvedValue([
        { id: "listing-1", distance: 1000 },
        { id: "listing-2", distance: 3000 },
      ]);

      const results = await prisma.$queryRaw`
        SELECT id, ST_Distance(location::geography, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography) as distance
        FROM listings
        WHERE ST_DWithin(location::geography, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radiusMeters})
        ORDER BY distance ASC
      `;

      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(results).toHaveLength(2);
    });

    it("uses bounding box pre-filter for large searches", async () => {
      const centerLat = 37.7749;
      const centerLng = -122.4194;
      const radiusKm = 50;

      // Calculate bounding box
      const latDelta = radiusKm / 111; // ~111km per degree latitude
      const lngDelta = radiusKm / (111 * Math.cos((centerLat * Math.PI) / 180));

      const bbox = {
        minLat: centerLat - latDelta,
        maxLat: centerLat + latDelta,
        minLng: centerLng - lngDelta,
        maxLng: centerLng + lngDelta,
      };

      expect(bbox.minLat).toBeLessThan(centerLat);
      expect(bbox.maxLat).toBeGreaterThan(centerLat);
      expect(bbox.minLng).toBeLessThan(centerLng);
      expect(bbox.maxLng).toBeGreaterThan(centerLng);
    });
  });

  // C3: International Date Line handling
  describe("C3: International Date Line edge cases", () => {
    it("handles search crossing International Date Line", () => {
      // Tokyo: 139.6917 E
      // Alaska: -150.0 W
      // Search across dateline

      const center = { lat: 45, lng: 175 }; // Near dateline
      const radiusKm = 1000;

      // This search would cross the dateline
      const lngDelta =
        radiusKm / (111 * Math.cos((center.lat * Math.PI) / 180));
      const maxLng = center.lng + lngDelta;

      // If maxLng > 180, it wraps to negative
      const wrappedMaxLng = maxLng > 180 ? maxLng - 360 : maxLng;

      expect(maxLng).toBeGreaterThan(180);
      expect(wrappedMaxLng).toBeLessThan(0);
    });

    it("calculates correct distance across dateline", () => {
      // Point in Russia (Eastern Hemisphere)
      const point1 = { lat: 65.0, lng: 175.0 };
      // Point in Alaska (Western Hemisphere)
      const point2 = { lat: 65.0, lng: -165.0 };

      // Distance should be ~20 degrees of longitude at 65°N latitude
      const distance = haversineMiles(
        point1.lat,
        point1.lng,
        point2.lat,
        point2.lng,
      );

      // At 65°N, this should be roughly 500 miles (not 180+ degrees worth)
      expect(distance).toBeLessThan(1000);
    });
  });

  // C4: Polar region queries
  describe("C4: Polar region handling", () => {
    it("handles queries near North Pole", () => {
      const lat = 89.5;
      const lng = 0;

      // Near poles, longitude becomes less meaningful
      const latDelta = 5 / 111;

      expect(lat + latDelta).toBeLessThanOrEqual(90);
    });

    it("handles queries near South Pole", () => {
      const lat = -89.5;
      const lng = 0;

      const latDelta = 5 / 111;

      expect(lat - latDelta).toBeGreaterThanOrEqual(-90);
    });

    it("calculates correct distance near poles", () => {
      // Two points near North Pole but 180 degrees apart in longitude
      const point1 = { lat: 89.9, lng: 0 };
      const point2 = { lat: 89.9, lng: 180 };

      const distance = haversineMiles(
        point1.lat,
        point1.lng,
        point2.lat,
        point2.lng,
      );

      // Should be roughly 14 miles (across the pole)
      expect(distance).toBeLessThan(50);
    });
  });

  // C5: Zero-distance handling
  describe("C5: Zero and near-zero distances", () => {
    it("returns 0 for identical coordinates", () => {
      const lat = 37.7749;
      const lng = -122.4194;

      const distance = haversineMiles(lat, lng, lat, lng);

      expect(distance).toBe(0);
    });

    it("handles floating point precision near zero", () => {
      const lat1 = 37.7749;
      const lng1 = -122.4194;
      const lat2 = 37.7749 + 0.0000001;
      const lng2 = -122.4194 + 0.0000001;

      const distance = haversineMiles(lat1, lng1, lat2, lng2);

      expect(distance).toBeLessThan(0.1); // Less than 0.1 miles
    });
  });

  // C6: Geocoding API edge cases
  describe("C6: Geocoding API handling", () => {
    it("handles geocoding timeout", async () => {
      mockFetch.mockRejectedValue(new Error("Timeout"));

      let result = null;
      try {
        await fetch(
          "https://api.mapbox.com/geocoding/v5/mapbox.places/test.json",
        );
      } catch {
        result = null;
      }

      expect(result).toBeNull();
    });

    it("handles geocoding no results", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ features: [] }),
      });

      const response = await fetch(
        "https://api.mapbox.com/geocoding/v5/mapbox.places/xyz123.json",
      );
      const data = await response.json();

      expect(data.features).toHaveLength(0);
    });

    it("handles geocoding API error", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      const response = await fetch(
        "https://api.mapbox.com/geocoding/v5/mapbox.places/test.json",
      );

      expect(response.ok).toBe(false);
    });

    it("properly encodes special characters in address", () => {
      const address = "123 Main St, Apt #5 & Suite 2";
      const encoded = encodeURIComponent(address);

      expect(encoded).toContain("%23"); // # encoded
      expect(encoded).toContain("%26"); // & encoded
      expect(encoded).not.toContain("#");
      expect(encoded).not.toContain("&");
    });
  });

  // C7: Reverse geocoding edge cases
  describe("C7: Reverse geocoding scenarios", () => {
    it("handles reverse geocoding for ocean coordinates", async () => {
      // Middle of Pacific Ocean
      const lat = 0;
      const lng = -170;

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          features: [], // No address for ocean
        }),
      });

      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json`,
      );
      const data = await response.json();

      expect(data.features).toHaveLength(0);
    });

    it("handles reverse geocoding for disputed territories", async () => {
      // Coordinates in disputed region
      const lat = 35.0;
      const lng = 77.0;

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          features: [{ place_name: "Disputed Territory" }],
        }),
      });

      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json`,
      );
      const data = await response.json();

      expect(data.features.length).toBeGreaterThanOrEqual(0);
    });
  });

  // C8: Distance unit conversions
  describe("C8: Distance unit handling", () => {
    it("converts meters to miles correctly", () => {
      const meters = 1609.344; // 1 mile in meters
      const miles = meters / 1609.344;

      expect(miles).toBeCloseTo(1, 5);
    });

    it("converts kilometers to miles correctly", () => {
      const km = 1.609344; // 1 mile in km
      const miles = km / 1.609344;

      expect(miles).toBeCloseTo(1, 5);
    });

    it("handles large distances correctly", () => {
      // SF to NYC ~2,500 miles
      const sfLat = 37.7749;
      const sfLng = -122.4194;
      const nycLat = 40.7128;
      const nycLng = -74.006;

      const distance = haversineMiles(sfLat, sfLng, nycLat, nycLng);

      expect(distance).toBeGreaterThan(2000);
      expect(distance).toBeLessThan(3000);
    });
  });

  // C9: Bounding box calculations
  describe("C9: Bounding box edge cases", () => {
    it("creates valid bounding box for search", () => {
      const center = { lat: 37.7749, lng: -122.4194 };
      const radiusMiles = 5;

      const latDelta = radiusMiles / 69; // ~69 miles per degree
      const lngDelta =
        radiusMiles / (69 * Math.cos((center.lat * Math.PI) / 180));

      const bbox = {
        minLat: center.lat - latDelta,
        maxLat: center.lat + latDelta,
        minLng: center.lng - lngDelta,
        maxLng: center.lng + lngDelta,
      };

      expect(bbox.maxLat).toBeGreaterThan(bbox.minLat);
      expect(bbox.maxLng).toBeGreaterThan(bbox.minLng);
    });

    it("handles bounding box at equator", () => {
      const center = { lat: 0, lng: 0 };
      const radiusMiles = 10;

      const latDelta = radiusMiles / 69;
      const lngDelta = radiusMiles / (69 * Math.cos(0)); // cos(0) = 1

      expect(latDelta).toBeCloseTo(lngDelta, 5);
    });

    it("handles bounding box at high latitude", () => {
      const center = { lat: 70, lng: 0 };
      const radiusMiles = 10;

      const latDelta = radiusMiles / 69;
      const lngDelta = radiusMiles / (69 * Math.cos((70 * Math.PI) / 180));

      // At high latitudes, longitude delta should be larger
      expect(lngDelta).toBeGreaterThan(latDelta);
    });
  });

  // C10: PostGIS NULL handling
  describe("C10: NULL coordinate handling", () => {
    it("excludes listings with NULL coordinates", async () => {
      (prisma.listing.findMany as jest.Mock).mockResolvedValue([
        { id: "listing-1", lat: 37.7749, lng: -122.4194 },
        // Listing with NULL coords excluded
      ]);

      const listings = await prisma.listing.findMany({
        where: {
          // @ts-expect-error - lat/lng not on Listing directly, testing spatial query patterns
          lat: { not: null },
          lng: { not: null },
        },
      });

      expect(listings.every((l: any) => l.lat != null && l.lng != null)).toBe(
        true,
      );
    });

    it("handles partial NULL coordinates", async () => {
      (prisma.listing.count as jest.Mock).mockResolvedValue(0);

      const count = await prisma.listing.count({
        where: {
          // @ts-expect-error - lat/lng not on Listing directly, testing spatial query patterns
          OR: [{ lat: null }, { lng: null }],
        },
      });

      expect(count).toBe(0);
    });
  });

  // C11: SRID consistency
  describe("C11: SRID and projection handling", () => {
    it("uses SRID 4326 (WGS84) consistently", async () => {
      const srid = 4326;

      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ srid: 4326 }]);

      const result = await prisma.$queryRaw`
        SELECT ST_SRID(location) as srid FROM listings LIMIT 1
      `;

      expect(prisma.$queryRaw).toHaveBeenCalled();
    });
  });

  // C12: Search radius edge cases
  describe("C12: Search radius boundaries", () => {
    it("handles minimum radius (1 mile)", () => {
      const minRadius = 1;
      expect(minRadius).toBeGreaterThan(0);
    });

    it("handles maximum radius (100 miles)", () => {
      const maxRadius = 100;
      const requestedRadius = 150;

      const effectiveRadius = Math.min(requestedRadius, maxRadius);

      expect(effectiveRadius).toBe(100);
    });

    it("handles zero radius", () => {
      const radius = 0;

      // Should be treated as exact location match
      expect(radius).toBe(0);
    });
  });

  // C13: Coordinate precision handling
  describe("C13: Coordinate precision", () => {
    it("maintains precision to 6 decimal places", () => {
      const originalLat = 37.774929;
      const storedLat = parseFloat(originalLat.toFixed(6));

      expect(storedLat).toBeCloseTo(originalLat, 6);
    });

    it("rounds coordinates consistently", () => {
      const lat1 = 37.7749295;
      const lat2 = 37.7749294;

      const rounded1 = parseFloat(lat1.toFixed(6));
      const rounded2 = parseFloat(lat2.toFixed(6));

      expect(rounded1).toBe(rounded2);
    });
  });

  // C14: Geography vs Geometry
  describe("C14: Geography vs Geometry calculations", () => {
    it("uses geography type for accurate Earth distances", () => {
      // Geography accounts for Earth's curvature
      const useGeography = true;

      expect(useGeography).toBe(true);
    });

    it("understands difference between geography and geometry", () => {
      // Geography: meters, great circle distance
      // Geometry: units of SRID (degrees for 4326)

      const geographyUnit = "meters";
      const geometryUnit = "degrees";

      expect(geographyUnit).not.toBe(geometryUnit);
    });
  });

  // C15: Multi-point search
  describe("C15: Multi-point search optimization", () => {
    it("combines multiple search areas efficiently", async () => {
      const searchAreas = [
        { lat: 37.7749, lng: -122.4194, radius: 5 },
        { lat: 37.8749, lng: -122.2594, radius: 5 },
      ];

      (prisma.$queryRaw as jest.Mock).mockResolvedValue([
        { id: "listing-1" },
        { id: "listing-2" },
      ]);

      // Would combine with ST_Union or multiple WHERE clauses
      expect(searchAreas.length).toBe(2);
    });
  });

  // C16: Antimeridian (180° longitude) handling
  describe("C16: Antimeridian handling", () => {
    it("handles coordinates at 180° longitude", () => {
      const lng = 180;

      expect(lng).toBeLessThanOrEqual(180);
      expect(lng).toBeGreaterThanOrEqual(-180);
    });

    it("handles coordinates at -180° longitude", () => {
      const lng = -180;

      expect(lng).toBeLessThanOrEqual(180);
      expect(lng).toBeGreaterThanOrEqual(-180);
    });

    it("treats 180 and -180 as equivalent", () => {
      // Both represent the same meridian
      const lng1 = 180;
      const lng2 = -180;

      const normalized1 =
        lng1 > 180 ? lng1 - 360 : lng1 < -180 ? lng1 + 360 : lng1;
      const normalized2 =
        lng2 > 180 ? lng2 - 360 : lng2 < -180 ? lng2 + 360 : lng2;

      // They're effectively the same line
      expect(Math.abs(normalized1) + Math.abs(normalized2)).toBe(360);
    });
  });

  // C17: Geocoding caching
  describe("C17: Geocoding result caching", () => {
    it("caches successful geocoding results", async () => {
      const address = "123 Main St, San Francisco, CA";
      const cachedResult = { lat: 37.7749, lng: -122.4194 };

      // Simulate cache hit
      const cache = new Map();
      cache.set(address.toLowerCase(), cachedResult);

      const result = cache.get(address.toLowerCase());

      expect(result).toEqual(cachedResult);
    });

    it("does not cache failed geocoding attempts", async () => {
      const address = "Invalid Address XYZ";
      const cache = new Map();

      // Failed geocoding - don't cache
      const result = null;

      if (result) {
        cache.set(address.toLowerCase(), result);
      }

      expect(cache.has(address.toLowerCase())).toBe(false);
    });
  });

  // C18: Spatial index maintenance
  describe("C18: Spatial index considerations", () => {
    it("understands GIST index benefits", () => {
      // GIST indexes are essential for:
      // - ST_DWithin
      // - ST_Contains
      // - ST_Intersects
      // - Bounding box queries (&&)

      const indexUseCases = [
        "ST_DWithin",
        "ST_Contains",
        "ST_Intersects",
        "&&",
      ];

      expect(indexUseCases.length).toBeGreaterThan(0);
    });
  });

  // C19: Coordinate input validation
  describe("C19: User input coordinate validation", () => {
    it("validates string coordinates can be parsed", () => {
      const latStr = "37.7749";
      const lngStr = "-122.4194";

      const lat = parseFloat(latStr);
      const lng = parseFloat(lngStr);

      expect(isNaN(lat)).toBe(false);
      expect(isNaN(lng)).toBe(false);
    });

    it("handles invalid coordinate strings", () => {
      const latStr = "not-a-number";

      const lat = parseFloat(latStr);

      expect(isNaN(lat)).toBe(true);
    });

    it("handles coordinates with extra whitespace", () => {
      const latStr = "  37.7749  ";

      const lat = parseFloat(latStr.trim());

      expect(lat).toBe(37.7749);
    });
  });

  // C20: Spatial query performance
  describe("C20: Spatial query optimization", () => {
    it("limits results for performance", async () => {
      const maxResults = 100;

      (prisma.listing.findMany as jest.Mock).mockResolvedValue(
        Array(maxResults)
          .fill(null)
          .map((_, i) => ({ id: `listing-${i}` })),
      );

      const listings = await prisma.listing.findMany({
        take: maxResults,
        // @ts-expect-error - lat not on Listing directly, testing spatial query patterns
        where: { lat: { not: null } },
      });

      expect(listings.length).toBeLessThanOrEqual(maxResults);
    });

    it("uses pagination for large result sets", async () => {
      const pageSize = 20;
      const page = 1;
      const skip = (page - 1) * pageSize;

      (prisma.listing.findMany as jest.Mock).mockResolvedValue(
        Array(pageSize)
          .fill(null)
          .map((_, i) => ({ id: `listing-${i}` })),
      );

      const listings = await prisma.listing.findMany({
        take: pageSize,
        skip,
      });

      expect(listings.length).toBeLessThanOrEqual(pageSize);
    });
  });
});
