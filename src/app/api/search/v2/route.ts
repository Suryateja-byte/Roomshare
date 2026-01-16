/**
 * GET /api/search/v2
 *
 * Unified search endpoint that returns both list results and map data
 * in a single response. Feature-flagged via ENABLE_SEARCH_V2 env var
 * or ?v2=1 URL param for testing.
 *
 * Response contract:
 * - meta.mode: 'geojson' (>=50 mapListings) or 'pins' (<50 mapListings)
 * - map.geojson: ALWAYS present (GeoJSON FeatureCollection for Mapbox clustering)
 * - map.pins: ONLY present when mode='pins' (tiered pins for sparse results)
 */

import { NextRequest, NextResponse } from "next/server";
import { features } from "@/lib/env";
import { getListingsPaginated, getMapListings } from "@/lib/data";
import { parseSearchParams } from "@/lib/search-params";
import { withRateLimitRedis } from "@/lib/with-rate-limit-redis";
import {
  createContextFromHeaders,
  runWithRequestContext,
  getRequestId,
} from "@/lib/request-context";
import {
  generateQueryHash,
  encodeCursor,
  decodeCursor,
} from "@/lib/search/hash";
import {
  transformToListItems,
  transformToMapResponse,
  determineMode,
} from "@/lib/search/transform";
import type { SearchV2Response } from "@/lib/search/types";

/**
 * Check if v2 is enabled via feature flag or URL param.
 */
function isV2Enabled(request: NextRequest): boolean {
  // Global feature flag takes precedence
  if (features.searchV2) {
    return true;
  }

  // URL param override for testing: ?v2=1
  const v2Param = request.nextUrl.searchParams.get("v2");
  return v2Param === "1" || v2Param === "true";
}

export async function GET(request: NextRequest) {
  const context = createContextFromHeaders(request.headers);

  return runWithRequestContext(context, async () => {
    const requestId = getRequestId();

    // Check feature flag before processing
    if (!isV2Enabled(request)) {
      return NextResponse.json(
        { error: "Search v2 endpoint not enabled" },
        {
          status: 404,
          headers: { "x-request-id": requestId },
        },
      );
    }

    try {
      // Rate limiting via Redis (using map type as it has similar search semantics)
      const rateLimitResponse = await withRateLimitRedis(request, {
        type: "map",
      });
      if (rateLimitResponse) return rateLimitResponse;

      // Parse and validate search params
      const searchParams = request.nextUrl.searchParams;
      const rawParams = Object.fromEntries(searchParams.entries());
      const parsed = parseSearchParams(rawParams);

      // Handle cursor-based pagination
      const cursor = searchParams.get("cursor");
      let page = parsed.requestedPage;

      if (cursor) {
        const decodedPage = decodeCursor(cursor);
        if (decodedPage !== null) {
          page = decodedPage;
        }
      }

      // Build filter params with page
      const filterParams = {
        ...parsed.filterParams,
        page,
      };

      // Fetch list and map data in parallel
      const [listResult, mapListings] = await Promise.all([
        getListingsPaginated(filterParams),
        getMapListings(filterParams),
      ]);

      // Determine mode based on mapListings count (not list total)
      const mode = determineMode(mapListings.length);

      // Generate query hash for caching (excludes pagination)
      const queryHash = generateQueryHash({
        query: parsed.filterParams.query,
        minPrice: parsed.filterParams.minPrice,
        maxPrice: parsed.filterParams.maxPrice,
        amenities: parsed.filterParams.amenities,
        houseRules: parsed.filterParams.houseRules,
        languages: parsed.filterParams.languages,
        roomType: parsed.filterParams.roomType,
        leaseDuration: parsed.filterParams.leaseDuration,
        moveInDate: parsed.filterParams.moveInDate,
        bounds: parsed.filterParams.bounds,
        nearMatches: parsed.filterParams.nearMatches,
      });

      // Transform list items
      const listItems = transformToListItems(listResult.items);

      // Transform map data (geojson always, pins only when sparse)
      const mapResponse = transformToMapResponse(mapListings);

      // Build next cursor if more pages available
      const hasNextPage = listResult.page < listResult.totalPages;
      const nextCursor = hasNextPage ? encodeCursor(page + 1) : null;

      // Build response
      const response: SearchV2Response = {
        meta: {
          queryHash,
          generatedAt: new Date().toISOString(),
          mode,
        },
        list: {
          items: listItems,
          nextCursor,
          total: listResult.total,
        },
        map: mapResponse,
      };

      return NextResponse.json(response, {
        headers: {
          // CDN caching for search results
          "Cache-Control":
            "public, s-maxage=60, max-age=30, stale-while-revalidate=120",
          "x-request-id": requestId,
          Vary: "Accept-Encoding",
        },
      });
    } catch (error) {
      console.error("Search v2 API error:", { error, requestId });
      return NextResponse.json(
        { error: "Failed to fetch search results" },
        {
          status: 500,
          headers: { "x-request-id": requestId },
        },
      );
    }
  });
}
