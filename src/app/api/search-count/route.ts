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
  hasActiveFilters,
} from "@/lib/search-params";
import { getLimitedCount } from "@/lib/data";
import { logger, sanitizeErrorMessage } from "@/lib/logger";
import { clampBoundsToMaxSpan } from "@/lib/validation";
import {
  MAP_FETCH_MAX_LAT_SPAN,
  MAP_FETCH_MAX_LNG_SPAN,
} from "@/lib/constants";
import { isPhase04ProjectionReadsEnabled } from "@/lib/flags/phase04";
import {
  getProjectionSearchCount,
  hasProjectionFreshnessHoles,
} from "@/lib/search/projection-search";
import { getProjectionReadEligibility } from "@/lib/search/projection-read-eligibility";
import { buildPublicCacheHeaders } from "@/lib/public-cache/headers";

// Disable static caching - counts must be fresh
export const dynamic = "force-dynamic";

/**
 * Freshness guard for the projection count, mirroring the list path in
 * search-v2-service.ts (:672-690). A projection-eligible query whose bounds
 * contain freshness holes is served by the SearchDoc engine on the list, so
 * the count must fall back to the SearchDoc count as well. If the guard query
 * itself throws, we match the list path's catch branch and stay on the
 * projection engine (returns true).
 */
async function canUseProjectionCount(
  parsed: ReturnType<typeof parseSearchParams>,
  requestId: string | undefined
): Promise<boolean> {
  try {
    if (await hasProjectionFreshnessHoles({ parsed })) {
      logger.sync.warn("phase04_projection_count_freshness_fallback", {
        requestId,
        reason: "projection_freshness_hole",
      });
      return false;
    }
    return true;
  } catch (err) {
    logger.sync.warn("phase04_projection_count_freshness_guard_failed", {
      requestId,
      error: sanitizeErrorMessage(err),
    });
    return true;
  }
}

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
      const parsed = parseSearchParams(rawParams);
      const { filterParams } = parsed;

      // Block unbounded text searches - require bounds when query present
      // This prevents full-table scans that are expensive and not useful
      if (parsed.boundsRequired) {
        return NextResponse.json(
          { count: null, boundsRequired: true },
          {
            headers: {
              "Cache-Control": "private, no-store",
            },
          }
        );
      }

      // Handle unbounded browse (no query, no bounds, no filters)
      // Return null count with browseMode flag to indicate capped results
      if (
        !filterParams.query &&
        !filterParams.vibeQuery &&
        !filterParams.bounds &&
        !hasActiveFilters(filterParams)
      ) {
        return NextResponse.json(
          { count: null, browseMode: true },
          {
            headers: {
              "Cache-Control": "private, no-store",
            },
          }
        );
      }

      // Use the SAME sort-aware eligibility gate the list path uses
      // (search-v2-service.ts) so the count is produced by the same engine the
      // list will render. Previously this passed { ignoreSort: true }, which
      // diverged the engines: under the default "recommended" sort the list is
      // projection-INELIGIBLE (served by SearchDoc, counting listings) but
      // ignoreSort forced the count onto the projection engine (counting
      // units) — so "Show N listings" mismatched the rendered list for
      // multi-inventory units (review P1-2).
      if (
        isPhase04ProjectionReadsEnabled() &&
        getProjectionReadEligibility(parsed).supported
      ) {
        // Mirror the list path's freshness guard: a projection-eligible query
        // with freshness holes is served by SearchDoc, so the count must be too
        // (search-v2-service.ts:672-690). When there are no holes (or the guard
        // itself throws — matching the list path's catch), stay on projection;
        // otherwise fall through to the SearchDoc count below.
        if (await canUseProjectionCount(parsed, requestId)) {
          const projectionCount = await getProjectionSearchCount({
            parsed,
            rawParams,
          });
          if (!projectionCount.ok) {
            return NextResponse.json(
              {
                error: "admission_rejected",
                admissionError: projectionCount.error,
              },
              {
                status: projectionCount.error.status,
                headers: {
                  "Cache-Control": "private, no-store",
                },
              }
            );
          }
          return NextResponse.json(
            { count: projectionCount.count },
            {
              headers: {
                "Cache-Control":
                  "public, s-maxage=15, stale-while-revalidate=30",
                ...buildPublicCacheHeaders(),
              },
            }
          );
        }
        // Projection freshness holes → fall back to the SearchDoc count below,
        // the same engine the list will use for this query.
      }

      // Clamp oversized bounds for consistency with /api/search/facets and /api/map-listings.
      // LIMIT 101 subquery already caps row scan, but clamping prevents unnecessarily broad ST_MakeEnvelope.
      const effectiveFilterParams = filterParams.bounds
        ? {
            ...filterParams,
            bounds: clampBoundsToMaxSpan(
              filterParams.bounds,
              MAP_FETCH_MAX_LAT_SPAN,
              MAP_FETCH_MAX_LNG_SPAN
            ),
          }
        : filterParams;

      // Get count using existing getLimitedCount function
      // Returns exact count if ≤100, null if >100
      // Dedup parity: getLimitedCount dispatches to getSearchDocLimitedCount,
      // which counts distinct canonical groups when searchListingDedup is on
      // (review P2-6), so this count matches the list's rendered total.
      const count = await getLimitedCount(effectiveFilterParams);

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
            ...buildPublicCacheHeaders(),
          },
        }
      );
    } catch (error) {
      logger.error("Search count error", {
        requestId,
        error: sanitizeErrorMessage(error),
      });
      Sentry.captureException(error, {
        tags: { route: "/api/search-count", method: "GET" },
      });

      return NextResponse.json(
        { error: "Failed to get count" },
        {
          status: 500,
          headers: {
            "Cache-Control": "private, no-store",
          },
        }
      );
    }
  });
}
