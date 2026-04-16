import {
  applySearchQueryChange,
  buildCanonicalSearchUrl,
  buildSeoCanonicalSearchUrl,
  normalizeSearchQuery,
  serializeSearchQuery,
} from "@/lib/search/search-query";

describe("search-query", () => {
  it("normalizes array params, drops invalid price ranges, and canonicalizes pagination", () => {
    const query = normalizeSearchQuery(
      new URLSearchParams(
        "amenities=Parking&amenities=Wifi&amenities=Parking&minPrice=1800&maxPrice=900&page=2&pageNumber=3"
      )
    );

    expect(query.amenities).toEqual(["Parking", "Wifi"]);
    expect(query.minPrice).toBeUndefined();
    expect(query.maxPrice).toBeUndefined();
    expect(query.page).toBe(2);
    expect(query.cursor).toBeUndefined();

    const params = serializeSearchQuery(query);
    expect(params.getAll("amenities")).toEqual(["Parking", "Wifi"]);
    expect(params.has("minPrice")).toBe(false);
    expect(params.has("maxPrice")).toBe(false);
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

  it("allows filter patches to clear array params explicitly", () => {
    const current = normalizeSearchQuery(
      new URLSearchParams(
        "amenities=Wifi&amenities=Parking&houseRules=Pets%20allowed&languages=en&languages=es"
      )
    );

    const next = applySearchQueryChange(current, "filter", {
      amenities: undefined,
      houseRules: [],
      languages: undefined,
    });

    expect(next.amenities).toBeUndefined();
    expect(next.houseRules).toBeUndefined();
    expect(next.languages).toBeUndefined();
    expect(serializeSearchQuery(next).toString()).toBe("");
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

  it("preserves explicit endDate values through normalization and serialization", () => {
    const query = normalizeSearchQuery(
      new URLSearchParams("moveInDate=2026-05-01&endDate=2026-06-01")
    );

    expect(query.moveInDate).toBe("2026-05-01");
    expect(query.endDate).toBe("2026-06-01");

    const params = serializeSearchQuery(query);
    expect(params.get("moveInDate")).toBe("2026-05-01");
    expect(params.get("endDate")).toBe("2026-06-01");

    expect(buildCanonicalSearchUrl(query, { includePagination: false })).toBe(
      "/search?endDate=2026-06-01&moveInDate=2026-05-01"
    );
  });

  it("normalizes inbound startDate aliases back to canonical search params", () => {
    const query = normalizeSearchQuery(
      new URLSearchParams("startDate=2026-05-01&endDate=2026-06-01")
    );

    expect(query.moveInDate).toBe("2026-05-01");
    expect(query.endDate).toBe("2026-06-01");

    expect(buildCanonicalSearchUrl(query, { includePagination: false })).toBe(
      "/search?endDate=2026-06-01&moveInDate=2026-05-01"
    );
  });

  it("normalizes structural booking mode aliases in query serialization", () => {
    const query = normalizeSearchQuery(
      new URLSearchParams("bookingMode=PER_SLOT&minSlots=2")
    );

    expect(query.bookingMode).toBe("SHARED");

    expect(buildCanonicalSearchUrl(query, { includePagination: false })).toBe(
      "/search?bookingMode=SHARED&minSlots=2"
    );
  });

  it("drops deprecated booking-only values from canonical URLs", () => {
    const query = normalizeSearchQuery(
      new URLSearchParams("bookingMode=INSTANT&minSlots=2")
    );

    expect(query.bookingMode).toBeUndefined();

    expect(buildCanonicalSearchUrl(query, { includePagination: false })).toBe(
      "/search?minSlots=2"
    );
  });

  it("drops malformed manual price ranges during serialization to match parser semantics", () => {
    const params = serializeSearchQuery({
      minPrice: 1800,
      maxPrice: 900,
    });

    expect(params.has("minPrice")).toBe(false);
    expect(params.has("maxPrice")).toBe(false);
  });

  it("drops orphan endDate values from canonical search URLs", () => {
    const query = normalizeSearchQuery(
      new URLSearchParams("endDate=2026-06-01")
    );

    expect(query.moveInDate).toBeUndefined();
    expect(query.endDate).toBeUndefined();

    expect(buildCanonicalSearchUrl(query, { includePagination: false })).toBe(
      "/search"
    );
  });

  describe("buildSeoCanonicalSearchUrl", () => {
    it("returns bare /search for an empty query", () => {
      const url = buildSeoCanonicalSearchUrl(
        normalizeSearchQuery(new URLSearchParams(""))
      );
      expect(url).toBe("/search");
    });

    it("keeps only the q param when present", () => {
      const url = buildSeoCanonicalSearchUrl(
        normalizeSearchQuery(new URLSearchParams("q=San+Francisco"))
      );
      expect(url).toBe("/search?q=San+Francisco");
    });

    it("strips filter, sort, and pagination params (SEO-04 contract)", () => {
      // Mirrors tests/e2e/seo/search-seo-meta.anon.spec.ts:166
      const url = buildSeoCanonicalSearchUrl(
        normalizeSearchQuery(
          new URLSearchParams(
            "q=LA&minPrice=500&maxPrice=2000&roomType=Private Room&amenities=Wifi&amenities=Parking&sort=price_asc&cursor=abc123"
          )
        )
      );
      expect(url).toBe("/search?q=LA");
    });

    it("returns /search when only filter params are present without q", () => {
      const url = buildSeoCanonicalSearchUrl(
        normalizeSearchQuery(
          new URLSearchParams("minPrice=500&roomType=Private Room")
        )
      );
      expect(url).toBe("/search");
    });
  });
});
