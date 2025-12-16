import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Readiness probe - confirms the application can serve traffic
 * Checks database connectivity and critical dependencies
 *
 * Use this for load balancer readiness checks and k8s readiness probes.
 * Returns 503 if any critical dependency is unavailable.
 */
export async function GET() {
  const checks: Record<string, { status: 'ok' | 'error'; latency?: number; error?: string }> = {};
  let healthy = true;

  // Check database connectivity (CRITICAL)
  const dbStart = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { status: 'ok', latency: Date.now() - dbStart };
  } catch (error) {
    checks.database = {
      status: 'error',
      error: error instanceof Error ? error.message : String(error)
    };
    healthy = false;
  }

  // Check Redis connectivity (OPTIONAL - we have DB fallback)
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const redisStart = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const response = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/ping`, {
        headers: {
          Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      checks.redis = response.ok
        ? { status: 'ok', latency: Date.now() - redisStart }
        : { status: 'error', error: `HTTP ${response.status}` };
    } catch (error) {
      checks.redis = {
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      };
      // Redis failure is non-fatal - we have DB fallback for rate limiting
    }
  } else {
    checks.redis = { status: 'ok', latency: 0 }; // Not configured, using DB fallback
  }

  // Check Supabase connectivity (OPTIONAL - affects real-time only)
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    checks.supabase = { status: 'ok' }; // Just check config exists
  }

  return NextResponse.json(
    {
      status: healthy ? 'ready' : 'unhealthy',
      timestamp: new Date().toISOString(),
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'dev',
      checks,
    },
    { status: healthy ? 200 : 503 }
  );
}

// Use nodejs runtime for Prisma access
export const runtime = 'nodejs';
