"use server";

import { headers } from "next/headers";
import { executeSearchV2 } from "@/lib/search/search-v2-service";
import { type ListingData } from "@/lib/data";
import {
  buildRawParamsFromSearchParams,
  type RawSearchParams,
} from "@/lib/search-params";
import { checkServerComponentRateLimit } from "@/lib/with-rate-limit";
import { withTimeout, DEFAULT_TIMEOUTS } from "@/lib/timeout-wrapper";
import { features } from "@/lib/env";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import { logger, sanitizeErrorMessage } from "@/lib/logger";
import { circuitBreakers, isCircuitOpenError } from "@/lib/circuit-breaker";
import * as Sentry from "@sentry/nextjs";
import {
  createSearchResponseMeta,
  type SearchResponseMeta,
} from "@/lib/search/search-response";
import { normalizeSearchQuery } from "@/lib/search/search-query";
import {
  buildScenarioLoadMoreResult,
  resolveSearchScenario,
  type SearchScenario,
} from "@/lib/search/testing/search-scenarios";
import {
  recordSearchLoadMoreError,
  recordSearchRequestLatency,
  recordSearchV2Fallback,
} from "@/lib/search/search-telemetry";

export interface FetchMoreResult {
  items: ListingData[];
  nextCursor: string | null;
  hasNextPage: boolean;
  meta?: SearchResponseMeta;
  snapshotExpired?: {
    queryHash: string;
    reason: "search_contract_changed" | "snapshot_missing" | "snapshot_expired";
  };
  /** True when V2 is unavailable and V1 can't continue cursor pagination */
  degraded?: boolean;
  /** True when request was rate limited — client should show friendly message */
  rateLimited?: boolean;
}

export async function fetchMoreListings(
  cursor: string,
  rawParams: Record<string, string | string[] | undefined>,
  queryHash?: string,
  scenarioOverride?: SearchScenario | null
): Promise<FetchMoreResult> {
  const requestStartTime = performance.now();
  try {
    const normalizedQuery = normalizeSearchQuery(rawParams as RawSearchParams);
    const fallbackMeta = createSearchResponseMeta(normalizedQuery, "v1-fallback");
    const testScenario = resolveSearchScenario({
      override: scenarioOverride ?? null,
    });

    if (testScenario) {
      const scenarioResult = await buildScenarioLoadMoreResult(testScenario, {
        query: normalizedQuery,
        cursor,
        queryHashOverride: queryHash,
      });
      recordSearchRequestLatency({
        route: "search-load-more",
        durationMs: performance.now() - requestStartTime,
        backendSource: scenarioResult.meta?.backendSource,
        stateKind: scenarioResult.degraded
          ? "degraded"
          : scenarioResult.rateLimited
            ? "rate-limited"
            : "ok",
        queryHash: scenarioResult.meta?.queryHash,
        resultCount: scenarioResult.items.length,
      });
      if (scenarioResult.degraded || scenarioResult.rateLimited) {
        recordSearchLoadMoreError({
          route: "search-load-more",
          queryHash: scenarioResult.meta?.queryHash,
          reason: scenarioResult.rateLimited
            ? "rate-limited"
            : "degraded-fallback",
        });
      }
      return scenarioResult;
    }

    // Validate cursor — return safe empty result instead of exposing error details
    if (!cursor || typeof cursor !== "string" || cursor.trim() === "") {
      recordSearchLoadMoreError({
        route: "search-load-more",
        queryHash: fallbackMeta.queryHash,
        reason: "invalid-cursor",
      });
      recordSearchRequestLatency({
        route: "search-load-more",
        durationMs: performance.now() - requestStartTime,
        backendSource: fallbackMeta.backendSource,
        stateKind: "invalid-cursor",
        queryHash: fallbackMeta.queryHash,
        resultCount: 0,
      });
      return {
        items: [],
        nextCursor: null,
        hasNextPage: false,
        meta: fallbackMeta,
      };
    }

    // Rate limiting
    const headersList = await headers();
    const rateLimitResult = await checkServerComponentRateLimit(
      headersList,
      "search",
      "/search"
    );
    if (!rateLimitResult.allowed) {
      recordSearchLoadMoreError({
        route: "search-load-more",
        queryHash: fallbackMeta.queryHash,
        reason: "rate-limited",
      });
      recordSearchRequestLatency({
        route: "search-load-more",
        durationMs: performance.now() - requestStartTime,
        stateKind: "rate-limited",
        queryHash: fallbackMeta.queryHash,
        resultCount: 0,
      });
      return {
        items: [],
        nextCursor: null,
        hasNextPage: false,
        rateLimited: true,
        meta: fallbackMeta,
      };
    }

    // Embed cursor in rawParams for v2
    const paramsWithCursor = { ...rawParams, cursor };

    // Try v2 if enabled
    if (features.searchV2) {
      try {
        const rawParamsForV2 = buildRawParamsFromSearchParams(
          new URLSearchParams(
            Object.entries(paramsWithCursor).flatMap(([key, value]) =>
              Array.isArray(value)
                ? value.map((v) => [key, v])
                : value
                  ? [[key, value]]
                  : []
            )
          )
        );

        // P0-1 FIX: Throw on V2 error-returns so circuit breaker correctly tracks failures.
        // Previously, executeSearchV2 swallowed errors into resolved { error: "..." } values,
        // so the circuit breaker never saw failures and never opened.
        const v2Result = await circuitBreakers.searchV2.execute(async () => {
          const result = await withTimeout(
            executeSearchV2({
              rawParams: rawParamsForV2,
              limit: DEFAULT_PAGE_SIZE,
            }),
            DEFAULT_TIMEOUTS.DATABASE,
            "fetchMoreListings-executeSearchV2"
          );
          if (result.snapshotExpired) {
            return result;
          }
          // Throw on V2 failures so circuit breaker counts them
          if (!result.response || !result.paginatedResult) {
            throw new Error(result.error || "V2 search returned no response");
          }
          return result;
        });

        if (v2Result.snapshotExpired) {
          const meta = createSearchResponseMeta(normalizedQuery, "v2");
          const finalMeta =
            queryHash && queryHash.trim().length > 0
              ? { ...meta, queryHash }
              : meta;
          recordSearchLoadMoreError({
            route: "search-load-more",
            queryHash: finalMeta.queryHash,
            reason: "snapshot-expired",
          });
          recordSearchRequestLatency({
            route: "search-load-more",
            durationMs: performance.now() - requestStartTime,
            backendSource: finalMeta.backendSource,
            stateKind: "degraded",
            queryHash: finalMeta.queryHash,
            resultCount: 0,
          });
          return {
            items: [],
            nextCursor: null,
            hasNextPage: false,
            snapshotExpired: v2Result.snapshotExpired,
            meta: finalMeta,
          };
        }

        if (v2Result.paginatedResult) {
          const responseMeta = v2Result.response?.meta;
          const meta = responseMeta
            ? createSearchResponseMeta(normalizedQuery, "v2", {
                querySnapshotId: responseMeta.querySnapshotId,
                projectionVersion: responseMeta.projectionVersion,
                embeddingVersion: responseMeta.embeddingVersion,
                rankerProfileVersion: responseMeta.rankerProfileVersion,
              })
            : createSearchResponseMeta(normalizedQuery, "v2");
          const finalMeta =
            queryHash && queryHash.trim().length > 0
              ? { ...meta, queryHash }
              : meta;
          recordSearchRequestLatency({
            route: "search-load-more",
            durationMs: performance.now() - requestStartTime,
            backendSource: finalMeta.backendSource,
            stateKind: "ok",
            queryHash: finalMeta.queryHash,
            resultCount: v2Result.paginatedResult.items.length,
          });
          return {
            items: v2Result.paginatedResult.items,
            nextCursor: v2Result.paginatedResult.nextCursor ?? null,
            hasNextPage: v2Result.paginatedResult.hasNextPage ?? false,
            meta: finalMeta,
          };
        }
      } catch (error) {
        if (!isCircuitOpenError(error)) {
          Sentry.captureException(error, {
            tags: { component: "search-action", path: "fetchMoreListings-v2" },
          });
          logger.sync.warn(
            "[fetchMoreListings] V2 failed, falling back to v1",
            {
              error: sanitizeErrorMessage(error),
            }
          );
        }
        recordSearchV2Fallback({
          route: "search-load-more",
          queryHash: queryHash || fallbackMeta.queryHash,
          reason: isCircuitOpenError(error)
            ? "v2_circuit_open"
            : "v2_failed_or_unavailable",
        });
      }
    }

    // V1 fallback - cursor-based pagination not truly supported
    // Signal degradation to client so it can show a user-friendly message
    // instead of silently removing the "Load more" button
    logger.sync.warn(
      "[fetchMoreListings] V1 fallback reached - cursor pagination not supported"
    );
    recordSearchLoadMoreError({
      route: "search-load-more",
      queryHash: queryHash || fallbackMeta.queryHash,
      reason: "degraded-fallback",
    });
    recordSearchRequestLatency({
      route: "search-load-more",
      durationMs: performance.now() - requestStartTime,
      backendSource: fallbackMeta.backendSource,
      stateKind: "degraded",
      queryHash: queryHash || fallbackMeta.queryHash,
      resultCount: 0,
    });
    return {
      items: [],
      nextCursor: null,
      hasNextPage: false,
      degraded: true,
      meta:
        queryHash && queryHash.trim().length > 0
          ? { ...fallbackMeta, queryHash }
          : fallbackMeta,
    };
  } catch (error) {
    recordSearchLoadMoreError({
      route: "search-load-more",
      reason: "unexpected-error",
    });
    logger.sync.error("[fetchMoreListings] Unexpected error", {
      error: sanitizeErrorMessage(error),
    });
    throw new Error("Failed to load more listings");
  }
}
