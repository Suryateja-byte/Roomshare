/**
 * GET /api/map-listings
 *
 * Fetch map listings based on bounds and filters.
 * Used by the persistent map component in layout.tsx to fetch its own data.
 */

import { NextRequest, NextResponse } from "next/server";
import { getMapListings, MapListingData } from "@/lib/data";
import {
  isSearchDocEnabled,
  getSearchDocMapListings,
} from "@/lib/search/search-doc-queries";
import { features } from "@/lib/env";
import { withRateLimitRedis } from "@/lib/with-rate-limit-redis";
import { withTimeout, DEFAULT_TIMEOUTS } from "@/lib/timeout-wrapper";
import { validateAndParseBounds } from "@/lib/validation";
import {
  createContextFromHeaders,
  runWithRequestContext,
  getRequestId,
} from "@/lib/request-context";
import {
  buildRawParamsFromSearchParams,
  parseSearchParams,
  type RawSearchParams,
} from "@/lib/search-params";
import {
  MAP_FETCH_MAX_LAT_SPAN,
  MAP_FETCH_MAX_LNG_SPAN,
} from "@/lib/constants";
import { boundsTupleToObject, deriveSearchBoundsFromPoint } from "@/lib/search/location-bounds";
import { logger, sanitizeErrorMessage } from "@/lib/logger";
import * as Sentry from "@sentry/nextjs";
import { getSearchRateLimitIdentifier } from "@/lib/search-rate-limit-identifier";
import {
  createSearchResponseMeta,
  type SearchMapState,
} from "@/lib/search/search-response";
import { normalizeSearchQuery } from "@/lib/search/search-query";
import {
  buildScenarioSearchMapState,
  resolveSearchScenario,
  SEARCH_SCENARIO_HEADER,
} from "@/lib/search/testing/search-scenarios";
import { recordSearchRequestLatency } from "@/lib/search/search-telemetry";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const context = createContextFromHeaders(request.headers);
  const requestStartTime = performance.now();

  return runWithRequestContext(context, async () => {
    const requestId = getRequestId();

    try {
      const searchParams = request.nextUrl.searchParams;
      const rawParams = buildRawParamsFromSearchParams(searchParams);
      const requestedQueryHash =
        request.headers.get("x-search-query-hash")?.trim() || null;
      const normalizedQuery = normalizeSearchQuery(rawParams as RawSearchParams);
      const baseMeta = createSearchResponseMeta(normalizedQuery, "map-api");
      const meta = requestedQueryHash
        ? { ...baseMeta, queryHash: requestedQueryHash }
        : baseMeta;
      const testScenario = resolveSearchScenario({
        headerValue: request.headers.get(SEARCH_SCENARIO_HEADER),
      });

      if (!testScenario) {
        // Rate limiting via Redis (falls back to DB rate limiting when Redis unavailable)
        const rateLimitResponse = await withRateLimitRedis(request, {
          type: "map",
          getIdentifier: getSearchRateLimitIdentifier,
        });
        if (rateLimitResponse) {
          recordSearchRequestLatency({
            route: "map-listings-api",
            durationMs: performance.now() - requestStartTime,
            stateKind: "rate-limited",
            queryHash: meta.queryHash,
          });
          return rateLimitResponse;
        }
      }

      // Validate and parse explicit bounds first
      const boundsResult = validateAndParseBounds(
        searchParams.get("minLng"),
        searchParams.get("maxLng"),
        searchParams.get("minLat"),
        searchParams.get("maxLat"),
        {
          maxLatSpan: MAP_FETCH_MAX_LAT_SPAN,
          maxLngSpan: MAP_FETCH_MAX_LNG_SPAN,
          clampOversized: true,
        }
      );

      let bounds = boundsResult.valid ? boundsResult.bounds : null;

      // P2b Fix: Derive bounds from lat/lng when explicit bounds not provided
      // Uses same logic as parseSearchParams (~10km radius)
      if (!bounds) {
        const latStr = searchParams.get("lat");
        const lngStr = searchParams.get("lng");
        const lat = latStr ? parseFloat(latStr) : NaN;
        const lng = lngStr ? parseFloat(lngStr) : NaN;

        if (
          !isNaN(lat) &&
          !isNaN(lng) &&
          lat >= -90 &&
          lat <= 90 &&
          lng >= -180 &&
          lng <= 180
        ) {
          bounds = boundsTupleToObject(deriveSearchBoundsFromPoint(lat, lng));
        }
      }

      // Bounds are required - prevents full-table scans
      if (!bounds) {
        recordSearchRequestLatency({
          route: "map-listings-api",
          durationMs: performance.now() - requestStartTime,
          backendSource: meta.backendSource,
          stateKind: "location-required",
          queryHash: meta.queryHash,
        });
        return NextResponse.json(
          {
            kind: "location-required",
            meta,
          } satisfies SearchMapState,
          {
            status: 400,
            headers: { "x-request-id": requestId },
          }
        );
      }

      if (testScenario) {
        const scenarioState = await buildScenarioSearchMapState(testScenario, {
          query: normalizedQuery,
          queryHashOverride: requestedQueryHash,
        });
        const scenarioResultCount =
          scenarioState.kind === "ok" || scenarioState.kind === "degraded"
            ? scenarioState.data.listings.length
            : scenarioState.kind === "zero-results"
              ? 0
              : null;

        recordSearchRequestLatency({
          route: "map-listings-api",
          durationMs: performance.now() - requestStartTime,
          backendSource: scenarioState.meta.backendSource,
          stateKind: scenarioState.kind,
          queryHash: scenarioState.meta.queryHash,
          resultCount: scenarioResultCount,
        });

        return NextResponse.json(scenarioState, {
          headers: {
            "Cache-Control": "no-store",
            "x-request-id": requestId,
          },
        });
      }

      // Use canonical parsing for all filter params
      // This handles: repeated params, CSV splitting, alias resolution,
      // numeric validation, and allowlist filtering
      const parsed = parseSearchParams(rawParams);

      // Capture sort before overriding — needed for semantic search check
      const sortOption = parsed.filterParams.sort || "recommended";
      const vibeQuery = parsed.filterParams.vibeQuery?.trim();

      // Build filter params from canonical parsed values with validated bounds
      const filterParams = {
        ...parsed.filterParams,
        // Map-specific overrides: exclude sort/pagination, use validated bounds
        sort: undefined,
        page: undefined,
        limit: undefined,
        bounds,
      };

      // When semantic search is active, strip the query for the map so it
      // shows ALL listings in bounds (the list handles semantic ranking).
      // This prevents the map from showing 0 results while the list has results.
      const hasSemanticVibeQuery =
        typeof vibeQuery === "string" && vibeQuery.length >= 3;
      const semanticActive =
        features.semanticSearch &&
        hasSemanticVibeQuery &&
        sortOption === "recommended";
      const mapFilterParams = semanticActive
        ? { ...filterParams, query: undefined }
        : filterParams;

      // Fetch listings using SearchDoc path when enabled (faster, no JOINs),
      // falling back to the legacy getMapListings path.
      let listings: MapListingData[];
      if (isSearchDocEnabled(searchParams.get("searchDoc"))) {
        const result = await withTimeout(
          getSearchDocMapListings(mapFilterParams),
          DEFAULT_TIMEOUTS.DATABASE,
          "getSearchDocMapListings"
        );
        listings = result.listings;
      } else {
        listings = await withTimeout(
          getMapListings(mapFilterParams),
          DEFAULT_TIMEOUTS.DATABASE,
          "getMapListings"
        );
      }

      const state = {
        kind: "ok",
        data: { listings },
        meta,
      } satisfies SearchMapState;

      recordSearchRequestLatency({
        route: "map-listings-api",
        durationMs: performance.now() - requestStartTime,
        backendSource: meta.backendSource,
        stateKind: listings.length === 0 ? "zero-results" : "ok",
        queryHash: meta.queryHash,
        resultCount: listings.length,
      });

      return NextResponse.json(state, {
        headers: {
          // Fix #3: Use s-maxage for CDN caching (markers are NOT user-specific)
          // s-maxage: CDN/edge cache duration (60s)
          // max-age: browser cache duration (shorter to allow user refresh)
          "Cache-Control":
            "public, s-maxage=60, max-age=30, stale-while-revalidate=120",
          "x-request-id": requestId,
          // Vary by Accept-Encoding for proper CDN compression handling
          Vary: "Accept-Encoding",
        },
      });
    } catch (error) {
      logger.sync.error("Map listings API error", {
        error: sanitizeErrorMessage(error),
        route: "/api/map-listings",
        requestId,
      });
      Sentry.captureException(error);
      return NextResponse.json(
        { error: "Failed to fetch map listings" },
        {
          status: 500,
          headers: { "x-request-id": requestId },
        }
      );
    }
  });
}
