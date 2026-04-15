import type {
  ListingAvailabilitySource,
  ListingStatus,
} from "@prisma/client";

export const HOST_MANAGED_STATUS_REASONS = [
  "NO_OPEN_SLOTS",
  "AVAILABLE_UNTIL_PASSED",
  "HOST_PAUSED",
  "ADMIN_PAUSED",
  "MIGRATION_REVIEW",
  "STALE_AUTO_PAUSE",
  "MANUAL_CLOSED",
] as const;

export type HostManagedStatusReason =
  (typeof HOST_MANAGED_STATUS_REASONS)[number];

export const HOST_MANAGED_WRITE_ERROR_MESSAGES = {
  VERSION_CONFLICT:
    "This listing was updated elsewhere. Reload and try again.",
  HOST_MANAGED_WRITE_PATH_REQUIRED:
    "This listing now uses host-managed availability. Reload and use the new availability editor.",
  HOST_MANAGED_ACTIVE_REQUIRES_OPEN_SLOTS:
    "Active host-managed listings require at least one open slot.",
  HOST_MANAGED_INVALID_DATE_RANGE:
    "Host-managed listings require a valid availability window.",
  HOST_MANAGED_INVALID_MIN_STAY:
    "Minimum stay must be at least 1 month.",
  HOST_MANAGED_MIGRATION_REVIEW_REQUIRED:
    "This listing must finish migration review before it can be made active.",
  HOST_MANAGED_INVALID_TOTAL_SLOTS:
    "Total slots must be at least 1.",
  HOST_MANAGED_INVALID_OPEN_SLOTS:
    "Open slots must be between 0 and total slots.",
} as const;

export type HostManagedWriteErrorCode =
  keyof typeof HOST_MANAGED_WRITE_ERROR_MESSAGES;

export interface HostManagedWriteError {
  ok: false;
  code: HostManagedWriteErrorCode;
  error: string;
  httpStatus: 400 | 409;
}

export interface HostManagedListingWriteCurrent {
  id: string;
  version: number;
  availabilitySource: ListingAvailabilitySource | "LEGACY_BOOKING" | "HOST_MANAGED";
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
}

export interface HostManagedListingWriteInput {
  expectedVersion: number;
  openSlots?: number | null;
  totalSlots?: number;
  moveInDate?: Date | null;
  availableUntil?: Date | null;
  minStayMonths?: number;
  status?: ListingStatus | "ACTIVE" | "PAUSED" | "RENTED";
}

export interface HostManagedListingWriteContext {
  actor: "host" | "admin";
  now: Date;
}

export interface HostManagedListingWriteData {
  version: number;
  status: ListingStatus | "ACTIVE" | "PAUSED" | "RENTED";
  statusReason: HostManagedStatusReason | null;
  totalSlots?: number;
  openSlots?: number;
  availableSlots?: number;
  moveInDate?: Date | null;
  availableUntil?: Date | null;
  minStayMonths?: number;
  lastConfirmedAt?: Date | null;
  freshnessReminderSentAt?: Date | null;
  freshnessWarningSentAt?: Date | null;
  autoPausedAt?: Date | null;
}

export interface PreparedHostManagedListingWrite {
  ok: true;
  data: HostManagedListingWriteData;
  availabilityAffecting: boolean;
  status: ListingStatus | "ACTIVE" | "PAUSED" | "RENTED";
  statusReason: HostManagedStatusReason | null;
  nextVersion: number;
}

export type PrepareHostManagedListingWriteResult =
  | PreparedHostManagedListingWrite
  | HostManagedWriteError;

export interface HostManagedLegacyWritePathInput {
  availabilitySource: ListingAvailabilitySource | "LEGACY_BOOKING" | "HOST_MANAGED";
  moveInDateChanged: boolean;
  bookingModeChanged: boolean;
  totalSlotsChanged: boolean;
}

function makeWriteError(
  code: HostManagedWriteErrorCode,
  httpStatus: 400 | 409
): HostManagedWriteError {
  return {
    ok: false,
    code,
    error: HOST_MANAGED_WRITE_ERROR_MESSAGES[code],
    httpStatus,
  };
}

function dateOnly(value: Date | null | undefined): string | null {
  if (!value || Number.isNaN(value.getTime())) {
    return null;
  }

  return value.toISOString().slice(0, 10);
}

function isPastDate(value: Date | null, now: Date): boolean {
  const candidate = dateOnly(value);
  if (!candidate) {
    return false;
  }

  return candidate < now.toISOString().slice(0, 10);
}

function statusReasonForExplicitStatus(
  status: ListingStatus | "ACTIVE" | "PAUSED" | "RENTED",
  actor: HostManagedListingWriteContext["actor"],
  options: {
    openSlots: number | null;
    availableUntilPast: boolean;
  }
): HostManagedStatusReason | null {
  if (status === "ACTIVE") {
    return null;
  }

  if (status === "PAUSED") {
    return actor === "admin" ? "ADMIN_PAUSED" : "HOST_PAUSED";
  }

  if (options.openSlots === 0) {
    return "NO_OPEN_SLOTS";
  }

  if (options.availableUntilPast) {
    return "AVAILABLE_UNTIL_PASSED";
  }

  return "MANUAL_CLOSED";
}

export function requiresDedicatedHostManagedWritePath(
  input: HostManagedLegacyWritePathInput
): boolean {
  return (
    input.availabilitySource === "HOST_MANAGED" &&
    (input.moveInDateChanged ||
      input.bookingModeChanged ||
      input.totalSlotsChanged)
  );
}

export function prepareHostManagedListingWrite(
  current: HostManagedListingWriteCurrent,
  input: HostManagedListingWriteInput,
  context: HostManagedListingWriteContext
): PrepareHostManagedListingWriteResult {
  if (current.availabilitySource !== "HOST_MANAGED") {
    return makeWriteError("HOST_MANAGED_WRITE_PATH_REQUIRED", 409);
  }

  if (input.expectedVersion !== current.version) {
    return makeWriteError("VERSION_CONFLICT", 409);
  }

  const nextTotalSlots = input.totalSlots ?? current.totalSlots;
  const nextOpenSlots =
    input.openSlots !== undefined ? input.openSlots : current.openSlots;
  const nextMoveInDate =
    input.moveInDate !== undefined ? input.moveInDate : current.moveInDate;
  const nextAvailableUntil =
    input.availableUntil !== undefined
      ? input.availableUntil
      : current.availableUntil;
  const nextMinStayMonths = input.minStayMonths ?? current.minStayMonths;

  if (nextTotalSlots < 1) {
    return makeWriteError("HOST_MANAGED_INVALID_TOTAL_SLOTS", 400);
  }

  if (nextMinStayMonths < 1) {
    return makeWriteError("HOST_MANAGED_INVALID_MIN_STAY", 400);
  }

  if (
    nextOpenSlots !== null &&
    (nextOpenSlots < 0 || nextOpenSlots > nextTotalSlots)
  ) {
    return makeWriteError("HOST_MANAGED_INVALID_OPEN_SLOTS", 400);
  }

  const nextMoveInDateOnly = dateOnly(nextMoveInDate);
  const nextAvailableUntilOnly = dateOnly(nextAvailableUntil);
  const availableUntilPast = isPastDate(nextAvailableUntil, context.now);

  if (
    nextAvailableUntilOnly &&
    nextMoveInDateOnly &&
    nextAvailableUntilOnly < nextMoveInDateOnly
  ) {
    return makeWriteError("HOST_MANAGED_INVALID_DATE_RANGE", 400);
  }

  let nextStatus = input.status ?? current.status;
  let nextStatusReason = current.statusReason as HostManagedStatusReason | null;

  if (input.status === undefined) {
    if (nextOpenSlots === 0) {
      nextStatus = "RENTED";
      nextStatusReason = "NO_OPEN_SLOTS";
    } else if (availableUntilPast) {
      nextStatus = "RENTED";
      nextStatusReason = "AVAILABLE_UNTIL_PASSED";
    }
  } else {
    nextStatusReason = statusReasonForExplicitStatus(input.status, context.actor, {
      openSlots: nextOpenSlots,
      availableUntilPast,
    });
  }

  if (nextStatus === "ACTIVE") {
    if (current.needsMigrationReview) {
      return makeWriteError("HOST_MANAGED_MIGRATION_REVIEW_REQUIRED", 400);
    }

    if (nextOpenSlots == null || nextOpenSlots <= 0) {
      return makeWriteError(
        "HOST_MANAGED_ACTIVE_REQUIRES_OPEN_SLOTS",
        400
      );
    }

    if (!nextMoveInDateOnly || availableUntilPast) {
      return makeWriteError("HOST_MANAGED_INVALID_DATE_RANGE", 400);
    }

    nextStatusReason = null;
  }

  const availabilityAffecting =
    input.openSlots !== undefined ||
    input.totalSlots !== undefined ||
    input.moveInDate !== undefined ||
    input.availableUntil !== undefined ||
    input.minStayMonths !== undefined;

  if (availabilityAffecting && nextOpenSlots === null) {
    return makeWriteError("HOST_MANAGED_INVALID_OPEN_SLOTS", 400);
  }

  const nextVersion = current.version + 1;
  const data: HostManagedListingWriteData = {
    version: nextVersion,
    status: nextStatus,
    statusReason: nextStatusReason,
  };

  if (availabilityAffecting) {
    data.totalSlots = nextTotalSlots;
    data.openSlots = nextOpenSlots!;
    data.availableSlots = nextOpenSlots!;
    data.moveInDate = nextMoveInDate;
    data.availableUntil = nextAvailableUntil;
    data.minStayMonths = nextMinStayMonths;
    data.lastConfirmedAt = context.now;
    data.freshnessReminderSentAt = null;
    data.freshnessWarningSentAt = null;
    data.autoPausedAt = null;
  }

  return {
    ok: true,
    data,
    availabilityAffecting,
    status: nextStatus,
    statusReason: nextStatusReason,
    nextVersion,
  };
}
