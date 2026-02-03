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
 *
 * This route delegates to the shared v2 service (search-v2-service.ts)
 * which handles searchDoc, keyset pagination, and ranking features.
 */

import { NextRequest, NextResponse } from "next/server";
import { features } from "@/lib/env";
import { buildRawParamsFromSearchParams } from "@/lib/search-params";
import { withRateLimitRedis } from "@/lib/with-rate-limit-redis";
import {
  createContextFromHeaders,
  runWithRequestContext,
  getRequestId,
} from "@/lib/request-context";
import { executeSearchV2 } from "@/lib/search/search-v2-service";
import { withTimeout, DEFAULT_TIMEOUTS } from "@/lib/timeout-wrapper";

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

      // Build raw params from URL search params
      const searchParams = request.nextUrl.searchParams;
      const rawParams = buildRawParamsFromSearchParams(searchParams);

      // Delegate to shared v2 service (handles searchDoc, keyset, ranking)
      // P1-6 FIX: Add timeout protection to prevent indefinite hangs
      const result = await withTimeout(
        executeSearchV2({ rawParams }),
        DEFAULT_TIMEOUTS.DATABASE,
        "executeSearchV2"
      );

      // Handle unbounded search (text query without geographic bounds)
      // This is not an error - it's a signal to the client to prompt for location
      if (result.unboundedSearch) {
        return NextResponse.json(
          {
            unboundedSearch: true,
            list: null,
            map: null,
            meta: { mode: "pins", queryHash: null, generatedAt: new Date().toISOString() },
          },
          {
            status: 200,
            headers: {
              "Cache-Control": "no-cache, no-store",
              "x-request-id": requestId,
            },
          },
        );
      }

      // Handle service error
      if (result.error || !result.response) {
        return NextResponse.json(
          { error: result.error || "Search temporarily unavailable" },
          {
            status: 503,
            headers: { "x-request-id": requestId },
          },
        );
      }

      return NextResponse.json(result.response, {
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
