import {
  evaluateListingContactable,
  LISTING_UNAVAILABLE_MESSAGE,
  MIGRATION_REVIEW_MESSAGE,
  MODERATION_LOCKED_MESSAGE,
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
    "blocks a %s listing with LISTING_UNAVAILABLE",
    (status) => {
      const result = evaluateListingContactable({ status });
      expect(result).toEqual({
        ok: false,
        code: "LISTING_UNAVAILABLE",
        message: LISTING_UNAVAILABLE_MESSAGE,
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

  it("returns LISTING_UNAVAILABLE for stale host-managed listings", () => {
    const result = evaluateListingContactable({
      status: "ACTIVE" as const,
      availabilitySource: "HOST_MANAGED" as const,
      availableSlots: 1,
      totalSlots: 1,
      openSlots: 1,
      moveInDate: new Date("2026-05-01T00:00:00.000Z"),
      availableUntil: new Date("2026-12-01T00:00:00.000Z"),
      minStayMonths: 1,
      lastConfirmedAt: new Date("2026-03-20T12:00:00.000Z"),
      statusReason: null,
      needsMigrationReview: false,
    });

    expect(result).toEqual({
      ok: false,
      code: "LISTING_UNAVAILABLE",
      message: LISTING_UNAVAILABLE_MESSAGE,
    });
  });

  it("returns MIGRATION_REVIEW when a listing is flagged for migration review", () => {
    const result = evaluateListingContactable({
      status: "ACTIVE" as const,
      availabilitySource: "HOST_MANAGED" as const,
      availableSlots: 1,
      totalSlots: 1,
      openSlots: 1,
      moveInDate: new Date("2026-05-01T00:00:00.000Z"),
      availableUntil: new Date("2026-12-01T00:00:00.000Z"),
      minStayMonths: 1,
      lastConfirmedAt: new Date("2026-04-10T12:00:00.000Z"),
      statusReason: "MIGRATION_REVIEW",
      needsMigrationReview: true,
    });

    expect(result).toEqual({
      ok: false,
      code: "MIGRATION_REVIEW",
      message: MIGRATION_REVIEW_MESSAGE,
    });
  });

  it("returns MODERATION_LOCKED for admin-paused listings", () => {
    const result = evaluateListingContactable({
      status: "PAUSED" as const,
      availabilitySource: "HOST_MANAGED" as const,
      availableSlots: 1,
      totalSlots: 1,
      openSlots: 1,
      moveInDate: new Date("2026-05-01T00:00:00.000Z"),
      availableUntil: new Date("2026-12-01T00:00:00.000Z"),
      minStayMonths: 1,
      lastConfirmedAt: new Date("2026-04-10T12:00:00.000Z"),
      statusReason: "ADMIN_PAUSED",
      needsMigrationReview: false,
    });

    expect(result).toEqual({
      ok: false,
      code: "MODERATION_LOCKED",
      message: MODERATION_LOCKED_MESSAGE,
    });
  });
});
