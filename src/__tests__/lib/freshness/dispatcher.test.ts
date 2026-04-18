jest.mock("@/lib/env", () => ({
  features: {
    freshnessNotifications: true,
  },
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    listing: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

jest.mock("@/lib/notifications", () => ({
  createInternalNotification: jest.fn(),
}));

jest.mock("@/lib/email", () => ({
  sendNotificationEmail: jest.fn(),
  sendNotificationEmailWithPreference: jest.fn(),
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
  getFreshnessCronTelemetrySnapshot,
  resetFreshnessCronTelemetryForTests,
} from "@/lib/freshness/freshness-cron-telemetry";
import {
  classifyFreshnessDispatch,
  runFreshnessDispatcher,
  shouldEmitReminder,
  shouldEmitStaleWarning,
} from "@/lib/freshness/dispatcher";
import { createInternalNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import {
  sendNotificationEmail,
  sendNotificationEmailWithPreference,
} from "@/lib/email";

const mockFindMany = prisma.listing.findMany as jest.Mock;
const mockUpdateMany = prisma.listing.updateMany as jest.Mock;
const mockCreateInternalNotification =
  createInternalNotification as jest.Mock;
const mockSendNotificationEmail = sendNotificationEmail as jest.Mock;
const mockSendNotificationEmailWithPreference =
  sendNotificationEmailWithPreference as jest.Mock;

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
    freshnessReminderSentAt: Date | null;
    freshnessWarningSentAt: Date | null;
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
    version: overrides.version ?? 1,
    availabilitySource: overrides.availabilitySource ?? "HOST_MANAGED",
    status: overrides.status ?? "ACTIVE",
    statusReason: overrides.statusReason ?? null,
    needsMigrationReview: overrides.needsMigrationReview ?? false,
    lastConfirmedAt,
    freshnessReminderSentAt: overrides.freshnessReminderSentAt ?? null,
    freshnessWarningSentAt: overrides.freshnessWarningSentAt ?? null,
    owner: overrides.owner ?? {
      id: `owner-${id}`,
      email: `${id}@example.com`,
      name: `Host ${id}`,
      isSuspended: false,
    },
  };
}

describe("freshness dispatcher", () => {
  const now = new Date("2026-04-17T12:00:00.000Z");

  beforeEach(() => {
    jest.clearAllMocks();
    resetFreshnessCronTelemetryForTests();
    Object.defineProperty(features, "freshnessNotifications", {
      value: true,
      writable: true,
    });
    mockCreateInternalNotification.mockResolvedValue({ success: true });
    mockSendNotificationEmail.mockResolvedValue({ success: true });
    mockSendNotificationEmailWithPreference.mockResolvedValue({ success: true });
    mockUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("uses the shipped 14/21/30 day boundaries for reminder, warning, and auto-pause decisions", () => {
    expect(
      classifyFreshnessDispatch(makeListing("fresh", daysAgo(now, 13)), now)
    ).toMatchObject({
      action: "skip",
      reason: "not_due",
      freshnessBucket: "NORMAL",
    });

    expect(shouldEmitReminder(makeListing("d14", daysAgo(now, 14)), now)).toBe(
      true
    );
    expect(shouldEmitReminder(makeListing("d15", daysAgo(now, 15)), now)).toBe(
      true
    );
    expect(
      shouldEmitStaleWarning(makeListing("d22", daysAgo(now, 22)), now)
    ).toBe(true);
    expect(
      classifyFreshnessDispatch(makeListing("d31", daysAgo(now, 31)), now)
    ).toMatchObject({
      action: "skip",
      reason: "auto_pause",
      freshnessBucket: "AUTO_PAUSE_DUE",
    });
    expect(
      classifyFreshnessDispatch(
        makeListing("sent-reminder", daysAgo(now, 14), {
          freshnessReminderSentAt: now,
        }),
        now
      )
    ).toMatchObject({
      action: "skip",
      reason: "already_sent",
      freshnessBucket: "REMINDER",
    });
  });

  it("dispatches reminder and warning listings, honors reminder preferences, and updates telemetry", async () => {
    mockFindMany
      .mockResolvedValueOnce([
        { id: "listing-warning", lastConfirmedAt: daysAgo(now, 22) },
      ])
      .mockResolvedValueOnce([
        { id: "listing-reminder", lastConfirmedAt: daysAgo(now, 15) },
      ])
      .mockResolvedValueOnce([
        makeListing("listing-warning", daysAgo(now, 22)),
        makeListing("listing-reminder", daysAgo(now, 15)),
      ]);
    mockSendNotificationEmailWithPreference.mockResolvedValueOnce({
      success: true,
      skipped: true,
    });

    const summary = await runFreshnessDispatcher(now);

    expect(summary).toMatchObject({
      success: true,
      skipped: false,
      selected: 2,
      processed: 2,
      emitted: {
        reminder: 0,
        warning: 1,
      },
      skippedPreference: {
        reminder: 1,
        warning: 0,
      },
      errors: {
        reminder: { notification: 0, email: 0, db: 0 },
        warning: { notification: 0, email: 0, db: 0 },
      },
    });

    expect(mockCreateInternalNotification).toHaveBeenCalledTimes(2);
    expect(mockCreateInternalNotification).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        type: "LISTING_STALE_WARNING",
      })
    );
    expect(mockCreateInternalNotification).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        type: "LISTING_FRESHNESS_REMINDER",
      })
    );
    expect(mockSendNotificationEmail).toHaveBeenCalledWith(
      "listingStaleWarning",
      "listing-warning@example.com",
      expect.objectContaining({ listingId: "listing-warning" })
    );
    expect(mockSendNotificationEmailWithPreference).toHaveBeenCalledWith(
      "listingFreshnessReminder",
      "owner-listing-reminder",
      "listing-reminder@example.com",
      expect.objectContaining({ listingId: "listing-reminder" })
    );
    expect(mockSendNotificationEmailWithPreference).toHaveBeenCalledTimes(1);
    expect(mockSendNotificationEmail).toHaveBeenCalledTimes(1);
    expect(mockUpdateMany).toHaveBeenCalledTimes(2);
    expect(getFreshnessCronTelemetrySnapshot()).toMatchObject({
      eligibleCounts: {
        reminder: 1,
        warning: 1,
      },
      emittedCounts: {
        reminder: 0,
        warning: 1,
      },
      skippedPreferenceCounts: {
        reminder: 1,
        warning: 0,
      },
    });
  });

  it("does not flip the idempotency token when warning email delivery fails", async () => {
    mockFindMany
      .mockResolvedValueOnce([
        { id: "listing-warning", lastConfirmedAt: daysAgo(now, 22) },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeListing("listing-warning", daysAgo(now, 22))]);
    mockSendNotificationEmail.mockResolvedValueOnce({
      success: false,
      error: "resend 503",
    });

    const summary = await runFreshnessDispatcher(now);

    expect(summary.success).toBe(false);
    expect(summary.emitted.warning).toBe(0);
    expect(summary.errors.warning.email).toBe(1);
    expect(mockUpdateMany).not.toHaveBeenCalled();
    expect(getFreshnessCronTelemetrySnapshot().errorCounts.warning.email).toBe(1);
  });

  it("skips suspended owners without touching tokens or delivery channels", async () => {
    mockFindMany
      .mockResolvedValueOnce([
        { id: "listing-reminder", lastConfirmedAt: daysAgo(now, 15) },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        makeListing("listing-reminder", daysAgo(now, 15), {
          owner: {
            id: "owner-listing-reminder",
            email: "listing-reminder@example.com",
            name: "Host listing-reminder",
            isSuspended: true,
          },
        }),
      ]);

    const summary = await runFreshnessDispatcher(now);

    expect(summary.skippedSuspended).toBe(1);
    expect(mockCreateInternalNotification).not.toHaveBeenCalled();
    expect(mockSendNotificationEmailWithPreference).not.toHaveBeenCalled();
    expect(mockUpdateMany).not.toHaveBeenCalled();
    expect(getFreshnessCronTelemetrySnapshot().skippedSuspendedCount).toBe(1);
  });

  it("does not inflate emitted.reminder when reminder preference is disabled", async () => {
    mockFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: "listing-reminder", lastConfirmedAt: daysAgo(now, 15) },
      ])
      .mockResolvedValueOnce([makeListing("listing-reminder", daysAgo(now, 15))]);
    mockSendNotificationEmailWithPreference.mockResolvedValueOnce({
      success: true,
      skipped: true,
    });

    const summary = await runFreshnessDispatcher(now);

    expect(summary.emitted.reminder).toBe(0);
    expect(summary.skippedPreference.reminder).toBe(1);
    expect(mockSendNotificationEmailWithPreference).toHaveBeenCalledTimes(1);
    expect(mockSendNotificationEmail).not.toHaveBeenCalled();
    expect(mockUpdateMany).toHaveBeenCalledTimes(1);
    expect(getFreshnessCronTelemetrySnapshot()).toMatchObject({
      emittedCounts: {
        reminder: 0,
        warning: 0,
      },
      skippedPreferenceCounts: {
        reminder: 1,
        warning: 0,
      },
    });
  });

  it("fires exactly one outbound send per reminder candidate", async () => {
    mockFindMany
      .mockResolvedValueOnce([
        { id: "listing-warning", lastConfirmedAt: daysAgo(now, 22) },
      ])
      .mockResolvedValueOnce([
        { id: "listing-reminder", lastConfirmedAt: daysAgo(now, 15) },
      ])
      .mockResolvedValueOnce([
        makeListing("listing-warning", daysAgo(now, 22)),
        makeListing("listing-reminder", daysAgo(now, 15)),
      ]);
    mockSendNotificationEmailWithPreference.mockResolvedValueOnce({
      success: true,
      skipped: true,
    });

    const summary = await runFreshnessDispatcher(now);

    expect(summary.emitted.reminder).toBe(0);
    expect(summary.skippedPreference.reminder).toBe(1);
    expect(summary.emitted.warning).toBe(1);
    expect(mockSendNotificationEmailWithPreference).toHaveBeenCalledTimes(1);
    expect(mockSendNotificationEmail).toHaveBeenCalledTimes(1);
    expect(mockUpdateMany).toHaveBeenCalledTimes(2);
    expect(getFreshnessCronTelemetrySnapshot()).toMatchObject({
      emittedCounts: {
        reminder: 0,
        warning: 1,
      },
      skippedPreferenceCounts: {
        reminder: 1,
        warning: 0,
      },
    });
  });

  it("keeps the warning selection window above the auto-pause cutoff", async () => {
    mockFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await runFreshnessDispatcher(now);

    expect(mockFindMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          availabilitySource: "HOST_MANAGED",
          status: "ACTIVE",
          freshnessWarningSentAt: null,
          lastConfirmedAt: expect.objectContaining({
            lte: daysAgo(now, 21),
            gt: daysAgo(now, 30),
          }),
        }),
      })
    );
  });

  it("stays disabled behind ENABLE_FRESHNESS_NOTIFICATIONS=off", async () => {
    Object.defineProperty(features, "freshnessNotifications", {
      value: false,
      writable: true,
    });

    const summary = await runFreshnessDispatcher(now);

    expect(summary).toMatchObject({
      success: true,
      skipped: true,
      reason: "feature_disabled",
      selected: 0,
    });
    expect(mockFindMany).not.toHaveBeenCalled();
  });
});
