"use server";

import { headers } from "next/headers";
import { executeSearchV2 } from "@/lib/search/search-v2-service";
import { type ListingData } from "@/lib/data";
import { buildRawParamsFromSearchParams } from "@/lib/search-params";
import { checkServerComponentRateLimit } from "@/lib/with-rate-limit";
import { withTimeout, DEFAULT_TIMEOUTS } from "@/lib/timeout-wrapper";
import { features } from "@/lib/env";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";

export interface FetchMoreResult {
  items: ListingData[];
  nextCursor: string | null;
  hasNextPage: boolean;
}

export async function fetchMoreListings(
  cursor: string,
  rawParams: Record<string, string | string[] | undefined>
): Promise<FetchMoreResult> {
  // Validate cursor
  if (!cursor || typeof cursor !== "string" || cursor.trim() === "") {
    throw new Error("Invalid cursor");
  }

  // Rate limiting
  const headersList = await headers();
  const rateLimitResult = await checkServerComponentRateLimit(headersList, "search", "/search");
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

      const v2Result = await withTimeout(
        executeSearchV2({
          rawParams: rawParamsForV2,
          limit: DEFAULT_PAGE_SIZE,
        }),
        DEFAULT_TIMEOUTS.DATABASE,
        'fetchMoreListings-executeSearchV2'
      );

      if (v2Result.paginatedResult) {
        return {
          items: v2Result.paginatedResult.items,
          nextCursor: v2Result.paginatedResult.nextCursor ?? null,
          hasNextPage: v2Result.paginatedResult.hasNextPage ?? false,
        };
      }
    } catch (error) {
      console.warn("[fetchMoreListings] V2 failed, falling back to v1:", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  // V1 fallback - cursor-based pagination not truly supported
  // Return empty result to signal load more is unavailable via V1
  // The initial page was already loaded via SSR; continuing with page-based
  // pagination would return duplicate first-page results
  console.warn("[fetchMoreListings] V1 fallback reached - cursor pagination not supported");
  return { items: [], nextCursor: null, hasNextPage: false };
}
