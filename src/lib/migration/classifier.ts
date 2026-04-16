import type {
  ListingAvailabilitySource,
  ListingStatus,
} from "@prisma/client";

export const MIGRATION_COHORTS = [
  "clean_auto_convert",
  "blocked_legacy_state",
  "manual_review",
] as const;

export type MigrationCohort = (typeof MIGRATION_COHORTS)[number];

export const MIGRATION_REASON_CODES = [
  "ALREADY_HOST_MANAGED",
  "HAS_PENDING_BOOKINGS",
  "HAS_ACCEPTED_BOOKINGS",
  "HAS_HELD_BOOKINGS",
  "HAS_FUTURE_INVENTORY_ROWS",
  "SHADOW_OPEN_SLOTS_PRESENT",
  "SHADOW_STATUS_REASON_PRESENT",
  "NEEDS_MIGRATION_REVIEW_FLAG",
  "INVALID_TOTAL_SLOTS",
  "INVALID_AVAILABLE_SLOTS",
  "AMBIGUOUS_AVAILABLE_SLOTS",
  "MISSING_MOVE_IN_DATE",
  "AVAILABLE_UNTIL_BEFORE_MOVE_IN_DATE",
  "AVAILABLE_UNTIL_IN_PAST",
  "UNSUPPORTED_STATUS_FOR_AUTO_CONVERT",
] as const;

export type MigrationReasonCode = (typeof MIGRATION_REASON_CODES)[number];

export interface ListingMigrationSnapshot {
  id: string;
  version: number;
  availabilitySource:
    | ListingAvailabilitySource
    | "LEGACY_BOOKING"
    | "HOST_MANAGED";
  status: ListingStatus | "ACTIVE" | "PAUSED" | "RENTED";
  statusReason: string | null;
  needsMigrationReview: boolean;
  openSlots: number | null;
  availableSlots: number;
  totalSlots: number;
  moveInDate: Date | null;
  availableUntil: Date | null;
  minStayMonths: number;
  lastConfirmedAt: Date | null;
  freshnessReminderSentAt: Date | null;
  freshnessWarningSentAt: Date | null;
  autoPausedAt: Date | null;
  pendingBookingCount: number;
  acceptedBookingCount: number;
  heldBookingCount: number;
  futureInventoryRowCount: number;
  futurePeakReservedLoad: number;
}

export interface ListingMigrationClassification {
  cohort: MigrationCohort;
  reasons: MigrationReasonCode[];
}

function toDateOnly(value: Date | null | undefined): string | null {
  if (!value || Number.isNaN(value.getTime())) {
    return null;
  }

  return value.toISOString().slice(0, 10);
}

function uniqueReasons(
  reasons: ReadonlyArray<MigrationReasonCode>
): MigrationReasonCode[] {
  return Array.from(new Set(reasons));
}

export function classifyListingForHostManagedMigration(
  snapshot: ListingMigrationSnapshot,
  now: Date = new Date()
): ListingMigrationClassification {
  const manualReasons: MigrationReasonCode[] = [];
  const blockedReasons: MigrationReasonCode[] = [];

  if (snapshot.availabilitySource !== "LEGACY_BOOKING") {
    manualReasons.push("ALREADY_HOST_MANAGED");
  }

  if (snapshot.pendingBookingCount > 0) {
    blockedReasons.push("HAS_PENDING_BOOKINGS");
  }

  if (snapshot.acceptedBookingCount > 0) {
    blockedReasons.push("HAS_ACCEPTED_BOOKINGS");
  }

  if (snapshot.heldBookingCount > 0) {
    blockedReasons.push("HAS_HELD_BOOKINGS");
  }

  if (snapshot.futureInventoryRowCount > 0) {
    blockedReasons.push("HAS_FUTURE_INVENTORY_ROWS");
  }

  if (snapshot.openSlots !== null) {
    manualReasons.push("SHADOW_OPEN_SLOTS_PRESENT");
  }

  if (
    typeof snapshot.statusReason === "string" &&
    snapshot.statusReason.trim().length > 0
  ) {
    manualReasons.push("SHADOW_STATUS_REASON_PRESENT");
  }

  if (snapshot.needsMigrationReview) {
    manualReasons.push("NEEDS_MIGRATION_REVIEW_FLAG");
  }

  if (snapshot.totalSlots < 1) {
    manualReasons.push("INVALID_TOTAL_SLOTS");
  }

  if (
    snapshot.availableSlots < 0 ||
    snapshot.availableSlots > snapshot.totalSlots
  ) {
    manualReasons.push("INVALID_AVAILABLE_SLOTS");
  } else if (snapshot.availableSlots !== snapshot.totalSlots) {
    manualReasons.push("AMBIGUOUS_AVAILABLE_SLOTS");
  }

  const moveInDateOnly = toDateOnly(snapshot.moveInDate);
  const availableUntilOnly = toDateOnly(snapshot.availableUntil);
  const nowDateOnly = now.toISOString().slice(0, 10);

  if (!moveInDateOnly) {
    manualReasons.push("MISSING_MOVE_IN_DATE");
  }

  if (
    moveInDateOnly &&
    availableUntilOnly &&
    availableUntilOnly < moveInDateOnly
  ) {
    manualReasons.push("AVAILABLE_UNTIL_BEFORE_MOVE_IN_DATE");
  }

  if (availableUntilOnly && availableUntilOnly < nowDateOnly) {
    manualReasons.push("AVAILABLE_UNTIL_IN_PAST");
  }

  if (snapshot.status !== "ACTIVE" && snapshot.status !== "PAUSED") {
    manualReasons.push("UNSUPPORTED_STATUS_FOR_AUTO_CONVERT");
  }

  if (snapshot.availabilitySource !== "LEGACY_BOOKING") {
    return {
      cohort: "manual_review",
      reasons: uniqueReasons([...manualReasons, ...blockedReasons]),
    };
  }

  if (blockedReasons.length > 0) {
    return {
      cohort: "blocked_legacy_state",
      reasons: uniqueReasons([...blockedReasons, ...manualReasons]),
    };
  }

  if (manualReasons.length > 0) {
    return {
      cohort: "manual_review",
      reasons: uniqueReasons(manualReasons),
    };
  }

  return {
    cohort: "clean_auto_convert",
    reasons: [],
  };
}
