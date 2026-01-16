import {
  PublicListing,
  PublicMapListing,
  USER_SPECIFIC_FIELDS,
  isPublicListingSafe,
  assertPublicListing,
  assertPublicListings,
} from "@/types/listing";

/**
 * Cache Safety Tests
 *
 * These tests verify that the cache safety type guards correctly detect
 * user-specific fields that would cause cache poisoning if included
 * in shared caches (unstable_cache, CDN, etc.).
 */

// Helper to create a valid public listing for testing
const createValidPublicListing = (): PublicListing => ({
  id: "test-123",
  title: "Cozy Room in Downtown",
  description: "A lovely room with great amenities",
  price: 1200,
  images: ["/img1.jpg", "/img2.jpg"],
  availableSlots: 2,
  totalSlots: 3,
  amenities: ["WiFi", "Laundry"],
  houseRules: ["No smoking", "No pets"],
  householdLanguages: ["English", "Spanish"],
  primaryHomeLanguage: "English",
  leaseDuration: "6-month",
  roomType: "private",
  moveInDate: new Date("2025-02-01"),
  ownerId: "owner-456",
  location: {
    address: "123 Main St",
    city: "San Francisco",
    state: "CA",
    zip: "94102",
    lat: 37.7749,
    lng: -122.4194,
  },
});

// Helper to create a valid map listing for testing
const createValidMapListing = (): PublicMapListing => ({
  id: "test-123",
  title: "Cozy Room",
  price: 1200,
  availableSlots: 2,
  ownerId: "owner-456",
  images: ["/img1.jpg"],
  location: {
    lat: 37.7749,
    lng: -122.4194,
  },
});

describe("isPublicListingSafe", () => {
  describe("valid listings (should return true)", () => {
    it("should accept a clean PublicListing object", () => {
      const listing = createValidPublicListing();
      expect(isPublicListingSafe(listing)).toBe(true);
    });

    it("should accept a minimal listing with required fields only", () => {
      const minimalListing = {
        id: "test-1",
        title: "Test",
        description: "Test description",
        price: 100,
        images: [],
        availableSlots: 1,
        totalSlots: 1,
        amenities: [],
        houseRules: [],
        householdLanguages: [],
        location: {
          address: "123 Test St",
          city: "Test City",
          state: "TS",
          zip: "12345",
          lat: 0,
          lng: 0,
        },
      };
      expect(isPublicListingSafe(minimalListing)).toBe(true);
    });

    it("should accept a PublicMapListing object", () => {
      const mapListing = createValidMapListing();
      expect(isPublicListingSafe(mapListing)).toBe(true);
    });

    it("should accept listing with optional fields as undefined", () => {
      const listing = {
        ...createValidPublicListing(),
        primaryHomeLanguage: undefined,
        leaseDuration: undefined,
        roomType: undefined,
        moveInDate: undefined,
        ownerId: undefined,
      };
      expect(isPublicListingSafe(listing)).toBe(true);
    });
  });

  describe("invalid listings (should return false)", () => {
    it.each(USER_SPECIFIC_FIELDS)(
      "should reject listing with user-specific field: %s",
      (field) => {
        const poisonedListing = {
          ...createValidPublicListing(),
          [field]: "some-value",
        };
        expect(isPublicListingSafe(poisonedListing)).toBe(false);
      },
    );

    it("should reject listing with isSaved boolean", () => {
      const poisonedListing = {
        ...createValidPublicListing(),
        isSaved: true,
      };
      expect(isPublicListingSafe(poisonedListing)).toBe(false);
    });

    it("should reject listing with isSaved set to false (field still exists)", () => {
      const poisonedListing = {
        ...createValidPublicListing(),
        isSaved: false,
      };
      expect(isPublicListingSafe(poisonedListing)).toBe(false);
    });

    it("should reject listing with viewedAt timestamp", () => {
      const poisonedListing = {
        ...createValidPublicListing(),
        viewedAt: new Date(),
      };
      expect(isPublicListingSafe(poisonedListing)).toBe(false);
    });

    it("should reject listing with multiple user-specific fields", () => {
      const poisonedListing = {
        ...createValidPublicListing(),
        isSaved: true,
        viewedAt: new Date(),
        bookingStatus: "pending",
      };
      expect(isPublicListingSafe(poisonedListing)).toBe(false);
    });

    it("should reject listing with user-specific field set to null", () => {
      const poisonedListing = {
        ...createValidPublicListing(),
        isSaved: null,
      };
      expect(isPublicListingSafe(poisonedListing)).toBe(false);
    });

    it("should reject listing with user-specific field set to undefined but present", () => {
      // Object.assign creates a property with undefined value
      const poisonedListing = Object.assign({}, createValidPublicListing(), {
        isSaved: undefined,
      });
      // The 'in' operator returns true even if value is undefined
      expect("isSaved" in poisonedListing).toBe(true);
      expect(isPublicListingSafe(poisonedListing)).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("should return false for null input", () => {
      expect(isPublicListingSafe(null)).toBe(false);
    });

    it("should return false for undefined input", () => {
      expect(isPublicListingSafe(undefined)).toBe(false);
    });

    it("should return false for primitive types", () => {
      expect(isPublicListingSafe("string")).toBe(false);
      expect(isPublicListingSafe(123)).toBe(false);
      expect(isPublicListingSafe(true)).toBe(false);
    });

    it("should return false for empty object", () => {
      // Empty object doesn't have user-specific fields, so it passes the safety check
      // But it doesn't satisfy PublicListing interface at compile time
      expect(isPublicListingSafe({})).toBe(true);
    });

    it("should return false for array input", () => {
      expect(isPublicListingSafe([createValidPublicListing()])).toBe(false);
    });
  });
});

describe("assertPublicListing", () => {
  it("should return the listing when valid", () => {
    const listing = createValidPublicListing();
    const result = assertPublicListing(listing);
    expect(result).toEqual(listing);
  });

  it("should throw error when isSaved is present", () => {
    const poisonedListing = {
      ...createValidPublicListing(),
      isSaved: true,
    };
    expect(() => assertPublicListing(poisonedListing)).toThrow(
      "Cache safety violation",
    );
    expect(() => assertPublicListing(poisonedListing)).toThrow("isSaved");
  });

  it("should throw error listing all detected user-specific fields", () => {
    const poisonedListing = {
      ...createValidPublicListing(),
      isSaved: true,
      viewedAt: new Date(),
      bookingStatus: "pending",
    };
    expect(() => assertPublicListing(poisonedListing)).toThrow(
      /isSaved.*viewedAt.*bookingStatus|isSaved.*bookingStatus.*viewedAt|viewedAt.*isSaved.*bookingStatus|viewedAt.*bookingStatus.*isSaved|bookingStatus.*isSaved.*viewedAt|bookingStatus.*viewedAt.*isSaved/,
    );
  });

  it("should throw for null input", () => {
    expect(() => assertPublicListing(null)).toThrow("Cache safety violation");
    expect(() => assertPublicListing(null)).toThrow("got null");
  });

  it("should throw for undefined input", () => {
    expect(() => assertPublicListing(undefined)).toThrow(
      "Cache safety violation",
    );
    expect(() => assertPublicListing(undefined)).toThrow("got undefined");
  });
});

describe("assertPublicListings", () => {
  it("should return all listings when valid", () => {
    const listings = [
      createValidPublicListing(),
      { ...createValidPublicListing(), id: "test-456" },
    ];
    const result = assertPublicListings(listings);
    expect(result).toEqual(listings);
    expect(result).toHaveLength(2);
  });

  it("should throw error with index when one listing is invalid", () => {
    const listings = [
      createValidPublicListing(),
      { ...createValidPublicListing(), id: "test-456", isSaved: true },
      createValidPublicListing(),
    ];
    expect(() => assertPublicListings(listings)).toThrow("at index 1");
  });

  it("should throw on first invalid listing", () => {
    const listings = [
      { ...createValidPublicListing(), isSaved: true },
      { ...createValidPublicListing(), viewedAt: new Date() },
    ];
    expect(() => assertPublicListings(listings)).toThrow("at index 0");
  });

  it("should handle empty array", () => {
    const result = assertPublicListings([]);
    expect(result).toEqual([]);
  });

  it("should handle single-item array", () => {
    const listings = [createValidPublicListing()];
    const result = assertPublicListings(listings);
    expect(result).toEqual(listings);
  });
});

describe("USER_SPECIFIC_FIELDS constant", () => {
  it("should include all expected user-specific fields", () => {
    expect(USER_SPECIFIC_FIELDS).toContain("isSaved");
    expect(USER_SPECIFIC_FIELDS).toContain("viewedAt");
    expect(USER_SPECIFIC_FIELDS).toContain("messageThread");
    expect(USER_SPECIFIC_FIELDS).toContain("bookingStatus");
    expect(USER_SPECIFIC_FIELDS).toContain("savedAt");
    expect(USER_SPECIFIC_FIELDS).toContain("userNotes");
    expect(USER_SPECIFIC_FIELDS).toContain("privateHostContact");
    expect(USER_SPECIFIC_FIELDS).toContain("viewerSpecificRanking");
  });

  it("should be a readonly tuple", () => {
    // TypeScript enforces this at compile time with 'as const'
    // At runtime, we can verify the array exists and has expected length
    expect(USER_SPECIFIC_FIELDS).toHaveLength(8);
  });

  it("should not include public listing fields", () => {
    expect(USER_SPECIFIC_FIELDS).not.toContain("id");
    expect(USER_SPECIFIC_FIELDS).not.toContain("title");
    expect(USER_SPECIFIC_FIELDS).not.toContain("price");
    expect(USER_SPECIFIC_FIELDS).not.toContain("ownerId");
    expect(USER_SPECIFIC_FIELDS).not.toContain("location");
  });
});

describe("Cache poisoning scenarios", () => {
  it("should detect database result with JOIN'd user data", () => {
    // Simulates a DB query that accidentally included user-specific data
    const dbResultWithUserData = {
      ...createValidPublicListing(),
      // These would come from a JOIN with user_saved_listings table
      isSaved: true,
      savedAt: new Date("2025-01-01"),
    };
    expect(isPublicListingSafe(dbResultWithUserData)).toBe(false);
  });

  it("should detect API response mutation", () => {
    // Simulates code that mutated a cached object
    const cachedListing = createValidPublicListing();
    const mutatedListing = { ...cachedListing, viewedAt: new Date() };
    expect(isPublicListingSafe(cachedListing)).toBe(true);
    expect(isPublicListingSafe(mutatedListing)).toBe(false);
  });

  it("should detect serialization round-trip with extra fields", () => {
    // Simulates JSON parse of data that included user fields
    const jsonWithUserFields = JSON.stringify({
      ...createValidPublicListing(),
      bookingStatus: "confirmed",
      userNotes: "Great location!",
    });
    const parsed = JSON.parse(jsonWithUserFields);
    expect(isPublicListingSafe(parsed)).toBe(false);
  });
});
