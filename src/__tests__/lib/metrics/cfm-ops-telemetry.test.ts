jest.mock("@/lib/logger", () => ({
  logger: { sync: { info: jest.fn() } },
}));

import {
  getCfmOpsTelemetrySnapshot,
  recordContactOnlyReviewAttempt,
  recordFreshnessRecovered,
  recordUnauthorizedReviewCreate,
  resetCfmOpsTelemetryForTests,
} from "@/lib/metrics/cfm-ops-telemetry";

describe("cfm ops telemetry", () => {
  beforeEach(() => {
    resetCfmOpsTelemetryForTests();
  });

  it("tracks review denials and freshness recoveries", () => {
    recordUnauthorizedReviewCreate({
      listingId: "listing-1",
      reviewerId: "viewer-1",
      scope: "listing",
    });
    recordContactOnlyReviewAttempt({
      listingId: "listing-1",
      reviewerId: "viewer-1",
      targetUserId: "owner-1",
    });
    recordFreshnessRecovered({
      listingId: "listing-2",
      ownerId: "owner-2",
      mode: "REOPEN",
    });

    expect(getCfmOpsTelemetrySnapshot()).toEqual({
      unauthorizedCreateCount: 1,
      contactOnlyAttemptCount: 1,
      freshnessRecoveredCount: 1,
    });
  });
});
