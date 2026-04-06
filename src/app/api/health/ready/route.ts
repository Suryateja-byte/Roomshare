import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isInShutdownMode } from "@/lib/shutdown";
import { logger } from "@/lib/logger";
import { getAllCircuitBreakerStates } from "@/lib/circuit-breaker";

/**
 * Readiness probe - confirms the application can serve traffic
 * Checks database connectivity and critical dependencies
 *
 * Use this for load balancer readiness checks and k8s readiness probes.
 * Returns 503 if any critical dependency is unavailable or if shutting down.
 */
export async function GET() {
  // If shutting down, return 503 to stop receiving new traffic
  if (isInShutdownMode()) {
    return NextResponse.json(
      {
        status: "draining",
        message: "Application is shutting down",
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }

  const publicChecks: Record<string, { status: "ok" | "error" | "timeout" }> =
    {};
  const internalLatency: Record<string, number> = {};
  let healthy = true;

  // Check database connectivity (CRITICAL) — 3s timeout to prevent hang on pool exhaustion
  const DB_TIMEOUT_MS = 3000;
  const dbStart = Date.now();
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("DB health check timeout")),
          DB_TIMEOUT_MS
        )
      ),
    ]);
    const dbLatency = Date.now() - dbStart;
    publicChecks.database = { status: "ok" };
    internalLatency.database = dbLatency;
  } catch (err) {
    const dbLatency = Date.now() - dbStart;
    const isTimeout =
      err instanceof Error && err.message === "DB health check timeout";
    publicChecks.database = {
      status: isTimeout ? "timeout" : "error",
    };
    internalLatency.database = dbLatency;
    healthy = false;
  }

  // Check Redis connectivity (OPTIONAL - we have DB fallback)
  if (
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    const redisStart = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const fetchResponse = await fetch(
        `${process.env.UPSTASH_REDIS_REST_URL}/ping`,
        {
          headers: {
            Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
          },
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      const redisLatency = Date.now() - redisStart;
      publicChecks.redis = { status: fetchResponse.ok ? "ok" : "error" };
      internalLatency.redis = redisLatency;
    } catch {
      publicChecks.redis = { status: "error" };
      internalLatency.redis = Date.now() - redisStart;
      // Redis failure is non-fatal - map/metrics/search fall back to DB; chat fails closed
    }
  } else {
    publicChecks.redis = { status: "ok" }; // Not configured, using DB fallback
  }

  // Check Supabase connectivity (OPTIONAL - affects real-time only)
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    publicChecks.supabase = { status: "ok" }; // Just check config exists
  }

  // INFRA-002 FIX: Expose circuit breaker states for ops visibility
  const breakerStates = getAllCircuitBreakerStates();
  const anyBreakerOpen = breakerStates.some((b) => b.state === "OPEN");

  // Log latency internally (not exposed in public response)
  logger.sync.debug("Health check latency", {
    route: "/api/health/ready",
    latency: internalLatency,
    healthy,
    anyBreakerOpen,
  });

  // Determine overall status:
  // - "unhealthy" (503) if critical deps (DB) are down
  // - "degraded" (200) if DB is healthy but a circuit breaker is open
  // - "ready" (200) if everything is healthy
  const status = !healthy ? "unhealthy" : anyBreakerOpen ? "degraded" : "ready";

  // P2-1: Health checks must never be cached - always return fresh data
  const response = NextResponse.json(
    {
      status,
      timestamp: new Date().toISOString(),
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "dev",
      checks: publicChecks,
      circuitBreakers: breakerStates,
    },
    { status: healthy ? 200 : 503 }
  );
  response.headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
  return response;
}

// Use nodejs runtime for Prisma access
export const runtime = "nodejs";
