/**
 * createTTLCache - Shared TTL + LRU cache helper
 *
 * Uses Map insertion order for LRU eviction:
 * - get() deletes and re-inserts to move entry to end (most recent)
 * - set() evicts oldest (first) entry when over maxSize
 * - Periodic sweep every 60s removes expired entries (browser only)
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export interface TTLCache<T> {
  get(key: string): T | undefined;
  set(key: string, value: T, ttlMs: number): void;
  clear(): void;
  /** Exposed for testing */
  readonly size: number;
}

export function createTTLCache<T>(maxSize: number = 100): TTLCache<T> {
  const store = new Map<string, CacheEntry<T>>();

  function sweep(): void {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.expiresAt) {
        store.delete(key);
      }
    }
  }

  // Periodic sweep in browser only
  if (typeof window !== "undefined") {
    setInterval(sweep, 60_000);
  }

  return {
    get(key: string): T | undefined {
      const entry = store.get(key);
      if (!entry) return undefined;

      if (Date.now() > entry.expiresAt) {
        store.delete(key);
        return undefined;
      }

      // LRU: delete and re-insert to move to end
      store.delete(key);
      store.set(key, entry);
      return entry.value;
    },

    set(key: string, value: T, ttlMs: number): void {
      // If key already exists, delete first so re-insert moves to end
      if (store.has(key)) {
        store.delete(key);
      }

      // Evict oldest (first entry) if at capacity
      while (store.size >= maxSize) {
        const oldest = store.keys().next().value;
        if (oldest !== undefined) {
          store.delete(oldest);
        }
      }

      store.set(key, {
        value,
        expiresAt: Date.now() + ttlMs,
      });
    },

    clear(): void {
      store.clear();
    },

    get size(): number {
      return store.size;
    },
  };
}
