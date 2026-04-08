/**
 * @jest-environment node
 */

const mockSearchPhoton = jest.fn();
const mockGetCachedResults = jest.fn();
const mockSetCachedResults = jest.fn();

jest.mock("@/lib/geocoding/photon", () => ({
  searchPhoton: (...args: unknown[]) => mockSearchPhoton(...args),
}));

jest.mock("@/lib/geocoding-cache", () => ({
  getCachedResults: (...args: unknown[]) => mockGetCachedResults(...args),
  setCachedResults: (...args: unknown[]) => mockSetCachedResults(...args),
}));

import { GET } from "@/app/api/geocoding/autocomplete/route";
import { FetchTimeoutError } from "@/lib/fetch-with-timeout";

describe("/api/geocoding/autocomplete", () => {
  const requestFor = (queryString: string) =>
    new Request(`http://localhost/api/geocoding/autocomplete?${queryString}`);

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCachedResults.mockResolvedValue(null);
    mockSetCachedResults.mockResolvedValue(undefined);
  });

  it("returns cached results without calling Photon", async () => {
    mockGetCachedResults.mockResolvedValueOnce([
      {
        id: "cached:1",
        place_name: "Chicago, IL, USA",
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
          place_name: "Chicago, IL, USA",
          center: [-87.6298, 41.8781],
          place_type: ["place"],
        },
      ],
    });
    expect(mockSearchPhoton).not.toHaveBeenCalled();
  });

  it("returns 422 for invalid queries", async () => {
    const response = await GET(requestFor("q=%20"));
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload).toEqual({ code: "INVALID_QUERY" });
    expect(mockSearchPhoton).not.toHaveBeenCalled();
  });

  it("calls Photon with the sanitized query and caches the result", async () => {
    const results = [
      {
        id: "photon:1",
        place_name: "Austin, TX, USA",
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
    expect(mockSetCachedResults).toHaveBeenCalledWith("Austin", results);
  });

  it("maps upstream timeouts to 504 without exposing raw details", async () => {
    mockSearchPhoton.mockRejectedValueOnce(
      new FetchTimeoutError("https://photon.example?q=Irving", 8000)
    );

    const response = await GET(requestFor("q=Irving"));
    const payload = await response.json();

    expect(response.status).toBe(504);
    expect(payload).toEqual({ code: "TIMEOUT" });
    expect(JSON.stringify(payload)).not.toContain("photon.example");
  });

  it("maps upstream failures to 503 without exposing raw errors", async () => {
    mockSearchPhoton.mockRejectedValueOnce(new Error("Failed to fetch"));

    const response = await GET(requestFor("q=Irving"));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toEqual({ code: "UNAVAILABLE" });
    expect(JSON.stringify(payload)).not.toContain("Failed to fetch");
  });
});
