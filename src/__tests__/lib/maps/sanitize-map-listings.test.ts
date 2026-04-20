import {
  sanitizeMapListing,
  sanitizeMapListings,
} from "@/lib/maps/sanitize-map-listings";

describe("sanitize-map-listings", () => {
  it("filters out invalid coordinates including 0,0 and non-finite values", () => {
    const listings = sanitizeMapListings([
      {
        id: "valid",
        title: "Valid listing",
        price: 1200,
        availableSlots: 2,
        location: { lat: 30.2672, lng: -97.7431 },
      },
      {
        id: "zero-zero",
        location: { lat: 0, lng: 0 },
      },
      {
        id: "nan-coords",
        location: { lat: Number.NaN, lng: -97.7431 },
      },
    ]);

    expect(listings).toEqual([
      expect.objectContaining({
        id: "valid",
        location: { lat: 30.2672, lng: -97.7431 },
      }),
    ]);
  });

  it("normalizes numeric fields and image arrays into safe map values", () => {
    const listing = sanitizeMapListing({
      id: "listing-1",
      title: "  Sanitized listing  ",
      price: "-10",
      availableSlots: "3.7",
      images: ["one.jpg", 42, "two.jpg"],
      location: { lat: "30.2672", lng: "-97.7431" },
      tier: "primary",
    });

    expect(listing).toEqual(
      expect.objectContaining({
        id: "listing-1",
        title: "Sanitized listing",
        price: 0,
        availableSlots: 3,
        totalSlots: 3,
        images: ["one.jpg", "two.jpg"],
        location: expect.objectContaining({ lat: 30.2672, lng: -97.7431 }),
        tier: "primary",
        avgRating: 0,
        reviewCount: 0,
        recommendedScore: null,
        createdAt: null,
        groupContext: null,
        groupSummary: null,
      })
    );
  });
});
