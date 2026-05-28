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

const mockWithRateLimit = jest.fn();
const mockResolveDestination = jest.fn();

jest.mock("@/lib/env", () => ({
  features: {
    googlePlacesPublic: true,
  },
}));

jest.mock("@/lib/with-rate-limit", () => ({
  withRateLimit: (...args: unknown[]) => mockWithRateLimit(...args),
}));

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
    resolveDestination: (...args: unknown[]) => mockResolveDestination(...args),
  };
});

import { GET } from "@/app/api/geocoding/place-details/route";
import { features } from "@/lib/env";

const mockedFeatures = features as {
  googlePlacesPublic: boolean;
};

describe("/api/geocoding/place-details", () => {
  const requestFor = (queryString: string) =>
    new Request(`http://localhost/api/geocoding/place-details?${queryString}`);

  beforeEach(() => {
    jest.clearAllMocks();
    mockedFeatures.googlePlacesPublic = true;
    mockWithRateLimit.mockResolvedValue(null);
    mockResolveDestination.mockResolvedValue({
      id: "google:ChIJIrving",
      place_id: "ChIJIrving",
      provider: "google",
      place_name: "Irving, TX, USA",
      primary_text: "Irving",
      secondary_text: "TX, USA",
      center: [-96.9489, 32.814],
      bbox: [-97.03, 32.75, -96.86, 32.9],
      place_type: ["place"],
      requires_resolution: false,
    });
  });

  it("resolves a selected destination to coordinates for the search contract", async () => {
    const response = await GET(
      requestFor("placeId=ChIJIrving&sessionToken=session_123")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.result).toEqual(
      expect.objectContaining({
        place_name: "Irving, TX, USA",
        center: [-96.9489, 32.814],
        bbox: [-97.03, 32.75, -96.86, 32.9],
      })
    );
    expect(mockResolveDestination).toHaveBeenCalledWith("ChIJIrving", {
      sessionToken: "session_123",
    });
  });

  it("rejects missing place ids", async () => {
    const response = await GET(requestFor("sessionToken=session_123"));
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload).toEqual({ code: "INVALID_QUERY" });
    expect(mockResolveDestination).not.toHaveBeenCalled();
  });

  it("does not resolve Google place ids when public Google fallback is disabled", async () => {
    mockedFeatures.googlePlacesPublic = false;

    const response = await GET(requestFor("placeId=ChIJIrving"));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toEqual({ code: "UNAVAILABLE" });
    expect(mockResolveDestination).not.toHaveBeenCalled();
  });
});
