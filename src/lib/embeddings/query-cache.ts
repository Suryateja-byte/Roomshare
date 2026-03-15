/**
 * In-memory LRU cache for query embeddings.
 *
 * Same search query text always produces the same 768-dim vector (deterministic),
 * so caching avoids redundant Gemini API calls. Saves ~200ms per hit and
 * protects the 100 RPM free-tier rate limit.
 *
 * Memory: 768 floats × 8 bytes ≈ 6KB per entry. 100 entries ≈ 600KB.
 */

import { generateQueryEmbedding } from "./gemini";

const MAX_ENTRIES = 100;
const TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  embedding: number[];
  createdAt: number;
}

const cache = new Map<string, CacheEntry>();

let hits = 0;
let misses = 0;

/** Normalize query for cache key: trim + lowercase for case-insensitive matching */
function cacheKey(query: string): string {
  return query.trim().toLowerCase();
}

/** Evict the oldest entry (first inserted — Map preserves insertion order) */
function evictOldest(): void {
  const firstKey = cache.keys().next().value;
  if (firstKey !== undefined) {
    cache.delete(firstKey);
  }
}

/**
 * Get a query embedding, returning a cached result if available.
 * On cache miss, calls `generateQueryEmbedding` and stores the result.
 */
export async function getCachedQueryEmbedding(
  query: string,
): Promise<number[]> {
  const key = cacheKey(query);

  const existing = cache.get(key);
  if (existing && Date.now() - existing.createdAt < TTL_MS) {
    hits++;
    // Move to end for LRU (delete + re-insert preserves Map order)
    cache.delete(key);
    cache.set(key, existing);
    return existing.embedding;
  }

  // Expired or missing — remove stale entry if present
  if (existing) {
    cache.delete(key);
  }

  misses++;
  const embedding = await generateQueryEmbedding(query);

  // Evict if at capacity
  if (cache.size >= MAX_ENTRIES) {
    evictOldest();
  }

  cache.set(key, { embedding, createdAt: Date.now() });
  return embedding;
}

/** Cache statistics for monitoring/logging */
export function queryCacheStats(): {
  size: number;
  hits: number;
  misses: number;
} {
  return { size: cache.size, hits, misses };
}

/** Clear cache (for testing) */
export function clearQueryCache(): void {
  cache.clear();
  hits = 0;
  misses = 0;
}
