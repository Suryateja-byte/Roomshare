/**
 * P2-04 FIX: Prometheus-compatible ops metrics endpoint
 *
 * Provides system metrics for infrastructure monitoring:
 * - Process uptime
 * - Memory usage (heap, RSS, external)
 * - Node.js version
 * - Application version
 *
 * Protected by optional bearer token authentication (METRICS_SECRET)
 */

export const runtime = 'nodejs';

export async function GET(request: Request) {
    // Auth check - only allow internal/authenticated requests if METRICS_SECRET is set
    const authHeader = request.headers.get('authorization');
    const expectedToken = process.env.METRICS_SECRET;

    // If METRICS_SECRET is configured, require valid bearer token
    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
        return new Response('Unauthorized', { status: 401 });
    }

    const memory = process.memoryUsage();
    const version = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) || 'dev';

    // Prometheus text format (https://prometheus.io/docs/instrumenting/exposition_formats/)
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
