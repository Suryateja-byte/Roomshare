import { createHash, createHmac } from "crypto";
import { logger } from "@/lib/logger";
import {
  LEGACY_URL_ALIASES,
  LEGACY_URL_SURFACES,
  type LegacyUrlAlias,
  type LegacyUrlSurface,
} from "@/lib/search-params";
import type { SearchBackendSource } from "./search-response";

export type SearchTelemetryRoute =
  | "search-page-ssr"
  | "search-listings-api"
  | "map-listings-api"
  | "search-load-more"
  | "search-client"
  | "search-map-client";

interface SearchRequestLatencyRecord {
  durationMs: number;
}

interface SearchTelemetryStore {
  requestLatencies: Array<SearchRequestLatencyRecord | undefined>;
  requestLatencyIndex: number;
  requestLatencyCount: number;
  requestLatencySum: number;
  backendSourceCounts: Record<SearchBackendSource, number>;
  v2FallbackTotal: number;
  mapListMismatchTotal: number;
  loadMoreErrorTotal: number;
  zeroResultsTotal: number;
  clientAbortTotal: number;
  dedupAppliedTotal: number;
  dedupOverflowTotal: number;
  listingCreateCollisionDetectedTotal: number;
  listingCreateCollisionResolvedTotal: number;
  listingCreateCollisionModerationGatedTotal: number;
  dedupOpenPanelClickTotal: number;
  dedupMemberClickTotal: number;
  listingCreateCollisionActionSelectedTotal: number;
  legacyUrlCounts: Record<LegacyUrlSurface, Record<LegacyUrlAlias, number>>;
}

const MAX_REQUEST_LATENCY_SAMPLES = 1000;

function createLegacyUrlCounts(): Record<
  LegacyUrlSurface,
  Record<LegacyUrlAlias, number>
> {
  return Object.fromEntries(
    LEGACY_URL_SURFACES.map((surface) => [
      surface,
      Object.fromEntries(LEGACY_URL_ALIASES.map((alias) => [alias, 0])),
    ])
  ) as Record<LegacyUrlSurface, Record<LegacyUrlAlias, number>>;
}

const telemetryStore: SearchTelemetryStore = {
  requestLatencies: new Array<SearchRequestLatencyRecord | undefined>(
    MAX_REQUEST_LATENCY_SAMPLES
  ),
  requestLatencyIndex: 0,
  requestLatencyCount: 0,
  requestLatencySum: 0,
  backendSourceCounts: {
    v2: 0,
    "v1-fallback": 0,
    "map-api": 0,
  },
  v2FallbackTotal: 0,
  mapListMismatchTotal: 0,
  loadMoreErrorTotal: 0,
  zeroResultsTotal: 0,
  clientAbortTotal: 0,
  dedupAppliedTotal: 0,
  dedupOverflowTotal: 0,
  listingCreateCollisionDetectedTotal: 0,
  listingCreateCollisionResolvedTotal: 0,
  listingCreateCollisionModerationGatedTotal: 0,
  dedupOpenPanelClickTotal: 0,
  dedupMemberClickTotal: 0,
  listingCreateCollisionActionSelectedTotal: 0,
  legacyUrlCounts: createLegacyUrlCounts(),
};

function computePercentile(samples: number[], percentile: number): number {
  if (samples.length === 0) return 0;
  const index = Math.ceil((percentile / 100) * samples.length) - 1;
  return samples[Math.max(0, index)];
}

function getRoundedDuration(durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs < 0) return 0;
  return Math.round(durationMs * 100) / 100;
}

function recordLatencySample(durationMs: number): void {
  if (!Number.isFinite(durationMs) || durationMs < 0) return;

  const slot = telemetryStore.requestLatencyIndex % MAX_REQUEST_LATENCY_SAMPLES;
  telemetryStore.requestLatencies[slot] = {
    durationMs,
  };
  telemetryStore.requestLatencyIndex += 1;
  telemetryStore.requestLatencyCount += 1;
  telemetryStore.requestLatencySum += durationMs;
}

function getOwnerHash16(ownerId: string): string {
  const ownerHashSalt = process.env.OWNER_HASH_SALT;

  if (ownerHashSalt && ownerHashSalt.length > 0) {
    return createHmac("sha256", ownerHashSalt)
      .update(ownerId)
      .digest("hex")
      .slice(0, 16);
  }

  return createHash("sha256").update(ownerId).digest("hex").slice(0, 16);
}

export function getOwnerHashPrefix8(ownerId: string): string {
  return getOwnerHash16(ownerId).slice(0, 8);
}

export function recordSearchRequestLatency({
  route,
  durationMs,
  backendSource,
  stateKind,
  queryHash,
  resultCount,
}: {
  route: SearchTelemetryRoute;
  durationMs: number;
  backendSource?: SearchBackendSource;
  stateKind?: string;
  queryHash?: string;
  resultCount?: number | null;
}): void {
  const roundedDurationMs = getRoundedDuration(durationMs);
  recordLatencySample(roundedDurationMs);

  if (backendSource) {
    telemetryStore.backendSourceCounts[backendSource] += 1;
  }

  logger.sync.info("search_request_latency_ms", {
    route,
    durationMs: roundedDurationMs,
    backendSource,
    stateKind,
    queryHash,
    resultCount,
  });
}

export function recordSearchV2Fallback({
  route,
  queryHash,
  reason,
}: {
  route: SearchTelemetryRoute;
  queryHash?: string;
  reason: string;
}): void {
  telemetryStore.v2FallbackTotal += 1;
  logger.sync.warn("search_v2_fallback_total", {
    route,
    queryHash,
    reason,
    total: telemetryStore.v2FallbackTotal,
  });
}

export function recordSearchMapListMismatch({
  route,
  queryHash,
  responseQueryHash,
  reason,
}: {
  route: SearchTelemetryRoute;
  queryHash?: string;
  responseQueryHash?: string;
  reason: string;
}): void {
  telemetryStore.mapListMismatchTotal += 1;
  logger.sync.warn("search_map_list_mismatch_total", {
    route,
    queryHash,
    responseQueryHash,
    reason,
    total: telemetryStore.mapListMismatchTotal,
  });
}

export function recordSearchLoadMoreError({
  route,
  queryHash,
  reason,
}: {
  route: Extract<SearchTelemetryRoute, "search-load-more">;
  queryHash?: string;
  reason: string;
}): void {
  telemetryStore.loadMoreErrorTotal += 1;
  logger.sync.warn("search_load_more_error_total", {
    route,
    queryHash,
    reason,
    total: telemetryStore.loadMoreErrorTotal,
  });
}

export function recordSearchZeroResults({
  route,
  queryHash,
  backendSource,
}: {
  route: Exclude<SearchTelemetryRoute, "search-client" | "search-map-client">;
  queryHash?: string;
  backendSource?: SearchBackendSource;
}): void {
  telemetryStore.zeroResultsTotal += 1;
  logger.sync.info("search_zero_results_total", {
    route,
    queryHash,
    backendSource,
    total: telemetryStore.zeroResultsTotal,
  });
}

export function recordSearchClientAbort({
  route,
  queryHash,
  reason,
}: {
  route: Extract<SearchTelemetryRoute, "search-client" | "search-map-client">;
  queryHash?: string;
  reason: string;
}): void {
  telemetryStore.clientAbortTotal += 1;
  logger.sync.info("search_client_abort_total", {
    route,
    queryHash,
    reason,
    total: telemetryStore.clientAbortTotal,
  });
}

export function recordSearchDedupApplied({
  rowsIn,
  groupsOut,
  maxGroupSize,
}: {
  rowsIn: number;
  groupsOut: number;
  maxGroupSize: number;
}): void {
  telemetryStore.dedupAppliedTotal += 1;
  logger.sync.info("search_dedup_applied_total", {
    rowsIn,
    groupsOut,
    maxGroupSize,
    total: telemetryStore.dedupAppliedTotal,
  });
}

export function recordSearchDedupOverflow({
  groupKeyPrefix8,
  queryHashPrefix8,
}: {
  groupKeyPrefix8: string;
  queryHashPrefix8: string;
}): void {
  telemetryStore.dedupOverflowTotal += 1;
  logger.sync.warn("search_dedup_overflow_total", {
    groupKeyPrefix8,
    queryHashPrefix8,
    total: telemetryStore.dedupOverflowTotal,
  });
}

export function recordListingCreateCollisionDetected({
  ownerHashPrefix8,
  siblingCount,
}: {
  ownerHashPrefix8: string;
  siblingCount: number;
}): void {
  telemetryStore.listingCreateCollisionDetectedTotal += 1;
  logger.sync.info("listing_create_collision_detected_total", {
    ownerHashPrefix8,
    siblingCount,
    total: telemetryStore.listingCreateCollisionDetectedTotal,
  });
}

export function recordListingCreateCollisionResolved({
  ownerHashPrefix8,
  action,
}: {
  ownerHashPrefix8: string;
  action: "proceed" | "moderation_gated";
}): void {
  telemetryStore.listingCreateCollisionResolvedTotal += 1;
  logger.sync.info("listing_create_collision_resolved_total", {
    ownerHashPrefix8,
    action,
    total: telemetryStore.listingCreateCollisionResolvedTotal,
  });
}

export function recordListingCreateCollisionModerationGated({
  ownerHashPrefix8,
  windowCount24h,
}: {
  ownerHashPrefix8: string;
  windowCount24h: number;
}): void {
  telemetryStore.listingCreateCollisionModerationGatedTotal += 1;
  logger.sync.warn("listing_create_collision_moderation_gated_total", {
    ownerHashPrefix8,
    windowCount24h,
    total: telemetryStore.listingCreateCollisionModerationGatedTotal,
  });
}

export function recordSearchDedupOpenPanelClick({
  groupSize,
  queryHashPrefix8,
}: {
  groupSize: number;
  queryHashPrefix8: string;
}): void {
  telemetryStore.dedupOpenPanelClickTotal += 1;
  logger.sync.info("search_dedup_open_panel_click", {
    groupSize,
    queryHashPrefix8,
    total: telemetryStore.dedupOpenPanelClickTotal,
  });
}

export function recordSearchDedupMemberClick({
  groupSize,
  memberIndex,
}: {
  groupSize: number;
  memberIndex: number;
}): void {
  telemetryStore.dedupMemberClickTotal += 1;
  logger.sync.info("search_dedup_member_click", {
    groupSize,
    memberIndex,
    total: telemetryStore.dedupMemberClickTotal,
  });
}

export function recordListingCreateCollisionActionSelected({
  action,
}: {
  action: "update" | "add_date" | "create_separate" | "cancel";
}): void {
  telemetryStore.listingCreateCollisionActionSelectedTotal += 1;
  logger.sync.info("listing_create_collision_action_selected", {
    action,
    total: telemetryStore.listingCreateCollisionActionSelectedTotal,
  });
}

export function recordLegacyUrlUsage({
  alias,
  surface,
}: {
  alias: LegacyUrlAlias;
  surface: LegacyUrlSurface;
}): void {
  telemetryStore.legacyUrlCounts[surface][alias] += 1;
  logger.sync.info("cfm.search.legacy_url_count", {
    alias,
    surface,
    total: telemetryStore.legacyUrlCounts[surface][alias],
  });
}

export function getSearchTelemetrySnapshot() {
  const validLatencies = telemetryStore.requestLatencies
    .filter((entry): entry is SearchRequestLatencyRecord => entry !== undefined)
    .map((entry) => entry.durationMs)
    .sort((left, right) => left - right);
  const legacyUrlCounts = createLegacyUrlCounts();

  for (const surface of LEGACY_URL_SURFACES) {
    for (const alias of LEGACY_URL_ALIASES) {
      legacyUrlCounts[surface][alias] =
        telemetryStore.legacyUrlCounts[surface][alias];
    }
  }

  return {
    requestLatency: {
      count: telemetryStore.requestLatencyCount,
      sum: Math.round(telemetryStore.requestLatencySum * 100) / 100,
      p50: computePercentile(validLatencies, 50),
      p95: computePercentile(validLatencies, 95),
      p99: computePercentile(validLatencies, 99),
    },
    backendSourceCounts: {
      ...telemetryStore.backendSourceCounts,
    },
    v2FallbackTotal: telemetryStore.v2FallbackTotal,
    mapListMismatchTotal: telemetryStore.mapListMismatchTotal,
    loadMoreErrorTotal: telemetryStore.loadMoreErrorTotal,
    zeroResultsTotal: telemetryStore.zeroResultsTotal,
    clientAbortTotal: telemetryStore.clientAbortTotal,
    dedupAppliedTotal: telemetryStore.dedupAppliedTotal,
    dedupOverflowTotal: telemetryStore.dedupOverflowTotal,
    dedupOpenPanelClickTotal: telemetryStore.dedupOpenPanelClickTotal,
    dedupMemberClickTotal: telemetryStore.dedupMemberClickTotal,
    listingCreateCollisionDetectedTotal:
      telemetryStore.listingCreateCollisionDetectedTotal,
    listingCreateCollisionResolvedTotal:
      telemetryStore.listingCreateCollisionResolvedTotal,
    listingCreateCollisionModerationGatedTotal:
      telemetryStore.listingCreateCollisionModerationGatedTotal,
    listingCreateCollisionActionSelectedTotal:
      telemetryStore.listingCreateCollisionActionSelectedTotal,
    legacyUrlCounts,
  };
}

export function resetSearchTelemetryForTests(): void {
  telemetryStore.requestLatencies = new Array<SearchRequestLatencyRecord | undefined>(
    MAX_REQUEST_LATENCY_SAMPLES
  );
  telemetryStore.requestLatencyIndex = 0;
  telemetryStore.requestLatencyCount = 0;
  telemetryStore.requestLatencySum = 0;
  telemetryStore.backendSourceCounts = {
    v2: 0,
    "v1-fallback": 0,
    "map-api": 0,
  };
  telemetryStore.v2FallbackTotal = 0;
  telemetryStore.mapListMismatchTotal = 0;
  telemetryStore.loadMoreErrorTotal = 0;
  telemetryStore.zeroResultsTotal = 0;
  telemetryStore.clientAbortTotal = 0;
  telemetryStore.dedupAppliedTotal = 0;
  telemetryStore.dedupOverflowTotal = 0;
  telemetryStore.listingCreateCollisionDetectedTotal = 0;
  telemetryStore.listingCreateCollisionResolvedTotal = 0;
  telemetryStore.listingCreateCollisionModerationGatedTotal = 0;
  telemetryStore.dedupOpenPanelClickTotal = 0;
  telemetryStore.dedupMemberClickTotal = 0;
  telemetryStore.listingCreateCollisionActionSelectedTotal = 0;
  telemetryStore.legacyUrlCounts = createLegacyUrlCounts();
}
