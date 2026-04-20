import {
  evaluateListingContactable,
  LISTING_INACTIVE_MESSAGE,
  LISTING_NOT_FOUND_MESSAGE,
} from "@/lib/messaging/listing-contactable";

describe("evaluateListingContactable", () => {
  it("returns ok for an ACTIVE listing", () => {
    const result = evaluateListingContactable({ status: "ACTIVE" });
    expect(result).toEqual({ ok: true, listing: { status: "ACTIVE" } });
  });

  it("preserves extra fields on an ACTIVE listing", () => {
    const listing = { status: "ACTIVE" as const, ownerId: "owner-1", id: "l-1" };
    const result = evaluateListingContactable(listing);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.listing.ownerId).toBe("owner-1");
      expect(result.listing.id).toBe("l-1");
    }
  });

  it.each(["PAUSED", "RENTED"] as const)(
    "blocks a %s listing with LISTING_INACTIVE",
    (status) => {
      const result = evaluateListingContactable({ status });
      expect(result).toEqual({
        ok: false,
        code: "LISTING_INACTIVE",
        message: LISTING_INACTIVE_MESSAGE,
      });
    },
  );

  it("returns LISTING_NOT_FOUND when listing is null", () => {
    const result = evaluateListingContactable(null);
    expect(result).toEqual({
      ok: false,
      code: "LISTING_NOT_FOUND",
      message: LISTING_NOT_FOUND_MESSAGE,
    });
  });

  it("returns LISTING_NOT_FOUND when listing is undefined", () => {
    const result = evaluateListingContactable(undefined);
    expect(result).toEqual({
      ok: false,
      code: "LISTING_NOT_FOUND",
      message: LISTING_NOT_FOUND_MESSAGE,
    });
  });
});
