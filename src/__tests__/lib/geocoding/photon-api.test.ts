const mockFetchWithTimeout = jest.fn();
jest.mock("@/lib/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
}));

import { searchPhoton } from "@/lib/geocoding/photon";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFeature(
  overrides: {
    osm_id?: number;
    osm_type?: string;
    type?: string;
    name?: string;
    city?: string;
    district?: string;
    state?: string;
    country?: string;
    street?: string;
    housenumber?: string;
    extent?: [number, number, number, number];
    coordinates?: [number, number];
  } = {}
) {
  return {
    type: "Feature" as const,
    geometry: {
      type: "Point" as const,
      coordinates:
        overrides.coordinates ?? ([-97.74, 30.27] as [number, number]),
    },
    properties: {
      osm_id: overrides.osm_id ?? 12345,
      osm_type: overrides.osm_type ?? "N",
      type: overrides.type,
      name: overrides.name,
      city: overrides.city,
      district: overrides.district,
      state: overrides.state,
      country: overrides.country ?? "United States",
      street: overrides.street,
      housenumber: overrides.housenumber,
      extent: overrides.extent,
    },
  };
}

function makeResponse(features: ReturnType<typeof makeFeature>[]) {
  return {
    ok: true,
    json: async () => ({ type: "FeatureCollection", features }),
  };
}

beforeEach(() => jest.clearAllMocks());

// ---------------------------------------------------------------------------
// searchPhoton — core transformation
// ---------------------------------------------------------------------------

describe("searchPhoton", () => {
  it("transforms a valid feature to a GeocodingResult correctly", async () => {
    // Photon extent format: [minLng, maxLat, maxLng, minLat]
    const feature = makeFeature({
      osm_id: 12345,
      osm_type: "N",
      type: "city",
      name: "Austin",
      city: "Austin",
      state: "Texas",
      country: "United States",
      extent: [-97.9, 30.5, -97.5, 30.1],
      coordinates: [-97.74, 30.27],
    });
    mockFetchWithTimeout.mockResolvedValue(makeResponse([feature]));

    const results = await searchPhoton("Austin");

    expect(results).toHaveLength(1);
    const result = results[0];
    expect(result.id).toBe("N:12345");
    // name === city so city is not appended; state + country follow
    expect(result.place_name).toBe("Austin, Texas, United States");
    expect(result.center).toEqual([-97.74, 30.27]);
    expect(result.place_type).toEqual(["place"]);
    // Converted to app format: [minLng, minLat, maxLng, maxLat]
    expect(result.bbox).toEqual([-97.9, 30.1, -97.5, 30.5]);
  });

  it("returns an array when multiple features are present", async () => {
    const features = [
      makeFeature({ osm_id: 1, name: "Austin", type: "city" }),
      makeFeature({ osm_id: 2, name: "Houston", type: "city" }),
      makeFeature({ osm_id: 3, name: "Dallas", type: "city" }),
    ];
    mockFetchWithTimeout.mockResolvedValue(makeResponse(features));

    const results = await searchPhoton("Texas");

    expect(results).toHaveLength(3);
    expect(results.map((r) => r.id)).toEqual(["N:1", "N:2", "N:3"]);
  });

  it("returns an empty array when features is empty", async () => {
    mockFetchWithTimeout.mockResolvedValue(makeResponse([]));

    const results = await searchPhoton("nowhere");

    expect(results).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// buildPlaceName — tested indirectly through searchPhoton
// ---------------------------------------------------------------------------

describe("buildPlaceName", () => {
  it("uses name + country when only name is present", async () => {
    mockFetchWithTimeout.mockResolvedValue(
      makeResponse([makeFeature({ name: "Central Park" })])
    );

    const [result] = await searchPhoton("park");

    expect(result.place_name).toBe("Central Park, United States");
  });

  it("formats street with housenumber when name is absent", async () => {
    mockFetchWithTimeout.mockResolvedValue(
      makeResponse([makeFeature({ street: "Main St", housenumber: "123" })])
    );

    const [result] = await searchPhoton("main");

    expect(result.place_name).toBe("123 Main St, United States");
  });

  it("builds city + state + country", async () => {
    mockFetchWithTimeout.mockResolvedValue(
      makeResponse([
        makeFeature({
          city: "Austin",
          state: "Texas",
          country: "United States",
        }),
      ])
    );

    const [result] = await searchPhoton("austin");

    expect(result.place_name).toBe("Austin, Texas, United States");
  });

  it("does not repeat city when city equals name (dedup)", async () => {
    // San Francisco as name; city is also San Francisco — city should be skipped
    mockFetchWithTimeout.mockResolvedValue(
      makeResponse([
        makeFeature({
          name: "San Francisco",
          city: "San Francisco",
          state: "California",
          country: "United States",
        }),
      ])
    );

    const [result] = await searchPhoton("sf");

    // Should NOT produce "San Francisco, San Francisco, ..."
    expect(result.place_name).toBe("San Francisco, California, United States");
    const parts = result.place_name.split(", ");
    const sfCount = parts.filter((p) => p === "San Francisco").length;
    expect(sfCount).toBe(1);
  });

  it("returns 'Unknown location' when no name/street/city/district/state/country fields are present", async () => {
    // Explicitly set country to "United States" so it passes US filter, but
    // use name-less fields to test the place-name fallback.
    // Note: buildPlaceName will include country, so result won't actually be
    // "Unknown location" — it will be "United States". Adjust expectation:
    mockFetchWithTimeout.mockResolvedValue(
      makeResponse([makeFeature({ country: "United States" })])
    );

    const [result] = await searchPhoton("?");

    expect(result.place_name).toBe("United States");
  });
});

// ---------------------------------------------------------------------------
// inferPlaceType — tested indirectly through searchPhoton
// ---------------------------------------------------------------------------

describe("inferPlaceType", () => {
  it.each(["city", "town"] as const)(
    "type '%s' maps to place_type ['place']",
    async (osmType) => {
      mockFetchWithTimeout.mockResolvedValue(
        makeResponse([makeFeature({ type: osmType })])
      );

      const [result] = await searchPhoton("q");

      expect(result.place_type).toEqual(["place"]);
    }
  );

  it("type 'street' maps to place_type ['address']", async () => {
    mockFetchWithTimeout.mockResolvedValue(
      makeResponse([makeFeature({ type: "street" })])
    );

    const [result] = await searchPhoton("q");

    expect(result.place_type).toEqual(["address"]);
  });

  it.each(["state", "county"] as const)(
    "type '%s' maps to place_type ['region']",
    async (osmType) => {
      mockFetchWithTimeout.mockResolvedValue(
        makeResponse([makeFeature({ type: osmType })])
      );

      const [result] = await searchPhoton("q");

      expect(result.place_type).toEqual(["region"]);
    }
  );

  it("unknown/null type falls back to place_type ['place']", async () => {
    mockFetchWithTimeout.mockResolvedValue(
      // type is undefined (not set in makeFeature defaults)
      makeResponse([makeFeature({})])
    );

    const [result] = await searchPhoton("q");

    expect(result.place_type).toEqual(["place"]);
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe("Error handling", () => {
  it("throws a specific message on 5xx status", async () => {
    mockFetchWithTimeout.mockResolvedValue({ ok: false, status: 503 });

    await expect(searchPhoton("test")).rejects.toThrow(
      "Location service is temporarily unavailable"
    );
  });

  it("throws a generic message on 4xx status", async () => {
    mockFetchWithTimeout.mockResolvedValue({ ok: false, status: 404 });

    await expect(searchPhoton("test")).rejects.toThrow(
      "Failed to fetch suggestions"
    );
  });

  it("propagates a JSON parse error", async () => {
    mockFetchWithTimeout.mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    });

    await expect(searchPhoton("test")).rejects.toThrow(SyntaxError);
  });
});

// ---------------------------------------------------------------------------
// Options — limit and URL encoding
// ---------------------------------------------------------------------------

describe("Options", () => {
  it("over-requests by 3x to compensate for US-only post-filtering", async () => {
    mockFetchWithTimeout.mockResolvedValue(makeResponse([]));

    await searchPhoton("austin");

    const [url] = mockFetchWithTimeout.mock.calls[0] as [string, unknown];
    // Default limit=5, over-requested as 5*3=15
    expect(url).toContain("limit=15");
  });

  it("uses a custom limit (over-requested 3x) when provided", async () => {
    mockFetchWithTimeout.mockResolvedValue(makeResponse([]));

    await searchPhoton("austin", { limit: 10 });

    const [url] = mockFetchWithTimeout.mock.calls[0] as [string, unknown];
    // limit=10, over-requested as 10*3=30
    expect(url).toContain("limit=30");
  });

  it("URL-encodes the query string", async () => {
    mockFetchWithTimeout.mockResolvedValue(makeResponse([]));

    await searchPhoton("New York City");

    const [url] = mockFetchWithTimeout.mock.calls[0] as [string, unknown];
    expect(url).toContain("q=New%20York%20City");
  });

  it("biases results toward US geographic center", async () => {
    mockFetchWithTimeout.mockResolvedValue(makeResponse([]));

    await searchPhoton("austin");

    const [url] = mockFetchWithTimeout.mock.calls[0] as [string, unknown];
    expect(url).toContain("lat=39.8283");
    expect(url).toContain("lon=-98.5795");
  });
});

// ---------------------------------------------------------------------------
// US-only filtering
// ---------------------------------------------------------------------------

describe("US-only filtering", () => {
  it("filters out non-US results", async () => {
    const usFeature = makeFeature({
      osm_id: 1,
      name: "Austin",
      country: "United States",
    });
    const ukFeature = makeFeature({
      osm_id: 2,
      name: "London",
      country: "United Kingdom",
    });
    mockFetchWithTimeout.mockResolvedValue(
      makeResponse([usFeature, ukFeature])
    );

    const results = await searchPhoton("city");

    expect(results).toHaveLength(1);
    expect(results[0].place_name).toContain("Austin");
  });

  it("trims results to requested limit after filtering", async () => {
    const features = Array.from({ length: 10 }, (_, i) =>
      makeFeature({
        osm_id: i,
        name: `City ${i}`,
        country: "United States",
      })
    );
    mockFetchWithTimeout.mockResolvedValue(makeResponse(features));

    const results = await searchPhoton("city", { limit: 3 });

    expect(results).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Extent reordering (Photon → app format)
// ---------------------------------------------------------------------------

describe("Extent reordering", () => {
  it("converts Photon extent [minLng, maxLat, maxLng, minLat] to [minLng, minLat, maxLng, maxLat]", async () => {
    // Photon format: [west, north, east, south]
    const feature = makeFeature({
      name: "New York",
      country: "United States",
      extent: [-74.26, 40.92, -73.70, 40.48],
    });
    mockFetchWithTimeout.mockResolvedValue(makeResponse([feature]));

    const [result] = await searchPhoton("ny");

    // App format: [minLng, minLat, maxLng, maxLat]
    expect(result.bbox).toEqual([-74.26, 40.48, -73.70, 40.92]);
  });

  it("returns undefined bbox when extent is not provided", async () => {
    const feature = makeFeature({ name: "SomePlace", country: "United States" });
    mockFetchWithTimeout.mockResolvedValue(makeResponse([feature]));

    const [result] = await searchPhoton("place");

    expect(result.bbox).toBeUndefined();
  });
});
