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
  FRESHNESS_CRON_ELIGIBLE_METRIC,
  FRESHNESS_CRON_EMITTED_METRIC,
  FRESHNESS_CRON_ERROR_STAGES,
  FRESHNESS_NOTIFICATION_KINDS,
  FRESHNESS_NOTIFICATION_SENT_METRIC,
  getFreshnessCronTelemetrySnapshot,
} from "@/lib/freshness/freshness-cron-telemetry";
import {
  PRIVATE_FEEDBACK_CATEGORIES,
  PRIVATE_FEEDBACK_DENIAL_REASONS,
} from "@/lib/reports/private-feedback";
import { getPrivateFeedbackTelemetrySnapshot } from "@/lib/reports/private-feedback-telemetry";
import { LEGACY_URL_ALIASES, LEGACY_URL_SURFACES } from "@/lib/search-params";
import {
  getSearchDocCronTelemetrySnapshot,
  SEARCH_DOC_CRON_CAS_SUPPRESSION_REASON_LABELS,
  SEARCH_DOC_CRON_ERROR_REASON_LABELS,
  SEARCH_DOC_CRON_REASON_LABELS,
} from "@/lib/search/search-doc-cron-telemetry";
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

function toPrometheusMetricName(metric: string): string {
  return metric.replaceAll(".", "_");
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
  const freshnessTelemetry = getFreshnessCronTelemetrySnapshot();
  const searchDocCronTelemetry = getSearchDocCronTelemetrySnapshot();
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
    ``,
    `# HELP ${toPrometheusMetricName(FRESHNESS_CRON_ELIGIBLE_METRIC)} Total number of due listings selected in the latest freshness cron run`,
    `# TYPE ${toPrometheusMetricName(FRESHNESS_CRON_ELIGIBLE_METRIC)} gauge`,
    ...FRESHNESS_NOTIFICATION_KINDS.map(
      (kind) =>
        `${toPrometheusMetricName(FRESHNESS_CRON_ELIGIBLE_METRIC)}{kind="${kind}"} ${freshnessTelemetry.eligibleCounts[kind]}`
    ),
    ``,
    `# HELP ${toPrometheusMetricName(FRESHNESS_CRON_EMITTED_METRIC)} Total number of freshness reminder or warning notifications emitted`,
    `# TYPE ${toPrometheusMetricName(FRESHNESS_CRON_EMITTED_METRIC)} counter`,
    ...FRESHNESS_NOTIFICATION_KINDS.map(
      (kind) =>
        `${toPrometheusMetricName(FRESHNESS_CRON_EMITTED_METRIC)}{kind="${kind}"} ${freshnessTelemetry.emittedCounts[kind]}`
    ),
    ``,
    `# HELP ${toPrometheusMetricName(FRESHNESS_NOTIFICATION_SENT_METRIC)} Total number of canonical freshness reminder or warning notifications emitted`,
    `# TYPE ${toPrometheusMetricName(FRESHNESS_NOTIFICATION_SENT_METRIC)} counter`,
    ...FRESHNESS_NOTIFICATION_KINDS.map(
      (kind) =>
        `${toPrometheusMetricName(FRESHNESS_NOTIFICATION_SENT_METRIC)}{kind="${kind}"} ${freshnessTelemetry.notificationSentCounts[kind]}`
    ),
    ``,
    `# HELP cfm_cron_freshness_reminder_error_count Total number of freshness cron failures by kind and stage`,
    `# TYPE cfm_cron_freshness_reminder_error_count counter`,
    ...FRESHNESS_NOTIFICATION_KINDS.flatMap((kind) =>
      FRESHNESS_CRON_ERROR_STAGES.map(
        (stage) =>
          `cfm_cron_freshness_reminder_error_count{kind="${kind}",stage="${stage}"} ${freshnessTelemetry.errorCounts[kind][stage]}`
      )
    ),
    ``,
    `# HELP cfm_cron_freshness_reminder_skipped_preference_count Total number of reminder emails skipped due to host email preferences`,
    `# TYPE cfm_cron_freshness_reminder_skipped_preference_count counter`,
    ...FRESHNESS_NOTIFICATION_KINDS.map(
      (kind) =>
        `cfm_cron_freshness_reminder_skipped_preference_count{kind="${kind}"} ${freshnessTelemetry.skippedPreferenceCounts[kind]}`
    ),
    ``,
    `# HELP cfm_cron_freshness_reminder_skipped_auto_pause_count Total number of freshness candidates skipped because they reached auto-pause age`,
    `# TYPE cfm_cron_freshness_reminder_skipped_auto_pause_count counter`,
    `cfm_cron_freshness_reminder_skipped_auto_pause_count ${freshnessTelemetry.skippedAutoPauseCount}`,
    ``,
    `# HELP cfm_cron_freshness_reminder_skipped_unconfirmed_count Total number of freshness candidates skipped because lastConfirmedAt was missing`,
    `# TYPE cfm_cron_freshness_reminder_skipped_unconfirmed_count counter`,
    `cfm_cron_freshness_reminder_skipped_unconfirmed_count ${freshnessTelemetry.skippedUnconfirmedCount}`,
    ``,
    `# HELP cfm_cron_freshness_reminder_skipped_stale_row_count Total number of freshness token updates skipped because the row changed during dispatch`,
    `# TYPE cfm_cron_freshness_reminder_skipped_stale_row_count counter`,
    `cfm_cron_freshness_reminder_skipped_stale_row_count ${freshnessTelemetry.skippedStaleRowCount}`,
    ``,
    `# HELP cfm_cron_freshness_reminder_skipped_suspended_count Total number of freshness candidates skipped because the owner is suspended`,
    `# TYPE cfm_cron_freshness_reminder_skipped_suspended_count counter`,
    `cfm_cron_freshness_reminder_skipped_suspended_count ${freshnessTelemetry.skippedSuspendedCount}`,
    ``,
    `# HELP cfm_cron_freshness_reminder_budget_exhausted_count Total number of freshness cron runs that stopped because the time budget was exhausted`,
    `# TYPE cfm_cron_freshness_reminder_budget_exhausted_count counter`,
    `cfm_cron_freshness_reminder_budget_exhausted_count ${freshnessTelemetry.budgetExhaustedCount}`,
    ``,
    `# HELP cfm_cron_freshness_reminder_lock_held_count Total number of freshness cron invocations skipped because another run already held the advisory lock`,
    `# TYPE cfm_cron_freshness_reminder_lock_held_count counter`,
    `cfm_cron_freshness_reminder_lock_held_count ${freshnessTelemetry.lockHeldCount}`,
    ``,
    `# HELP cfm_search_doc_divergence_count Total number of detected search doc divergences in the latest cron run`,
    `# TYPE cfm_search_doc_divergence_count gauge`,
    ...SEARCH_DOC_CRON_REASON_LABELS.map(
      (reason) =>
        `cfm_search_doc_divergence_count{reason="${reason}"} ${searchDocCronTelemetry.divergenceCounts[reason]}`
    ),
    ``,
    `# HELP cfm_search_doc_repaired_count Total number of repaired search doc divergences`,
    `# TYPE cfm_search_doc_repaired_count counter`,
    ...SEARCH_DOC_CRON_REASON_LABELS.map(
      (reason) =>
        `cfm_search_doc_repaired_count{reason="${reason}"} ${searchDocCronTelemetry.repairedCounts[reason]}`
    ),
    ``,
    `# HELP cfm_search_doc_cas_suppressed_count Total number of CAS-suppressed write attempts by the search doc cron`,
    `# TYPE cfm_search_doc_cas_suppressed_count counter`,
    ...SEARCH_DOC_CRON_CAS_SUPPRESSION_REASON_LABELS.map(
      (reason) =>
        `cfm_search_doc_cas_suppressed_count{reason="${reason}"} ${searchDocCronTelemetry.casSuppressedCounts[reason]}`
    ),
    ``,
    `# HELP cfm_search_doc_cron_last_run_partial 1 if the most recent cron run recorded partial/interrupted metrics, 0 if the run completed cleanly`,
    `# TYPE cfm_search_doc_cron_last_run_partial gauge`,
    `cfm_search_doc_cron_last_run_partial ${searchDocCronTelemetry.lastRunPartial ? 1 : 0}`,
    ``,
    `# HELP cfm_search_dirty_queue_age_seconds Age of dirty search-doc queue entries in seconds from the latest cron batch`,
    `# TYPE cfm_search_dirty_queue_age_seconds summary`,
    `cfm_search_dirty_queue_age_seconds{quantile="0.5"} ${searchDocCronTelemetry.dirtyQueueAgeSeconds.p50}`,
    `cfm_search_dirty_queue_age_seconds{quantile="0.95"} ${searchDocCronTelemetry.dirtyQueueAgeSeconds.p95}`,
    `cfm_search_dirty_queue_age_seconds_count ${searchDocCronTelemetry.dirtyQueueAgeSeconds.count}`,
    `cfm_search_dirty_queue_age_seconds_sum ${searchDocCronTelemetry.dirtyQueueAgeSeconds.sum}`,
    ``,
    `# HELP cfm_search_refresh_processed_count Total number of search doc refresh upserts processed`,
    `# TYPE cfm_search_refresh_processed_count counter`,
    `cfm_search_refresh_processed_count ${searchDocCronTelemetry.processedCount}`,
    ``,
    `# HELP cfm_search_refresh_error_count Total number of search doc refresh projection errors`,
    `# TYPE cfm_search_refresh_error_count counter`,
    ...SEARCH_DOC_CRON_ERROR_REASON_LABELS.map(
      (reason) =>
        `cfm_search_refresh_error_count{reason="${reason}"} ${searchDocCronTelemetry.errorCounts[reason]}`
    ),
  ].join("\n");

  return new Response(prometheusFormat, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
