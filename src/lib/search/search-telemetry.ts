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
  telemetryStore.legacyUrlCounts = createLegacyUrlCounts();
}
