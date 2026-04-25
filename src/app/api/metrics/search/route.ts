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
  recordListingCreateCollisionActionSelected,
  recordSearchClientAbort,
  recordSearchDedupMemberClick,
  recordSearchDedupOpenPanelClick,
  recordSearchMapListMismatch,
  recordSearchSnapshotExpired,
} from "@/lib/search/search-telemetry";

export const runtime = "nodejs";

const MAX_BODY_SIZE = 2_000;
const ALLOWED_METRICS = new Set([
  "search_client_abort_total",
  "search_map_list_mismatch_total",
  "search_snapshot_expired_total",
  "cfm.search.legacy_url_count",
  "search_dedup_open_panel_click",
  "search_dedup_member_click",
  "listing_create_collision_action_selected",
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
const ALLOWED_SNAPSHOT_EXPIRED_REASONS = new Set([
  "search_contract_changed",
  "snapshot_missing",
  "snapshot_expired",
]);
const ALLOWED_LEGACY_URL_ALIASES = new Set<string>(LEGACY_URL_ALIASES);
const ALLOWED_LEGACY_URL_SURFACES = new Set(["spa"]);
const ALLOWED_COLLISION_ACTIONS = new Set([
  "update",
  "add_date",
  "create_separate",
  "cancel",
]);

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
      metric: "search_snapshot_expired_total";
      route: "search-results-client";
      queryHash?: string;
      reason: "search_contract_changed" | "snapshot_missing" | "snapshot_expired";
    }
  | {
      metric: "cfm.search.legacy_url_count";
      alias: LegacyUrlAlias;
      surface: "spa";
    }
  | {
      metric: "search_dedup_open_panel_click";
      groupSize: number;
      queryHashPrefix8: string;
    }
  | {
      metric: "search_dedup_member_click";
      groupSize: number;
      memberIndex: number;
    }
  | {
      metric: "listing_create_collision_action_selected";
      action: "update" | "add_date" | "create_separate" | "cancel";
    };

function isSafeNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    Number.isFinite(value) &&
    value >= 0
  );
}

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

  if (obj.metric === "search_dedup_open_panel_click") {
    if (
      !isSafeNonNegativeInteger(obj.groupSize) ||
      typeof obj.queryHashPrefix8 !== "string" ||
      !isShortOptionalString(obj.queryHashPrefix8, 32)
    ) {
      return { valid: false };
    }

    return {
      valid: true,
      payload: {
        metric: "search_dedup_open_panel_click",
        groupSize: obj.groupSize,
        queryHashPrefix8: obj.queryHashPrefix8,
      },
    };
  }

  if (obj.metric === "search_dedup_member_click") {
    if (
      !isSafeNonNegativeInteger(obj.groupSize) ||
      !isSafeNonNegativeInteger(obj.memberIndex)
    ) {
      return { valid: false };
    }

    return {
      valid: true,
      payload: {
        metric: "search_dedup_member_click",
        groupSize: obj.groupSize,
        memberIndex: obj.memberIndex,
      },
    };
  }

  if (obj.metric === "listing_create_collision_action_selected") {
    if (
      typeof obj.action !== "string" ||
      !ALLOWED_COLLISION_ACTIONS.has(obj.action)
    ) {
      return { valid: false };
    }

    return {
      valid: true,
      payload: {
        metric: "listing_create_collision_action_selected",
        action: obj.action as "update" | "add_date" | "create_separate" | "cancel",
      },
    };
  }

  if (obj.metric === "search_snapshot_expired_total") {
    if (
      obj.route !== "search-results-client" ||
      typeof obj.reason !== "string" ||
      !ALLOWED_SNAPSHOT_EXPIRED_REASONS.has(obj.reason) ||
      !isShortOptionalString(obj.queryHash, 128)
    ) {
      return { valid: false };
    }

    return {
      valid: true,
      payload: {
        metric: "search_snapshot_expired_total",
        route: "search-results-client",
        queryHash: obj.queryHash as string | undefined,
        reason: obj.reason as
          | "search_contract_changed"
          | "snapshot_missing"
          | "snapshot_expired",
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
    } else if (validation.payload.metric === "search_snapshot_expired_total") {
      recordSearchSnapshotExpired({
        route: "search-client",
        queryHash: validation.payload.queryHash,
        reason: validation.payload.reason,
      });
    } else if (validation.payload.metric === "search_dedup_open_panel_click") {
      recordSearchDedupOpenPanelClick({
        groupSize: validation.payload.groupSize,
        queryHashPrefix8: validation.payload.queryHashPrefix8,
      });
    } else if (validation.payload.metric === "search_dedup_member_click") {
      recordSearchDedupMemberClick({
        groupSize: validation.payload.groupSize,
        memberIndex: validation.payload.memberIndex,
      });
    } else if (
      validation.payload.metric === "listing_create_collision_action_selected"
    ) {
      recordListingCreateCollisionActionSelected({
        action: validation.payload.action,
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
