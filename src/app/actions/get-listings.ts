'use server';

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { crossesAntimeridian } from '@/lib/data';
import { checkRateLimit, getClientIPFromHeaders, RATE_LIMITS } from '@/lib/rate-limit';
import { headers } from 'next/headers';

export interface Bounds {
  ne_lat: number;
  ne_lng: number;
  sw_lat: number;
  sw_lng: number;
}

export interface MapListing {
  id: string;
  title: string;
  price: number;
  availableSlots: number;
  ownerId: string;
  lat: number;
  lng: number;
  amenities: string[];
  images: string[];
}

export async function getListingsInBounds(bounds: Bounds): Promise<MapListing[]> {
  const { ne_lat, ne_lng, sw_lat, sw_lng } = bounds;

  // Rate limiting
  const headersList = await headers();
  const ip = getClientIPFromHeaders(headersList);
  const rl = await checkRateLimit(ip, 'getListingsInBounds', RATE_LIMITS.getListingsInBounds);
  if (!rl.success) return [];

  try {
    // Use raw query to leverage PostGIS spatial functions
    // ST_MakeEnvelope(xmin, ymin, xmax, ymax, srid)
    // Note: PostGIS uses (lng, lat) order for coordinates
    // sw_lng = west/minLng, ne_lng = east/maxLng

    let listings: MapListing[];

    if (crossesAntimeridian(sw_lng, ne_lng)) {
      // Split into two envelopes for antimeridian crossing
      // Envelope 1: sw_lng (west) to 180 (eastern side of dateline)
      // Envelope 2: -180 to ne_lng (east) (western side of dateline)
      listings = await prisma.$queryRaw<MapListing[]>`
        SELECT
          l.id,
          l.title,
          l.price,
          l."availableSlots",
          l."ownerId",
          l.amenities,
          l.images,
          ST_Y(loc.coords::geometry) as lat,
          ST_X(loc.coords::geometry) as lng
        FROM "Listing" l
        JOIN "Location" loc ON l.id = loc."listingId"
        WHERE l."status" = 'ACTIVE'
        AND (
          ST_Intersects(
            loc.coords,
            ST_MakeEnvelope(${sw_lng}, ${sw_lat}, 180, ${ne_lat}, 4326)
          )
          OR ST_Intersects(
            loc.coords,
            ST_MakeEnvelope(-180, ${sw_lat}, ${ne_lng}, ${ne_lat}, 4326)
          )
        )
        LIMIT 50;
      `;
    } else {
      // Normal envelope (no antimeridian crossing)
      listings = await prisma.$queryRaw<MapListing[]>`
        SELECT
          l.id,
          l.title,
          l.price,
          l."availableSlots",
          l."ownerId",
          l.amenities,
          l.images,
          ST_Y(loc.coords::geometry) as lat,
          ST_X(loc.coords::geometry) as lng
        FROM "Listing" l
        JOIN "Location" loc ON l.id = loc."listingId"
        WHERE l."status" = 'ACTIVE'
        AND ST_Intersects(
          loc.coords,
          ST_MakeEnvelope(${sw_lng}, ${sw_lat}, ${ne_lng}, ${ne_lat}, 4326)
        )
        LIMIT 50;
      `;
    }

    return listings;
  } catch (error: unknown) {
    logger.sync.error('Failed to fetch listings in bounds', {
      action: 'getListingsInBounds',
      bounds: { ne_lat, ne_lng, sw_lat, sw_lng },
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return [];
  }
}
