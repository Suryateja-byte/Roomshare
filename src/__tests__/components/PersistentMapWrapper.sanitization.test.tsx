jest.mock("next/navigation", () => ({
  useSearchParams: jest.fn(),
}));

import { v2MapDataToListings } from "@/components/PersistentMapWrapper";

describe("v2MapDataToListings", () => {
  it("filters invalid features and sanitizes map-bound numeric fields", () => {
    const listings = v2MapDataToListings({
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
              id: "valid-listing",
              title: "Valid listing",
              price: null,
              availableSlots: "bad-value",
              image: "cover.jpg",
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
      pins: [{ id: "valid-listing", tier: "primary" }],
      mode: "pins",
    } as any);

    expect(listings).toEqual([
      {
        id: "valid-listing",
        title: "Valid listing",
        price: 0,
        availableSlots: 0,
        images: ["cover.jpg"],
        location: { lat: 30.2672, lng: -97.7431 },
        tier: "primary",
        avgRating: 0,
        reviewCount: 0,
        recommendedScore: null,
        createdAt: null,
      },
    ]);
  });
});
