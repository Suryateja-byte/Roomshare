/**
 * @jest-environment node
 */

jest.mock("next/server", () => ({
  NextResponse: {
    json: (
      data: unknown,
      init?: { status?: number; headers?: Record<string, string> }
    ) => {
      const headers = new Map<string, string>();
      if (init?.headers) {
        for (const [key, value] of Object.entries(init.headers)) {
          headers.set(key, value);
        }
      }

      return {
        status: init?.status || 200,
        json: async () => data,
        headers: {
          get: (key: string) => headers.get(key),
          set: (key: string, value: string) => headers.set(key, value),
        },
      };
    },
  },
}));

const mockSearchPhoton = jest.fn();
const mockSearchPublicAutocomplete = jest.fn();
const mockGetCachedResults = jest.fn();
const mockSetCachedResults = jest.fn();
const mockWithRateLimit = jest.fn();
const mockGetPublicCacheStatePayload = jest.fn();
const mockSuggestDestinations = jest.fn();
const mockSearchLocalDestinationIndex = jest.fn();
const mockSearchMapboxDestinations = jest.fn();
const mockIsProviderMonthlyCapReached = jest.fn();
const mockRecordGeocodingProviderSkipped = jest.fn();

jest.mock("@/lib/env", () => ({
  features: {
    publicAutocompleteContract: false,
    googlePlacesPublic: false,
    mapboxGeocoding: false,
  },
}));

jest.mock("@/lib/geocoding/photon", () => ({
  searchPhoton: (...args: unknown[]) => mockSearchPhoton(...args),
}));

jest.mock("@/lib/geocoding/public-autocomplete", () => {
  const actual = jest.requireActual("@/lib/geocoding/public-autocomplete");
  return {
    ...actual,
    searchPublicAutocomplete: (...args: unknown[]) =>
      mockSearchPublicAutocomplete(...args),
  };
});

jest.mock("@/lib/geocoding/local-destination-index", () => ({
  searchLocalDestinationIndex: (...args: unknown[]) =>
    mockSearchLocalDestinationIndex(...args),
}));

jest.mock("@/lib/geocoding/mapbox", () => {
  class MapboxGeocodingUnavailableError extends Error {
    constructor(
      message: string,
      public readonly code: "MISSING_KEY" | "TIMEOUT" | "UPSTREAM"
    ) {
      super(message);
    }
  }

  return {
    MapboxGeocodingUnavailableError,
    searchMapboxDestinations: (...args: unknown[]) =>
      mockSearchMapboxDestinations(...args),
  };
});

jest.mock("@/lib/geocoding/google-places", () => {
  class GooglePlacesUnavailableError extends Error {
    constructor(
      message: string,
      public readonly code: "MISSING_KEY" | "TIMEOUT" | "UPSTREAM"
    ) {
      super(message);
    }
  }

  return {
    GooglePlacesUnavailableError,
    suggestDestinations: (...args: unknown[]) =>
      mockSuggestDestinations(...args),
  };
});

jest.mock("@/lib/geocoding-cache", () => ({
  getCachedResults: (...args: unknown[]) => mockGetCachedResults(...args),
  setCachedResults: (...args: unknown[]) => mockSetCachedResults(...args),
}));

jest.mock("@/lib/geocoding/provider-cost-controls", () => ({
  isProviderMonthlyCapReached: (...args: unknown[]) =>
    mockIsProviderMonthlyCapReached(...args),
  recordGeocodingProviderSkipped: (...args: unknown[]) =>
    mockRecordGeocodingProviderSkipped(...args),
}));

jest.mock("@/lib/with-rate-limit", () => ({
  withRateLimit: (...args: unknown[]) => mockWithRateLimit(...args),
}));

jest.mock("@/lib/public-cache/state", () => ({
  getPublicCacheStatePayload: (...args: unknown[]) =>
    mockGetPublicCacheStatePayload(...args),
}));

jest.mock("@/lib/geocoding/public-autocomplete-telemetry", () => ({
  recordPublicAutocompleteRequest: jest.fn(),
  recordPublicAutocompleteFallbackUsed: jest.fn(),
}));

import { GET } from "@/app/api/geocoding/autocomplete/route";
import { FetchTimeoutError } from "@/lib/fetch-with-timeout";
import { features } from "@/lib/env";

const mockedFeatures = features as {
  publicAutocompleteContract: boolean;
  googlePlacesPublic: boolean;
  mapboxGeocoding: boolean;
};

describe("/api/geocoding/autocomplete", () => {
  const requestFor = (queryString: string) =>
    new Request(`http://localhost/api/geocoding/autocomplete?${queryString}`);
  const originalPublicLocationProvider = process.env.PUBLIC_LOCATION_PROVIDER;
  const originalMapboxMonthlyCap =
    process.env.MAPBOX_PUBLIC_AUTOCOMPLETE_MONTHLY_CAP;
  const originalGoogleMonthlyCap =
    process.env.GOOGLE_PUBLIC_AUTOCOMPLETE_MONTHLY_CAP;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedFeatures.publicAutocompleteContract = false;
    mockedFeatures.googlePlacesPublic = false;
    mockedFeatures.mapboxGeocoding = false;
    delete process.env.PUBLIC_LOCATION_PROVIDER;
    delete process.env.MAPBOX_PUBLIC_AUTOCOMPLETE_MONTHLY_CAP;
    delete process.env.GOOGLE_PUBLIC_AUTOCOMPLETE_MONTHLY_CAP;
    mockSearchLocalDestinationIndex.mockReturnValue([]);
    mockSearchMapboxDestinations.mockResolvedValue([]);
    mockIsProviderMonthlyCapReached.mockResolvedValue(false);
    mockGetCachedResults.mockResolvedValue(null);
    mockSetCachedResults.mockResolvedValue(undefined);
    mockWithRateLimit.mockResolvedValue(null);
    mockGetPublicCacheStatePayload.mockResolvedValue({
      cacheFloorToken: "v1:test",
      generatedAt: "2026-04-22T00:00:00.000Z",
    });
  });

  afterEach(() => {
    if (originalPublicLocationProvider === undefined) {
      delete process.env.PUBLIC_LOCATION_PROVIDER;
    } else {
      process.env.PUBLIC_LOCATION_PROVIDER = originalPublicLocationProvider;
    }
    if (originalMapboxMonthlyCap === undefined) {
      delete process.env.MAPBOX_PUBLIC_AUTOCOMPLETE_MONTHLY_CAP;
    } else {
      process.env.MAPBOX_PUBLIC_AUTOCOMPLETE_MONTHLY_CAP =
        originalMapboxMonthlyCap;
    }
    if (originalGoogleMonthlyCap === undefined) {
      delete process.env.GOOGLE_PUBLIC_AUTOCOMPLETE_MONTHLY_CAP;
    } else {
      process.env.GOOGLE_PUBLIC_AUTOCOMPLETE_MONTHLY_CAP =
        originalGoogleMonthlyCap;
    }
  });

  it("returns local destination results before cache or paid providers", async () => {
    const results = [
      {
        id: "local:place:irving-tx",
        provider: "local",
        place_name: "Irving, TX",
        center: [-96.9489, 32.814],
        place_type: ["place"],
        requires_resolution: false,
      },
    ];
    mockSearchLocalDestinationIndex.mockReturnValueOnce(results);

    const response = await GET(requestFor("q=irving"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ results });
    expect(mockSearchLocalDestinationIndex).toHaveBeenCalledWith("irving", {
      limit: 5,
    });
    expect(mockGetCachedResults).not.toHaveBeenCalled();
    expect(mockSearchMapboxDestinations).not.toHaveBeenCalled();
    expect(mockSuggestDestinations).not.toHaveBeenCalled();
    expect(mockSearchPhoton).not.toHaveBeenCalled();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns 422 for invalid queries", async () => {
    const response = await GET(requestFor("q=%20"));
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload).toEqual({ code: "INVALID_QUERY" });
    expect(mockSearchPhoton).not.toHaveBeenCalled();
  });

  it("calls Mapbox fallback with the sanitized query and does not cache temporary results", async () => {
    mockedFeatures.mapboxGeocoding = true;
    const results = [
      {
        id: "mapbox:place.123",
        provider: "mapbox",
        place_name: "Austin, TX",
        center: [-97.7431, 30.2672],
        place_type: ["place"],
      },
    ];
    mockSearchMapboxDestinations.mockResolvedValueOnce(results);

    const response = await GET(requestFor("q=%20Austin%20&limit=20"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ results });
    expect(mockSearchMapboxDestinations).toHaveBeenCalledWith("Austin", {
      limit: 10,
    });
    expect(mockSetCachedResults).not.toHaveBeenCalled();
    expect(mockSearchPhoton).not.toHaveBeenCalled();
    expect(mockSearchPublicAutocomplete).not.toHaveBeenCalled();
  });

  it("blocks address-like public queries from external fallback providers", async () => {
    process.env.PUBLIC_LOCATION_PROVIDER = "photon";

    const response = await GET(requestFor("q=123%20Main%20St"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ results: [] });
    expect(mockSearchPhoton).not.toHaveBeenCalled();
    expect(mockSearchMapboxDestinations).not.toHaveBeenCalled();
    expect(mockSuggestDestinations).not.toHaveBeenCalled();
    expect(JSON.stringify(payload)).not.toContain("123 Main St");
  });

  it("uses Google only when explicitly configured as a public fallback", async () => {
    process.env.PUBLIC_LOCATION_PROVIDER = "google";
    mockedFeatures.googlePlacesPublic = true;
    const results = [
      {
        id: "google:ChIJIrving",
        place_id: "ChIJIrving",
        provider: "google",
        place_name: "Irving, TX, USA",
        primary_text: "Irving",
        secondary_text: "TX, USA",
        place_type: ["place"],
        requires_resolution: true,
      },
    ];
    mockSuggestDestinations.mockResolvedValueOnce(results);

    const response = await GET(requestFor("q=irving&sessionToken=session_123"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ results });
    expect(mockSuggestDestinations).toHaveBeenCalledWith("irving", {
      limit: 5,
      sessionToken: "session_123",
    });
    expect(mockGetCachedResults).not.toHaveBeenCalled();
    expect(mockSearchPhoton).not.toHaveBeenCalled();
    expect(mockSearchPublicAutocomplete).not.toHaveBeenCalled();
  });

  it("uses the public autocomplete reader and cache floor token when the feature flag is on", async () => {
    mockedFeatures.publicAutocompleteContract = true;
    const results = [
      {
        id: "public:1",
        place_name: "Austin, TX",
        center: [-97.74, 30.27],
        place_type: ["place"],
        bbox: [-97.745, 30.265, -97.735, 30.275],
      },
    ];
    mockSearchPublicAutocomplete.mockResolvedValueOnce(results);

    const response = await GET(requestFor("q=Austin"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ results });
    expect(mockGetPublicCacheStatePayload).toHaveBeenCalled();
    expect(mockGetCachedResults).toHaveBeenCalledWith("Austin", {
      cacheVersion: "public:v1:test",
      ttlSeconds: 15 * 60,
    });
    expect(mockSearchPublicAutocomplete).toHaveBeenCalledWith("Austin", {
      limit: 5,
    });
    expect(mockSetCachedResults).toHaveBeenCalledWith("Austin", results, {
      cacheVersion: "public:v1:test",
      ttlSeconds: 15 * 60,
    });
    expect(mockSearchPhoton).not.toHaveBeenCalled();
  });

  it("maps upstream timeouts to 504 without exposing raw details on the legacy path", async () => {
    process.env.PUBLIC_LOCATION_PROVIDER = "photon";
    mockSearchPhoton.mockRejectedValueOnce(
      new FetchTimeoutError("https://photon.example?q=Irving", 8000)
    );

    const response = await GET(requestFor("q=Irving"));
    const payload = await response.json();

    expect(response.status).toBe(504);
    expect(payload).toEqual({ code: "TIMEOUT" });
    expect(JSON.stringify(payload)).not.toContain("photon.example");
  });

  it("degrades public-reader failures to an empty response without calling Photon", async () => {
    mockedFeatures.publicAutocompleteContract = true;
    mockSearchPublicAutocomplete.mockRejectedValueOnce(new Error("db down"));

    const response = await GET(requestFor("q=Irving"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ results: [] });
    expect(mockSearchPhoton).not.toHaveBeenCalled();
  });
});
