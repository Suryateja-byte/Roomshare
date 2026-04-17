import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { checkMetricsRateLimit } from "@/lib/rate-limit-redis";
import { getClientIP } from "@/lib/rate-limit";
import { isOriginAllowed, isHostAllowed } from "@/lib/origin-guard";
import { logger, sanitizeErrorMessage } from "@/lib/logger";
import {
  LEGACY_URL_ALIASES,
  type LegacyUrlAlias,
} from "@/lib/search-params";
import {
  recordLegacyUrlUsage,
  recordSearchClientAbort,
  recordSearchMapListMismatch,
} from "@/lib/search/search-telemetry";

export const runtime = "nodejs";

const MAX_BODY_SIZE = 2_000;
const ALLOWED_METRICS = new Set([
  "search_client_abort_total",
  "search_map_list_mismatch_total",
  "cfm.search.legacy_url_count",
]);
const ALLOWED_ROUTES = new Set([
  "search-results-client",
  "persistent-map-wrapper",
]);
const ALLOWED_REASONS = new Set([
  "superseded",
  "cleanup",
  "retry",
  "stale-query-hash",
  "stale-request-key",
]);
const ALLOWED_LEGACY_URL_ALIASES = new Set<string>(LEGACY_URL_ALIASES);
const ALLOWED_LEGACY_URL_SURFACES = new Set(["spa"]);

type SearchClientTelemetryPayload =
  | {
      metric: "search_client_abort_total";
      route: "search-results-client" | "persistent-map-wrapper";
      queryHash?: string;
      reason: string;
    }
  | {
      metric: "search_map_list_mismatch_total";
      route: "search-results-client" | "persistent-map-wrapper";
      queryHash?: string;
      responseQueryHash?: string;
      reason: string;
    }
  | {
      metric: "cfm.search.legacy_url_count";
      alias: LegacyUrlAlias;
      surface: "spa";
    };

function isShortOptionalString(value: unknown, maxLength: number): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.length <= maxLength)
  );
}

function validatePayload(
  body: unknown
): { valid: true; payload: SearchClientTelemetryPayload } | { valid: false } {
  if (!body || typeof body !== "object") {
    return { valid: false };
  }

  const obj = body as Record<string, unknown>;

  if (typeof obj.metric !== "string" || !ALLOWED_METRICS.has(obj.metric)) {
    return { valid: false };
  }

  if (obj.metric === "cfm.search.legacy_url_count") {
    if (
      typeof obj.alias !== "string" ||
      !ALLOWED_LEGACY_URL_ALIASES.has(obj.alias) ||
      typeof obj.surface !== "string" ||
      !ALLOWED_LEGACY_URL_SURFACES.has(obj.surface)
    ) {
      return { valid: false };
    }

    return {
      valid: true,
      payload: {
        metric: "cfm.search.legacy_url_count",
        alias: obj.alias as LegacyUrlAlias,
        surface: "spa",
      },
    };
  }

  if (
    typeof obj.route !== "string" ||
    !ALLOWED_ROUTES.has(obj.route) ||
    typeof obj.reason !== "string" ||
    !ALLOWED_REASONS.has(obj.reason) ||
    !isShortOptionalString(obj.queryHash, 128)
  ) {
    return { valid: false };
  }

  if (obj.metric === "search_map_list_mismatch_total") {
    if (!isShortOptionalString(obj.responseQueryHash, 128)) {
      return { valid: false };
    }

    return {
      valid: true,
      payload: {
        metric: "search_map_list_mismatch_total",
        route: obj.route as "search-results-client" | "persistent-map-wrapper",
        queryHash: obj.queryHash as string | undefined,
        responseQueryHash: obj.responseQueryHash as string | undefined,
        reason: obj.reason,
      },
    };
  }

  return {
    valid: true,
    payload: {
      metric: "search_client_abort_total",
      route: obj.route as "search-results-client" | "persistent-map-wrapper",
      queryHash: obj.queryHash as string | undefined,
      reason: obj.reason,
    },
  };
}

export async function POST(request: Request) {
  try {
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

    const contentType = request.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      return NextResponse.json(
        { error: "Invalid content type" },
        { status: 415 }
      );
    }

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

    const raw = await request.text();
    if (raw.length > MAX_BODY_SIZE) {
      return NextResponse.json({ error: "Request too large" }, { status: 413 });
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const validation = validatePayload(body);
    if (!validation.valid) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    if (validation.payload.metric === "search_client_abort_total") {
      recordSearchClientAbort({
        route:
          validation.payload.route === "search-results-client"
            ? "search-client"
            : "search-map-client",
        queryHash: validation.payload.queryHash,
        reason: validation.payload.reason,
      });
    } else if (validation.payload.metric === "search_map_list_mismatch_total") {
      recordSearchMapListMismatch({
        route:
          validation.payload.route === "search-results-client"
            ? "search-client"
            : "search-map-client",
        queryHash: validation.payload.queryHash,
        responseQueryHash: validation.payload.responseQueryHash,
        reason: validation.payload.reason,
      });
    } else {
      recordLegacyUrlUsage({
        alias: validation.payload.alias,
        surface: validation.payload.surface,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "/api/metrics/search", method: "POST" },
    });
    logger.sync.error("Search telemetry API error", {
      error: sanitizeErrorMessage(error),
    });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
