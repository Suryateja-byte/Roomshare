/**
 * Tests for createTTLCache utility
 * Validates TTL expiry, LRU eviction, and cache operations.
 */

import { createTTLCache } from '@/hooks/createTTLCache';

describe('createTTLCache', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('set and get returns the stored value', () => {
    const cache = createTTLCache<string>(10);
    cache.set('key1', 'value1', 60_000);
    expect(cache.get('key1')).toBe('value1');
  });

  it('get returns undefined for a missing key', () => {
    const cache = createTTLCache<string>(10);
    expect(cache.get('nonexistent')).toBeUndefined();
  });

  it('get returns undefined for an expired entry', () => {
    const cache = createTTLCache<string>(10);
    cache.set('key1', 'value1', 1_000);

    jest.advanceTimersByTime(1_001);

    expect(cache.get('key1')).toBeUndefined();
  });

  it('evicts the LRU (oldest) entry when maxSize is exceeded', () => {
    const cache = createTTLCache<number>(3);
    cache.set('a', 1, 60_000);
    cache.set('b', 2, 60_000);
    cache.set('c', 3, 60_000);
    // 'a' is the oldest — adding 'd' should evict 'a'
    cache.set('d', 4, 60_000);

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
    expect(cache.get('d')).toBe(4);
  });

  it('get refreshes LRU position so the key is not evicted first', () => {
    const cache = createTTLCache<number>(3);
    cache.set('a', 1, 60_000);
    cache.set('b', 2, 60_000);
    cache.set('c', 3, 60_000);
    // Access 'a' to move it to the MRU end
    cache.get('a');
    // Adding 'd' should now evict 'b' (oldest after the get)
    cache.set('d', 4, 60_000);

    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
    expect(cache.get('d')).toBe(4);
  });

  it('set overwrites an existing entry', () => {
    const cache = createTTLCache<string>(10);
    cache.set('key1', 'original', 60_000);
    cache.set('key1', 'updated', 60_000);
    expect(cache.get('key1')).toBe('updated');
  });

  it('clear removes all entries', () => {
    const cache = createTTLCache<string>(10);
    cache.set('a', 'v1', 60_000);
    cache.set('b', 'v2', 60_000);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBeUndefined();
  });

  it('size returns the number of stored entries', () => {
    const cache = createTTLCache<number>(10);
    expect(cache.size).toBe(0);
    cache.set('x', 1, 60_000);
    expect(cache.size).toBe(1);
    cache.set('y', 2, 60_000);
    expect(cache.size).toBe(2);
  });

  it('has-like behavior: get returns value for present key and undefined for absent key', () => {
    const cache = createTTLCache<boolean>(10);
    cache.set('present', true, 60_000);
    expect(cache.get('present')).toBe(true);
    expect(cache.get('absent')).toBeUndefined();
  });

  it('expired entries are not counted in size', () => {
    const cache = createTTLCache<string>(10);
    cache.set('short', 'val', 500);
    cache.set('long', 'val', 60_000);
    expect(cache.size).toBe(2);

    jest.advanceTimersByTime(501);

    // Accessing the expired key triggers deletion
    cache.get('short');
    expect(cache.size).toBe(1);
  });
});
