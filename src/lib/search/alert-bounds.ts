import "server-only";

import { Prisma } from "@prisma/client";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { crossesAntimeridian } from "@/lib/search-types";
import { buildBoundsFromFilters, type SearchFilters } from "@/lib/search-utils";

/**
 * Geographic scoping for search alerts (P1-5).
 *
 * Alert matching used to apply no geographic predicate at all, so a saved
 * search bounded to a few blocks in Austin matched every new ACTIVE listing in
 * the country and burned real Resend sends on the false positives.
 *
 * Bounds cannot be expressed as a Prisma `where`: Location.coords is
 * `Unsupported("geometry")`, and there are no scalar lat/lng columns to filter
 * on. So the viewport is applied as a PostGIS prefilter that returns candidate
 * listing ids, which the caller then intersects with its Prisma query.
 */

export type AlertBounds = NonNullable<ReturnType<typeof buildBoundsFromFilters>>;

/**
 * Upper bound on the prefilter result set. The candidate pool is only listings
 * created since the saved search's last alert, so this should never bind in
 * practice; it exists so a pathological backlog cannot build an unbounded
 * `IN (...)` list.
 */
export const MAX_ALERT_BOUNDS_LISTINGS = 1000;

/** Read a complete viewport out of parsed saved-search filters. */
export function boundsFromAlertFilters(
  filters: SearchFilters
): AlertBounds | undefined {
  return buildBoundsFromFilters(filters);
}

/**
 * ST_Intersects predicate for a viewport, using the spatial index on
 * Location.coords. A box crossing the antimeridian (minLng > maxLng) is split
 * into two envelopes, matching the map query in lib/data.ts.
 */
export function buildBoundsPredicate(bounds: AlertBounds): Prisma.Sql {
  if (crossesAntimeridian(bounds.minLng, bounds.maxLng)) {
    return Prisma.sql`(
      ST_Intersects(loc.coords, ST_MakeEnvelope(${bounds.minLng}, ${bounds.minLat}, 180, ${bounds.maxLat}, 4326))
      OR ST_Intersects(loc.coords, ST_MakeEnvelope(-180, ${bounds.minLat}, ${bounds.maxLng}, ${bounds.maxLat}, 4326))
    )`;
  }

  return Prisma.sql`ST_Intersects(loc.coords, ST_MakeEnvelope(${bounds.minLng}, ${bounds.minLat}, ${bounds.maxLng}, ${bounds.maxLat}, 4326))`;
}

/**
 * Ids of ACTIVE listings created after `since` whose coordinates fall inside
 * the viewport. The null-island guard mirrors lib/data.ts: a listing with
 * unset coordinates sits at (0, 0) and must not match a box containing it.
 */
export async function findListingIdsWithinBounds(
  bounds: AlertBounds,
  since: Date,
  limit: number = MAX_ALERT_BOUNDS_LISTINGS
): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT l.id
      FROM "Listing" l
      JOIN "Location" loc ON loc."listingId" = l.id
      WHERE l.status = 'ACTIVE'
        AND l."createdAt" > ${since}
        AND NOT (ST_X(loc.coords::geometry) = 0 AND ST_Y(loc.coords::geometry) = 0)
        AND ${buildBoundsPredicate(bounds)}
      ORDER BY l."createdAt" DESC
      LIMIT ${limit}
    `
  );

  if (rows.length >= limit) {
    // Silent truncation would read as "no more matches in this viewport".
    logger.sync.warn("Alert viewport prefilter hit its result cap", {
      action: "findListingIdsWithinBounds",
      limit,
      since: since.toISOString(),
    });
  }

  return rows.map((row) => row.id);
}

/**
 * In-memory equivalent of the SQL predicate, for the instant-alert path where
 * the new listing's coordinates are already in hand and a round trip would be
 * wasteful. Inclusive on all four edges, antimeridian-aware.
 */
export function isWithinAlertBounds(
  point: { lat?: number | null; lng?: number | null },
  bounds: AlertBounds
): boolean {
  const { lat, lng } = point;
  if (typeof lat !== "number" || !Number.isFinite(lat)) return false;
  if (typeof lng !== "number" || !Number.isFinite(lng)) return false;
  // Null island: unset coordinates must not match a box containing (0, 0).
  if (lat === 0 && lng === 0) return false;

  if (lat < bounds.minLat || lat > bounds.maxLat) return false;

  return crossesAntimeridian(bounds.minLng, bounds.maxLng)
    ? lng >= bounds.minLng || lng <= bounds.maxLng
    : lng >= bounds.minLng && lng <= bounds.maxLng;
}
