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

    // Default-deny: require METRICS_SECRET to be configured AND bearer token to match
    if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
        return new Response('Unauthorized', { status: 401 });
    }

    const memory = process.memoryUsage();
    const version = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) || 'dev';

    // Prometheus text format (https://prometheus.io/docs/instrumenting/exposition_formats/)
    // Reduced info exposure: omit Node.js version, array buffer details, and external memory
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
        `# HELP nodejs_rss_bytes Resident set size in bytes`,
        `# TYPE nodejs_rss_bytes gauge`,
        `nodejs_rss_bytes ${memory.rss}`,
        ``,
        `# HELP app_info Application version`,
        `# TYPE app_info gauge`,
        `app_info{version="${version}"} 1`,
    ].join('\n');

    return new Response(prometheusFormat, {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
    });
}
