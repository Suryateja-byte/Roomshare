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

import {
  resolveDestination,
  suggestDestinations,
  validateAddressForPublish,
} from "@/lib/geocoding/google-places";

describe("Google Places geocoding adapter", () => {
  const originalApiKey = process.env.GOOGLE_PLACES_API_KEY;
  const originalAddressValidationEnabled =
    process.env.GOOGLE_ADDRESS_VALIDATION_ENABLED;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GOOGLE_PLACES_API_KEY = "test-google-key";
    process.env.GOOGLE_ADDRESS_VALIDATION_ENABLED = "true";
  });

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.GOOGLE_PLACES_API_KEY;
    } else {
      process.env.GOOGLE_PLACES_API_KEY = originalApiKey;
    }
    if (originalAddressValidationEnabled === undefined) {
      delete process.env.GOOGLE_ADDRESS_VALIDATION_ENABLED;
    } else {
      process.env.GOOGLE_ADDRESS_VALIDATION_ENABLED =
        originalAddressValidationEnabled;
    }
  });

  it("returns unresolved destination suggestions for Irving, TX", async () => {
    const response = {
      ok: true,
      json: async () => ({
        suggestions: [
          {
            placePrediction: {
              placeId: "ChIJIrving",
              text: { text: "Irving, TX, USA" },
              structuredFormat: {
                mainText: { text: "Irving" },
                secondaryText: { text: "TX, USA" },
              },
              types: ["locality", "political"],
            },
          },
        ],
      }),
    };
    mockFetchWithTimeout.mockResolvedValue(response);

    const results = await suggestDestinations("irving", {
      limit: 5,
      sessionToken: "session_123",
    });

    expect(results).toEqual([
      expect.objectContaining({
        id: "google:ChIJIrving",
        place_id: "ChIJIrving",
        place_name: "Irving, TX, USA",
        primary_text: "Irving",
        secondary_text: "TX, USA",
        place_type: ["place"],
        requires_resolution: true,
      }),
    ]);
    expect(results[0].center).toBeUndefined();
    expect(mockFetchWithTimeout).toHaveBeenCalledTimes(2);
  });

  it("uses Place Details Essentials fields without displayName", async () => {
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "ChIJIrving",
        formattedAddress: "Irving, TX, USA",
        location: {
          latitude: 32.814,
          longitude: -96.9489,
        },
        viewport: {
          low: { latitude: 32.7, longitude: -97.1 },
          high: { latitude: 32.9, longitude: -96.8 },
        },
        types: ["locality", "political"],
      }),
    });

    const result = await resolveDestination("ChIJIrving", {
      sessionToken: "session_123",
    });

    expect(result).toEqual(
      expect.objectContaining({
        id: "google:ChIJIrving",
        place_name: "Irving, TX, USA",
        center: [-96.9489, 32.814],
        requires_resolution: false,
      })
    );
    const requestInit = mockFetchWithTimeout.mock.calls[0][1] as {
      fieldMask: string;
    };
    expect(requestInit.fieldMask).toContain("formattedAddress");
    expect(requestInit.fieldMask).toContain("location");
    expect(requestInit.fieldMask).not.toContain("displayName");
  });

  it("accepts complete premise-level Address Validation results", async () => {
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: {
          verdict: {
            addressComplete: true,
            validationGranularity: "PREMISE",
            geocodeGranularity: "PREMISE",
            possibleNextAction: "ACCEPT",
          },
          address: {
            formattedAddress: "1555 Market St, San Francisco, CA 94103",
            postalAddress: {
              addressLines: ["1555 Market St"],
              locality: "San Francisco",
              administrativeArea: "CA",
              postalCode: "94103",
              regionCode: "US",
            },
          },
          geocode: {
            location: {
              latitude: 37.7749,
              longitude: -122.4194,
            },
          },
        },
      }),
    });

    const result = await validateAddressForPublish({
      address: "1555 Market St",
      city: "San Francisco",
      state: "CA",
      zip: "94103",
    });

    expect(result).toEqual({
      address: "1555 Market St",
      city: "San Francisco",
      state: "CA",
      zip: "94103",
      lat: 37.7749,
      lng: -122.4194,
      precision: "PREMISE",
    });
  });

  it("rejects route-level Address Validation results", async () => {
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: {
          verdict: {
            addressComplete: true,
            validationGranularity: "ROUTE",
            geocodeGranularity: "ROUTE",
            possibleNextAction: "ACCEPT",
          },
        },
      }),
    });

    await expect(
      validateAddressForPublish({
        address: "Market St",
        city: "San Francisco",
        state: "CA",
        zip: "94103",
      })
    ).resolves.toBeNull();
  });
});
