import {
  applySearchQueryChange,
  buildCanonicalSearchUrl,
  normalizeSearchQuery,
  serializeSearchQuery,
} from "@/lib/search/search-query";

describe("search-query", () => {
  it("normalizes array params, swaps invalid price ranges, and canonicalizes pagination", () => {
    const query = normalizeSearchQuery(
      new URLSearchParams(
        "amenities=Parking&amenities=Wifi&amenities=Parking&minPrice=1800&maxPrice=900&page=2&pageNumber=3"
      )
    );

    expect(query.amenities).toEqual(["Parking", "Wifi"]);
    expect(query.minPrice).toBe(900);
    expect(query.maxPrice).toBe(1800);
    expect(query.page).toBe(2);
    expect(query.cursor).toBeUndefined();

    const params = serializeSearchQuery(query);
    expect(params.getAll("amenities")).toEqual(["Parking", "Wifi"]);
    expect(params.get("minPrice")).toBe("900");
    expect(params.get("maxPrice")).toBe("1800");
    expect(params.get("page")).toBe("2");
    expect(params.get("pageNumber")).toBeNull();
  });

  it("requires lat and lng together and quantizes bounds", () => {
    const query = normalizeSearchQuery(
      new URLSearchParams(
        "lat=37.7749&minLat=37.70041&maxLat=37.85049&minLng=-122.50049&maxLng=-122.30051"
      )
    );

    expect(query.lat).toBeUndefined();
    expect(query.lng).toBeUndefined();
    expect(query.bounds).toEqual({
      minLat: 37.7,
      maxLat: 37.85,
      minLng: -122.5,
      maxLng: -122.301,
    });
  });

  it("preserves bounds for filter changes and clears pagination", () => {
    const current = normalizeSearchQuery(
      new URLSearchParams(
        "where=Austin&lat=30.2672&lng=-97.7431&minLat=30.1004&maxLat=30.4999&minLng=-97.9004&maxLng=-97.5001&cursor=abc"
      )
    );

    const next = applySearchQueryChange(current, "filter", {
      maxPrice: 1400,
      amenities: ["Wifi", "Parking"],
    });

    expect(next.maxPrice).toBe(1400);
    expect(next.amenities).toEqual(["Parking", "Wifi"]);
    expect(next.bounds).toEqual({
      minLat: 30.1,
      maxLat: 30.5,
      minLng: -97.9,
      maxLng: -97.5,
    });
    expect(next.lat).toBeCloseTo(30.2672);
    expect(next.lng).toBeCloseTo(-97.7431);
    expect(next.cursor).toBeUndefined();
    expect(next.page).toBeUndefined();
  });

  it("replaces bounds and clears point coordinates on map-pan changes", () => {
    const current = normalizeSearchQuery(
      new URLSearchParams(
        "where=Austin&lat=30.2672&lng=-97.7431&minLat=30.1&maxLat=30.5&minLng=-97.9&maxLng=-97.5"
      )
    );

    const next = applySearchQueryChange(current, "map-pan", {
      bounds: {
        minLat: 30.2,
        maxLat: 30.4,
        minLng: -97.8,
        maxLng: -97.6,
      },
    });

    expect(next.lat).toBeUndefined();
    expect(next.lng).toBeUndefined();
    expect(next.bounds).toEqual({
      minLat: 30.2,
      maxLat: 30.4,
      minLng: -97.8,
      maxLng: -97.6,
    });
  });

  it("builds canonical URLs without default sort noise", () => {
    const url = buildCanonicalSearchUrl(
      normalizeSearchQuery(
        new URLSearchParams(
          "sort=recommended&where=San Francisco&what=quiet roommates&amenities=Wifi&amenities=Parking"
        )
      ),
      { includePagination: false }
    );

    expect(url).toBe(
      "/search?amenities=Parking&amenities=Wifi&what=quiet+roommates&where=San+Francisco"
    );
  });
});
