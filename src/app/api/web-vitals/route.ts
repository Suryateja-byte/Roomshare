import { NextResponse } from "next/server";
import { checkMetricsRateLimit } from "@/lib/rate-limit-redis";
import { getClientIP } from "@/lib/rate-limit";
import { isOriginAllowed, isHostAllowed } from "@/lib/origin-guard";
import { logger, sanitizeErrorMessage } from "@/lib/logger";

/**
 * Web Vitals API Route — Privacy-Safe Performance Metrics
 *
 * Accepts Core Web Vitals metrics from the WebVitals client component.
 * No PII is collected — only metric name, value, rating, and page pathname.
 *
 * SECURITY STACK:
 * 1. Origin/Host enforcement
 * 2. Content-Type enforcement
 * 3. Rate limiting (Redis-backed)
 * 4. Body size guard
 * 5. Strict schema validation (allowlisted metric names only)
 */

export const runtime = "nodejs";

const MAX_BODY_SIZE = 2_000; // Web vitals payloads are tiny

const ALLOWED_METRIC_NAMES = new Set([
  "LCP",
  "FID",
  "INP",
  "CLS",
  "FCP",
  "TTFB",
]);

const ALLOWED_RATINGS = new Set(["good", "needs-improvement", "poor"]);

const ALLOWED_NAV_TYPES = new Set([
  "navigate",
  "reload",
  "back-forward",
  "back_forward",
  "back-forward-cache",
  "back_forward_cache",
  "prerender",
  "restore",
]);

interface WebVitalsPayload {
  id: string;
  name: string;
  value: number;
  rating: string;
  delta: number;
  navigationType: string;
  pathname: string;
  timestamp: number;
}

function validatePayload(
  body: unknown
): { valid: true; payload: WebVitalsPayload } | { valid: false } {
  if (!body || typeof body !== "object") return { valid: false };

  const obj = body as Record<string, unknown>;

  if (typeof obj.id !== "string" || obj.id.length > 64) return { valid: false };
  if (typeof obj.name !== "string" || !ALLOWED_METRIC_NAMES.has(obj.name))
    return { valid: false };
  if (typeof obj.value !== "number" || !Number.isFinite(obj.value))
    return { valid: false };
  if (typeof obj.rating !== "string" || !ALLOWED_RATINGS.has(obj.rating))
    return { valid: false };
  if (typeof obj.delta !== "number" || !Number.isFinite(obj.delta))
    return { valid: false };
  if (
    typeof obj.navigationType !== "string" ||
    !ALLOWED_NAV_TYPES.has(obj.navigationType)
  )
    return { valid: false };
  if (typeof obj.pathname !== "string" || obj.pathname.length > 256)
    return { valid: false };
  if (typeof obj.timestamp !== "number" || !Number.isFinite(obj.timestamp))
    return { valid: false };

  return {
    valid: true,
    payload: {
      id: obj.id as string,
      name: obj.name as string,
      value: obj.value as number,
      rating: obj.rating as string,
      delta: obj.delta as number,
      navigationType: obj.navigationType as string,
      pathname: obj.pathname as string,
      timestamp: obj.timestamp as number,
    },
  };
}

export async function POST(request: Request) {
  try {
    // 1. ORIGIN/HOST ENFORCEMENT
    const origin = request.headers.get("origin");
    const host = request.headers.get("host");

    if (process.env.NODE_ENV === "production") {
      if (origin && !isOriginAllowed(origin)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (!origin && !isHostAllowed(host)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // 2. CONTENT-TYPE ENFORCEMENT
    const contentType = request.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      return NextResponse.json(
        { error: "Invalid content type" },
        { status: 415 }
      );
    }

    // 3. RATE LIMIT
    const clientIP = getClientIP(request);
    const rateLimitResult = await checkMetricsRateLimit(clientIP);

    if (!rateLimitResult.success) {
      return new Response(JSON.stringify({ error: "Too many requests" }), {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(rateLimitResult.retryAfter || 60),
        },
      });
    }

    // 4. BODY SIZE GUARD
    const raw = await request.text();
    if (raw.length > MAX_BODY_SIZE) {
      return NextResponse.json({ error: "Request too large" }, { status: 413 });
    }

    // 5. PARSE JSON
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    // 6. STRICT SCHEMA VALIDATION
    const validation = validatePayload(body);
    if (!validation.valid) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // 7. LOG SAFE METRICS (no PII — only metric name, value, rating, pathname)
    // Production: forward to analytics service (Supabase, BigQuery, etc.)
    const _safeLog = {
      ts: validation.payload.timestamp,
      metric: validation.payload.name,
      value: validation.payload.value,
      rating: validation.payload.rating,
      delta: validation.payload.delta,
      nav: validation.payload.navigationType,
      path: validation.payload.pathname,
    };

    // await analyticsService.logWebVitals(safeLog);

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.sync.error("Web Vitals API error", {
      error: sanitizeErrorMessage(error),
    });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
