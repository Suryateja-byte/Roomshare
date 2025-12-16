import { NextResponse } from 'next/server';

/**
 * Liveness probe - confirms the process is running
 * Returns 200 if the application is alive
 *
 * Use this for load balancer health checks and k8s liveness probes.
 * This should ALWAYS return 200 if the process is running.
 */
export async function GET() {
  return NextResponse.json(
    {
      status: 'alive',
      timestamp: new Date().toISOString(),
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'dev',
    },
    { status: 200 }
  );
}

// Use edge runtime for fastest response
export const runtime = 'edge';
