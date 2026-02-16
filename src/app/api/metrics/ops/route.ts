/**
 * Prometheus-compatible ops metrics endpoint
 *
 * Protected by bearer token authentication (METRICS_SECRET).
 * Default-deny: requires METRICS_SECRET configured AND valid bearer token.
 */

import { getServerEnv } from '@/lib/env';

export const runtime = 'nodejs';

export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');
    const { METRICS_SECRET: expectedToken } = getServerEnv();

    // Default-deny: require METRICS_SECRET configured AND bearer token to match
    if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
        return new Response('Unauthorized', { status: 401 });
    }

    const memory = process.memoryUsage();
    const version = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) || 'dev';

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
