/**
 * GET /api/search/listings
 *
 * Client-side search endpoint for listing results.
 * Used by SearchResultsClient when ENABLE_CLIENT_SIDE_SEARCH is on,
 * so map pans/filter changes fetch JSON instead of triggering full SSR.
 *
 * Mirrors the /api/map-listings pattern: rate limit, bounds validation,
 * executeSearchV2 with circuit breaker + timeout, V1 fallback.
 *
 * Returns: { items, nextCursor, total, nearMatchExpansion?, vibeAdvisory? }
 */

import { NextRequest, NextResponse } from "next/server";
import { features } from "@/lib/env";
import {
  buildRawParamsFromSearchParams,
  parseSearchParams,
} from "@/lib/search-params";
import { withRateLimitRedis } from "@/lib/with-rate-limit-redis";
import { withTimeout, DEFAULT_TIMEOUTS } from "@/lib/timeout-wrapper";
import {
  createContextFromHeaders,
  runWithRequestContext,
  getRequestId,
} from "@/lib/request-context";
import {
  executeSearchV2,
  type SearchV2Result,
} from "@/lib/search/search-v2-service";
import { getListingsPaginated } from "@/lib/data";
import { circuitBreakers, isCircuitOpenError } from "@/lib/circuit-breaker";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import { logger, sanitizeErrorMessage } from "@/lib/logger";
import * as Sentry from "@sentry/nextjs";
import { getSearchRateLimitIdentifier } from "@/lib/search-rate-limit-identifier";

export async function GET(request: NextRequest) {
  const context = createContextFromHeaders(request.headers);

  return runWithRequestContext(context, async () => {
    const requestId = getRequestId();

    try {
      // Gate behind feature flag — returns 404 when disabled to prevent
      // discoverability/abuse before the feature is intentionally enabled
      if (!features.clientSideSearch) {
        return NextResponse.json(
          { error: "Not found" },
          { status: 404, headers: { "x-request-id": requestId } }
        );
      }

      // Rate limiting (separate bucket from SSR search)
      const rateLimitResponse = await withRateLimitRedis(request, {
        type: "search-list",
        getIdentifier: getSearchRateLimitIdentifier,
      });
      if (rateLimitResponse) return rateLimitResponse;

      const searchParams = request.nextUrl.searchParams;
      const rawParams = buildRawParamsFromSearchParams(searchParams);
      const parsed = parseSearchParams(rawParams);

      // V2 path with circuit breaker + timeout (same pattern as page.tsx)
      let v2Result: SearchV2Result | null = null;
      if (features.searchV2) {
        try {
          v2Result = await circuitBreakers.searchV2.execute(async () => {
            const result = await withTimeout(
              executeSearchV2({
                rawParams,
                limit: DEFAULT_PAGE_SIZE,
                includeMap: false,
              }),
              DEFAULT_TIMEOUTS.DATABASE,
              "api-search-listings-v2"
            );
            if (result.unboundedSearch) return result;
            if (!result.response || result.error) {
              throw new Error(
                result.error || "V2 search returned no response"
              );
            }
            return result;
          });
        } catch (err) {
          if (isCircuitOpenError(err)) {
            logger.sync.info(
              "[api/search/listings] V2 circuit open, using V1 fallback"
            );
          } else {
            Sentry.captureException(err, {
              tags: { component: "search-listings-api", path: "v2-fallback" },
            });
            logger.sync.warn(
              "[api/search/listings] V2 failed, falling back to V1",
              { error: sanitizeErrorMessage(err) }
            );
          }
        }
      }

      // Unbounded search: text query without location
      if (v2Result?.unboundedSearch) {
        return NextResponse.json(
          {
            items: [],
            nextCursor: null,
            total: 0,
            unboundedSearch: true,
          },
          {
            headers: {
              "x-request-id": requestId,
              "Cache-Control": "no-store",
            },
          }
        );
      }

      // V2 success path
      if (v2Result?.response && v2Result.paginatedResult) {
        const { items: listings, total: rawTotal } = v2Result.paginatedResult;
        const total = rawTotal;
        const nextCursor =
          v2Result.response.list.nextCursor ?? null;
        const nearMatchExpansion =
          "nearMatchExpansion" in v2Result.paginatedResult
            ? v2Result.paginatedResult.nearMatchExpansion
            : undefined;
        const vibeAdvisory = v2Result.response.meta.warnings?.includes(
          "VIBE_SOFT_FALLBACK"
        )
          ? "Showing best matches for your vibe in this area"
          : undefined;

        return NextResponse.json(
          { items: listings, nextCursor, total, nearMatchExpansion, vibeAdvisory },
          {
            headers: {
              "Cache-Control":
                "public, s-maxage=60, max-age=30, stale-while-revalidate=120",
              "x-request-id": requestId,
              Vary: "Accept-Encoding",
            },
          }
        );
      }

      // V1 fallback path
      const paginatedResult = await withTimeout(
        getListingsPaginated({
          ...parsed.filterParams,
          page: parsed.requestedPage,
          limit: DEFAULT_PAGE_SIZE,
        }),
        DEFAULT_TIMEOUTS.DATABASE,
        "api-search-listings-v1"
      );

      return NextResponse.json(
        {
          items: paginatedResult.items,
          nextCursor: null,
          total: paginatedResult.total,
        },
        {
          headers: {
            "Cache-Control":
              "public, s-maxage=60, max-age=30, stale-while-revalidate=120",
            "x-request-id": requestId,
            Vary: "Accept-Encoding",
          },
        }
      );
    } catch (error) {
      logger.sync.error("Search listings API error", {
        error: sanitizeErrorMessage(error),
        route: "/api/search/listings",
        requestId,
      });
      Sentry.captureException(error);
      return NextResponse.json(
        { error: "Failed to fetch search listings" },
        {
          status: 500,
          headers: { "x-request-id": requestId },
        }
      );
    }
  });
}
