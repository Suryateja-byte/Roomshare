"use server";

import { headers } from "next/headers";
import { executeSearchV2 } from "@/lib/search/search-v2-service";
import { type ListingData } from "@/lib/data";
import { buildRawParamsFromSearchParams } from "@/lib/search-params";
import { checkServerComponentRateLimit } from "@/lib/with-rate-limit";
import { withTimeout, DEFAULT_TIMEOUTS } from "@/lib/timeout-wrapper";
import { features } from "@/lib/env";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import { logger, sanitizeErrorMessage } from "@/lib/logger";
import { circuitBreakers, isCircuitOpenError } from "@/lib/circuit-breaker";
import * as Sentry from "@sentry/nextjs";

export interface FetchMoreResult {
  items: ListingData[];
  nextCursor: string | null;
  hasNextPage: boolean;
  /** True when V2 is unavailable and V1 can't continue cursor pagination */
  degraded?: boolean;
}

export async function fetchMoreListings(
  cursor: string,
  rawParams: Record<string, string | string[] | undefined>
): Promise<FetchMoreResult> {
  try {
    // Validate cursor — return safe empty result instead of exposing error details
    if (!cursor || typeof cursor !== "string" || cursor.trim() === "") {
      return { items: [], nextCursor: null, hasNextPage: false };
    }

    // Rate limiting
    const headersList = await headers();
    const rateLimitResult = await checkServerComponentRateLimit(
      headersList,
      "search",
      "/search"
    );
    if (!rateLimitResult.allowed) {
      throw new Error("Rate limited");
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
          // Throw on V2 failures so circuit breaker counts them
          if (!result.response || !result.paginatedResult) {
            throw new Error(result.error || "V2 search returned no response");
          }
          return result;
        });

        if (v2Result.paginatedResult) {
          return {
            items: v2Result.paginatedResult.items,
            nextCursor: v2Result.paginatedResult.nextCursor ?? null,
            hasNextPage: v2Result.paginatedResult.hasNextPage ?? false,
          };
        }
      } catch (error) {
        if (!isCircuitOpenError(error)) {
          Sentry.captureException(error, {
            tags: { component: "search-action", path: "fetchMoreListings-v2" },
          });
          console.warn("[fetchMoreListings] V2 failed, falling back to v1", {
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }
    }

    // V1 fallback - cursor-based pagination not truly supported
    // Signal degradation to client so it can show a user-friendly message
    // instead of silently removing the "Load more" button
    console.warn(
      "[fetchMoreListings] V1 fallback reached - cursor pagination not supported"
    );
    return { items: [], nextCursor: null, hasNextPage: false, degraded: true };
  } catch (error) {
    logger.sync.error("[fetchMoreListings] Unexpected error", {
      error: sanitizeErrorMessage(error),
    });
    throw new Error("Failed to load more listings");
  }
}
