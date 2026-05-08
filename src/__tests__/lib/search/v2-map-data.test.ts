import { searchV2MapToListings } from "@/lib/search/v2-map-data";
import { buildPublicAvailability } from "@/lib/search/public-availability";
import type { SearchV2Map } from "@/lib/search/types";

function makeMap(contextKey: string): SearchV2Map {
  return {
    geojson: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [-97.74312, 30.26721],
          },
          properties: {
            id: "map-1",
            title: "Map listing",
            price: 1200,
            image: "map.jpg",
            availableSlots: 1,
            publicAvailability: buildPublicAvailability({
              availableSlots: 1,
              totalSlots: 2,
            }),
            groupContext: {
              siblingCount: 1,
              dateCount: 1,
              completeness: "complete",
              contextKey,
            },
          },
        },
      ],
    },
  };
}

describe("searchV2MapToListings", () => {
  it("drops legacy raw group contexts from browser-side map conversion", () => {
    const listings = searchV2MapToListings(makeMap("raw-unit-key:1"));

    expect(listings).toHaveLength(1);
    expect(listings[0].groupContext).toBeNull();
    expect(JSON.stringify(listings[0])).not.toContain("raw-unit-key");
  });

  it("keeps already-public group contexts and coarsens coordinates", () => {
    const listings = searchV2MapToListings(makeMap("pg1_public-key"));

    expect(listings[0].groupContext?.contextKey).toBe("pg1_public-key");
    expect(listings[0].location).toEqual({ lat: 30.27, lng: -97.74 });
  });
});
