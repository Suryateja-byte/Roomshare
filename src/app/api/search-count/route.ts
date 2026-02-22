/**
 * Search Count API Endpoint
 *
 * Returns a count of listings matching the given filter parameters.
 * Used by the filter drawer to show "Show X listings" button preview.
 *
 * Returns:
 * - { count: number } when count is ≤100
 * - { count: null } when count is >100 (indicates "100+")
 *
 * Uses the same parseSearchParams() logic as the main search
 * to ensure consistent filter interpretation.
 */

import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { withRateLimitRedis } from "@/lib/with-rate-limit-redis";
import {
  createContextFromHeaders,
  runWithRequestContext,
  getRequestId,
} from "@/lib/request-context";
import {
  parseSearchParams,
  buildRawParamsFromSearchParams,
} from "@/lib/search-params";
import { getLimitedCount } from "@/lib/data";
import { logger, sanitizeErrorMessage } from "@/lib/logger";

// Disable static caching - counts must be fresh
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const context = createContextFromHeaders(request.headers);

  return runWithRequestContext(context, async () => {
    const requestId = getRequestId();

    // Rate limiting - use a dedicated type for count requests
    const rateLimitResponse = await withRateLimitRedis(request, {
      type: "search-count",
    });
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    try {
      // Parse URL search params using same logic as main search
      const { searchParams } = request.nextUrl;
      const rawParams = buildRawParamsFromSearchParams(searchParams);

      // Parse and validate using same logic as main search
      const { filterParams } = parseSearchParams(rawParams);

      // Block unbounded text searches - require bounds when query present
      // This prevents full-table scans that are expensive and not useful
      if (filterParams.query && !filterParams.bounds) {
        return NextResponse.json(
          { count: null, boundsRequired: true },
          {
            headers: {
              "Cache-Control": "private, no-store",
            },
          },
        );
      }

      // Handle unbounded browse (no query, no bounds)
      // Return null count with browseMode flag to indicate capped results
      if (!filterParams.query && !filterParams.bounds) {
        return NextResponse.json(
          { count: null, browseMode: true },
          {
            headers: {
              "Cache-Control": "private, no-store",
            },
          },
        );
      }

      // Get count using existing getLimitedCount function
      // Returns exact count if ≤100, null if >100
      const count = await getLimitedCount(filterParams);

      logger.debug("Search count request", {
        requestId,
        count,
        hasFilters: Object.keys(filterParams).length > 0,
      });

      return NextResponse.json(
        { count },
        {
          headers: {
            // Short CDN cache for identical requests; private fallback for auth-dependent counts
            "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30",
          },
        },
      );
    } catch (error) {
      logger.error("Search count error", {
        requestId,
        error: sanitizeErrorMessage(error),
      });
      Sentry.captureException(error, { tags: { route: "/api/search-count", method: "GET" } });

      return NextResponse.json(
        { error: "Failed to get count" },
        {
          status: 500,
          headers: {
            "Cache-Control": "private, no-store",
          },
        },
      );
    }
  });
}
