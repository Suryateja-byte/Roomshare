import {
  classifyListingForHostManagedMigration,
  type ListingMigrationSnapshot,
} from "../../../lib/migration/classifier";

function makeSnapshot(
  overrides: Partial<ListingMigrationSnapshot> = {}
): ListingMigrationSnapshot {
  return {
    id: "listing-1",
    version: 3,
    availabilitySource: "LEGACY_BOOKING",
    status: "ACTIVE",
    statusReason: null,
    needsMigrationReview: false,
    openSlots: null,
    availableSlots: 2,
    totalSlots: 2,
    moveInDate: new Date("2026-05-01T00:00:00.000Z"),
    availableUntil: new Date("2026-08-01T00:00:00.000Z"),
    minStayMonths: 1,
    lastConfirmedAt: null,
    freshnessReminderSentAt: null,
    freshnessWarningSentAt: null,
    autoPausedAt: null,
    pendingBookingCount: 0,
    acceptedBookingCount: 0,
    heldBookingCount: 0,
    futureInventoryRowCount: 0,
    futurePeakReservedLoad: 0,
    ...overrides,
  };
}

const now = new Date("2026-04-15T12:00:00.000Z");

describe("classifyListingForHostManagedMigration", () => {
  it("classifies a clean ACTIVE listing as clean_auto_convert", () => {
    expect(classifyListingForHostManagedMigration(makeSnapshot(), now)).toEqual({
      cohort: "clean_auto_convert",
      reasons: [],
    });
  });

  it("classifies a clean PAUSED listing as clean_auto_convert", () => {
    expect(
      classifyListingForHostManagedMigration(
        makeSnapshot({ status: "PAUSED" }),
        now
      )
    ).toEqual({
      cohort: "clean_auto_convert",
      reasons: [],
    });
  });

  it("blocks listings with pending bookings", () => {
    expect(
      classifyListingForHostManagedMigration(
        makeSnapshot({ pendingBookingCount: 1 }),
        now
      )
    ).toEqual({
      cohort: "blocked_legacy_state",
      reasons: ["HAS_PENDING_BOOKINGS"],
    });
  });

  it("blocks listings with held bookings", () => {
    expect(
      classifyListingForHostManagedMigration(
        makeSnapshot({ heldBookingCount: 2 }),
        now
      )
    ).toEqual({
      cohort: "blocked_legacy_state",
      reasons: ["HAS_HELD_BOOKINGS"],
    });
  });

  it("blocks listings with accepted bookings", () => {
    expect(
      classifyListingForHostManagedMigration(
        makeSnapshot({ acceptedBookingCount: 1 }),
        now
      )
    ).toEqual({
      cohort: "blocked_legacy_state",
      reasons: ["HAS_ACCEPTED_BOOKINGS"],
    });
  });

  it("blocks future inventory projection rows", () => {
    expect(
      classifyListingForHostManagedMigration(
        makeSnapshot({
          futureInventoryRowCount: 3,
          futurePeakReservedLoad: 2,
        }),
        now
      )
    ).toEqual({
      cohort: "blocked_legacy_state",
      reasons: ["HAS_FUTURE_INVENTORY_ROWS"],
    });
  });

  it("marks availableSlots drift as manual_review", () => {
    expect(
      classifyListingForHostManagedMigration(
        makeSnapshot({ availableSlots: 1 }),
        now
      )
    ).toEqual({
      cohort: "manual_review",
      reasons: ["AMBIGUOUS_AVAILABLE_SLOTS"],
    });
  });

  it("marks invalid slot bounds as manual_review", () => {
    expect(
      classifyListingForHostManagedMigration(
        makeSnapshot({ availableSlots: 3, totalSlots: 2 }),
        now
      )
    ).toEqual({
      cohort: "manual_review",
      reasons: ["INVALID_AVAILABLE_SLOTS"],
    });
  });

  it("marks missing moveInDate as manual_review", () => {
    expect(
      classifyListingForHostManagedMigration(
        makeSnapshot({ moveInDate: null }),
        now
      )
    ).toEqual({
      cohort: "manual_review",
      reasons: ["MISSING_MOVE_IN_DATE"],
    });
  });

  it("marks past or inverted date windows as manual_review", () => {
    expect(
      classifyListingForHostManagedMigration(
        makeSnapshot({
          moveInDate: new Date("2026-03-01T00:00:00.000Z"),
          availableUntil: new Date("2026-04-01T00:00:00.000Z"),
        }),
        now
      )
    ).toEqual({
      cohort: "manual_review",
      reasons: ["AVAILABLE_UNTIL_IN_PAST"],
    });

    expect(
      classifyListingForHostManagedMigration(
        makeSnapshot({
          availableUntil: new Date("2026-04-20T00:00:00.000Z"),
          moveInDate: new Date("2026-05-01T00:00:00.000Z"),
        }),
        now
      )
    ).toEqual({
      cohort: "manual_review",
      reasons: ["AVAILABLE_UNTIL_BEFORE_MOVE_IN_DATE"],
    });
  });

  it("marks partial host-managed shadow state as manual_review", () => {
    expect(
      classifyListingForHostManagedMigration(
        makeSnapshot({
          openSlots: 2,
          statusReason: "HOST_PAUSED",
          needsMigrationReview: true,
        }),
        now
      )
    ).toEqual({
      cohort: "manual_review",
      reasons: [
        "SHADOW_OPEN_SLOTS_PRESENT",
        "SHADOW_STATUS_REASON_PRESENT",
        "NEEDS_MIGRATION_REVIEW_FLAG",
      ],
    });
  });
});
