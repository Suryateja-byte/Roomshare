/**
 * Prometheus-compatible ops metrics endpoint
 *
 * Protected by bearer token authentication (METRICS_SECRET).
 * Default-deny: requires METRICS_SECRET configured AND valid bearer token.
 *
 * Exposes: process metrics, memory, error counters, request duration histograms.
 */

import { getServerEnv } from '@/lib/env';

export const runtime = 'nodejs';

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
export function recordRequestMetrics(durationMs: number, isError: boolean): void {
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
    const authHeader = request.headers.get('authorization');
    const { METRICS_SECRET: expectedToken } = getServerEnv();

    // Default-deny: require METRICS_SECRET configured AND bearer token to match
    if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
        return new Response('Unauthorized', { status: 401 });
    }

    const memory = process.memoryUsage();
    const version = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) || 'dev';

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
    ].join('\n');

    return new Response(prometheusFormat, {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
    });
}
