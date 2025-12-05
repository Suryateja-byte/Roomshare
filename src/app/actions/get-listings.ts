'use server';

import { prisma } from '@/lib/prisma';

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

  try {
    // Use raw query to leverage PostGIS spatial functions
    // ST_MakeEnvelope(xmin, ymin, xmax, ymax, srid)
    // Note: PostGIS uses (lng, lat) order for coordinates
    const listings = await prisma.$queryRaw<MapListing[]>`
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
      WHERE ST_Intersects(
        loc.coords,
        ST_MakeEnvelope(${sw_lng}, ${sw_lat}, ${ne_lng}, ${ne_lat}, 4326)
      )
      LIMIT 50; -- Limit to prevent overwhelming the map
    `;

    return listings;
  } catch (error) {
    console.error('Error fetching listings in bounds:', error);
    return [];
  }
}
