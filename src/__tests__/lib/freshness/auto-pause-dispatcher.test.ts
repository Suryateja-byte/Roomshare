jest.mock("@/lib/env", () => ({
  features: {
    staleAutoPause: true,
  },
}));

const mockTx = {
  $queryRaw: jest.fn(),
  listing: {
    updateMany: jest.fn(),
  },
};

jest.mock("@/lib/prisma", () => ({
  prisma: {
    listing: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn((fn: (tx: typeof mockTx) => Promise<unknown>) =>
      fn(mockTx)
    ),
  },
}));

jest.mock("@/lib/notifications", () => ({
  createInternalNotification: jest.fn(),
}));

jest.mock("@/lib/email", () => ({
  sendNotificationEmail: jest.fn(),
}));

jest.mock("@/lib/search/search-doc-dirty", () => ({
  markListingDirtyInTx: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/messaging/cfm-messaging-telemetry", () => ({
  hashIdForLog: jest.fn(() => "hashed-listing-id"),
}));

jest.mock("@/lib/logger", () => ({
  logger: {
    sync: {
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
    },
  },
  sanitizeErrorMessage: jest.fn((error: unknown) =>
    error instanceof Error ? error.message : String(error ?? "Unknown error")
  ),
}));

import { features } from "@/lib/env";
import {
  getAutoPauseCronTelemetrySnapshot,
  resetAutoPauseCronTelemetryForTests,
} from "@/lib/freshness/freshness-cron-telemetry";
import {
  AUTO_PAUSE_BATCH_SIZE,
  classifyAutoPauseCandidate,
  isAutoPauseDue,
  runAutoPauseDispatcher,
} from "@/lib/freshness/auto-pause-dispatcher";
import { createInternalNotification } from "@/lib/notifications";
import { sendNotificationEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { markListingDirtyInTx } from "@/lib/search/search-doc-dirty";

const mockFindMany = prisma.listing.findMany as jest.Mock;
const mockTransaction = prisma.$transaction as jest.Mock;
const mockCreateInternalNotification =
  createInternalNotification as jest.Mock;
const mockSendNotificationEmail = sendNotificationEmail as jest.Mock;
const mockMarkListingDirtyInTx = markListingDirtyInTx as jest.Mock;

function daysAgo(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function makeListing(
  id: string,
  lastConfirmedAt: Date | null,
  overrides: Partial<{
    title: string;
    version: number;
    availabilitySource: "LEGACY_BOOKING" | "HOST_MANAGED";
    status: "ACTIVE" | "PAUSED" | "RENTED";
    statusReason: string | null;
    needsMigrationReview: boolean;
    freshnessWarningSentAt: Date | null;
    autoPausedAt: Date | null;
    owner: {
      id: string;
      email: string | null;
      name: string | null;
      isSuspended: boolean;
    };
  }> = {}
) {
  return {
    id,
    title: overrides.title ?? `Listing ${id}`,
    version: overrides.version ?? 3,
    availabilitySource: overrides.availabilitySource ?? "HOST_MANAGED",
    status: overrides.status ?? "ACTIVE",
    statusReason: overrides.statusReason ?? null,
    needsMigrationReview: overrides.needsMigrationReview ?? false,
    lastConfirmedAt,
    freshnessWarningSentAt:
      overrides.freshnessWarningSentAt !== undefined
        ? overrides.freshnessWarningSentAt
        : new Date("2026-04-01T00:00:00.000Z"),
    autoPausedAt:
      overrides.autoPausedAt !== undefined ? overrides.autoPausedAt : null,
    owner: overrides.owner ?? {
      id: `owner-${id}`,
      email: `${id}@example.com`,
      name: `Host ${id}`,
      isSuspended: false,
    },
  };
}

function makeLockedRow(
  id: string,
  lastConfirmedAt: Date | null,
  overrides: Partial<{
    title: string;
    version: number;
    availabilitySource: "LEGACY_BOOKING" | "HOST_MANAGED";
    status: "ACTIVE" | "PAUSED" | "RENTED";
    statusReason: string | null;
    needsMigrationReview: boolean;
    freshnessWarningSentAt: Date | null;
    autoPausedAt: Date | null;
    ownerId: string;
    ownerEmail: string | null;
    ownerName: string | null;
    ownerIsSuspended: boolean;
  }> = {}
) {
  return {
    id,
    title: overrides.title ?? `Listing ${id}`,
    version: overrides.version ?? 3,
    availabilitySource: overrides.availabilitySource ?? "HOST_MANAGED",
    status: overrides.status ?? "ACTIVE",
    statusReason: overrides.statusReason ?? null,
    needsMigrationReview: overrides.needsMigrationReview ?? false,
    lastConfirmedAt,
    freshnessWarningSentAt:
      overrides.freshnessWarningSentAt !== undefined
        ? overrides.freshnessWarningSentAt
        : new Date("2026-04-01T00:00:00.000Z"),
    autoPausedAt:
      overrides.autoPausedAt !== undefined ? overrides.autoPausedAt : null,
    ownerId: overrides.ownerId ?? `owner-${id}`,
    ownerEmail: overrides.ownerEmail ?? `${id}@example.com`,
    ownerName: overrides.ownerName ?? `Host ${id}`,
    ownerIsSuspended: overrides.ownerIsSuspended ?? false,
  };
}

describe("stale auto-pause dispatcher", () => {
  const now = new Date("2026-04-17T12:00:00.000Z");

  beforeEach(() => {
    jest.clearAllMocks();
    resetAutoPauseCronTelemetryForTests();
    Object.defineProperty(features, "staleAutoPause", {
      value: true,
      writable: true,
    });
    mockTransaction.mockImplementation(
      async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)
    );
    mockCreateInternalNotification.mockResolvedValue({ success: true });
    mockSendNotificationEmail.mockResolvedValue({ success: true });
    mockTx.listing.updateMany.mockResolvedValue({ count: 1 });
    mockMarkListingDirtyInTx.mockResolvedValue(undefined);
  });

  it("uses the shipped 30 day boundary for auto-pause decisions", () => {
    expect(isAutoPauseDue(daysAgo(now, 29), now)).toBe(false);
    expect(isAutoPauseDue(daysAgo(now, 30), now)).toBe(true);
  });

  it("auto-pauses a day-30 stale listing, marks search dirty, and logs hashed ids", async () => {
    mockFindMany
      .mockResolvedValueOnce([
        { id: "listing-1", lastConfirmedAt: daysAgo(now, 30) },
      ])
      .mockResolvedValueOnce([makeListing("listing-1", daysAgo(now, 30))]);
    mockTx.$queryRaw.mockResolvedValue([
      makeLockedRow("listing-1", daysAgo(now, 30)),
    ]);

    const summary = await runAutoPauseDispatcher(now);

    expect(summary).toMatchObject({
      success: true,
      skipped: false,
      selected: 1,
      processed: 1,
      eligible: 1,
      autoPaused: 1,
      emitted: 1,
      errors: { notification: 0, email: 0, db: 0 },
    });
    expect(mockCreateInternalNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "LISTING_AUTO_PAUSED",
      })
    );
    expect(mockSendNotificationEmail).toHaveBeenCalledWith(
      "listingAutoPaused",
      "listing-1@example.com",
      expect.objectContaining({ listingId: "listing-1" })
    );
    expect(mockMarkListingDirtyInTx).toHaveBeenCalledWith(
      mockTx,
      "listing-1",
      "status_changed"
    );
    expect(getAutoPauseCronTelemetrySnapshot()).toMatchObject({
      eligibleCount: 1,
      autoPausedCount: 1,
      emittedCount: 1,
    });

    const sqlStrings = (mockTx.$queryRaw as jest.Mock).mock.calls[0][0].join("");
    expect(sqlStrings).toContain("FOR UPDATE OF l");

    const logPayload = (logger.sync.info as jest.Mock).mock.calls.find(
      ([message]) => message === "[stale-auto-pause] Listing auto-paused"
    )?.[1];
    expect(logPayload).toEqual(
      expect.objectContaining({
        event: "cfm.cron.stale_auto_pause",
        listingIdHash: "hashed-listing-id",
      })
    );
    expect(logPayload).not.toHaveProperty("listingId");
  });

  it("skips already auto-paused listings before opening a transaction", async () => {
    mockFindMany
      .mockResolvedValueOnce([
        { id: "listing-1", lastConfirmedAt: daysAgo(now, 30) },
      ])
      .mockResolvedValueOnce([
        makeListing("listing-1", daysAgo(now, 30), {
          status: "PAUSED",
          statusReason: "STALE_AUTO_PAUSE",
          autoPausedAt: new Date("2026-04-16T00:00:00.000Z"),
        }),
      ]);

    const summary = await runAutoPauseDispatcher(now);

    expect(summary.autoPaused).toBe(0);
    expect(summary.skippedCounts.already_paused).toBe(1);
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockCreateInternalNotification).not.toHaveBeenCalled();
  });

  it("skips listings that never received the stale warning", async () => {
    mockFindMany
      .mockResolvedValueOnce([
        { id: "listing-1", lastConfirmedAt: daysAgo(now, 30) },
      ])
      .mockResolvedValueOnce([
        makeListing("listing-1", daysAgo(now, 30), {
          freshnessWarningSentAt: null,
        }),
      ]);

    const summary = await runAutoPauseDispatcher(now);

    expect(summary.autoPaused).toBe(0);
    expect(summary.skippedCounts.no_warning).toBe(1);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it.each([
    [
      "host-paused listings",
      makeListing("listing-1", daysAgo(now, 30), {
        status: "PAUSED",
        statusReason: "HOST_PAUSED",
      }),
      "already_paused",
    ],
    [
      "suspended owners",
      makeListing("listing-1", daysAgo(now, 30), {
        owner: {
          id: "owner-listing-1",
          email: "listing-1@example.com",
          name: "Host listing-1",
          isSuspended: true,
        },
      }),
      "suspended",
    ],
    [
      "legacy-booking listings",
      makeListing("listing-1", daysAgo(now, 30), {
        availabilitySource: "LEGACY_BOOKING",
      }),
      "not_host_managed",
    ],
    [
      "migration-review listings",
      makeListing("listing-1", daysAgo(now, 30), {
        needsMigrationReview: true,
      }),
      "migration_review",
    ],
  ] as const)(
    "skips %s",
    async (_label, listing, expectedReason) => {
      mockFindMany
        .mockResolvedValueOnce([
          { id: "listing-1", lastConfirmedAt: daysAgo(now, 30) },
        ])
        .mockResolvedValueOnce([listing]);

      const summary = await runAutoPauseDispatcher(now);

      expect(summary.autoPaused).toBe(0);
      expect(summary.skippedCounts[expectedReason]).toBe(1);
      expect(mockTransaction).not.toHaveBeenCalled();
    }
  );

  it("counts version conflicts without sending duplicate notifications", async () => {
    mockFindMany
      .mockResolvedValueOnce([
        { id: "listing-1", lastConfirmedAt: daysAgo(now, 30) },
      ])
      .mockResolvedValueOnce([makeListing("listing-1", daysAgo(now, 30))]);
    mockTx.$queryRaw.mockResolvedValue([
      makeLockedRow("listing-1", daysAgo(now, 30)),
    ]);
    mockTx.listing.updateMany.mockResolvedValue({ count: 0 });

    const summary = await runAutoPauseDispatcher(now);

    expect(summary.autoPaused).toBe(0);
    expect(summary.skippedCounts.version_conflict).toBe(1);
    expect(mockCreateInternalNotification).not.toHaveBeenCalled();
    expect(mockSendNotificationEmail).not.toHaveBeenCalled();
  });

  it("treats a lock-time state flip as a stale row and skips the write", async () => {
    mockFindMany
      .mockResolvedValueOnce([
        { id: "listing-1", lastConfirmedAt: daysAgo(now, 30) },
      ])
      .mockResolvedValueOnce([makeListing("listing-1", daysAgo(now, 30))]);
    mockTx.$queryRaw.mockResolvedValue([
      makeLockedRow("listing-1", daysAgo(now, 30), {
        status: "PAUSED",
        statusReason: "STALE_AUTO_PAUSE",
        autoPausedAt: new Date("2026-04-16T00:00:00.000Z"),
      }),
    ]);

    const summary = await runAutoPauseDispatcher(now);

    expect(summary.autoPaused).toBe(0);
    expect(summary.skippedCounts.stale_row).toBe(1);
    expect(mockTx.listing.updateMany).not.toHaveBeenCalled();
    expect(mockCreateInternalNotification).not.toHaveBeenCalled();
  });

  it("stays disabled behind ENABLE_STALE_AUTO_PAUSE=off", async () => {
    Object.defineProperty(features, "staleAutoPause", {
      value: false,
      writable: true,
    });

    const summary = await runAutoPauseDispatcher(now);

    expect(summary).toMatchObject({
      success: true,
      skipped: true,
      reason: "feature_disabled",
      selected: 0,
      autoPaused: 0,
      emitted: 0,
    });
    expect(mockFindMany).not.toHaveBeenCalled();
    expect(getAutoPauseCronTelemetrySnapshot().skippedCounts.feature_disabled).toBe(
      1
    );
  });

  it("keeps the initial candidate query bounded and fully day-30 gated", async () => {
    mockFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await runAutoPauseDispatcher(now);

    expect(mockFindMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        take: AUTO_PAUSE_BATCH_SIZE,
        where: expect.objectContaining({
          availabilitySource: "HOST_MANAGED",
          status: "ACTIVE",
          statusReason: null,
          needsMigrationReview: false,
          freshnessWarningSentAt: { not: null },
          autoPausedAt: null,
          lastConfirmedAt: {
            lte: daysAgo(now, 30),
          },
          owner: {
            isSuspended: false,
          },
        }),
      })
    );
  });

  it("classifies stale selections without warning as non-eligible even when they were preselected elsewhere", () => {
    expect(
      classifyAutoPauseCandidate(
        {
          status: "ACTIVE",
          statusReason: null,
          lastConfirmedAt: daysAgo(now, 30),
          freshnessWarningSentAt: null,
          autoPausedAt: null,
          ownerIsSuspended: false,
        },
        now
      )
    ).toEqual({
      action: "skip",
      reason: "no_warning",
    });
  });
});
