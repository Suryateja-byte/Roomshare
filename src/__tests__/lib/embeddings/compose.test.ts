import { composeListingText } from "@/lib/embeddings/compose";

describe("composeListingText", () => {
  it("includes title and description", () => {
    const text = composeListingText({
      title: "Sunny Room",
      description: "A bright room downtown",
      price: 800,
    });
    expect(text).toContain("Sunny Room");
    expect(text).toContain("A bright room downtown");
    expect(text).toContain("$800 per month");
  });

  it("handles zero available slots correctly", () => {
    const text = composeListingText({
      title: "Room",
      description: "Description",
      price: 500,
      availableSlots: 0,
      totalSlots: 3,
    });
    expect(text).toContain("0 of 3 slots available");
  });

  it("includes all optional fields when present", () => {
    const text = composeListingText({
      title: "Room",
      description: "Desc",
      price: 600,
      roomType: "PRIVATE",
      amenities: ["WiFi", "AC"],
      houseRules: ["No smoking"],
      leaseDuration: "MONTH_TO_MONTH",
      genderPreference: "ANY",
      householdGender: "MIXED",
      householdLanguages: ["English", "Spanish"],
      city: "Austin",
      state: "TX",
      moveInDate: "2026-04-01",
      bookingMode: "SHARED",
    });
    expect(text).toContain("Room type: PRIVATE");
    expect(text).toContain("Amenities: WiFi, AC");
    expect(text).toContain("House rules: No smoking");
    expect(text).toContain("Lease: MONTH_TO_MONTH");
    expect(text).toContain("Located in Austin, TX");
    expect(text).toContain("Available from 2026-04-01");
    expect(text).toContain("Languages spoken: English, Spanish");
    expect(text).toContain("Booking mode: SHARED");
  });

  it("omits null/undefined optional fields", () => {
    const text = composeListingText({
      title: "Room",
      description: "Desc",
      price: 500,
    });
    expect(text).not.toContain("Room type:");
    expect(text).not.toContain("Amenities:");
    expect(text).not.toContain("Located in");
    expect(text).not.toContain("Booking mode:");
    expect(text).not.toContain("Available from");
  });

  // PII safety: street address must NOT be included in embedding text
  describe("PII address exclusion", () => {
    it("does NOT include street address in output", () => {
      const text = composeListingText({
        title: "Room",
        description: "Desc",
        price: 500,
        address: "123 Main St, Apt 4B",
        city: "Austin",
        state: "TX",
      });
      expect(text).not.toContain("123 Main St");
      expect(text).not.toContain("Apt 4B");
      expect(text).not.toContain("Address:");
    });

    it("includes city + state when both present", () => {
      const text = composeListingText({
        title: "Room",
        description: "Desc",
        price: 500,
        city: "Austin",
        state: "TX",
      });
      expect(text).toContain("Located in Austin, TX");
    });

    it("omits location when only city (no state)", () => {
      const text = composeListingText({
        title: "Room",
        description: "Desc",
        price: 500,
        city: "Austin",
      });
      expect(text).not.toContain("Located in");
    });

    it("omits address even when no city/state provided", () => {
      const text = composeListingText({
        title: "Room",
        description: "Desc",
        price: 500,
        address: "456 Oak Ave",
      });
      expect(text).not.toContain("456 Oak Ave");
      expect(text).not.toContain("Address:");
    });
  });
});
