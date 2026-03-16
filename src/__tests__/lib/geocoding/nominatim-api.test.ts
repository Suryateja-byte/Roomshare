const mockFetchWithTimeout = jest.fn();
jest.mock("@/lib/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
}));

import {
  forwardGeocode,
  reverseGeocode,
  searchBoundary,
} from "@/lib/geocoding/nominatim";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSearchResult(
  overrides: Partial<{
    lat: string;
    lon: string;
    display_name: string;
    boundingbox: [string, string, string, string];
    geojson: GeoJSON.Geometry;
  }> = {},
) {
  return {
    place_id: 1,
    osm_type: "relation",
    osm_id: 12345,
    lat: overrides.lat ?? "30.267",
    lon: overrides.lon ?? "-97.743",
    display_name: overrides.display_name ?? "Austin, Travis County, Texas, United States",
    boundingbox: overrides.boundingbox ?? (["30.1", "30.5", "-97.9", "-97.5"] as [string, string, string, string]),
    geojson: overrides.geojson,
  };
}

function makeSearchResponse(results: ReturnType<typeof makeSearchResult>[]) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => results,
  };
}

function makeReverseResult(overrides: Partial<{ display_name: string }> = {}) {
  return {
    place_id: 1,
    osm_type: "way",
    osm_id: 9999,
    lat: "30.267",
    lon: "-97.743",
    display_name: overrides.display_name ?? "Austin, Travis County, Texas, United States",
  };
}

function makeReverseResponse(result: ReturnType<typeof makeReverseResult>) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => result,
  };
}

function makeErrorResponse(status: number, statusText: string) {
  return {
    ok: false,
    status,
    statusText,
    json: async () => ({ error: statusText }),
  };
}

beforeEach(() => jest.clearAllMocks());

// ---------------------------------------------------------------------------
// forwardGeocode
// ---------------------------------------------------------------------------

describe("forwardGeocode", () => {
  it("parses string lat/lon from Nominatim response as floats", async () => {
    mockFetchWithTimeout.mockResolvedValue(
      makeSearchResponse([makeSearchResult({ lat: "30.267153", lon: "-97.743061" })]),
    );

    const result = await forwardGeocode("Austin, TX");

    expect(result).not.toBeNull();
    expect(result!.lat).toBe(30.267153);
    expect(result!.lng).toBe(-97.743061);
    // Verify they are numbers, not strings
    expect(typeof result!.lat).toBe("number");
    expect(typeof result!.lng).toBe("number");
  });

  it("returns null when results array is empty", async () => {
    mockFetchWithTimeout.mockResolvedValue(makeSearchResponse([]));

    const result = await forwardGeocode("Nonexistent Place XYZ");

    expect(result).toBeNull();
  });

  it("throws an error with status code and statusText on non-200 response", async () => {
    mockFetchWithTimeout.mockResolvedValue(makeErrorResponse(429, "Too Many Requests"));

    await expect(forwardGeocode("Austin")).rejects.toThrow(
      "Nominatim search failed: 429 Too Many Requests",
    );
  });

  it("sends the correct User-Agent header on every request", async () => {
    mockFetchWithTimeout.mockResolvedValue(
      makeSearchResponse([makeSearchResult()]),
    );

    await forwardGeocode("Austin");

    const [, options] = mockFetchWithTimeout.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(options.headers["User-Agent"]).toBe("Roomshare/1.0 (contact@roomshare.app)");
  });

  it("URL-encodes the query parameter", async () => {
    mockFetchWithTimeout.mockResolvedValue(
      makeSearchResponse([makeSearchResult()]),
    );

    await forwardGeocode("New York City");

    const [url] = mockFetchWithTimeout.mock.calls[0] as [string, unknown];
    expect(url).toContain("q=New%20York%20City");
  });
});

// ---------------------------------------------------------------------------
// reverseGeocode
// ---------------------------------------------------------------------------

describe("reverseGeocode", () => {
  it("returns display_name string for valid coordinates", async () => {
    mockFetchWithTimeout.mockResolvedValue(
      makeReverseResponse(makeReverseResult({ display_name: "Austin, Travis County, Texas, United States" })),
    );

    const result = await reverseGeocode(30.267, -97.743);

    expect(result).toBe("Austin, Travis County, Texas, United States");
  });

  it("returns null when display_name is missing from response", async () => {
    mockFetchWithTimeout.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        place_id: 1,
        osm_type: "way",
        osm_id: 9999,
        lat: "30.267",
        lon: "-97.743",
        // display_name intentionally absent
      }),
    });

    const result = await reverseGeocode(30.267, -97.743);

    expect(result).toBeNull();
  });

  it("returns null (does not throw) on non-200 status", async () => {
    mockFetchWithTimeout.mockResolvedValue(makeErrorResponse(503, "Service Unavailable"));

    // reverseGeocode silently returns null on errors — different from forwardGeocode
    const result = await reverseGeocode(30.267, -97.743);

    expect(result).toBeNull();
  });

  it("sends the correct User-Agent header", async () => {
    mockFetchWithTimeout.mockResolvedValue(
      makeReverseResponse(makeReverseResult()),
    );

    await reverseGeocode(37.77, -122.41);

    const [, options] = mockFetchWithTimeout.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(options.headers["User-Agent"]).toBe("Roomshare/1.0 (contact@roomshare.app)");
  });
});

// ---------------------------------------------------------------------------
// searchBoundary
// ---------------------------------------------------------------------------

describe("searchBoundary", () => {
  it("returns geometry when geojson is present in the result", async () => {
    const polygon: GeoJSON.Geometry = {
      type: "Polygon",
      coordinates: [[[-97.9, 30.1], [-97.5, 30.1], [-97.5, 30.5], [-97.9, 30.5], [-97.9, 30.1]]],
    };

    mockFetchWithTimeout.mockResolvedValue(
      makeSearchResponse([makeSearchResult({ geojson: polygon })]),
    );

    const result = await searchBoundary("Austin, TX");

    expect(result).not.toBeNull();
    expect(result!.geometry).toEqual(polygon);
    expect(result!.displayName).toBe("Austin, Travis County, Texas, United States");
  });

  it("converts Nominatim boundingbox [minLat, maxLat, minLon, maxLon] to GeoJSON [minLng, minLat, maxLng, maxLat]", async () => {
    // Nominatim order: [south, north, west, east] as strings
    mockFetchWithTimeout.mockResolvedValue(
      makeSearchResponse([
        makeSearchResult({
          boundingbox: ["30.1", "30.5", "-97.9", "-97.5"],
          geojson: undefined,
        }),
      ]),
    );

    const result = await searchBoundary("Austin, TX");

    expect(result).not.toBeNull();
    // GeoJSON order: [minLng, minLat, maxLng, maxLat]
    expect(result!.bbox).toEqual([-97.9, 30.1, -97.5, 30.5]);
  });

  it("falls back to bbox when geojson is absent", async () => {
    mockFetchWithTimeout.mockResolvedValue(
      makeSearchResponse([
        makeSearchResult({
          geojson: undefined,
          boundingbox: ["30.1", "30.5", "-97.9", "-97.5"],
        }),
      ]),
    );

    const result = await searchBoundary("Austin, TX");

    expect(result).not.toBeNull();
    expect(result!.geometry).toBeNull();
    expect(result!.bbox).not.toBeNull();
  });

  it("returns null when results array is empty", async () => {
    mockFetchWithTimeout.mockResolvedValue(makeSearchResponse([]));

    const result = await searchBoundary("Nonexistent Place XYZ");

    expect(result).toBeNull();
  });

  it("returns null (does not throw) on non-200 status", async () => {
    mockFetchWithTimeout.mockResolvedValue(makeErrorResponse(503, "Service Unavailable"));

    const result = await searchBoundary("Austin");

    expect(result).toBeNull();
  });

  it("parses bbox string values to numbers correctly", async () => {
    mockFetchWithTimeout.mockResolvedValue(
      makeSearchResponse([
        makeSearchResult({
          boundingbox: ["51.2867602", "51.6918741", "-0.5103751", "0.3340155"],
        }),
      ]),
    );

    const result = await searchBoundary("London");

    expect(result).not.toBeNull();
    const [minLng, minLat, maxLng, maxLat] = result!.bbox!;
    expect(typeof minLng).toBe("number");
    expect(typeof minLat).toBe("number");
    expect(typeof maxLng).toBe("number");
    expect(typeof maxLat).toBe("number");
    // Nominatim: [minLat, maxLat, minLon, maxLon] = ["51.28", "51.69", "-0.51", "0.33"]
    // GeoJSON:   [minLng, minLat, maxLng, maxLat] = [-0.51,  51.28,  0.33,  51.69]
    expect(minLng).toBeCloseTo(-0.5103751);
    expect(minLat).toBeCloseTo(51.2867602);
    expect(maxLng).toBeCloseTo(0.3340155);
    expect(maxLat).toBeCloseTo(51.6918741);
  });
});

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

describe("Rate limiting", () => {
  it("first call proceeds immediately (no delay)", async () => {
    // Use isolateModules to get a fresh module with lastRequestTimestamp = 0
    let isolatedForwardGeocode!: typeof forwardGeocode;

    jest.isolateModules(() => {
      const mod = jest.requireActual<typeof import("@/lib/geocoding/nominatim")>(
        "@/lib/geocoding/nominatim",
      );
      isolatedForwardGeocode = mod.forwardGeocode;
    });

    mockFetchWithTimeout.mockResolvedValue(
      makeSearchResponse([makeSearchResult()]),
    );

    const start = Date.now();
    await isolatedForwardGeocode("Austin");
    const elapsed = Date.now() - start;

    // First call: no rate-limit delay — should complete well under 1100ms
    expect(elapsed).toBeLessThan(500);
  });

  it("rapid sequential calls are delayed by >1100ms gap between requests", async () => {
    jest.useFakeTimers();

    try {
      mockFetchWithTimeout.mockResolvedValue(
        makeSearchResponse([makeSearchResult()]),
      );

      // First call (no delay)
      const p1 = forwardGeocode("Austin");
      // Advance time enough for the first fetch to settle but before rate limit expires
      jest.advanceTimersByTime(0);
      await Promise.resolve(); // flush microtasks

      // Second call — should wait for the rate limit window
      const p2 = forwardGeocode("Houston");
      jest.advanceTimersByTime(1100);

      await Promise.all([p1, p2]);

      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it("rate limiter resets between isolated module instantiations", async () => {
    let freshForwardGeocode!: typeof forwardGeocode;

    jest.isolateModules(() => {
      // Each isolateModules call gets its own module scope with lastRequestTimestamp = 0
      const mod = jest.requireActual<typeof import("@/lib/geocoding/nominatim")>(
        "@/lib/geocoding/nominatim",
      );
      freshForwardGeocode = mod.forwardGeocode;
    });

    mockFetchWithTimeout.mockResolvedValue(
      makeSearchResponse([makeSearchResult()]),
    );

    // The isolated module starts with lastRequestTimestamp = 0 so the first
    // call should never block even if the shared module has made recent calls.
    const start = Date.now();
    await freshForwardGeocode("Denver");
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(500);
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe("Error handling", () => {
  it("propagates JSON parse error from malformed response", async () => {
    mockFetchWithTimeout.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => {
        throw new SyntaxError("Unexpected token < in JSON at position 0");
      },
    });

    await expect(forwardGeocode("Austin")).rejects.toThrow(SyntaxError);
  });

  it("propagates network errors", async () => {
    mockFetchWithTimeout.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(forwardGeocode("Austin")).rejects.toThrow("Failed to fetch");
  });
});
