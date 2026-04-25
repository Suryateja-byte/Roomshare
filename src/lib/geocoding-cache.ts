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

const DEFAULT_TTL_SECONDS = 24 * 60 * 60; // 24 hours (legacy geocoding results are stable)
const CACHE_PREFIX = "geocode:";

export interface GeocodingCacheOptions {
  cacheVersion?: string;
  ttlSeconds?: number;
}

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
  expiresAt: number;
}

const MAX_ENTRIES = 100;
const memoryCache = new Map<string, CacheEntry>();

function normalizeQuery(query: string): string {
  return query.toLowerCase().trim();
}

function normalizeCacheVersion(cacheVersion?: string): string {
  return cacheVersion?.trim() || "legacy";
}

function getTtlMs(options?: GeocodingCacheOptions): number {
  const ttlSeconds = options?.ttlSeconds;
  if (typeof ttlSeconds !== "number" || !Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    return DEFAULT_TTL_SECONDS * 1000;
  }

  return Math.trunc(ttlSeconds * 1000);
}

function buildCacheKey(query: string, options?: GeocodingCacheOptions): string {
  const normalizedVersion = normalizeCacheVersion(options?.cacheVersion);
  return `${normalizedVersion}:${normalizeQuery(query)}`;
}

// --- Public API ---

export async function getCachedResults(
  query: string,
  options?: GeocodingCacheOptions
): Promise<GeocodingResult[] | null> {
  const normalized = buildCacheKey(query, options);
  const redisClient = getRedis();

  if (redisClient) {
    try {
      const cached = await redisClient.get<GeocodingResult[]>(
        `${CACHE_PREFIX}${normalized}`
      );
      return cached ?? null;
    } catch {
      // Redis error — fall through to memory cache
    }
  }

  // In-memory fallback (lazy eviction: only check requested key)
  const entry = memoryCache.get(normalized);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
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
  options?: GeocodingCacheOptions
): Promise<void> {
  const normalized = buildCacheKey(query, options);
  const ttlMs = getTtlMs(options);
  const redisClient = getRedis();

  if (redisClient) {
    try {
      await redisClient.set(`${CACHE_PREFIX}${normalized}`, results, {
        ex: Math.max(1, Math.trunc(ttlMs / 1000)),
      });
      return;
    } catch {
      // Redis error — fall through to memory cache
    }
  }

  // In-memory fallback
  memoryCache.set(normalized, { results, expiresAt: Date.now() + ttlMs });

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
