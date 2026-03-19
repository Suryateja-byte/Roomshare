import { createListingSchema, supabaseStorageUrlSchema } from "@/lib/schemas";

describe("createListingSchema", () => {
  const validListing = {
    title: "Cozy Room",
    description: "A beautiful cozy room in the heart of downtown area.",
    price: "800",
    amenities: "Wifi, Parking, Kitchen",
    houseRules: "Pets allowed, Smoking allowed",
    totalSlots: "3",
    address: "123 Main St",
    city: "San Francisco",
    state: "CA",
    zip: "94102",
  };

  describe("valid inputs", () => {
    it("should validate a complete valid listing", () => {
      const result = createListingSchema.safeParse(validListing);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe("Cozy Room");
        expect(result.data.price).toBe(800);
        expect(result.data.totalSlots).toBe(3);
      }
    });

    it("should transform amenities string to array", () => {
      const result = createListingSchema.safeParse(validListing);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.amenities).toEqual(["Wifi", "Parking", "Kitchen"]);
      }
    });

    it("should transform houseRules string to array", () => {
      const result = createListingSchema.safeParse(validListing);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.houseRules).toEqual([
          "Pets allowed",
          "Smoking allowed",
        ]);
      }
    });

    it("should handle empty houseRules", () => {
      const listing = { ...validListing, houseRules: "" };
      const result = createListingSchema.safeParse(listing);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.houseRules).toEqual([]);
      }
    });

    it("should coerce string price to number", () => {
      const result = createListingSchema.safeParse(validListing);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(typeof result.data.price).toBe("number");
        expect(result.data.price).toBe(800);
      }
    });

    it("should coerce string totalSlots to number", () => {
      const result = createListingSchema.safeParse(validListing);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(typeof result.data.totalSlots).toBe("number");
        expect(result.data.totalSlots).toBe(3);
      }
    });

    it("should handle single amenity", () => {
      const listing = { ...validListing, amenities: "Wifi" };
      const result = createListingSchema.safeParse(listing);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.amenities).toEqual(["Wifi"]);
      }
    });

    it("should trim whitespace from amenities", () => {
      const listing = { ...validListing, amenities: "  Wifi  ,  Parking  " };
      const result = createListingSchema.safeParse(listing);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.amenities).toEqual(["Wifi", "Parking"]);
      }
    });

    it("should filter empty amenities", () => {
      const listing = { ...validListing, amenities: "Wifi,,Parking,," };
      const result = createListingSchema.safeParse(listing);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.amenities).toEqual(["Wifi", "Parking"]);
      }
    });
  });

  describe("invalid inputs", () => {
    it("should reject empty title", () => {
      const listing = { ...validListing, title: "" };
      const result = createListingSchema.safeParse(listing);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("Title is required");
      }
    });

    it("should reject short description", () => {
      const listing = { ...validListing, description: "Short" };
      const result = createListingSchema.safeParse(listing);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          "Description must be at least 10 characters"
        );
      }
    });

    it("should reject zero price", () => {
      const listing = { ...validListing, price: "0" };
      const result = createListingSchema.safeParse(listing);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          "Price must be a positive number"
        );
      }
    });

    it("should reject negative price", () => {
      const listing = { ...validListing, price: "-100" };
      const result = createListingSchema.safeParse(listing);
      expect(result.success).toBe(false);
    });

    it("should reject zero totalSlots", () => {
      const listing = { ...validListing, totalSlots: "0" };
      const result = createListingSchema.safeParse(listing);
      expect(result.success).toBe(false);
    });

    it("should reject negative totalSlots", () => {
      const listing = { ...validListing, totalSlots: "-1" };
      const result = createListingSchema.safeParse(listing);
      expect(result.success).toBe(false);
    });

    it("should reject decimal totalSlots", () => {
      const listing = { ...validListing, totalSlots: "2.5" };
      const result = createListingSchema.safeParse(listing);
      expect(result.success).toBe(false);
    });

    it("should reject empty address", () => {
      const listing = { ...validListing, address: "" };
      const result = createListingSchema.safeParse(listing);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("Address is required");
      }
    });

    it("should reject empty city", () => {
      const listing = { ...validListing, city: "" };
      const result = createListingSchema.safeParse(listing);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("City is required");
      }
    });

    it("should reject empty state", () => {
      const listing = { ...validListing, state: "" };
      const result = createListingSchema.safeParse(listing);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("State is required");
      }
    });

    it("should reject empty zip", () => {
      const listing = { ...validListing, zip: "" };
      const result = createListingSchema.safeParse(listing);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("Zip code is required");
      }
    });

    it("should reject missing required fields", () => {
      const result = createListingSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("should reject non-numeric price", () => {
      const listing = { ...validListing, price: "invalid" };
      const result = createListingSchema.safeParse(listing);
      expect(result.success).toBe(false);
    });
  });
});

describe("supabaseStorageUrlSchema", () => {
  const PROJECT_REF = "qolpgfdmkqvxraafucvu";
  const BASE = `https://${PROJECT_REF}.supabase.co/storage/v1/object/public`;

  beforeAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
  });

  describe("valid URLs", () => {
    it("accepts a Supabase storage JPEG URL", () => {
      const url = `${BASE}/verification/docs/abc123.jpg`;
      const result = supabaseStorageUrlSchema.safeParse(url);
      expect(result.success).toBe(true);
    });

    it("accepts a Supabase storage PNG URL", () => {
      const url = `${BASE}/verification/selfies/photo.png`;
      const result = supabaseStorageUrlSchema.safeParse(url);
      expect(result.success).toBe(true);
    });

    it("accepts a Supabase storage PDF URL", () => {
      const url = `${BASE}/verification/docs/document.pdf`;
      const result = supabaseStorageUrlSchema.safeParse(url);
      expect(result.success).toBe(true);
    });

    it("accepts a Supabase storage WebP URL", () => {
      const url = `${BASE}/images/listings/room.webp`;
      const result = supabaseStorageUrlSchema.safeParse(url);
      expect(result.success).toBe(true);
    });

    it("accepts nested paths within a bucket", () => {
      const url = `${BASE}/verification/user-123/docs/id-front.jpeg`;
      const result = supabaseStorageUrlSchema.safeParse(url);
      expect(result.success).toBe(true);
    });
  });

  describe("rejects malicious/invalid URLs", () => {
    it("rejects external URLs (SSRF)", () => {
      const result = supabaseStorageUrlSchema.safeParse(
        "https://evil.com/doc.pdf"
      );
      expect(result.success).toBe(false);
    });

    it("rejects AWS metadata URL (SSRF)", () => {
      const result = supabaseStorageUrlSchema.safeParse(
        "http://169.254.169.254/latest/meta-data/"
      );
      expect(result.success).toBe(false);
    });

    it("rejects wrong Supabase project", () => {
      const result = supabaseStorageUrlSchema.safeParse(
        "https://other-project.supabase.co/storage/v1/object/public/bucket/file.jpg"
      );
      expect(result.success).toBe(false);
    });

    it("rejects non-storage Supabase paths", () => {
      const result = supabaseStorageUrlSchema.safeParse(
        `https://${PROJECT_REF}.supabase.co/rest/v1/users`
      );
      expect(result.success).toBe(false);
    });

    it("rejects disallowed file extensions", () => {
      const result = supabaseStorageUrlSchema.safeParse(
        `${BASE}/verification/docs/script.exe`
      );
      expect(result.success).toBe(false);
    });

    it("rejects URLs over 2048 characters", () => {
      const result = supabaseStorageUrlSchema.safeParse(
        `${BASE}/verification/docs/${"a".repeat(2048)}.jpg`
      );
      expect(result.success).toBe(false);
    });

    it("rejects empty string", () => {
      const result = supabaseStorageUrlSchema.safeParse("");
      expect(result.success).toBe(false);
    });

    it("rejects non-URL string", () => {
      const result = supabaseStorageUrlSchema.safeParse("not-a-url");
      expect(result.success).toBe(false);
    });
  });
});
