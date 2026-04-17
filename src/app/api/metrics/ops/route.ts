/**
 * Prometheus-compatible ops metrics endpoint
 *
 * Protected by bearer token authentication (METRICS_SECRET).
 * Default-deny: requires METRICS_SECRET configured AND valid bearer token.
 *
 * Exposes: process metrics, memory, error counters, request duration histograms.
 */

import crypto from "crypto";
import { getServerEnv } from "@/lib/env";
import {
  PRIVATE_FEEDBACK_CATEGORIES,
  PRIVATE_FEEDBACK_DENIAL_REASONS,
} from "@/lib/reports/private-feedback";
import { getPrivateFeedbackTelemetrySnapshot } from "@/lib/reports/private-feedback-telemetry";
import { LEGACY_URL_ALIASES, LEGACY_URL_SURFACES } from "@/lib/search-params";
import { getSearchTelemetrySnapshot } from "@/lib/search/search-telemetry";

export const runtime = "nodejs";

// In-process counters (reset on cold start — acceptable for serverless)
const counters = {
  requestTotal: 0,
  errorTotal: 0,
};

// Track request durations (last 1000 samples, circular buffer)
const MAX_DURATION_SAMPLES = 1000;
const durationSamples: number[] = [];
let durationIndex = 0;

/** Record an API request duration (call from middleware or instrumentation) */
function _recordRequestMetrics(durationMs: number, isError: boolean): void {
  counters.requestTotal++;
  if (isError) counters.errorTotal++;
  durationSamples[durationIndex % MAX_DURATION_SAMPLES] = durationMs;
  durationIndex++;
}

function computePercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const { METRICS_SECRET: expectedToken } = getServerEnv();

  // Default-deny: require METRICS_SECRET configured AND bearer token to match
  const expected = `Bearer ${expectedToken}`;
  if (
    !expectedToken ||
    !authHeader ||
    authHeader.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  const memory = process.memoryUsage();
  const version = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) || "dev";
  const feedbackTelemetry = getPrivateFeedbackTelemetrySnapshot();
  const searchTelemetry = getSearchTelemetrySnapshot();

  // Compute duration percentiles from samples
  const validSamples = durationSamples.filter((d) => d !== undefined);
  const sorted = [...validSamples].sort((a, b) => a - b);
  const p50 = computePercentile(sorted, 50);
  const p95 = computePercentile(sorted, 95);
  const p99 = computePercentile(sorted, 99);

  const prometheusFormat = [
    `# HELP process_uptime_seconds Process uptime in seconds`,
    `# TYPE process_uptime_seconds gauge`,
    `process_uptime_seconds ${process.uptime()}`,
    ``,
    `# HELP nodejs_heap_size_used_bytes Used heap size in bytes`,
    `# TYPE nodejs_heap_size_used_bytes gauge`,
    `nodejs_heap_size_used_bytes ${memory.heapUsed}`,
    ``,
    `# HELP nodejs_heap_size_total_bytes Total heap size in bytes`,
    `# TYPE nodejs_heap_size_total_bytes gauge`,
    `nodejs_heap_size_total_bytes ${memory.heapTotal}`,
    ``,
    `# HELP nodejs_external_memory_bytes External memory in bytes`,
    `# TYPE nodejs_external_memory_bytes gauge`,
    `nodejs_external_memory_bytes ${memory.external}`,
    ``,
    `# HELP nodejs_rss_bytes Resident set size in bytes`,
    `# TYPE nodejs_rss_bytes gauge`,
    `nodejs_rss_bytes ${memory.rss}`,
    ``,
    `# HELP nodejs_array_buffers_bytes Memory used by ArrayBuffers in bytes`,
    `# TYPE nodejs_array_buffers_bytes gauge`,
    `nodejs_array_buffers_bytes ${memory.arrayBuffers}`,
    ``,
    `# HELP http_requests_total Total number of HTTP requests`,
    `# TYPE http_requests_total counter`,
    `http_requests_total ${counters.requestTotal}`,
    ``,
    `# HELP http_errors_total Total number of HTTP error responses (4xx/5xx)`,
    `# TYPE http_errors_total counter`,
    `http_errors_total ${counters.errorTotal}`,
    ``,
    `# HELP http_request_duration_ms Request duration percentiles in milliseconds`,
    `# TYPE http_request_duration_ms summary`,
    `http_request_duration_ms{quantile="0.5"} ${p50}`,
    `http_request_duration_ms{quantile="0.95"} ${p95}`,
    `http_request_duration_ms{quantile="0.99"} ${p99}`,
    `http_request_duration_ms_count ${validSamples.length}`,
    ``,
    `# HELP app_info Application information`,
    `# TYPE app_info gauge`,
    `app_info{version="${version}",node_version="${process.version}"} 1`,
    ``,
    `# HELP search_request_latency_ms Search request latency summary in milliseconds`,
    `# TYPE search_request_latency_ms summary`,
    `search_request_latency_ms{quantile="0.5"} ${searchTelemetry.requestLatency.p50}`,
    `search_request_latency_ms{quantile="0.95"} ${searchTelemetry.requestLatency.p95}`,
    `search_request_latency_ms{quantile="0.99"} ${searchTelemetry.requestLatency.p99}`,
    `search_request_latency_ms_count ${searchTelemetry.requestLatency.count}`,
    `search_request_latency_ms_sum ${searchTelemetry.requestLatency.sum}`,
    ``,
    `# HELP search_backend_source Search responses grouped by backend source`,
    `# TYPE search_backend_source gauge`,
    `search_backend_source{backend_source="v2"} ${searchTelemetry.backendSourceCounts.v2}`,
    `search_backend_source{backend_source="v1-fallback"} ${searchTelemetry.backendSourceCounts["v1-fallback"]}`,
    `search_backend_source{backend_source="map-api"} ${searchTelemetry.backendSourceCounts["map-api"]}`,
    ``,
    `# HELP search_v2_fallback_total Total number of search v2 fallbacks`,
    `# TYPE search_v2_fallback_total counter`,
    `search_v2_fallback_total ${searchTelemetry.v2FallbackTotal}`,
    ``,
    `# HELP search_map_list_mismatch_total Total number of stale search response mismatches`,
    `# TYPE search_map_list_mismatch_total counter`,
    `search_map_list_mismatch_total ${searchTelemetry.mapListMismatchTotal}`,
    ``,
    `# HELP search_load_more_error_total Total number of load more failures`,
    `# TYPE search_load_more_error_total counter`,
    `search_load_more_error_total ${searchTelemetry.loadMoreErrorTotal}`,
    ``,
    `# HELP search_zero_results_total Total number of zero-result search responses`,
    `# TYPE search_zero_results_total counter`,
    `search_zero_results_total ${searchTelemetry.zeroResultsTotal}`,
    ``,
    `# HELP search_client_abort_total Total number of aborted client search requests`,
    `# TYPE search_client_abort_total counter`,
    `search_client_abort_total ${searchTelemetry.clientAbortTotal}`,
    ``,
    `# HELP cfm_search_legacy_url_count Total number of legacy search URL aliases observed`,
    `# TYPE cfm_search_legacy_url_count counter`,
    ...LEGACY_URL_SURFACES.flatMap((surface) =>
      LEGACY_URL_ALIASES.map(
        (alias) =>
          `cfm_search_legacy_url_count{alias="${alias}",surface="${surface}"} ${searchTelemetry.legacyUrlCounts[surface][alias]}`
      )
    ),
    ``,
    `# HELP cfm_feedback_submission_count Total number of accepted private feedback submissions`,
    `# TYPE cfm_feedback_submission_count counter`,
    ...PRIVATE_FEEDBACK_CATEGORIES.map(
      (category) =>
        `cfm_feedback_submission_count{category="${category}"} ${feedbackTelemetry.submissionCounts[category]}`
    ),
    ``,
    `# HELP cfm_feedback_denied_count Total number of denied private feedback submissions`,
    `# TYPE cfm_feedback_denied_count counter`,
    ...PRIVATE_FEEDBACK_DENIAL_REASONS.map(
      (reason) =>
        `cfm_feedback_denied_count{reason="${reason}"} ${feedbackTelemetry.deniedCounts[reason]}`
    ),
  ].join("\n");

  return new Response(prometheusFormat, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
