/**
 * Neighborhood Intelligence cache functions.
 * Caches POI search results in the database with a maximum 30-day TTL
 * to comply with Google Places ToS.
 *
 * NOTE: Uses prisma.neighborhoodCache model not yet in schema.
 * Targeted @ts-expect-error comments suppress only those lines.
 * Remove them once the NeighborhoodCache model is added to schema.prisma.
 */

import { prisma } from "@/lib/prisma";
import type {
  POI,
  SearchMeta,
  NeighborhoodCacheKey,
  CachedNeighborhoodResult,
} from "./types";

/** Maximum cache TTL in days (Google ToS limit) */
const MAX_TTL_DAYS = 30;

/** Default cache TTL in days */
const DEFAULT_TTL_DAYS = 7;

/**
 * Get cached search results if available and not expired.
 * @param key - Cache key parameters
 * @returns Cached result or null if not found/expired
 */
export async function getCachedSearch(
  key: NeighborhoodCacheKey,
): Promise<CachedNeighborhoodResult | null> {
  try {
    // @ts-expect-error — NeighborhoodCache model not yet in schema
    const cached = await prisma.neighborhoodCache.findUnique({
      where: {
        listingId_normalizedQuery_radiusMeters_searchMode: {
          listingId: key.listingId,
          normalizedQuery: key.normalizedQuery,
          radiusMeters: key.radiusMeters,
          searchMode: key.searchMode,
        },
      },
    });

    if (!cached) {
      return null;
    }

    // Check if expired
    if (new Date() > cached.expiresAt) {
      // Delete expired cache entry
      // @ts-expect-error — NeighborhoodCache model not yet in schema
      await prisma.neighborhoodCache
        .delete({
          where: { id: cached.id },
        })
        .catch(() => {
          // Ignore deletion errors - entry will be cleaned up later
        });
      return null;
    }

    // Parse the cached POI data
    const pois: POI[] = JSON.parse(cached.poisJson);
    const meta: SearchMeta = {
      radiusMeters: cached.radiusMeters,
      radiusUsed: cached.radiusUsed,
      resultCount: cached.resultCount,
      closestMiles: cached.closestMiles,
      farthestMiles: cached.farthestMiles,
      searchMode: cached.searchMode as "type" | "text",
      queryText: cached.normalizedQuery,
      timestamp: cached.createdAt.getTime(),
    };

    return {
      pois,
      meta,
      cachedAt: cached.createdAt,
      expiresAt: cached.expiresAt,
    };
  } catch (error) {
    console.error("Error fetching neighborhood cache:", error);
    return null;
  }
}

/**
 * Cache search results for a listing.
 * @param key - Cache key parameters
 * @param pois - POI data to cache
 * @param meta - Search metadata
 * @param ttlDays - Cache TTL in days (default: 7, max: 30)
 */
export async function cacheSearch(
  key: NeighborhoodCacheKey,
  pois: POI[],
  meta: SearchMeta,
  ttlDays: number = DEFAULT_TTL_DAYS,
): Promise<void> {
  try {
    // Enforce maximum TTL
    const effectiveTTL = Math.min(ttlDays, MAX_TTL_DAYS);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + effectiveTTL);

    // Serialize POI data (exclude computed fields that can be recalculated)
    const poisJson = JSON.stringify(
      pois.map((poi) => ({
        placeId: poi.placeId,
        name: poi.name,
        lat: poi.lat,
        lng: poi.lng,
        rating: poi.rating,
        userRatingsTotal: poi.userRatingsTotal,
        openNow: poi.openNow,
        address: poi.address,
        primaryType: poi.primaryType,
        googleMapsURI: poi.googleMapsURI,
        photoReference: poi.photoReference,
        // Note: distanceMiles and walkMins are computed client-side and cached
        distanceMiles: poi.distanceMiles,
        walkMins: poi.walkMins,
      })),
    );

    // @ts-expect-error — NeighborhoodCache model not yet in schema
    await prisma.neighborhoodCache.upsert({
      where: {
        listingId_normalizedQuery_radiusMeters_searchMode: {
          listingId: key.listingId,
          normalizedQuery: key.normalizedQuery,
          radiusMeters: key.radiusMeters,
          searchMode: key.searchMode,
        },
      },
      update: {
        poisJson,
        resultCount: meta.resultCount,
        closestMiles: meta.closestMiles,
        farthestMiles: meta.farthestMiles,
        radiusUsed: meta.radiusUsed,
        expiresAt,
      },
      create: {
        listingId: key.listingId,
        normalizedQuery: key.normalizedQuery,
        radiusMeters: key.radiusMeters,
        searchMode: key.searchMode,
        poisJson,
        resultCount: meta.resultCount,
        closestMiles: meta.closestMiles,
        farthestMiles: meta.farthestMiles,
        radiusUsed: meta.radiusUsed,
        expiresAt,
      },
    });
  } catch (error) {
    console.error("Error caching neighborhood search:", error);
    // Don't throw - caching failure shouldn't break the feature
  }
}

/**
 * Clean up expired cache entries.
 * Should be called periodically (e.g., via cron job).
 * @returns Number of deleted entries
 */
export async function cleanupExpiredCache(): Promise<number> {
  try {
    // @ts-expect-error — NeighborhoodCache model not yet in schema
    const result = await prisma.neighborhoodCache.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });
    return result.count;
  } catch (error) {
    console.error("Error cleaning up neighborhood cache:", error);
    return 0;
  }
}

/**
 * Get cache statistics for a listing.
 * Useful for analytics and debugging.
 * @param listingId - Listing ID to get stats for
 */
export async function getCacheStats(listingId: string): Promise<{
  totalEntries: number;
  oldestEntry: Date | null;
  newestEntry: Date | null;
}> {
  try {
    // @ts-expect-error — NeighborhoodCache model not yet in schema
    const entries = await prisma.neighborhoodCache.findMany({
      where: { listingId },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    return {
      totalEntries: entries.length,
      oldestEntry: entries.length > 0 ? entries[0].createdAt : null,
      newestEntry:
        entries.length > 0 ? entries[entries.length - 1].createdAt : null,
    };
  } catch (error) {
    console.error("Error getting cache stats:", error);
    return {
      totalEntries: 0,
      oldestEntry: null,
      newestEntry: null,
    };
  }
}

/**
 * Check if a cached result is stale (older than specified days).
 * Stale results can trigger background refresh for Pro users.
 * @param cachedAt - When the result was cached
 * @param staleDays - Number of days after which result is considered stale
 */
export function isCacheStale(cachedAt: Date, staleDays: number = 3): boolean {
  const staleDate = new Date();
  staleDate.setDate(staleDate.getDate() - staleDays);
  return cachedAt < staleDate;
}

/**
 * Invalidate all cache entries for a listing.
 * Useful when listing location changes.
 * @param listingId - Listing ID to invalidate cache for
 */
export async function invalidateListingCache(
  listingId: string,
): Promise<number> {
  try {
    // @ts-expect-error — NeighborhoodCache model not yet in schema
    const result = await prisma.neighborhoodCache.deleteMany({
      where: { listingId },
    });
    return result.count;
  } catch (error) {
    console.error("Error invalidating listing cache:", error);
    return 0;
  }
}
