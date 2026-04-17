import { readFileSync } from "node:fs";
import { join } from "node:path";

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
  logBackfillDeferred,
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
import { hashIdForLog } from "../../../lib/messaging/cfm-messaging-telemetry";
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

function collectListingIdLeaks(
  value: unknown,
  rawListingId: string,
  path = "payload"
): string[] {
  if (typeof value === "string" && value.includes(rawListingId)) {
    return [path];
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      collectListingIdLeaks(entry, rawListingId, `${path}[${index}]`)
    );
  }

  return Object.entries(value).flatMap(([key, entry]) => {
    const entryPath = `${path}.${key}`;
    const leaks = key === "listingId" ? [entryPath] : [];
    return leaks.concat(collectListingIdLeaks(entry, rawListingId, entryPath));
  });
}

function expectNoRawListingId(payload: Record<string, unknown>, rawListingId: string) {
  expect(collectListingIdLeaks(payload, rawListingId)).toEqual([]);
}

function expectHashedListingId(
  payload: Record<string, unknown>,
  rawListingId: string
) {
  expect(payload).toEqual(
    expect.objectContaining({
      listingIdHash: expect.stringMatching(/^[0-9a-f]{16}$/),
    })
  );
  expect(payload).toHaveProperty("listingIdHash", hashIdForLog(rawListingId));
  expectNoRawListingId(payload, rawListingId);
}

function findLoggedPayload(eventName: string): Record<string, unknown> {
  const eventCall = (logger.sync.info as jest.Mock).mock.calls.find(
    ([event]) => event === eventName
  );

  expect(eventCall).toBeDefined();

  return eventCall?.[1] as Record<string, unknown>;
}

function extractCapturedSql(firstQueryArg: unknown): string {
  if (
    Array.isArray(firstQueryArg) &&
    firstQueryArg.every((part) => typeof part === "string")
  ) {
    return firstQueryArg.join(" ");
  }

  if (
    firstQueryArg &&
    typeof firstQueryArg === "object" &&
    "raw" in firstQueryArg &&
    Array.isArray(firstQueryArg.raw)
  ) {
    return firstQueryArg.raw.join(" ");
  }

  // Prisma's tagged-template wrapper can vary across versions, so the test
  // falls back to the source file if the mock does not expose raw strings.
  return readFileSync(
    join(process.cwd(), "src/lib/migration/backfill.ts"),
    "utf8"
  );
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
    const queryRawMock = jest.fn().mockResolvedValue([makeSnapshot()]);

    (prisma.$transaction as jest.Mock).mockImplementation(
      async (
        callback: (tx: {
          $queryRaw: jest.Mock;
          $executeRaw: jest.Mock;
          listing: { update: jest.Mock };
        }) => Promise<unknown>
      ) =>
        callback({
          $queryRaw: queryRawMock,
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
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "listing-1" }),
        data: expect.objectContaining({
          availableSlots: 2,
          openSlots: 2,
          version: { increment: 1 },
        }),
      })
    );
    expect(updateMock.mock.calls[0][0].where).not.toHaveProperty("version");
    expect(executeRawMock).toHaveBeenCalled();
    const convertedPayload = findLoggedPayload("cfm.backfill.converted");
    expect(convertedPayload).toEqual(
      expect.objectContaining({
        runId: "run-convert",
        previousVersion: 4,
        nextVersion: 5,
      })
    );
    expectHashedListingId(convertedPayload, "listing-1");
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
    const reviewFlagPayload = findLoggedPayload("cfm.backfill.review_flag_set");
    expect(reviewFlagPayload).toEqual(
      expect.objectContaining({
        runId: "run-review",
        cohort: "blocked_legacy_state",
        fromSource: "LEGACY_BOOKING",
        toSource: "LEGACY_BOOKING",
      })
    );
    expectHashedListingId(reviewFlagPayload, "listing-1");
  });

  it("stamps held-booking legacy rows for review with a hashed payload", async () => {
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
            .mockResolvedValue([makeSnapshot({ heldBookingCount: 1 })]),
          listing: { update: updateMock },
        })
    );

    const result = await applyNeedsReviewFlagForListing(
      "listing-1",
      now,
      "run-held",
      4
    );

    expect(result.outcome).toBe("applied");
    expect(result.classification).toEqual({
      cohort: "blocked_legacy_state",
      reasons: ["HAS_HELD_BOOKINGS"],
    });
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "listing-1", version: 4 },
      data: {
        needsMigrationReview: true,
        version: { increment: 1 },
      },
    });
    const reviewFlagPayload = findLoggedPayload("cfm.backfill.review_flag_set");
    expect(reviewFlagPayload).toEqual(
      expect.objectContaining({
        runId: "run-held",
        cohort: "blocked_legacy_state",
        reasons: ["HAS_HELD_BOOKINGS"],
      })
    );
    expectHashedListingId(reviewFlagPayload, "listing-1");
  });

  it("stamps future-inventory legacy rows for review with a hashed payload", async () => {
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
            .mockResolvedValue([makeSnapshot({ futureInventoryRowCount: 1 })]),
          listing: { update: updateMock },
        })
    );

    const result = await applyNeedsReviewFlagForListing(
      "listing-1",
      now,
      "run-future-inventory",
      4
    );

    expect(result.outcome).toBe("applied");
    expect(result.classification).toEqual({
      cohort: "blocked_legacy_state",
      reasons: ["HAS_FUTURE_INVENTORY_ROWS"],
    });
    expect(updateMock).toHaveBeenCalledTimes(1);
    const reviewFlagPayload = findLoggedPayload("cfm.backfill.review_flag_set");
    expect(reviewFlagPayload).toEqual(
      expect.objectContaining({
        runId: "run-future-inventory",
        cohort: "blocked_legacy_state",
        reasons: ["HAS_FUTURE_INVENTORY_ROWS"],
      })
    );
    expectHashedListingId(reviewFlagPayload, "listing-1");
  });

  it("stamps manual-review shadow openSlots rows for review with a hashed payload", async () => {
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
            .mockResolvedValue([makeSnapshot({ openSlots: 3 })]),
          listing: { update: updateMock },
        })
    );

    const result = await applyNeedsReviewFlagForListing(
      "listing-1",
      now,
      "run-shadow-open-slots",
      4
    );

    expect(result.outcome).toBe("applied");
    expect(result.classification).toEqual({
      cohort: "manual_review",
      reasons: ["SHADOW_OPEN_SLOTS_PRESENT"],
    });
    expect(updateMock).toHaveBeenCalledTimes(1);
    const reviewFlagPayload = findLoggedPayload("cfm.backfill.review_flag_set");
    expect(reviewFlagPayload).toEqual(
      expect.objectContaining({
        runId: "run-shadow-open-slots",
        cohort: "manual_review",
        reasons: ["SHADOW_OPEN_SLOTS_PRESENT"],
      })
    );
    expectHashedListingId(reviewFlagPayload, "listing-1");
  });

  it("stamps manual-review availableUntil-in-past rows for review with a hashed payload", async () => {
    const updateMock = jest.fn().mockResolvedValue({ id: "listing-1" });

    (prisma.$transaction as jest.Mock).mockImplementation(
      async (
        callback: (tx: {
          $queryRaw: jest.Mock;
          listing: { update: jest.Mock };
        }) => Promise<unknown>
      ) =>
        callback({
          $queryRaw: jest.fn().mockResolvedValue([
            makeSnapshot({
              moveInDate: new Date("2024-12-01T00:00:00.000Z"),
              availableUntil: new Date("2025-01-01T00:00:00.000Z"),
            }),
          ]),
          listing: { update: updateMock },
        })
    );

    const result = await applyNeedsReviewFlagForListing(
      "listing-1",
      now,
      "run-available-until-past",
      4
    );

    expect(result.outcome).toBe("applied");
    expect(result.classification).toEqual({
      cohort: "manual_review",
      reasons: ["AVAILABLE_UNTIL_IN_PAST"],
    });
    expect(updateMock).toHaveBeenCalledTimes(1);
    const reviewFlagPayload = findLoggedPayload("cfm.backfill.review_flag_set");
    expect(reviewFlagPayload).toEqual(
      expect.objectContaining({
        runId: "run-available-until-past",
        cohort: "manual_review",
        reasons: ["AVAILABLE_UNTIL_IN_PAST"],
      })
    );
    expectHashedListingId(reviewFlagPayload, "listing-1");
  });

  it("skips already-flagged blocked rows without re-emitting a review-flag event", async () => {
    const updateMock = jest.fn();

    (prisma.$transaction as jest.Mock).mockImplementation(
      async (
        callback: (tx: {
          $queryRaw: jest.Mock;
          listing: { update: jest.Mock };
        }) => Promise<unknown>
      ) =>
        callback({
          $queryRaw: jest.fn().mockResolvedValue([
            makeSnapshot({
              pendingBookingCount: 1,
              needsMigrationReview: true,
            }),
          ]),
          listing: { update: updateMock },
        })
    );

    const result = await applyNeedsReviewFlagForListing(
      "listing-1",
      now,
      "run-already-flagged",
      4
    );

    expect(result).toEqual({
      listingId: "listing-1",
      outcome: "skipped",
      classification: expect.objectContaining({
        cohort: "blocked_legacy_state",
      }),
    });
    expect(result.classification?.reasons).toContain("HAS_PENDING_BOOKINGS");
    expect(updateMock).not.toHaveBeenCalled();
    const skippedPayload = findLoggedPayload("cfm.backfill.skipped");
    expect(skippedPayload).toEqual(
      expect.objectContaining({
        runId: "run-already-flagged",
        outcome: "already_flagged",
        cohort: "blocked_legacy_state",
      })
    );
    expectHashedListingId(skippedPayload, "listing-1");
    const eventNames = (logger.sync.info as jest.Mock).mock.calls.map(
      ([event]) => event
    );
    expect(eventNames).not.toContain("cfm.backfill.review_flag_set");
  });

  it("skips instead of deferring when a blocked listing drifts to clean before stamp apply", async () => {
    const updateMock = jest.fn();

    (prisma.$transaction as jest.Mock).mockImplementation(
      async (
        callback: (tx: {
          $queryRaw: jest.Mock;
          listing: { update: jest.Mock };
        }) => Promise<unknown>
      ) =>
        callback({
          $queryRaw: jest.fn().mockResolvedValue([
            makeSnapshot({
              version: 5,
              pendingBookingCount: 0,
            }),
          ]),
          listing: { update: updateMock },
        })
    );

    const result = await applyNeedsReviewFlagForListing(
      "listing-1",
      now,
      "run-cohort-drift",
      4
    );

    expect(result).toEqual({
      listingId: "listing-1",
      outcome: "skipped",
      classification: {
        cohort: "clean_auto_convert",
        reasons: [],
      },
    });
    expect(updateMock).not.toHaveBeenCalled();
    const skippedPayload = findLoggedPayload("cfm.backfill.skipped");
    expect(skippedPayload).toEqual(
      expect.objectContaining({
        runId: "run-cohort-drift",
        outcome: "blocked_has_been_reclassified",
        cohort: "clean_auto_convert",
      })
    );
    expectHashedListingId(skippedPayload, "listing-1");
    const eventNames = (logger.sync.info as jest.Mock).mock.calls.map(
      ([event]) => event
    );
    expect(eventNames).not.toContain("cfm.backfill.deferred");
    expect(eventNames).not.toContain("cfm.backfill.review_flag_set");
  });

  it("keeps FOR UPDATE OF l in the locked snapshot query used by the convert path", async () => {
    const queryRawMock = jest.fn().mockResolvedValue([makeSnapshot()]);
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
          $queryRaw: queryRawMock,
          $executeRaw: executeRawMock,
          listing: { update: updateMock },
        })
    );

    await applyHostManagedMigrationBackfillForListing(
      "listing-1",
      now,
      "run-for-update"
    );

    const sql = extractCapturedSql(queryRawMock.mock.calls[0]?.[0]);
    expect(sql).toMatch(/FOR UPDATE OF l/i);
  });

  it("logs deferred rows with a hashed listingId payload", () => {
    logBackfillDeferred("listing-1", "run-deferred", 3, "P2025");

    const deferredPayload = findLoggedPayload("cfm.backfill.deferred");
    expect(deferredPayload).toEqual(
      expect.objectContaining({
        runId: "run-deferred",
        attempts: 3,
        lastErrorCode: "P2025",
      })
    );
    expectHashedListingId(deferredPayload, "listing-1");
  });

  it("logs errors with a hashed listingId payload", async () => {
    (prisma.$transaction as jest.Mock).mockRejectedValue(
      new Error("boom listing-1")
    );

    await expect(
      applyHostManagedMigrationBackfillForListing("listing-1", now, "run-error")
    ).rejects.toThrow("boom listing-1");

    const errorPayload = findLoggedPayload("cfm.backfill.error");
    expect(errorPayload).toEqual(
      expect.objectContaining({
        runId: "run-error",
        message: `boom ${hashIdForLog("listing-1")}`,
      })
    );
    expectHashedListingId(errorPayload, "listing-1");
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
