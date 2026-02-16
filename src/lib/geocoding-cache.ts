/**
 * Geocoding cache backed by Upstash Redis for persistence across serverless invocations.
 * Falls back to in-memory Map when Redis is not configured.
 *
 * Redis handles TTL natively — no eager eviction needed.
 */

import { Redis } from "@upstash/redis";

export interface GeocodingResult {
  id: string;
  place_name: string;
  center: [number, number];
  place_type: string[];
  bbox?: [number, number, number, number];
}

const TTL_SECONDS = 5 * 60; // 5 minutes
const CACHE_PREFIX = "geocode:";

// --- Redis client (lazy singleton) ---
let redis: Redis | null = null;
let redisUnavailable = false;

function getRedis(): Redis | null {
  if (redisUnavailable) return null;
  if (redis) return redis;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    redisUnavailable = true;
    return null;
  }

  try {
    redis = new Redis({ url, token });
    return redis;
  } catch {
    redisUnavailable = true;
    return null;
  }
}

// --- In-memory fallback (same as before, for dev / missing Redis env) ---
interface CacheEntry {
  results: GeocodingResult[];
  timestamp: number;
}

const MAX_ENTRIES = 100;
const TTL_MS = TTL_SECONDS * 1000;
const memoryCache = new Map<string, CacheEntry>();

function normalizeQuery(query: string): string {
  return query.toLowerCase().trim();
}

// --- Public API ---

export async function getCachedResults(
  query: string,
): Promise<GeocodingResult[] | null> {
  const normalized = normalizeQuery(query);
  const redisClient = getRedis();

  if (redisClient) {
    try {
      const cached = await redisClient.get<GeocodingResult[]>(
        `${CACHE_PREFIX}${normalized}`,
      );
      return cached ?? null;
    } catch {
      // Redis error — fall through to memory cache
    }
  }

  // In-memory fallback (lazy eviction: only check requested key)
  const entry = memoryCache.get(normalized);
  if (!entry) return null;

  if (Date.now() - entry.timestamp > TTL_MS) {
    memoryCache.delete(normalized);
    return null;
  }

  // LRU: move to end
  memoryCache.delete(normalized);
  memoryCache.set(normalized, entry);
  return entry.results;
}

export async function setCachedResults(
  query: string,
  results: GeocodingResult[],
): Promise<void> {
  const normalized = normalizeQuery(query);
  const redisClient = getRedis();

  if (redisClient) {
    try {
      await redisClient.set(`${CACHE_PREFIX}${normalized}`, results, {
        ex: TTL_SECONDS,
      });
      return;
    } catch {
      // Redis error — fall through to memory cache
    }
  }

  // In-memory fallback
  memoryCache.set(normalized, { results, timestamp: Date.now() });

  // Enforce max size (evict oldest)
  while (memoryCache.size > MAX_ENTRIES) {
    const oldestKey = memoryCache.keys().next().value;
    if (oldestKey) memoryCache.delete(oldestKey);
  }
}

export function clearCache(): void {
  memoryCache.clear();
  // Note: Redis cache will expire via TTL; explicit flush is not needed for normal operation
}

export function getCacheSize(): number {
  return memoryCache.size;
}
