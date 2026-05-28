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
            hostIdentityStatus: "unverified",
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
    expect(listings[0].hostIdentityStatus).toBe("unverified");
  });

  it("defaults missing cached host identity status to unknown", () => {
    const map = makeMap("pg1_public-key");
    delete map.geojson.features[0].properties.hostIdentityStatus;

    const listings = searchV2MapToListings(map);

    expect(listings[0].hostIdentityStatus).toBe("unknown");
  });

  it("handles partial map features without exposing raw metadata", () => {
    const listings = searchV2MapToListings({
      geojson: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: [-97.7431, 30.2672],
            },
            properties: {
              id: "partial-listing",
              title: "Partial listing",
              price: null,
              availableSlots: "bad-value",
              image: "cover.jpg",
              groupContext: {
                siblingCount: 1,
                dateCount: 1,
                completeness: "complete",
                contextKey: "raw-unit-key:1",
              },
            },
          },
          {
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: [0, 0],
            },
            properties: {
              id: "invalid-listing",
              title: "Invalid listing",
              price: 1500,
              availableSlots: 1,
              image: "bad.jpg",
            },
          },
        ],
      },
      pins: [{ id: "partial-listing", tier: "primary" }],
    } as any);

    expect(listings).toHaveLength(1);
    expect(listings[0]).toMatchObject({
      id: "partial-listing",
      title: "Partial listing",
      price: 0,
      availableSlots: 0,
      totalSlots: 0,
      images: ["cover.jpg"],
      location: { lat: 30.27, lng: -97.74 },
      groupKey: null,
      groupSummary: null,
      groupContext: null,
      tier: "primary",
      hostIdentityStatus: "unknown",
      publicAvailability: {
        availabilitySource: "HOST_MANAGED",
        openSlots: 0,
        totalSlots: 0,
      },
    });
    expect(JSON.stringify(listings[0])).not.toContain("raw-unit-key");
  });
});
