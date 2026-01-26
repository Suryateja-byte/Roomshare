/**
 * Simple LRU-like cache for geocoding results
 * Avoids external dependency while providing caching benefits
 */

interface CacheEntry {
  results: GeocodingResult[];
  timestamp: number;
}

export interface GeocodingResult {
  id: string;
  place_name: string;
  center: [number, number];
  place_type: string[];
  bbox?: [number, number, number, number];
}

const MAX_ENTRIES = 100;
const TTL_MS = 5 * 60 * 1000; // 5 minutes

// Use Map to maintain insertion order for LRU behavior
const cache = new Map<string, CacheEntry>();

function normalizeQuery(query: string): string {
  return query.toLowerCase().trim();
}

function evictStaleEntries(): void {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (now - entry.timestamp > TTL_MS) {
      cache.delete(key);
    }
  }
}

function enforceMaxSize(): void {
  while (cache.size > MAX_ENTRIES) {
    // Delete oldest entry (first key in Map iteration order)
    const oldestKey = cache.keys().next().value;
    if (oldestKey) {
      cache.delete(oldestKey);
    }
  }
}

export function getCachedResults(query: string): GeocodingResult[] | null {
  evictStaleEntries();

  const normalized = normalizeQuery(query);
  const entry = cache.get(normalized);

  if (!entry) {
    return null;
  }

  // Check if entry is still valid
  if (Date.now() - entry.timestamp > TTL_MS) {
    cache.delete(normalized);
    return null;
  }

  // Move to end (most recently used) by re-inserting
  cache.delete(normalized);
  cache.set(normalized, entry);

  return entry.results;
}

export function setCachedResults(query: string, results: GeocodingResult[]): void {
  const normalized = normalizeQuery(query);

  cache.set(normalized, {
    results,
    timestamp: Date.now(),
  });

  enforceMaxSize();
}

export function clearCache(): void {
  cache.clear();
}

export function getCacheSize(): number {
  return cache.size;
}
