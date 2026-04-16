import { Prisma } from "@prisma/client";

import {
  HOST_MANAGED_WRITE_ERROR_MESSAGES,
  prepareHostManagedListingWrite,
  type HostManagedListingWriteCurrent,
  type HostManagedWriteErrorCode,
} from "@/lib/listings/host-managed-write";
import { prisma } from "@/lib/prisma";
import { resolvePublicAvailability } from "@/lib/search/public-availability";

import {
  classifyListingForHostManagedMigration,
  type ListingMigrationSnapshot,
  type MigrationCohort,
  type MigrationReasonCode,
} from "./classifier";

type QueryClient = Prisma.TransactionClient | typeof prisma;
type ReviewActor = "host" | "admin";

type ReasonSeverity = "blocked" | "fix" | "info";

interface RawListingMigrationReviewRow {
  id: string;
  ownerId: string;
  title: string;
  version: number;
  availabilitySource: "LEGACY_BOOKING" | "HOST_MANAGED";
  status: "ACTIVE" | "PAUSED" | "RENTED";
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

export interface LockedListingMigrationReviewRecord
  extends ListingMigrationSnapshot {
  ownerId: string;
  title: string;
}

export interface MigrationReviewReasonDetail {
  code: MigrationReasonCode | HostManagedWriteErrorCode;
  summary: string;
  fixHint: string;
  severity: ReasonSeverity;
}

export interface ListingMigrationReviewState {
  listingId: string;
  availabilitySource: "LEGACY_BOOKING" | "HOST_MANAGED";
  needsMigrationReview: boolean;
  status: "ACTIVE" | "PAUSED" | "RENTED";
  statusReason: string | null;
  cohort: MigrationCohort;
  publicStatus: string;
  searchEligible: boolean;
  isReviewRequired: boolean;
  canReviewNow: boolean;
  reviewActionLabel: "Convert and keep paused" | "Mark reviewed";
  reasonCodes: MigrationReasonCode[];
  reasons: MigrationReviewReasonDetail[];
  blockingReasonCodes: Array<MigrationReasonCode | HostManagedWriteErrorCode>;
  blockingReasons: MigrationReviewReasonDetail[];
  helperErrorCode: HostManagedWriteErrorCode | null;
  helperError: string | null;
}

export interface ReviewListingMigrationSuccess {
  success: true;
  listingId: string;
  availabilitySource: "HOST_MANAGED";
  needsMigrationReview: false;
  status: "PAUSED";
  statusReason: string | null;
  version: number;
}

export interface ReviewListingMigrationFailure {
  success?: false;
  error: string;
  code:
    | "VERSION_CONFLICT"
    | "MIGRATION_REVIEW_NOT_REQUIRED"
    | "MIGRATION_REVIEW_BLOCKED";
  reasonCodes?: Array<MigrationReasonCode | HostManagedWriteErrorCode>;
  reasons?: MigrationReviewReasonDetail[];
  helperErrorCode?: HostManagedWriteErrorCode | null;
  helperError?: string | null;
}

export type ReviewListingMigrationResult =
  | ReviewListingMigrationSuccess
  | ReviewListingMigrationFailure;

const REVIEW_REASON_DETAILS: Record<
  MigrationReasonCode,
  Omit<MigrationReviewReasonDetail, "code">
> = {
  ALREADY_HOST_MANAGED: {
    summary: "This listing already uses host-managed availability.",
    fixHint: "Review the current availability fields, then mark the listing reviewed when they are correct.",
    severity: "info",
  },
  HAS_PENDING_BOOKINGS: {
    summary: "Pending booking requests still reference this legacy listing.",
    fixHint: "Resolve pending booking requests before converting this listing.",
    severity: "blocked",
  },
  HAS_ACCEPTED_BOOKINGS: {
    summary: "Accepted legacy bookings still reference this listing.",
    fixHint: "Wait for accepted legacy bookings to end or resolve them before converting.",
    severity: "blocked",
  },
  HAS_HELD_BOOKINGS: {
    summary: "Active holds still reference this legacy listing.",
    fixHint: "Let active holds expire or clear them before converting this listing.",
    severity: "blocked",
  },
  HAS_FUTURE_INVENTORY_ROWS: {
    summary: "Future inventory rows already exist for this listing.",
    fixHint: "Resolve or clear the future inventory rows before marking this listing reviewed.",
    severity: "blocked",
  },
  SHADOW_OPEN_SLOTS_PRESENT: {
    summary: "Legacy data already contains host-managed slot state.",
    fixHint: "Use the review action to replace shadow slot state with the canonical paused host-managed state.",
    severity: "info",
  },
  SHADOW_STATUS_REASON_PRESENT: {
    summary: "Legacy data already contains a host-managed status reason.",
    fixHint: "Use the review action to replace the shadow status reason with an explicit paused host-managed state.",
    severity: "info",
  },
  NEEDS_MIGRATION_REVIEW_FLAG: {
    summary: "This listing is flagged for manual migration review.",
    fixHint: "Keep the listing paused until review is completed.",
    severity: "info",
  },
  INVALID_TOTAL_SLOTS: {
    summary: "Total slots must be at least 1.",
    fixHint: "Set total slots to a value greater than 0 before review.",
    severity: "fix",
  },
  INVALID_AVAILABLE_SLOTS: {
    summary: "Available slots fall outside the allowed range.",
    fixHint: "Correct the available or open slots so they stay between 0 and total slots.",
    severity: "fix",
  },
  AMBIGUOUS_AVAILABLE_SLOTS: {
    summary: "Legacy available slots do not match total slots.",
    fixHint: "This listing cannot safely derive host-managed open slots from legacy availability yet.",
    severity: "fix",
  },
  MISSING_MOVE_IN_DATE: {
    summary: "Move-in date is missing.",
    fixHint: "Set a move-in date before reviewing this listing.",
    severity: "fix",
  },
  AVAILABLE_UNTIL_BEFORE_MOVE_IN_DATE: {
    summary: "Available until is earlier than the move-in date.",
    fixHint: "Adjust the availability window so it does not end before move-in.",
    severity: "fix",
  },
  AVAILABLE_UNTIL_IN_PAST: {
    summary: "Available until has already passed.",
    fixHint: "Set a future availability end date or clear the field before review.",
    severity: "fix",
  },
  UNSUPPORTED_STATUS_FOR_AUTO_CONVERT: {
    summary: "The current listing status prevented automatic migration.",
    fixHint: "Manual review can still convert the listing into a paused host-managed state.",
    severity: "info",
  },
};

const HOST_MANAGED_REVIEW_IGNORE_REASONS = new Set<MigrationReasonCode>([
  "ALREADY_HOST_MANAGED",
  "SHADOW_OPEN_SLOTS_PRESENT",
  "SHADOW_STATUS_REASON_PRESENT",
  "NEEDS_MIGRATION_REVIEW_FLAG",
  "AMBIGUOUS_AVAILABLE_SLOTS",
  "UNSUPPORTED_STATUS_FOR_AUTO_CONVERT",
]);

const LEGACY_REVIEW_IGNORE_REASONS = new Set<MigrationReasonCode>([
  "SHADOW_OPEN_SLOTS_PRESENT",
  "SHADOW_STATUS_REASON_PRESENT",
  "NEEDS_MIGRATION_REVIEW_FLAG",
  "UNSUPPORTED_STATUS_FOR_AUTO_CONVERT",
]);

function getInventoryWindowStart(now: Date): Date {
  return new Date(now.toISOString().slice(0, 10));
}

function normalizeReviewRow(
  row: RawListingMigrationReviewRow
): LockedListingMigrationReviewRecord {
  return {
    ...row,
    version: Number(row.version),
    openSlots: row.openSlots === null ? null : Number(row.openSlots),
    availableSlots: Number(row.availableSlots),
    totalSlots: Number(row.totalSlots),
    minStayMonths: Number(row.minStayMonths),
    pendingBookingCount: Number(row.pendingBookingCount),
    acceptedBookingCount: Number(row.acceptedBookingCount),
    heldBookingCount: Number(row.heldBookingCount),
    futureInventoryRowCount: Number(row.futureInventoryRowCount),
    futurePeakReservedLoad: Number(row.futurePeakReservedLoad),
  };
}

function toReviewReasonDetail(
  code: MigrationReasonCode | HostManagedWriteErrorCode
): MigrationReviewReasonDetail {
  if (code in REVIEW_REASON_DETAILS) {
    return {
      code,
      ...REVIEW_REASON_DETAILS[code as MigrationReasonCode],
    };
  }

  return {
    code,
    summary: HOST_MANAGED_WRITE_ERROR_MESSAGES[code as HostManagedWriteErrorCode],
    fixHint: "Update the required host-managed availability fields, then review the listing again.",
    severity: "fix",
  };
}

function getIgnoredReviewReasons(
  availabilitySource: LockedListingMigrationReviewRecord["availabilitySource"]
): ReadonlySet<MigrationReasonCode> {
  return availabilitySource === "HOST_MANAGED"
    ? HOST_MANAGED_REVIEW_IGNORE_REASONS
    : LEGACY_REVIEW_IGNORE_REASONS;
}

function buildReviewWriteCandidate(
  snapshot: LockedListingMigrationReviewRecord
): HostManagedListingWriteCurrent {
  if (snapshot.availabilitySource === "HOST_MANAGED") {
    return {
      ...snapshot,
      availableSlots: snapshot.availableSlots,
    };
  }

  return {
    ...snapshot,
    availabilitySource: "HOST_MANAGED",
    openSlots: snapshot.openSlots,
    availableSlots: snapshot.availableSlots,
  };
}

function preparePausedReviewWrite(
  snapshot: LockedListingMigrationReviewRecord,
  actor: ReviewActor,
  now: Date
) {
  const writeCandidate = buildReviewWriteCandidate(snapshot);

  return prepareHostManagedListingWrite(
    writeCandidate,
    {
      expectedVersion: snapshot.version,
      openSlots:
        snapshot.availabilitySource === "HOST_MANAGED"
          ? snapshot.openSlots
          : snapshot.availableSlots,
      totalSlots: snapshot.totalSlots,
      moveInDate: snapshot.moveInDate,
      availableUntil: snapshot.availableUntil,
      minStayMonths: snapshot.minStayMonths,
      status: "PAUSED",
    },
    {
      actor,
      now,
    }
  );
}

export function buildListingMigrationReviewState(
  snapshot: LockedListingMigrationReviewRecord,
  options: { actor?: ReviewActor; now?: Date } = {}
): ListingMigrationReviewState {
  const now = options.now ?? new Date();
  const actor = options.actor ?? "host";
  const classification = classifyListingForHostManagedMigration(snapshot, now);
  const visibility = resolvePublicAvailability(snapshot, { now });
  const preparedWrite = preparePausedReviewWrite(snapshot, actor, now);
  const ignoredReasonCodes = getIgnoredReviewReasons(snapshot.availabilitySource);
  const blockingReasonCodes = classification.reasons.filter(
    (code) => !ignoredReasonCodes.has(code)
  );
  const helperErrorCode = preparedWrite.ok ? null : preparedWrite.code;
  const helperError = preparedWrite.ok ? null : preparedWrite.error;
  const combinedBlockingReasonCodes = Array.from(
    new Set(
      preparedWrite.ok
        ? blockingReasonCodes
        : [...blockingReasonCodes, preparedWrite.code]
    )
  );
  const isReviewRequired =
    snapshot.needsMigrationReview ||
    classification.cohort !== "clean_auto_convert";

  return {
    listingId: snapshot.id,
    availabilitySource: snapshot.availabilitySource,
    needsMigrationReview: snapshot.needsMigrationReview,
    status: snapshot.status,
    statusReason: snapshot.statusReason,
    cohort: classification.cohort,
    publicStatus: visibility.publicStatus,
    searchEligible: visibility.searchEligible,
    isReviewRequired,
    canReviewNow:
      isReviewRequired && blockingReasonCodes.length === 0 && preparedWrite.ok,
    reviewActionLabel:
      snapshot.availabilitySource === "HOST_MANAGED"
        ? "Mark reviewed"
        : "Convert and keep paused",
    reasonCodes: classification.reasons,
    reasons: classification.reasons.map(toReviewReasonDetail),
    blockingReasonCodes: combinedBlockingReasonCodes,
    blockingReasons: combinedBlockingReasonCodes.map(toReviewReasonDetail),
    helperErrorCode,
    helperError,
  };
}

async function fetchListingMigrationReviewRows(
  listingIds: string[],
  options: {
    now?: Date;
    tx?: QueryClient;
    lockForUpdate?: boolean;
  } = {}
): Promise<LockedListingMigrationReviewRecord[]> {
  if (listingIds.length === 0) {
    return [];
  }

  const now = options.now ?? new Date();
  const inventoryWindowStart = getInventoryWindowStart(now);
  const db = options.tx ?? prisma;
  const lockClause = options.lockForUpdate
    ? Prisma.sql`FOR UPDATE OF l`
    : Prisma.empty;

  const rows = await db.$queryRaw<RawListingMigrationReviewRow[]>`
    SELECT
      l.id,
      l."ownerId" as "ownerId",
      l.title,
      l.version,
      l."availabilitySource" as "availabilitySource",
      l.status,
      l."statusReason" as "statusReason",
      l."needsMigrationReview" as "needsMigrationReview",
      l."openSlots" as "openSlots",
      l."availableSlots"::int as "availableSlots",
      l."totalSlots"::int as "totalSlots",
      l."moveInDate" as "moveInDate",
      l."availableUntil" as "availableUntil",
      l."minStayMonths"::int as "minStayMonths",
      l."lastConfirmedAt" as "lastConfirmedAt",
      l."freshnessReminderSentAt" as "freshnessReminderSentAt",
      l."freshnessWarningSentAt" as "freshnessWarningSentAt",
      l."autoPausedAt" as "autoPausedAt",
      COALESCE(booking_counts."pendingBookingCount", 0)::int as "pendingBookingCount",
      COALESCE(booking_counts."acceptedBookingCount", 0)::int as "acceptedBookingCount",
      COALESCE(booking_counts."heldBookingCount", 0)::int as "heldBookingCount",
      COALESCE(inventory_counts."futureInventoryRowCount", 0)::int as "futureInventoryRowCount",
      COALESCE(inventory_counts."futurePeakReservedLoad", 0)::int as "futurePeakReservedLoad"
    FROM "Listing" l
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) FILTER (
          WHERE b.status = 'PENDING'
            AND b."endDate"::date > ${inventoryWindowStart}::date
        )::int as "pendingBookingCount",
        COUNT(*) FILTER (
          WHERE b.status = 'ACCEPTED'
            AND b."endDate"::date > ${inventoryWindowStart}::date
        )::int as "acceptedBookingCount",
        COUNT(*) FILTER (
          WHERE b.status = 'HELD'
            AND b."endDate"::date > ${inventoryWindowStart}::date
            AND b."heldUntil" > ${now}
        )::int as "heldBookingCount"
      FROM "Booking" b
      WHERE b."listingId" = l.id
        AND (
          (b.status IN ('PENDING', 'ACCEPTED') AND b."endDate"::date > ${inventoryWindowStart}::date)
          OR (
            b.status = 'HELD'
            AND b."endDate"::date > ${inventoryWindowStart}::date
            AND b."heldUntil" > ${now}
          )
        )
    ) booking_counts ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int as "futureInventoryRowCount",
        COALESCE(MAX(ldi.held_slots + ldi.accepted_slots), 0)::int as "futurePeakReservedLoad"
      FROM listing_day_inventory ldi
      WHERE ldi.listing_id = l.id
        AND ldi.day >= ${inventoryWindowStart}::date
    ) inventory_counts ON TRUE
    WHERE l.id IN (${Prisma.join(listingIds)})
    ORDER BY l.id
    ${lockClause}
  `;

  return rows.map(normalizeReviewRow);
}

export async function fetchLockedListingMigrationReviewRecord(
  tx: Prisma.TransactionClient,
  listingId: string,
  now: Date = new Date()
): Promise<LockedListingMigrationReviewRecord | null> {
  const [record] = await fetchListingMigrationReviewRows([listingId], {
    now,
    tx,
    lockForUpdate: true,
  });

  return record ?? null;
}

export async function getListingMigrationReviewState(
  listingId: string,
  options: { actor?: ReviewActor; now?: Date } = {}
): Promise<ListingMigrationReviewState | null> {
  const [record] = await fetchListingMigrationReviewRows([listingId], {
    now: options.now,
  });

  return record ? buildListingMigrationReviewState(record, options) : null;
}

export async function getListingMigrationReviewStates(
  listingIds: string[],
  options: { actor?: ReviewActor; now?: Date } = {}
): Promise<Record<string, ListingMigrationReviewState>> {
  const rows = await fetchListingMigrationReviewRows(listingIds, {
    now: options.now,
  });

  return Object.fromEntries(
    rows.map((row) => [row.id, buildListingMigrationReviewState(row, options)])
  );
}

export async function executeLockedListingMigrationReview(
  tx: Prisma.TransactionClient,
  snapshot: LockedListingMigrationReviewRecord,
  options: {
    actor: ReviewActor;
    expectedVersion: number;
    now?: Date;
  }
): Promise<ReviewListingMigrationResult> {
  if (snapshot.version !== options.expectedVersion) {
    return {
      error: HOST_MANAGED_WRITE_ERROR_MESSAGES.VERSION_CONFLICT,
      code: "VERSION_CONFLICT",
    };
  }

  const now = options.now ?? new Date();
  const reviewState = buildListingMigrationReviewState(snapshot, {
    actor: options.actor,
    now,
  });

  if (!reviewState.isReviewRequired) {
    return {
      error: "This listing does not require migration review.",
      code: "MIGRATION_REVIEW_NOT_REQUIRED",
    };
  }

  if (!reviewState.canReviewNow) {
    return {
      error:
        "Resolve the listed migration blockers before reviewing this listing.",
      code: "MIGRATION_REVIEW_BLOCKED",
      reasonCodes: reviewState.blockingReasonCodes,
      reasons: reviewState.blockingReasons,
      helperErrorCode: reviewState.helperErrorCode,
      helperError: reviewState.helperError,
    };
  }

  const preparedWrite = preparePausedReviewWrite(snapshot, options.actor, now);

  if (!preparedWrite.ok) {
    return {
      error:
        "Resolve the listed migration blockers before reviewing this listing.",
      code: "MIGRATION_REVIEW_BLOCKED",
      reasonCodes: [preparedWrite.code],
      reasons: [toReviewReasonDetail(preparedWrite.code)],
      helperErrorCode: preparedWrite.code,
      helperError: preparedWrite.error,
    };
  }

  await tx.listing.update({
    where: { id: snapshot.id },
    data: {
      ...preparedWrite.data,
      availabilitySource: "HOST_MANAGED",
      needsMigrationReview: false,
    },
  });

  return {
    success: true,
    listingId: snapshot.id,
    availabilitySource: "HOST_MANAGED",
    needsMigrationReview: false,
    status: "PAUSED",
    statusReason: preparedWrite.statusReason,
    version: preparedWrite.nextVersion,
  };
}
