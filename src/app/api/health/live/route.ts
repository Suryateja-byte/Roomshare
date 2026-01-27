import { NextResponse } from 'next/server';

/**
 * Liveness probe - confirms the process is running
 * Returns 200 if the application is alive
 *
 * Use this for load balancer health checks and k8s liveness probes.
 * This should ALWAYS return 200 if the process is running.
 *
 * For draining state detection during graceful shutdown,
 * use /api/health/ready instead (returns 503 when shutting down).
 */
export async function GET() {
  // P2-1: Health checks must never be cached - always return fresh data
  const response = NextResponse.json(
    {
      status: 'alive',
      timestamp: new Date().toISOString(),
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'dev',
    },
    { status: 200 }
  );
  response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  return response;
}
