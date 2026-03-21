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
      country: overrides.country,
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
    const feature = makeFeature({
      osm_id: 12345,
      osm_type: "N",
      type: "city",
      name: "Austin",
      city: "Austin",
      state: "Texas",
      country: "United States",
      extent: [-97.9, 30.1, -97.5, 30.5],
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
  it("uses name only when only name is present", async () => {
    mockFetchWithTimeout.mockResolvedValue(
      makeResponse([makeFeature({ name: "Central Park" })])
    );

    const [result] = await searchPhoton("park");

    expect(result.place_name).toBe("Central Park");
  });

  it("formats street with housenumber when name is absent", async () => {
    mockFetchWithTimeout.mockResolvedValue(
      makeResponse([makeFeature({ street: "Main St", housenumber: "123" })])
    );

    const [result] = await searchPhoton("main");

    expect(result.place_name).toBe("123 Main St");
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
    mockFetchWithTimeout.mockResolvedValue(makeResponse([makeFeature({})]));

    const [result] = await searchPhoton("?");

    expect(result.place_name).toBe("Unknown location");
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
  it("defaults to limit=5 in the query string", async () => {
    mockFetchWithTimeout.mockResolvedValue(makeResponse([]));

    await searchPhoton("austin");

    const [url] = mockFetchWithTimeout.mock.calls[0] as [string, unknown];
    expect(url).toContain("limit=5");
  });

  it("uses a custom limit when provided", async () => {
    mockFetchWithTimeout.mockResolvedValue(makeResponse([]));

    await searchPhoton("austin", { limit: 10 });

    const [url] = mockFetchWithTimeout.mock.calls[0] as [string, unknown];
    expect(url).toContain("limit=10");
  });

  it("URL-encodes the query string", async () => {
    mockFetchWithTimeout.mockResolvedValue(makeResponse([]));

    await searchPhoton("New York City");

    const [url] = mockFetchWithTimeout.mock.calls[0] as [string, unknown];
    expect(url).toContain("q=New%20York%20City");
  });
});
