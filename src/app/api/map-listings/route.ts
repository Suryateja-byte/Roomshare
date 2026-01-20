/**
 * GET /api/map-listings
 *
 * Fetch map listings based on bounds and filters.
 * Used by the persistent map component in layout.tsx to fetch its own data.
 */

import { NextRequest, NextResponse } from "next/server";
import { getMapListings, MapListingData } from "@/lib/data";
import { withRateLimitRedis } from "@/lib/with-rate-limit-redis";
import { validateAndParseBounds } from "@/lib/validation";
import {
  createContextFromHeaders,
  runWithRequestContext,
  getRequestId,
} from "@/lib/request-context";

export async function GET(request: NextRequest) {
  const context = createContextFromHeaders(request.headers);

  return runWithRequestContext(context, async () => {
    const requestId = getRequestId();

    try {
      // Rate limiting via Redis (fail-closed in production)
      const rateLimitResponse = await withRateLimitRedis(request, {
        type: "map",
      });
      if (rateLimitResponse) return rateLimitResponse;

      const searchParams = request.nextUrl.searchParams;

      // Validate and parse bounds (required - prevents full-table scans)
      const boundsResult = validateAndParseBounds(
        searchParams.get("minLng"),
        searchParams.get("maxLng"),
        searchParams.get("minLat"),
        searchParams.get("maxLat"),
      );

      if (!boundsResult.valid) {
        return NextResponse.json(
          { error: boundsResult.error },
          {
            status: 400,
            headers: { "x-request-id": requestId },
          },
        );
      }

      const bounds = boundsResult.bounds;

      /** Get multi-value param supporting both repeated keys and CSV format */
      const getMultiValue = (key: string): string[] | undefined => {
        const values = searchParams.getAll(key);
        if (values.length === 0) return undefined;
        const result = values.flatMap((v: string) => v.split(",")).filter(Boolean);
        return result.length > 0 ? result : undefined;
      };

      // Extract filters
      const filterParams = {
        query: searchParams.get("q") || undefined,
        minPrice: searchParams.get("minPrice")
          ? parseInt(searchParams.get("minPrice")!)
          : undefined,
        maxPrice: searchParams.get("maxPrice")
          ? parseInt(searchParams.get("maxPrice")!)
          : undefined,
        bounds,
        amenities: getMultiValue("amenities"),
        languages: getMultiValue("languages"),
        houseRules: getMultiValue("houseRules"),
        moveInDate: searchParams.get("moveInDate") || undefined,
        leaseDuration: searchParams.get("leaseDuration") || undefined,
        roomType: searchParams.get("roomType") || undefined,
      };

      // Fetch listings using existing data function
      const listings: MapListingData[] = await getMapListings(filterParams);

      return NextResponse.json(
        { listings },
        {
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
        },
      );
    } catch (error) {
      console.error("Map listings API error:", { error, requestId });
      return NextResponse.json(
        { error: "Failed to fetch map listings" },
        {
          status: 500,
          headers: { "x-request-id": requestId },
        },
      );
    }
  });
}
