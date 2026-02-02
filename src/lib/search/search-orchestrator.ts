/**
 * Search Orchestrator - v2→v1 Fallback Logic
 *
 * Extracted from src/app/search/page.tsx for testability.
 * This is a pure extraction with no behavior changes.
 */

import { executeSearchV2 } from "./search-v2-service";
import { getListingsPaginated } from "@/lib/data";
import { logger } from "@/lib/logger";
import type { PaginatedResultHybrid, ListingData } from "@/lib/data";
import type { V2MapData } from "@/contexts/SearchV2DataContext";
import type { FilterParams } from "@/lib/search-params";

export interface SearchOrchestrationResult {
  paginatedResult: PaginatedResultHybrid<ListingData>;
  v2MapData: V2MapData | null;
  fetchError: string | null;
  usedV1Fallback: boolean;
}

/**
 * Orchestrates search between v2 and v1 APIs with fallback.
 *
 * Flow:
 * 1. If useV2=true, try executeSearchV2()
 * 2. If v2 fails (null response), fall back to v1
 * 3. If useV2=false, use v1 directly
 * 4. If v1 fails, return empty result with error
 *
 * @param rawParams - Raw URL search params
 * @param filterParams - Parsed filter parameters
 * @param requestedPage - Page number to fetch
 * @param limit - Items per page
 * @param useV2 - Whether to attempt v2 API first
 */
export async function orchestrateSearch(
  rawParams: Record<string, string>,
  filterParams: FilterParams,
  requestedPage: number,
  limit: number,
  useV2: boolean,
): Promise<SearchOrchestrationResult> {
  let paginatedResult: PaginatedResultHybrid<ListingData> | null = null;
  let fetchError: string | null = null;
  let v2MapData: V2MapData | null = null;
  let usedV1Fallback = false;

  if (useV2) {
    // V2 path: unified fetch for list + map data
    const v2Result = await executeSearchV2({
      rawParams: rawParams,
      limit,
    });

    if (v2Result.response && v2Result.paginatedResult) {
      // Extract map data for context injection
      v2MapData = {
        geojson: v2Result.response.map.geojson,
        pins: v2Result.response.map.pins,
        mode: v2Result.response.meta.mode,
      };
      paginatedResult = v2Result.paginatedResult;
    } else {
      // V2 failed, fall back to v1 path
      fetchError = v2Result.error || null;
    }
  }

  // V1 path (or fallback when v2 fails)
  if (!paginatedResult) {
    usedV1Fallback = useV2; // Only counts as fallback if v2 was attempted
    try {
      paginatedResult = await getListingsPaginated({
        ...filterParams,
        page: requestedPage,
        limit,
      });
    } catch (err) {
      logger.sync.error("Search listings fetch failed", {
        action: "getListingsPaginated",
        error: err instanceof Error ? err.message : "Unknown error",
      });
      fetchError =
        err instanceof Error
          ? err.message
          : "Unable to load listings. Please try again.";
      // Provide empty fallback to render gracefully
      paginatedResult = {
        items: [],
        total: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPrevPage: false,
        page: requestedPage,
        limit,
      };
    }
  }

  return { paginatedResult, v2MapData, fetchError, usedV1Fallback };
}
