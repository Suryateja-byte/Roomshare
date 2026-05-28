/**
 * @jest-environment node
 */

jest.mock("server-only", () => ({}));

const mockFetchWithTimeout = jest.fn();

jest.mock("@/lib/fetch-with-timeout", () => {
  class FetchTimeoutError extends Error {}

  return {
    FetchTimeoutError,
    fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
  };
});

jest.mock("@/lib/logger", () => ({
  logger: {
    sync: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    },
  },
}));

import { searchMapboxDestinations } from "@/lib/geocoding/mapbox";

describe("Mapbox public destination adapter", () => {
  const originalToken = process.env.MAPBOX_ACCESS_TOKEN;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.MAPBOX_ACCESS_TOKEN = "test-mapbox-token";
  });

  afterEach(() => {
    if (originalToken === undefined) {
      delete process.env.MAPBOX_ACCESS_TOKEN;
    } else {
      process.env.MAPBOX_ACCESS_TOKEN = originalToken;
    }
  });

  it("maps coarse city/neighborhood results and filters exact addresses", async () => {
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        type: "FeatureCollection",
        features: [
          {
            id: "address.1",
            geometry: { type: "Point", coordinates: [-96.9432, 32.8765] },
            properties: {
              mapbox_id: "address.1",
              name: "123 Main St",
              full_address: "123 Main St, Irving, Texas 75039, United States",
              place_formatted: "Irving, Texas, United States",
              feature_type: "address",
            },
          },
          {
            id: "place.1",
            bbox: [-97.1, 32.7, -96.8, 32.9],
            geometry: { type: "Point", coordinates: [-96.9489, 32.814] },
            properties: {
              mapbox_id: "place.1",
              name: "Irving",
              full_address: "Irving, Texas, United States",
              place_formatted: "Texas, United States",
              feature_type: "place",
            },
          },
        ],
      }),
    });

    const results = await searchMapboxDestinations("irving", { limit: 5 });

    expect(results).toEqual([
      expect.objectContaining({
        id: "mapbox:place.1",
        provider: "mapbox",
        place_name: "Irving, Texas, United States",
        center: [-96.9489, 32.814],
        place_type: ["place"],
        requires_resolution: false,
      }),
    ]);
    expect(JSON.stringify(results)).not.toContain("123 Main St");

    const requestedUrl = mockFetchWithTimeout.mock.calls[0][0] as string;
    expect(requestedUrl).toContain("country=us");
    expect(decodeURIComponent(requestedUrl)).toContain(
      "types=place,locality,neighborhood,district,region"
    );
  });
});
