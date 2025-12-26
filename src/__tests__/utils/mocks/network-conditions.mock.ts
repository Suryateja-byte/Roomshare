/**
 * Network Conditions Mock Utilities
 *
 * Mock utilities for testing networking edge cases:
 * - Race conditions (slow then fast responses)
 * - Rate limiting (429 with Retry-After)
 * - Network failures
 * - Offline detection
 */

import type { NearbyPlace } from '@/types/nearby';

/**
 * Create a mock place for network testing
 */
export function createMockPlace(id: string, overrides: Partial<NearbyPlace> = {}): NearbyPlace {
  return {
    id,
    name: `Place ${id}`,
    address: `123 Test St, City`,
    category: 'food-grocery',
    location: { lat: 37.7749, lng: -122.4194 },
    distanceMiles: 0.5,
    ...overrides,
  };
}

/**
 * Simulate "latest request wins" race condition
 * First request takes longer than second, verifying second response is used
 */
export function mockSlowThenFastResponses() {
  let callCount = 0;
  return jest.fn(async () => {
    callCount++;
    const currentCall = callCount;
    // First call: 500ms delay, Second call: 100ms delay
    const delay = currentCall === 1 ? 500 : 100;
    await new Promise((r) => setTimeout(r, delay));
    return {
      ok: true,
      status: 200,
      json: async () => ({
        places: [createMockPlace(`place_${currentCall}`)],
        meta: { count: 1, cached: false },
      }),
    };
  });
}

/**
 * Mock 429 rate limit response with Retry-After header
 * @param seconds - Retry-After value in seconds
 */
export function mock429WithRetryAfter(seconds: number) {
  return {
    ok: false,
    status: 429,
    headers: new Headers({ 'Retry-After': seconds.toString() }),
    json: async () => ({ error: 'Rate limit exceeded' }),
    text: async () => JSON.stringify({ error: 'Rate limit exceeded' }),
  };
}

/**
 * Mock that fails first N times, then succeeds
 * Useful for testing retry logic
 */
export function mockFailThenSucceed(failCount: number, successData: unknown) {
  let attempts = 0;
  return jest.fn(async () => {
    attempts++;
    if (attempts <= failCount) {
      throw new Error('Network error');
    }
    return {
      ok: true,
      status: 200,
      json: async () => successData,
    };
  });
}

/**
 * Mock network timeout (never resolves until aborted)
 */
export function mockNetworkTimeout() {
  return jest.fn(
    (_url: string, options?: { signal?: AbortSignal }) =>
      new Promise((resolve, reject) => {
        const signal = options?.signal;
        if (signal) {
          signal.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted', 'AbortError'));
          });
        }
        // Never resolves naturally - waits for abort
      })
  );
}

/**
 * Mock successful response with configurable delay
 */
export function mockDelayedSuccess(delay: number, data: unknown) {
  return jest.fn(async () => {
    await new Promise((r) => setTimeout(r, delay));
    return {
      ok: true,
      status: 200,
      json: async () => data,
    };
  });
}

/**
 * Mock that tracks abort signals
 */
export function mockWithAbortTracking() {
  const abortedCalls: number[] = [];
  let callCount = 0;

  const mockFn = jest.fn(
    (_url: string, options?: { signal?: AbortSignal }) =>
      new Promise((resolve, reject) => {
        callCount++;
        const currentCall = callCount;
        const signal = options?.signal;

        if (signal) {
          signal.addEventListener('abort', () => {
            abortedCalls.push(currentCall);
            reject(new DOMException('The operation was aborted', 'AbortError'));
          });
        }

        // Resolve after a delay
        setTimeout(() => {
          if (!signal?.aborted) {
            resolve({
              ok: true,
              status: 200,
              json: async () => ({
                places: [createMockPlace(`place_${currentCall}`)],
                meta: { count: 1, cached: false },
              }),
            });
          }
        }, 200);
      })
  );

  return {
    mockFn,
    getAbortedCalls: () => abortedCalls,
    getCallCount: () => callCount,
    reset: () => {
      callCount = 0;
      abortedCalls.length = 0;
    },
  };
}

/**
 * Mock online/offline events
 */
export function createNetworkStatusMock() {
  let isOnline = true;
  const listeners: { [key: string]: (() => void)[] } = {
    online: [],
    offline: [],
  };

  return {
    get onLine() {
      return isOnline;
    },
    addEventListener: (event: string, handler: () => void) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    },
    removeEventListener: (event: string, handler: () => void) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter((h) => h !== handler);
      }
    },
    goOffline: () => {
      isOnline = false;
      listeners.offline?.forEach((h) => h());
    },
    goOnline: () => {
      isOnline = true;
      listeners.online?.forEach((h) => h());
    },
    reset: () => {
      isOnline = true;
      listeners.online = [];
      listeners.offline = [];
    },
  };
}

/**
 * Mock DNS/connection errors
 */
export function mockConnectionError(errorType: 'dns' | 'refused' | 'timeout' = 'refused') {
  const errors = {
    dns: 'getaddrinfo ENOTFOUND api.radar.io',
    refused: 'connect ECONNREFUSED 127.0.0.1:443',
    timeout: 'ETIMEDOUT',
  };
  return jest.fn(() => Promise.reject(new Error(errors[errorType])));
}
