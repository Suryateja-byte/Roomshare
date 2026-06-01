import { resolveTypedSearchLocation } from "@/lib/search/typed-location-resolver";

const mockFetch = jest.fn();

describe("resolveTypedSearchLocation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
  });

  it("returns a selected location from the first autocomplete result", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            id: "local:place:seattle-wa",
            place_name: "Seattle, WA",
            center: [-122.3321, 47.6062],
            bbox: [-122.5121, 47.4262, -122.1521, 47.7862],
            place_type: ["place"],
            requires_resolution: false,
          },
        ],
      }),
    });

    await expect(resolveTypedSearchLocation(" Seattle ")).resolves.toEqual({
      label: "Seattle, WA",
      selection: {
        lat: 47.6062,
        lng: -122.3321,
        bounds: [-122.5121, 47.4262, -122.1521, 47.7862],
      },
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe(
      "/api/geocoding/autocomplete?q=Seattle&limit=1"
    );
  });

  it("derives bounds when autocomplete returns only a center point", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            id: "local:place:seattle-wa",
            place_name: "Seattle, WA",
            center: [-122.3321, 47.6062],
            place_type: ["place"],
            requires_resolution: false,
          },
        ],
      }),
    });

    const result = await resolveTypedSearchLocation("Seattle");

    expect(result?.label).toBe("Seattle, WA");
    expect(result?.selection.lat).toBe(47.6062);
    expect(result?.selection.lng).toBe(-122.3321);
    expect(result?.selection.bounds).toEqual(expect.any(Array));
  });

  it("resolves place details when the autocomplete suggestion requires it", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              id: "google:ChIJSeattle",
              place_id: "ChIJSeattle",
              provider: "google",
              place_name: "Seattle, WA",
              place_type: ["place"],
              requires_resolution: true,
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            id: "google:ChIJSeattle",
            place_id: "ChIJSeattle",
            provider: "google",
            place_name: "Seattle, WA",
            center: [-122.3321, 47.6062],
            bbox: [-122.5121, 47.4262, -122.1521, 47.7862],
            place_type: ["place"],
            requires_resolution: false,
          },
        }),
      });

    await expect(resolveTypedSearchLocation("Seattle")).resolves.toEqual({
      label: "Seattle, WA",
      selection: {
        lat: 47.6062,
        lng: -122.3321,
        bounds: [-122.5121, 47.4262, -122.1521, 47.7862],
      },
    });

    expect(mockFetch.mock.calls[1][0]).toContain(
      "/api/geocoding/place-details?placeId=ChIJSeattle"
    );
  });

  it("returns null for invalid, empty, or unavailable autocomplete results", async () => {
    await expect(resolveTypedSearchLocation(" ")).resolves.toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });

    await expect(resolveTypedSearchLocation("Atlantis")).resolves.toBeNull();
  });
});
