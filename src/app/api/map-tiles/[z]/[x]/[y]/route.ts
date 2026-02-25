import { NextRequest, NextResponse } from "next/server";
import { getMapTileListings } from "@/lib/data";
import { withRateLimitRedis } from "@/lib/with-rate-limit-redis";
import { withTimeout, DEFAULT_TIMEOUTS } from "@/lib/timeout-wrapper";
import {
  createContextFromHeaders,
  runWithRequestContext,
  getRequestId,
} from "@/lib/request-context";
import {
  buildRawParamsFromSearchParams,
  parseSearchParams,
} from "@/lib/search-params";
import { logger, sanitizeErrorMessage } from "@/lib/logger";
import * as Sentry from "@sentry/nextjs";
import { getSearchRateLimitIdentifier } from "@/lib/search-rate-limit-identifier";

interface RouteParams {
  params: Promise<{
    z: string;
    x: string;
    y: string;
  }>;
}

export async function GET(request: NextRequest, context: RouteParams) {
  const requestContext = createContextFromHeaders(request.headers);

  return runWithRequestContext(requestContext, async () => {
    const requestId = getRequestId();

    try {
      const rateLimitResponse = await withRateLimitRedis(request, {
        type: "map",
        getIdentifier: getSearchRateLimitIdentifier,
      });
      if (rateLimitResponse) return rateLimitResponse;

      const { z: zParam, x: xParam, y: yParam } = await context.params;
      const z = Number.parseInt(zParam, 10);
      const x = Number.parseInt(xParam, 10);
      const y = Number.parseInt(yParam, 10);
      if (![z, x, y].every(Number.isFinite) || z < 0 || x < 0 || y < 0) {
        return NextResponse.json(
          { error: "Invalid tile coordinates" },
          { status: 400, headers: { "x-request-id": requestId } },
        );
      }

      const maxIndex = 2 ** z;
      if (x >= maxIndex || y >= maxIndex) {
        return NextResponse.json(
          { error: "Tile coordinates out of range for zoom" },
          { status: 400, headers: { "x-request-id": requestId } },
        );
      }

      const searchParams = request.nextUrl.searchParams;
      const rawParams = buildRawParamsFromSearchParams(searchParams);
      const parsed = parseSearchParams(rawParams);

      const zoomParam = searchParams.get("zoom");
      const zoom = zoomParam ? Number.parseInt(zoomParam, 10) : z;
      const includeDensity = searchParams.get("includeDensity") !== "false";

      const tileResponse = await withTimeout(
        getMapTileListings({
          tile: { z, x, y },
          zoom,
          query: parsed.filterParams.query,
          minPrice: parsed.filterParams.minPrice,
          maxPrice: parsed.filterParams.maxPrice,
          amenities: parsed.filterParams.amenities,
          languages: parsed.filterParams.languages,
          houseRules: parsed.filterParams.houseRules,
          moveInDate: parsed.filterParams.moveInDate,
          leaseDuration: parsed.filterParams.leaseDuration,
          roomType: parsed.filterParams.roomType,
          genderPreference: parsed.filterParams.genderPreference,
          householdGender: parsed.filterParams.householdGender,
        }),
        DEFAULT_TIMEOUTS.DATABASE,
        "getMapTileListings",
      );

      return NextResponse.json(
        {
          tileKey: tileResponse.tileKey,
          mode: tileResponse.mode,
          zoom: tileResponse.zoom,
          listings: tileResponse.listings,
          density: includeDensity ? tileResponse.density : undefined,
        },
        {
          headers: {
            "Cache-Control":
              "public, s-maxage=60, max-age=30, stale-while-revalidate=120",
            "x-request-id": requestId,
            Vary: "Accept-Encoding",
          },
        },
      );
    } catch (error) {
      logger.sync.error("Map tiles API error", {
        error: sanitizeErrorMessage(error),
        route: "/api/map-tiles/[z]/[x]/[y]",
        requestId,
      });
      Sentry.captureException(error);
      return NextResponse.json(
        { error: "Failed to fetch map tile listings" },
        {
          status: 500,
          headers: { "x-request-id": requestId },
        },
      );
    }
  });
}
