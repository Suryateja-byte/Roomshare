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

import { GET } from "@/app/api/metrics/ops/route";
import {
  recordSearchDocCronRun,
  resetSearchDocCronTelemetryForTests,
} from "@/lib/search/search-doc-cron-telemetry";
import {
  recordSearchClientAbort,
  recordSearchRequestLatency,
  resetSearchTelemetryForTests,
} from "@/lib/search/search-telemetry";

describe("GET /api/metrics/ops", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
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
    expect(text).toContain('cfm_search_doc_divergence_count{reason="missing"} 1');
    expect(text).toContain('cfm_search_doc_repaired_count{reason="stale"} 1');
    expect(text).toContain('cfm_search_dirty_queue_age_seconds{quantile="0.95"} 90');
    expect(text).toContain("cfm_search_refresh_processed_count 4");
    expect(text).toContain(
      'cfm_search_refresh_error_count{reason="projection_error"} 1'
    );
  });
});
