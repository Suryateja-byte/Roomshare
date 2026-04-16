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

import {
  applyHostManagedMigrationBackfillForListing,
  generateHostManagedMigrationReport,
  planHostManagedMigrationBackfill,
  type HostManagedMigrationUpdateData,
} from "../../../lib/migration/backfill";
import type { ListingMigrationSnapshot } from "../../../lib/migration/classifier";
import { prisma } from "../../../lib/prisma";

function getSqlText(callArg: unknown): string {
  if (Array.isArray(callArg)) {
    const templateStrings = callArg as unknown as { raw?: readonly string[] };
    if (templateStrings.raw) {
      return templateStrings.raw.join(" ");
    }
  }

  return String(callArg);
}

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

const now = new Date("2026-04-15T12:00:00.000Z");

describe("host-managed migration backfill", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("builds the exact conservative update plan for a clean row", () => {
    const result = planHostManagedMigrationBackfill(makeSnapshot(), now);

    expect(result.shouldApply).toBe(true);
    expect(result.classification).toEqual({
      cohort: "clean_auto_convert",
      reasons: [],
    });
    expect(result.updateData).toEqual<HostManagedMigrationUpdateData>({
      availabilitySource: "HOST_MANAGED",
      openSlots: 2,
      availableSlots: 2,
      needsMigrationReview: false,
      status: "ACTIVE",
      statusReason: null,
      totalSlots: 2,
      moveInDate: new Date("2026-05-01T00:00:00.000Z"),
      availableUntil: new Date("2026-08-01T00:00:00.000Z"),
      minStayMonths: 2,
      lastConfirmedAt: now,
      freshnessReminderSentAt: null,
      freshnessWarningSentAt: null,
      autoPausedAt: null,
    });
  });

  it("keeps blocked and manual rows read-only in dry-run reports", async () => {
    (prisma.$queryRaw as jest.Mock)
      .mockResolvedValueOnce([
        { ...makeSnapshot({ id: "listing-1", pendingBookingCount: 1 }) },
        { ...makeSnapshot({ id: "listing-2", availableSlots: 1 }) },
      ])
      .mockResolvedValueOnce([]);

    const report = await generateHostManagedMigrationReport({
      batchSize: 2,
      now,
    });

    expect(report.summary.totalListings).toBe(2);
    expect(report.rows[0].backfillPlan.shouldApply).toBe(false);
    expect(report.rows[1].backfillPlan.shouldApply).toBe(false);
    expect(report.summary.cohortCounts.blocked_legacy_state).toBe(1);
    expect(report.summary.cohortCounts.manual_review).toBe(1);
  });

  it("counts only future or ongoing accepted bookings and active holds in report queries", async () => {
    (prisma.$queryRaw as jest.Mock)
      .mockResolvedValueOnce([{ ...makeSnapshot() }])
      .mockResolvedValueOnce([]);

    await generateHostManagedMigrationReport({
      batchSize: 1,
      now,
    });

    const sqlText = getSqlText((prisma.$queryRaw as jest.Mock).mock.calls[0][0]);

    expect(sqlText).toContain(`b."endDate"::date >`);
    expect(sqlText).toContain(`b."heldUntil" >`);
    expect(sqlText).toContain(`b.status IN ('PENDING', 'ACCEPTED')`);
  });

  it("re-classifies under lock and skips rows that changed before apply", async () => {
    const queryRawMock = jest.fn().mockResolvedValue([
      { ...makeSnapshot({ pendingBookingCount: 1 }) },
    ]);
    const updateMock = jest.fn();

    (prisma.$transaction as jest.Mock).mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          $queryRaw: queryRawMock,
          listing: { update: updateMock },
        })
    );

    const result = await applyHostManagedMigrationBackfillForListing(
      "listing-1",
      now
    );

    expect(result).toEqual({
      listingId: "listing-1",
      outcome: "skipped",
      classification: {
        cohort: "blocked_legacy_state",
        reasons: ["HAS_PENDING_BOOKINGS"],
      },
      updateData: null,
    });
    expect(updateMock).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it("uses the same active-booking filters when rechecking under lock", async () => {
    const queryRawMock = jest.fn().mockResolvedValue([{ ...makeSnapshot() }]);
    const updateMock = jest.fn().mockResolvedValue({ id: "listing-1" });

    (prisma.$transaction as jest.Mock).mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          $queryRaw: queryRawMock,
          listing: { update: updateMock },
        })
    );
    (prisma.$executeRaw as jest.Mock).mockResolvedValue(1);

    await applyHostManagedMigrationBackfillForListing("listing-1", now);

    const sqlText = getSqlText(queryRawMock.mock.calls[0][0]);

    expect(sqlText).toContain(`b."endDate"::date >`);
    expect(sqlText).toContain(`b."heldUntil" >`);
    expect(sqlText).toContain(`b.status IN ('PENDING', 'ACCEPTED')`);
  });

  it("applies clean rows and dirty-marks them best-effort", async () => {
    const queryRawMock = jest.fn().mockResolvedValue([{ ...makeSnapshot() }]);
    const updateMock = jest.fn().mockResolvedValue({ id: "listing-1" });
    (prisma.$transaction as jest.Mock).mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          $queryRaw: queryRawMock,
          listing: { update: updateMock },
        })
    );
    (prisma.$executeRaw as jest.Mock).mockResolvedValue(1);

    const result = await applyHostManagedMigrationBackfillForListing(
      "listing-1",
      now
    );

    expect(result).toEqual({
      listingId: "listing-1",
      outcome: "applied",
      classification: {
        cohort: "clean_auto_convert",
        reasons: [],
      },
      updateData: {
        availabilitySource: "HOST_MANAGED",
        openSlots: 2,
        availableSlots: 2,
        needsMigrationReview: false,
        status: "ACTIVE",
        statusReason: null,
        totalSlots: 2,
        moveInDate: new Date("2026-05-01T00:00:00.000Z"),
        availableUntil: new Date("2026-08-01T00:00:00.000Z"),
        minStayMonths: 2,
        lastConfirmedAt: now,
        freshnessReminderSentAt: null,
        freshnessWarningSentAt: null,
        autoPausedAt: null,
      },
    });

    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "listing-1" },
      data: expect.objectContaining({
        availabilitySource: "HOST_MANAGED",
        openSlots: 2,
        availableSlots: 2,
        needsMigrationReview: false,
        status: "ACTIVE",
        statusReason: null,
        totalSlots: 2,
        moveInDate: new Date("2026-05-01T00:00:00.000Z"),
        availableUntil: new Date("2026-08-01T00:00:00.000Z"),
        minStayMonths: 2,
        lastConfirmedAt: now,
        freshnessReminderSentAt: null,
        freshnessWarningSentAt: null,
        autoPausedAt: null,
        version: { increment: 1 },
      }),
    });
    expect(prisma.$executeRaw).toHaveBeenCalled();
  });
});
