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

jest.mock("@/lib/env", () => ({
  features: {
    publicAutocompleteContract: false,
  },
}));

jest.mock("@/lib/geocoding/photon", () => ({
  searchPhoton: (...args: unknown[]) => mockSearchPhoton(...args),
}));

jest.mock("@/lib/geocoding/public-autocomplete", () => ({
  searchPublicAutocomplete: (...args: unknown[]) =>
    mockSearchPublicAutocomplete(...args),
}));

jest.mock("@/lib/geocoding-cache", () => ({
  getCachedResults: (...args: unknown[]) => mockGetCachedResults(...args),
  setCachedResults: (...args: unknown[]) => mockSetCachedResults(...args),
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
}));

import { GET } from "@/app/api/geocoding/autocomplete/route";
import { FetchTimeoutError } from "@/lib/fetch-with-timeout";
import { features } from "@/lib/env";

const mockedFeatures = features as {
  publicAutocompleteContract: boolean;
};

describe("/api/geocoding/autocomplete", () => {
  const requestFor = (queryString: string) =>
    new Request(`http://localhost/api/geocoding/autocomplete?${queryString}`);

  beforeEach(() => {
    jest.clearAllMocks();
    mockedFeatures.publicAutocompleteContract = false;
    mockGetCachedResults.mockResolvedValue(null);
    mockSetCachedResults.mockResolvedValue(undefined);
    mockWithRateLimit.mockResolvedValue(null);
    mockGetPublicCacheStatePayload.mockResolvedValue({
      cacheFloorToken: "v1:test",
      generatedAt: "2026-04-22T00:00:00.000Z",
    });
  });

  it("returns cached results without calling Photon on the legacy path", async () => {
    mockGetCachedResults.mockResolvedValueOnce([
      {
        id: "cached:1",
        place_name: "Chicago, IL",
        center: [-87.6298, 41.8781],
        place_type: ["place"],
      },
    ]);

    const response = await GET(requestFor("q=Chicago"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      results: [
        {
          id: "cached:1",
          place_name: "Chicago, IL",
          center: [-87.6298, 41.8781],
          place_type: ["place"],
        },
      ],
    });
    expect(mockSearchPhoton).not.toHaveBeenCalled();
    expect(mockSearchPublicAutocomplete).not.toHaveBeenCalled();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns 422 for invalid queries", async () => {
    const response = await GET(requestFor("q=%20"));
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload).toEqual({ code: "INVALID_QUERY" });
    expect(mockSearchPhoton).not.toHaveBeenCalled();
  });

  it("calls Photon with the sanitized query and caches the result on the legacy path", async () => {
    const results = [
      {
        id: "photon:1",
        place_name: "Austin, TX",
        center: [-97.7431, 30.2672],
        place_type: ["place"],
      },
    ];
    mockSearchPhoton.mockResolvedValueOnce(results);

    const response = await GET(requestFor("q=%20Austin%20&limit=20"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ results });
    expect(mockSearchPhoton).toHaveBeenCalledWith("Austin", { limit: 10 });
    expect(mockSetCachedResults).toHaveBeenCalledWith("Austin", results, undefined);
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
    mockSearchPhoton.mockRejectedValueOnce(
      new FetchTimeoutError("https://photon.example?q=Irving", 8000)
    );

    const response = await GET(requestFor("q=Irving"));
    const payload = await response.json();

    expect(response.status).toBe(504);
    expect(payload).toEqual({ code: "TIMEOUT" });
    expect(JSON.stringify(payload)).not.toContain("photon.example");
  });

  it("maps public-reader failures to 503 without calling Photon", async () => {
    mockedFeatures.publicAutocompleteContract = true;
    mockSearchPublicAutocomplete.mockRejectedValueOnce(new Error("db down"));

    const response = await GET(requestFor("q=Irving"));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toEqual({ code: "UNAVAILABLE" });
    expect(mockSearchPhoton).not.toHaveBeenCalled();
  });
});
