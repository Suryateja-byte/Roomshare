import {
  buildSearchIntentParams,
  readSearchIntentState,
} from "@/lib/search/search-intent";

describe("search-intent helpers", () => {
  it("reads summary state for a plain location search", () => {
    const state = readSearchIntentState(
      new URLSearchParams("where=Chicago&sort=recommended")
    );

    expect(state.locationInput).toBe("Chicago");
    expect(state.locationSummary).toBe("Chicago");
    expect(state.vibeInput).toBe("");
    expect(state.vibeSummary).toBe("Any vibe");
    expect(state.selectedLocation).toBeNull();
  });

  it("reads a semantic vibe query with preserved selected area", () => {
    const state = readSearchIntentState(
      new URLSearchParams(
        "where=San%20Francisco&what=quiet%20roommates&lat=37.7749&lng=-122.4194&minLng=-122.6&minLat=37.6&maxLng=-122.2&maxLat=37.9"
      )
    );

    expect(state.locationInput).toBe("San Francisco");
    expect(state.locationSummary).toBe("San Francisco");
    expect(state.vibeInput).toBe("quiet roommates");
    expect(state.vibeSummary).toBe("quiet roommates");
    expect(state.selectedLocation).toEqual({
      lat: 37.7749,
      lng: -122.4194,
      bounds: [-122.6, 37.6, -122.2, 37.9],
    });
  });

  it("builds a search intent query while preserving sort and clearing pagination", () => {
    const params = buildSearchIntentParams(
      new URLSearchParams("sort=recommended&page=2&cursor=abc&amenities=Wifi"),
      {
        location: "San Francisco",
        vibe: "quiet roommates",
        selectedLocation: {
          lat: 37.7749,
          lng: -122.4194,
          bounds: [-122.6, 37.6, -122.2, 37.9],
        },
      }
    );

    expect(params.get("sort")).toBeNull();
    expect(params.get("amenities")).toBe("Wifi");
    expect(params.get("locationLabel")).toBe("San Francisco");
    expect(params.get("what")).toBe("quiet roommates");
    expect(params.get("lat")).toBe("37.7749");
    expect(params.get("lng")).toBe("-122.4194");
    expect(params.get("minLng")).toBe("-122.600");
    expect(params.get("maxLat")).toBe("37.900");
    expect(params.get("page")).toBeNull();
    expect(params.get("cursor")).toBeNull();
  });

  it("clears stale coordinates but preserves map bounds when no selected location remains", () => {
    // lat/lng (the point pin) are cleared, but the map bounds are preserved so
    // the user's current search area survives a submit with no selected location
    // (fix #12: previously bounds were cleared in the no-location/short-vibe path).
    const params = buildSearchIntentParams(
      new URLSearchParams(
        "where=Chicago&lat=41.8781&lng=-87.6298&minLng=-88&minLat=41&maxLng=-87&maxLat=42"
      ),
      {
        location: "",
        vibe: "",
        selectedLocation: null,
      }
    );

    expect(params.get("locationLabel")).toBeNull();
    // Point coordinates are cleared (no selected location)
    expect(params.get("lat")).toBeNull();
    expect(params.get("lng")).toBeNull();
    // Map bounds are preserved so the search area survives
    expect(params.get("minLng")).toBe("-88.000");
    expect(params.get("maxLat")).toBe("42.000");
  });

  // Regression for fix #12: sub-2-char vibe with active map bounds must not
  // clear bounds (previously the else branch set nextQuery.bounds = undefined,
  // destroying the user's search area and dead-ending to location-required).
  it("preserves current map bounds when vibe is too short (< 2 chars) and no location is selected", () => {
    const currentParams = new URLSearchParams(
      "minLng=-122.6&minLat=37.6&maxLng=-122.2&maxLat=37.9"
    );
    const params = buildSearchIntentParams(currentParams, {
      location: "",
      vibe: "a", // 1 character — below the >=2 gate, will be dropped
      selectedLocation: null,
    });

    // Vibe below threshold is dropped
    expect(params.get("what")).toBeNull();
    // But the map bounds must survive so the search area is not lost
    expect(params.get("minLng")).toBe("-122.600");
    expect(params.get("minLat")).toBe("37.600");
    expect(params.get("maxLng")).toBe("-122.200");
    expect(params.get("maxLat")).toBe("37.900");
    // No coordinates injected (no selected location)
    expect(params.get("lat")).toBeNull();
    expect(params.get("lng")).toBeNull();
  });

  it("preserves current map bounds when vibe is exactly empty and no location is selected", () => {
    const currentParams = new URLSearchParams(
      "minLng=-87.9&minLat=41.6&maxLng=-87.5&maxLat=42.0"
    );
    const params = buildSearchIntentParams(currentParams, {
      location: "",
      vibe: "",
      selectedLocation: null,
    });

    expect(params.get("what")).toBeNull();
    expect(params.get("minLng")).toBe("-87.900");
    expect(params.get("minLat")).toBe("41.600");
    expect(params.get("maxLng")).toBe("-87.500");
    expect(params.get("maxLat")).toBe("42.000");
    expect(params.get("lat")).toBeNull();
    expect(params.get("lng")).toBeNull();
  });

  it("preserves current map bounds when vibe is long enough (>= 2 chars) and no location is selected", () => {
    const currentParams = new URLSearchParams(
      "minLng=-122.6&minLat=37.6&maxLng=-122.2&maxLat=37.9"
    );
    const params = buildSearchIntentParams(currentParams, {
      location: "",
      vibe: "co", // exactly 2 chars — meets the gate
      selectedLocation: null,
    });

    expect(params.get("what")).toBe("co");
    expect(params.get("minLng")).toBe("-122.600");
    expect(params.get("maxLat")).toBe("37.900");
    expect(params.get("lat")).toBeNull();
  });

  it("treats legacy q-plus-point URLs as a selected location state", () => {
    const state = readSearchIntentState(
      new URLSearchParams("q=Irving&lat=32.814&lng=-96.9489")
    );

    expect(state.locationInput).toBe("Irving");
    expect(state.locationSummary).toBe("Irving");
    expect(state.selectedLocation).toEqual({
      lat: 32.814,
      lng: -96.9489,
      bounds: expect.any(Array),
    });
  });
});
