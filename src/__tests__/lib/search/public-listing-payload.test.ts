import {
  PUBLIC_GROUP_KEY_PREFIX,
  toPublicGroupKey,
  toPublicMapListing,
  toPublicSearchListing,
} from "@/lib/search/public-listing-payload";
import type { ListingData, MapListingData } from "@/lib/search-types";
import { buildPublicAvailability } from "@/lib/search/public-availability";

function makeListing(overrides: Partial<ListingData> = {}): ListingData {
  const listing: ListingData = {
    id: "listing-private-1",
    title: "Private source listing",
    description: "Call 555-123-4567 for the exact address.",
    price: 1500,
    images: ["https://images.example/listing.jpg"],
    availableSlots: 1,
    totalSlots: 2,
    amenities: ["Wifi"],
    houseRules: ["No Smoking"],
    householdLanguages: ["English"],
    primaryHomeLanguage: "English",
    ownerId: "owner-secret-1",
    location: {
      address: "123 Private St Apt 9",
      city: "Austin",
      state: "TX",
      zip: "78701",
      lat: 30.26721,
      lng: -97.74312,
    },
    publicAvailability: buildPublicAvailability({
      availableSlots: 1,
      totalSlots: 2,
    }),
    groupKey: "unit-secret-1:42",
    groupSummary: {
      groupKey: "unit-secret-1:42",
      siblingIds: ["listing-private-2"],
      availableFromDates: ["2026-06-01"],
      combinedOpenSlots: 1,
      combinedTotalSlots: 2,
      groupOverflow: false,
      members: [
        {
          listingId: "listing-private-1",
          availableFrom: "2026-06-01",
          availableUntil: null,
          openSlots: 1,
          totalSlots: 2,
          isCanonical: true,
        },
      ],
    },
    groupContext: {
      siblingCount: 1,
      dateCount: 1,
      completeness: "complete",
      contextKey: "unit-secret-1:42",
    },
    statusReason: "PRIVATE_MODERATION_REASON",
    ...overrides,
  };

  return listing;
}

describe("public listing payload sanitizer", () => {
  it("removes private listing fields from browser-visible search cards", () => {
    const publicListing = toPublicSearchListing(makeListing());
    const serialized = JSON.parse(JSON.stringify(publicListing));

    expect(serialized.ownerId).toBeUndefined();
    expect(serialized.location.address).toBeUndefined();
    expect(serialized.location.zip).toBeUndefined();
    expect(serialized.statusReason).toBeUndefined();
    expect(serialized.description).toBe("");
    expect(serialized.location).toEqual({
      city: "Austin",
      state: "TX",
      lat: 30.27,
      lng: -97.74,
    });
  });

  it("replaces raw group metadata with opaque public ids", () => {
    const publicListing = toPublicSearchListing(makeListing());

    expect(publicListing.groupKey).toMatch(
      new RegExp(`^${PUBLIC_GROUP_KEY_PREFIX}`)
    );
    expect(publicListing.groupSummary?.groupKey).toBe(publicListing.groupKey);
    expect(publicListing.groupContext?.contextKey).toBe(publicListing.groupKey);
    expect(publicListing.groupKey).not.toContain("unit-secret-1");
    expect(publicListing.groupSummary?.groupKey).not.toContain("unit-secret-1");
    expect(publicListing.groupContext?.contextKey).not.toContain(
      "unit-secret-1"
    );
  });

  it("keeps public group key conversion deterministic and idempotent", () => {
    const publicKey = toPublicGroupKey("unit-secret-1:42");

    expect(publicKey).toBe(toPublicGroupKey("unit-secret-1:42"));
    expect(toPublicGroupKey(publicKey)).toBe(publicKey);
  });

  it("sanitizes map listing group metadata without exposing status reasons", () => {
    const mapListing: MapListingData = {
      id: "map-private-1",
      title: "Map private",
      price: 1400,
      availableSlots: 1,
      totalSlots: 2,
      images: ["map.jpg"],
      location: { lat: 30.26721, lng: -97.74312 },
      publicAvailability: buildPublicAvailability({
        availableSlots: 1,
        totalSlots: 2,
      }),
      groupKey: "unit-secret-map:7",
      groupContext: {
        siblingCount: 1,
        dateCount: 1,
        completeness: "complete",
        contextKey: "unit-secret-map:7",
      },
      statusReason: "PRIVATE_MAP_REASON",
    };

    const publicMapListing = toPublicMapListing(mapListing);

    expect(publicMapListing.location).toEqual({ lat: 30.27, lng: -97.74 });
    expect(publicMapListing.groupKey).toMatch(
      new RegExp(`^${PUBLIC_GROUP_KEY_PREFIX}`)
    );
    expect(publicMapListing.groupContext?.contextKey).toMatch(
      new RegExp(`^${PUBLIC_GROUP_KEY_PREFIX}`)
    );
    expect(publicMapListing.groupKey).not.toContain("unit-secret-map");
    expect(publicMapListing.statusReason).toBeNull();
  });
});
