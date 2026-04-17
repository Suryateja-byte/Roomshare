jest.mock("../../../lib/env", () => ({
  features: {
    searchDoc: true,
  },
}));

jest.mock("../../../lib/prisma", () => ({
  prisma: {
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    $transaction: jest.fn(),
  },
}));

jest.mock("../../../lib/logger", () => {
  const sync = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };

  return {
    logger: {
      sync,
    },
    sanitizeErrorMessage: (error: unknown) =>
      error instanceof Error ? error.message : String(error),
  };
});

import {
  applyHostManagedMigrationBackfillForListing,
  applyNeedsReviewFlagForListing,
  planHostManagedMigrationBackfill,
  type HostManagedMigrationReport,
  type ListingMigrationReportRow,
  type ListingMigrationReportSummary,
} from "../../../lib/migration/backfill";
import {
  MIGRATION_COHORTS,
  MIGRATION_REASON_CODES,
  classifyListingForHostManagedMigration,
  type ListingMigrationSnapshot,
  type MigrationCohort,
  type MigrationReasonCode,
} from "../../../lib/migration/classifier";
import { logger } from "../../../lib/logger";
import { prisma } from "../../../lib/prisma";

function makeSnapshot(
  overrides: Partial<ListingMigrationSnapshot> = {}
): ListingMigrationSnapshot {
  return {
    id: "listing-1",
    version: 4,
    availabilitySource: "LEGACY_BOOKING",
    status: "ACTIVE",
    statusReason: null,
    needsMigrationReview: false,
    openSlots: null,
    availableSlots: 2,
    totalSlots: 2,
    moveInDate: new Date("2026-05-01T00:00:00.000Z"),
    availableUntil: new Date("2026-08-01T00:00:00.000Z"),
    minStayMonths: 2,
    lastConfirmedAt: null,
    freshnessReminderSentAt: new Date("2026-04-01T00:00:00.000Z"),
    freshnessWarningSentAt: new Date("2026-04-08T00:00:00.000Z"),
    autoPausedAt: new Date("2026-04-10T00:00:00.000Z"),
    pendingBookingCount: 0,
    acceptedBookingCount: 0,
    heldBookingCount: 0,
    futureInventoryRowCount: 0,
    futurePeakReservedLoad: 0,
    ...overrides,
  };
}

function makeEmptySummary(): ListingMigrationReportSummary {
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

function buildReport(
  now: Date,
  snapshots: ListingMigrationSnapshot[]
): HostManagedMigrationReport {
  const rows: ListingMigrationReportRow[] = snapshots.map((snapshot) => ({
    snapshot,
    classification: classifyListingForHostManagedMigration(snapshot, now),
    backfillPlan: planHostManagedMigrationBackfill(snapshot, now),
  }));
  const summary = makeEmptySummary();

  for (const row of rows) {
    summary.totalListings += 1;
    summary.cohortCounts[row.classification.cohort] += 1;

    for (const reason of row.classification.reasons) {
      summary.reasonCounts[reason] += 1;
    }
  }

  return {
    generatedAt: now.toISOString(),
    filter: {
      listingId: null,
      batchSize: snapshots.length || 1,
    },
    summary,
    rows,
  };
}

const now = new Date("2026-04-15T12:00:00.000Z");

describe("CFM-502 backfill implementation", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it("treats already HOST_MANAGED rows as idempotent manual-review skips", () => {
    const result = planHostManagedMigrationBackfill(
      makeSnapshot({
        availabilitySource: "HOST_MANAGED",
        openSlots: 2,
      }),
      now
    );

    expect(result.shouldApply).toBe(false);
    expect(result.classification.cohort).toBe("manual_review");
    expect(result.classification.reasons).toContain("ALREADY_HOST_MANAGED");
  });

  it("preserves availableSlots === openSlots after a successful conversion", async () => {
    const updateMock = jest.fn().mockResolvedValue({ id: "listing-1" });
    const executeRawMock = jest.fn().mockResolvedValue(1);

    (prisma.$transaction as jest.Mock).mockImplementation(
      async (
        callback: (tx: {
          $queryRaw: jest.Mock;
          $executeRaw: jest.Mock;
          listing: { update: jest.Mock };
        }) => Promise<unknown>
      ) =>
        callback({
          $queryRaw: jest.fn().mockResolvedValue([makeSnapshot()]),
          $executeRaw: executeRawMock,
          listing: { update: updateMock },
        })
    );

    const result = await applyHostManagedMigrationBackfillForListing(
      "listing-1",
      now,
      "run-convert"
    );

    expect(result.outcome).toBe("applied");
    expect(result.updateData?.availableSlots).toBe(2);
    expect(result.updateData?.openSlots).toBe(2);
    expect(result.updateData?.availableSlots).toBe(result.updateData?.openSlots);
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "listing-1" },
      data: expect.objectContaining({
        availableSlots: 2,
        openSlots: 2,
        version: { increment: 1 },
      }),
    });
    expect(executeRawMock).toHaveBeenCalled();
    expect(logger.sync.info).toHaveBeenCalledWith(
      "cfm.backfill.converted",
      expect.objectContaining({
        runId: "run-convert",
        listingId: "listing-1",
        previousVersion: 4,
        nextVersion: 5,
      })
    );
  });

  it("stamps blocked LEGACY_BOOKING rows for review without flipping availabilitySource", async () => {
    const updateMock = jest.fn().mockResolvedValue({ id: "listing-1" });

    (prisma.$transaction as jest.Mock).mockImplementation(
      async (
        callback: (tx: {
          $queryRaw: jest.Mock;
          listing: { update: jest.Mock };
        }) => Promise<unknown>
      ) =>
        callback({
          $queryRaw: jest
            .fn()
            .mockResolvedValue([makeSnapshot({ pendingBookingCount: 1 })]),
          listing: { update: updateMock },
        })
    );

    const result = await applyNeedsReviewFlagForListing(
      "listing-1",
      now,
      "run-review",
      4
    );

    expect(result).toEqual({
      listingId: "listing-1",
      outcome: "applied",
      classification: {
        cohort: "blocked_legacy_state",
        reasons: ["HAS_PENDING_BOOKINGS"],
      },
    });
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "listing-1", version: 4 },
      data: {
        needsMigrationReview: true,
        version: { increment: 1 },
      },
    });
    expect(logger.sync.info).toHaveBeenCalledWith(
      "cfm.backfill.review_flag_set",
      expect.objectContaining({
        runId: "run-review",
        listingId: "listing-1",
        cohort: "blocked_legacy_state",
        fromSource: "LEGACY_BOOKING",
        toSource: "LEGACY_BOOKING",
      })
    );
  });

  it("prints the three-line dry-run write surface summary", async () => {
    const report = buildReport(now, [
      makeSnapshot({ id: "listing-clean" }),
      makeSnapshot({
        id: "listing-blocked",
        pendingBookingCount: 1,
      }),
      makeSnapshot({
        id: "listing-skip",
        needsMigrationReview: true,
      }),
    ]);

    jest.resetModules();

    const mockGenerate = jest.fn().mockResolvedValue(report);
    const mockConvert = jest.fn();
    const mockStamp = jest.fn();
    const mockDeferred = jest.fn();
    const mockProgress = jest.fn();
    jest.doMock("../../../lib/migration/backfill", () => ({
      applyHostManagedMigrationBackfillForListing: mockConvert,
      applyNeedsReviewFlagForListing: mockStamp,
      generateHostManagedMigrationReport: mockGenerate,
      isVersionConflictError: (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2025",
      logBackfillDeferred: mockDeferred,
      logBackfillProgress: mockProgress,
    }));

    const consoleSpy = jest
      .spyOn(console, "log")
      .mockImplementation(() => undefined);

    const { parseCliArgs, runBackfillCli } = await import(
      "../../../../scripts/cfm-migration-backfill"
    );

    await runBackfillCli(parseCliArgs(["--dry-run", "--batch-size", "50"]), {
      now,
      runId: "run-dry",
    });

    const output = consoleSpy.mock.calls.map((call) => call.join(" ")).join("\n");

    expect(output).toContain("would_flip_to_host_managed: 1");
    expect(output).toContain("would_stamp_needs_migration_review: 1");
    expect(output).toContain("would_skip: 1");
    expect(output).toContain("Dry-run only. No listings were mutated.");

    jest.dontMock("../../../lib/migration/backfill");
  });

  it("retries a version conflict and succeeds on the next attempt", async () => {
    const report = buildReport(now, [
      makeSnapshot({
        id: "listing-review",
        pendingBookingCount: 1,
      }),
    ]);

    jest.resetModules();

    const mockGenerate = jest.fn().mockResolvedValue(report);
    const mockConvert = jest.fn().mockResolvedValue({
      listingId: "listing-review",
      outcome: "skipped",
      classification: null,
      updateData: null,
    });
    const mockStamp = jest
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("stale version"), { code: "P2025" })
      )
      .mockResolvedValueOnce({
        listingId: "listing-review",
        outcome: "applied",
        classification: {
          cohort: "blocked_legacy_state",
          reasons: ["HAS_PENDING_BOOKINGS"],
        },
      });
    const mockDeferred = jest.fn();
    const mockProgress = jest.fn();
    jest.doMock("../../../lib/migration/backfill", () => ({
      applyHostManagedMigrationBackfillForListing: mockConvert,
      applyNeedsReviewFlagForListing: mockStamp,
      generateHostManagedMigrationReport: mockGenerate,
      isVersionConflictError: (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2025",
      logBackfillDeferred: mockDeferred,
      logBackfillProgress: mockProgress,
    }));

    const consoleSpy = jest
      .spyOn(console, "log")
      .mockImplementation(() => undefined);

    const { parseCliArgs, runBackfillCli } = await import(
      "../../../../scripts/cfm-migration-backfill"
    );

    const result = await runBackfillCli(
      parseCliArgs(["--apply", "--i-understand"]),
      {
        now,
        runId: "run-retry",
      }
    );

    expect(result.stamped).toBe(1);
    expect(result.deferred).toBe(0);
    expect(mockConvert).not.toHaveBeenCalled();
    expect(mockStamp).toHaveBeenCalledTimes(2);
    expect(mockStamp).toHaveBeenNthCalledWith(
      1,
      "listing-review",
      now,
      "run-retry",
      4
    );
    expect(mockProgress).toHaveBeenCalledWith(
      {
        appliedCount: 0,
        stampedCount: 1,
        skippedCount: 0,
        deferredCount: 0,
        batchCursor: "listing-review",
      },
      "run-retry"
    );
    expect(
      consoleSpy.mock.calls.map((call) => call.join(" ")).join("\n")
    ).toContain("Apply results:");

    jest.dontMock("../../../lib/migration/backfill");
  });
});
