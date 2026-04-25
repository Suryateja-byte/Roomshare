/**
 * Tests for /api/metrics/ops route — route-level auth logic (Issue #12)
 *
 * Scope: Tests bearer-token matching in the route handler only.
 * getServerEnv is mocked to bypass Zod lazy-init caching, so these tests
 * do NOT cover production env-validation behavior (fail-fast throw on
 * missing METRICS_SECRET). That Zod .refine() path is currently untested;
 * adding coverage is tracked as a known gap.
 */

// Mock getServerEnv to read from process.env directly (avoids lazy-init caching)
jest.mock("@/lib/env", () => ({
  getServerEnv: () => process.env,
}));

jest.mock("@/lib/freshness/ops-metrics", () => ({
  getFreshnessOpsMetricsSnapshot: jest.fn(async () => ({
    freshnessBucketCounts: {
      normal: 0,
      reminder: 0,
      warning: 0,
      auto_paused: 0,
    },
    staleInSearchCount: 0,
    staleStillActiveCount: 0,
    legacyEligibleCount: 0,
  })),
}));

jest.mock("@/lib/metrics/cfm-ops-telemetry", () => ({
  getCfmOpsTelemetrySnapshot: jest.fn(() => ({
    unauthorizedCreateCount: 0,
    contactOnlyAttemptCount: 0,
    freshnessRecoveredCount: 0,
  })),
}));

import { GET } from "@/app/api/metrics/ops/route";
import {
  recordAutoPauseCronRun,
  recordFreshnessCronRun,
  resetAutoPauseCronTelemetryForTests,
  resetFreshnessCronTelemetryForTests,
} from "@/lib/freshness/freshness-cron-telemetry";
import {
  recordSearchDocCronRun,
  resetSearchDocCronTelemetryForTests,
} from "@/lib/search/search-doc-cron-telemetry";
import {
  recordSearchClientAbort,
  recordSearchRequestLatency,
  recordSearchSnapshotExpired,
  recordSearchSnapshotHoleRatio,
  resetSearchTelemetryForTests,
} from "@/lib/search/search-telemetry";
import { getFreshnessOpsMetricsSnapshot } from "@/lib/freshness/ops-metrics";
import { getCfmOpsTelemetrySnapshot } from "@/lib/metrics/cfm-ops-telemetry";

describe("GET /api/metrics/ops", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    resetAutoPauseCronTelemetryForTests();
    resetFreshnessCronTelemetryForTests();
    resetSearchDocCronTelemetryForTests();
    resetSearchTelemetryForTests();
    process.env = {
      ...originalEnv,
      METRICS_SECRET: "test-metrics-secret-32-chars-min!!",
    } as unknown as NodeJS.ProcessEnv;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns 401 when no Authorization header", async () => {
    const req = new Request("http://localhost/api/metrics/ops");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 401 when bearer token does not match", async () => {
    const req = new Request("http://localhost/api/metrics/ops", {
      headers: { authorization: "Bearer wrong-token" },
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 401 when METRICS_SECRET is not set", async () => {
    delete process.env.METRICS_SECRET;
    const req = new Request("http://localhost/api/metrics/ops", {
      headers: { authorization: "Bearer anything" },
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 200 with Prometheus metrics when token matches", async () => {
    (getFreshnessOpsMetricsSnapshot as jest.Mock).mockResolvedValue({
      freshnessBucketCounts: {
        normal: 7,
        reminder: 2,
        warning: 1,
        auto_paused: 3,
      },
      staleInSearchCount: 0,
      staleStillActiveCount: 2,
      legacyEligibleCount: 5,
    });
    (getCfmOpsTelemetrySnapshot as jest.Mock).mockReturnValue({
      unauthorizedCreateCount: 4,
      contactOnlyAttemptCount: 2,
      freshnessRecoveredCount: 3,
    });
    recordSearchRequestLatency({
      route: "search-page-ssr",
      durationMs: 42,
      backendSource: "v2",
      stateKind: "ok",
      queryHash: "hash-1",
      resultCount: 5,
    });
    recordSearchClientAbort({
      route: "search-client",
      queryHash: "hash-1",
      reason: "superseded",
    });
    recordSearchSnapshotExpired({
      route: "search-client",
      queryHash: "hash-2",
      reason: "snapshot_expired",
    });
    recordSearchSnapshotHoleRatio({
      route: "search-page-ssr",
      queryHash: "hash-3",
      querySnapshotId: "snapshot-1",
      holeCount: 1,
      consideredCount: 4,
    });
    recordSearchDocCronRun({
      divergenceCounts: {
        missing: 1,
        stale: 2,
        version_skew: 1,
      },
      repairedCounts: {
        missing: 1,
        stale: 1,
      },
      processedCount: 4,
      errorCounts: {
        projection_error: 1,
      },
      dirtyQueueAgeSeconds: [20, 40, 90],
      casSuppressedCounts: {
        older_source_version: 2,
        older_projection_version: 1,
      },
      partial: true,
    });
    recordFreshnessCronRun({
      eligibleCounts: {
        reminder: 2,
        warning: 1,
      },
      emittedCounts: {
        reminder: 1,
        warning: 1,
      },
      errorCounts: {
        warning: {
          email: 1,
        },
      },
      skippedPreferenceCounts: {
        reminder: 1,
      },
      skippedSuspendedCount: 1,
      budgetExhausted: true,
    });
    recordAutoPauseCronRun({
      eligibleCount: 3,
      autoPausedCount: 2,
      emittedCount: 1,
      errorCounts: {
        email: 1,
      },
      skippedCounts: {
        no_warning: 1,
        version_conflict: 1,
      },
      budgetExhausted: true,
    });

    const req = new Request("http://localhost/api/metrics/ops", {
      headers: { authorization: "Bearer test-metrics-secret-32-chars-min!!" },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("process_uptime_seconds");
    expect(text).toContain("nodejs_heap_size_used_bytes");
    expect(text).toContain("search_request_latency_ms_count 1");
    expect(text).toContain('search_backend_source{backend_source="v2"} 1');
    expect(text).toContain("search_client_abort_total 1");
    expect(text).toContain("search_snapshot_expired_total 1");
    expect(text).toContain("search_snapshot_hole_ratio_average 0.25");
    expect(text).toContain("search_snapshot_hole_responses_total 1");
    expect(text).toContain('cfm_listing_freshness_bucket_count{bucket="normal"} 7');
    expect(text).toContain("cfm_listing_stale_in_search_count 0");
    expect(text).toContain("cfm_listing_stale_still_active_count 2");
    expect(text).toContain("cfm_review_legacy_eligible_count 5");
    expect(text).toContain("cfm_review_unauthorized_create_count 4");
    expect(text).toContain("cfm_review_contact_only_attempt_count 2");
    expect(text).toContain("cfm_listing_freshness_recovered_count 3");
    expect(text).toContain(
      'cfm_cron_freshness_reminder_eligible_count{kind="reminder"} 2'
    );
    expect(text).toContain(
      'cfm_cron_freshness_reminder_emitted_count{kind="warning"} 1'
    );
    expect(text).toContain(
      'cfm_listing_freshness_notification_sent_count{kind="reminder"} 1'
    );
    expect(text).toContain(
      'cfm_cron_freshness_reminder_error_count{kind="warning",stage="email"} 1'
    );
    expect(text).toContain(
      'cfm_cron_freshness_reminder_skipped_preference_count{kind="reminder"} 1'
    );
    expect(text).toContain("cfm_cron_freshness_reminder_budget_exhausted_count 1");
    expect(text).toContain("cfm_listing_auto_paused_count 2");
    expect(text).toContain("cfm_cron_stale_auto_pause_eligible_count 3");
    expect(text).toContain("cfm_cron_stale_auto_pause_emitted_count 1");
    expect(text).toContain(
      'cfm_cron_stale_auto_pause_error_count{stage="email"} 1'
    );
    expect(text).toContain(
      'cfm_cron_stale_auto_pause_skipped_count{reason="version_conflict"} 1'
    );
    expect(text).toContain("cfm_cron_stale_auto_pause_budget_exhausted_count 1");
    expect(text).toContain('cfm_search_doc_divergence_count{reason="missing"} 1');
    expect(text).toContain('cfm_search_doc_repaired_count{reason="stale"} 1');
    expect(text).toContain(
      'cfm_search_doc_cas_suppressed_count{reason="older_source_version"} 2'
    );
    expect(text).toContain("cfm_search_doc_cron_last_run_partial 1");
    expect(text).toContain('cfm_search_dirty_queue_age_seconds{quantile="0.95"} 90');
    expect(text).toContain("cfm_search_refresh_processed_count 4");
    expect(text).toContain(
      'cfm_search_refresh_error_count{reason="projection_error"} 1'
    );
  });
});
