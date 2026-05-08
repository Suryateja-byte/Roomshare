import {
  sanitizeMapListing,
  sanitizeMapListings,
} from "@/lib/maps/sanitize-map-listings";
import { PUBLIC_GROUP_KEY_PREFIX } from "@/lib/search/public-listing-payload";

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
        location: expect.objectContaining({ lat: 30.27, lng: -97.74 }),
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
        location: expect.objectContaining({ lat: 30.27, lng: -97.74 }),
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

  it("replaces raw group identifiers and drops private status reasons", () => {
    const listing = sanitizeMapListing({
      id: "listing-private-map",
      price: 1200,
      availableSlots: 1,
      location: { lat: 30.2672, lng: -97.7431 },
      groupKey: "private-unit-key:12",
      groupSummary: {
        groupKey: "private-unit-key:12",
        siblingIds: ["sibling-1"],
        availableFromDates: ["2026-06-01"],
        combinedOpenSlots: 1,
        combinedTotalSlots: 2,
        groupOverflow: false,
      },
      groupContext: {
        siblingCount: 1,
        dateCount: 1,
        completeness: "complete",
        contextKey: "private-unit-key:12",
      },
      statusReason: "PRIVATE_REASON",
    });

    expect(listing?.groupKey).toMatch(
      new RegExp(`^${PUBLIC_GROUP_KEY_PREFIX}`)
    );
    expect(listing?.groupSummary?.groupKey).toBe(listing?.groupKey);
    expect(listing?.groupContext?.contextKey).toBe(listing?.groupKey);
    expect(JSON.stringify(listing)).not.toContain("private-unit-key");
    expect(listing?.statusReason).toBeNull();
  });
});
