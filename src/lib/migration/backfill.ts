import type { ListingStatus, Prisma } from "@prisma/client";

import { prisma } from "../prisma";
import { markListingDirtyInTx } from "../search/search-doc-dirty";
import {
  MIGRATION_COHORTS,
  MIGRATION_REASON_CODES,
  classifyListingForHostManagedMigration,
  type ListingMigrationClassification,
  type ListingMigrationSnapshot,
  type MigrationCohort,
  type MigrationReasonCode,
} from "./classifier";

type QueryClient = Prisma.TransactionClient | typeof prisma;

const DEFAULT_BATCH_SIZE = 200;

interface RawListingMigrationSnapshot {
  id: string;
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

export interface HostManagedMigrationUpdateData {
  availabilitySource: "HOST_MANAGED";
  openSlots: number;
  availableSlots: number;
  needsMigrationReview: false;
  status: Extract<ListingStatus, "ACTIVE" | "PAUSED"> | "ACTIVE" | "PAUSED";
  statusReason: null;
  totalSlots: number;
  moveInDate: Date;
  availableUntil: Date | null;
  minStayMonths: number;
  lastConfirmedAt: Date;
  freshnessReminderSentAt: null;
  freshnessWarningSentAt: null;
  autoPausedAt: null;
}

export interface PlannedHostManagedMigrationBackfill {
  listingId: string;
  classification: ListingMigrationClassification;
  shouldApply: boolean;
  updateData: HostManagedMigrationUpdateData | null;
}

export interface ListingMigrationReportRow {
  snapshot: ListingMigrationSnapshot;
  classification: ListingMigrationClassification;
  backfillPlan: PlannedHostManagedMigrationBackfill;
}

export interface ListingMigrationReportSummary {
  totalListings: number;
  cohortCounts: Record<MigrationCohort, number>;
  reasonCounts: Record<MigrationReasonCode, number>;
}

export interface HostManagedMigrationReport {
  generatedAt: string;
  filter: {
    listingId: string | null;
    batchSize: number;
  };
  summary: ListingMigrationReportSummary;
  rows: ListingMigrationReportRow[];
}

export interface FetchListingMigrationSnapshotsPageOptions {
  afterId?: string | null;
  batchSize?: number;
  listingId?: string | null;
  now?: Date;
  tx?: QueryClient;
}

export interface GenerateHostManagedMigrationReportOptions {
  batchSize?: number;
  listingId?: string | null;
  now?: Date;
}

export interface ApplyHostManagedMigrationBackfillResult {
  listingId: string;
  outcome: "applied" | "skipped" | "not_found";
  classification: ListingMigrationClassification | null;
  updateData: HostManagedMigrationUpdateData | null;
}

function getInventoryWindowStart(now: Date): Date {
  return new Date(now.toISOString().slice(0, 10));
}

function normalizeSnapshot(
  row: RawListingMigrationSnapshot
): ListingMigrationSnapshot {
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

function createEmptySummary(): ListingMigrationReportSummary {
  return {
    totalListings: 0,
    cohortCounts: Object.fromEntries(
      MIGRATION_COHORTS.map((cohort) => [cohort, 0])
    ) as Record<MigrationCohort, number>,
    reasonCounts: Object.fromEntries(
      MIGRATION_REASON_CODES.map((reason) => [reason, 0])
    ) as Record<MigrationReasonCode, number>,
  };
}

function addReportRowToSummary(
  summary: ListingMigrationReportSummary,
  row: ListingMigrationReportRow
): void {
  summary.totalListings += 1;
  summary.cohortCounts[row.classification.cohort] += 1;

  for (const reason of row.classification.reasons) {
    summary.reasonCounts[reason] += 1;
  }
}

function buildReportRow(
  snapshot: ListingMigrationSnapshot,
  now: Date
): ListingMigrationReportRow {
  const classification = classifyListingForHostManagedMigration(snapshot, now);
  const backfillPlan = planHostManagedMigrationBackfill(snapshot, now);

  return {
    snapshot,
    classification,
    backfillPlan,
  };
}

// CFM-405c: markListingDirtyAfterMigration is no longer needed as a separate
// post-tx helper — the migration backfill tx now calls markListingDirtyInTx
// directly so the dirty mark commits atomically with the listing update.

export function planHostManagedMigrationBackfill(
  snapshot: ListingMigrationSnapshot,
  now: Date = new Date()
): PlannedHostManagedMigrationBackfill {
  const classification = classifyListingForHostManagedMigration(snapshot, now);

  if (
    classification.cohort !== "clean_auto_convert" ||
    (snapshot.status !== "ACTIVE" && snapshot.status !== "PAUSED") ||
    !snapshot.moveInDate
  ) {
    return {
      listingId: snapshot.id,
      classification,
      shouldApply: false,
      updateData: null,
    };
  }

  return {
    listingId: snapshot.id,
    classification,
    shouldApply: true,
    updateData: {
      availabilitySource: "HOST_MANAGED",
      openSlots: snapshot.availableSlots,
      availableSlots: snapshot.availableSlots,
      needsMigrationReview: false,
      status: snapshot.status,
      statusReason: null,
      totalSlots: snapshot.totalSlots,
      moveInDate: snapshot.moveInDate,
      availableUntil: snapshot.availableUntil,
      minStayMonths: snapshot.minStayMonths,
      lastConfirmedAt: now,
      freshnessReminderSentAt: null,
      freshnessWarningSentAt: null,
      autoPausedAt: null,
    },
  };
}

export async function fetchListingMigrationSnapshotsPage(
  options: FetchListingMigrationSnapshotsPageOptions = {}
): Promise<ListingMigrationSnapshot[]> {
  const db = options.tx ?? prisma;
  const now = options.now ?? new Date();
  const inventoryWindowStart = getInventoryWindowStart(now);
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const afterId = options.afterId ?? null;
  const listingId = options.listingId ?? null;

  const rows = await db.$queryRaw<RawListingMigrationSnapshot[]>`
    SELECT
      l.id,
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
    WHERE (${listingId}::text IS NULL OR l.id = ${listingId})
      AND (${afterId}::text IS NULL OR l.id > ${afterId})
    ORDER BY l.id
    LIMIT ${batchSize}
  `;

  return rows.map(normalizeSnapshot);
}

async function fetchLockedListingMigrationSnapshot(
  tx: Prisma.TransactionClient,
  listingId: string,
  now: Date
): Promise<ListingMigrationSnapshot | null> {
  const inventoryWindowStart = getInventoryWindowStart(now);
  const rows = await tx.$queryRaw<RawListingMigrationSnapshot[]>`
    SELECT
      l.id,
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
    WHERE l.id = ${listingId}
    FOR UPDATE OF l
  `;

  return rows[0] ? normalizeSnapshot(rows[0]) : null;
}

export async function generateHostManagedMigrationReport(
  options: GenerateHostManagedMigrationReportOptions = {}
): Promise<HostManagedMigrationReport> {
  const now = options.now ?? new Date();
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const rows: ListingMigrationReportRow[] = [];
  const summary = createEmptySummary();

  if (options.listingId) {
    const snapshots = await fetchListingMigrationSnapshotsPage({
      listingId: options.listingId,
      batchSize: 1,
      now,
    });

    for (const snapshot of snapshots) {
      const row = buildReportRow(snapshot, now);
      rows.push(row);
      addReportRowToSummary(summary, row);
    }
  } else {
    let afterId: string | null = null;

    while (true) {
      const snapshots = await fetchListingMigrationSnapshotsPage({
        afterId,
        batchSize,
        now,
      });

      if (snapshots.length === 0) {
        break;
      }

      for (const snapshot of snapshots) {
        const row = buildReportRow(snapshot, now);
        rows.push(row);
        addReportRowToSummary(summary, row);
      }

      afterId = snapshots[snapshots.length - 1].id;
    }
  }

  return {
    generatedAt: now.toISOString(),
    filter: {
      listingId: options.listingId ?? null,
      batchSize,
    },
    summary,
    rows,
  };
}

export async function applyHostManagedMigrationBackfillForListing(
  listingId: string,
  now: Date = new Date()
): Promise<ApplyHostManagedMigrationBackfillResult> {
  const result = await prisma.$transaction(async (tx) => {
    const snapshot = await fetchLockedListingMigrationSnapshot(tx, listingId, now);

    if (!snapshot) {
      return {
        listingId,
        outcome: "not_found" as const,
        classification: null,
        updateData: null,
      };
    }

    const backfillPlan = planHostManagedMigrationBackfill(snapshot, now);

    if (!backfillPlan.shouldApply || !backfillPlan.updateData) {
      return {
        listingId,
        outcome: "skipped" as const,
        classification: backfillPlan.classification,
        updateData: null,
      };
    }

    await tx.listing.update({
      where: { id: listingId },
      data: {
        ...backfillPlan.updateData,
        version: { increment: 1 },
      },
    });

    await markListingDirtyInTx(tx, listingId, "listing_updated");

    return {
      listingId,
      outcome: "applied" as const,
      classification: backfillPlan.classification,
      updateData: backfillPlan.updateData,
    };
  });

  return result;
}
