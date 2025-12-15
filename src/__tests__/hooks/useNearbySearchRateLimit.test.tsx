import { renderHook, act } from '@testing-library/react';
import {
  useNearbySearchRateLimit,
  RATE_LIMIT_CONFIG,
} from '@/hooks/useNearbySearchRateLimit';

// Mock sessionStorage
const mockSessionStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: jest.fn((index: number) => Object.keys(store)[index] || null),
  };
})();

Object.defineProperty(window, 'sessionStorage', {
  value: mockSessionStorage,
});

describe('useNearbySearchRateLimit', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockSessionStorage.clear();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('initial state', () => {
    it('should return initial state with full searches available', () => {
      const { result } = renderHook(() => useNearbySearchRateLimit('listing-1'));

      expect(result.current.canSearch).toBe(true);
      expect(result.current.remainingSearches).toBe(RATE_LIMIT_CONFIG.maxSearchesPerListing);
      expect(result.current.isDebounceBusy).toBe(false);
    });

    it('should read existing state from sessionStorage', () => {
      const existingState = {
        searchCount: 2,
        lastSearchTime: Date.now() - 60000, // 1 minute ago
      };
      mockSessionStorage.setItem(
        'nearby-search-limit-listing-1',
        JSON.stringify(existingState)
      );

      const { result } = renderHook(() => useNearbySearchRateLimit('listing-1'));

      expect(result.current.remainingSearches).toBe(1);
      expect(result.current.canSearch).toBe(true);
    });

    it('should handle different listing IDs independently', () => {
      const { result: result1 } = renderHook(() =>
        useNearbySearchRateLimit('listing-1')
      );
      const { result: result2 } = renderHook(() =>
        useNearbySearchRateLimit('listing-2')
      );

      expect(result1.current.remainingSearches).toBe(3);
      expect(result2.current.remainingSearches).toBe(3);

      act(() => {
        result1.current.incrementCount();
      });

      expect(result1.current.remainingSearches).toBe(2);
      expect(result2.current.remainingSearches).toBe(3);
    });
  });

  describe('incrementCount', () => {
    it('should decrement remaining searches', () => {
      const { result } = renderHook(() => useNearbySearchRateLimit('listing-1'));

      expect(result.current.remainingSearches).toBe(3);

      act(() => {
        result.current.incrementCount();
      });

      expect(result.current.remainingSearches).toBe(2);
    });

    it('should persist state to sessionStorage', () => {
      const { result } = renderHook(() => useNearbySearchRateLimit('listing-1'));

      act(() => {
        result.current.incrementCount();
      });

      const stored = JSON.parse(
        mockSessionStorage.getItem('nearby-search-limit-listing-1') || '{}'
      );
      expect(stored.searchCount).toBe(1);
      expect(stored.lastSearchTime).toBeGreaterThan(0);
    });

    // P1-03 FIX: incrementCount no longer starts debounce - use startDebounce() for that
    it('should NOT set isDebounceBusy when incrementCount is called alone', () => {
      const { result } = renderHook(() => useNearbySearchRateLimit('listing-1'));

      expect(result.current.isDebounceBusy).toBe(false);

      act(() => {
        result.current.incrementCount();
      });

      // P1-03: incrementCount only increments, doesn't start debounce
      expect(result.current.isDebounceBusy).toBe(false);
    });

    it('should set isDebounceBusy when startDebounce is called', () => {
      const { result } = renderHook(() => useNearbySearchRateLimit('listing-1'));

      expect(result.current.isDebounceBusy).toBe(false);

      act(() => {
        result.current.startDebounce();
      });

      expect(result.current.isDebounceBusy).toBe(true);
    });

    it('should clear debounce after DEBOUNCE_MS', () => {
      const { result } = renderHook(() => useNearbySearchRateLimit('listing-1'));

      act(() => {
        result.current.startDebounce();
      });

      expect(result.current.isDebounceBusy).toBe(true);

      act(() => {
        jest.advanceTimersByTime(RATE_LIMIT_CONFIG.debounceMs);
      });

      expect(result.current.isDebounceBusy).toBe(false);
    });

    it('should prevent search when at max count', () => {
      const { result } = renderHook(() => useNearbySearchRateLimit('listing-1'));

      // Exhaust all searches
      act(() => {
        result.current.incrementCount();
        jest.advanceTimersByTime(RATE_LIMIT_CONFIG.debounceMs);
      });
      act(() => {
        result.current.incrementCount();
        jest.advanceTimersByTime(RATE_LIMIT_CONFIG.debounceMs);
      });
      act(() => {
        result.current.incrementCount();
        jest.advanceTimersByTime(RATE_LIMIT_CONFIG.debounceMs);
      });

      expect(result.current.remainingSearches).toBe(0);
      expect(result.current.canSearch).toBe(false);
    });
  });

  describe('B18 regression: rapid increments with functional update', () => {
    it('should correctly count rapid successive increments', () => {
      const { result } = renderHook(() => useNearbySearchRateLimit('listing-1'));

      // Simulate rapid clicks without waiting for debounce
      act(() => {
        result.current.incrementCount();
      });

      // Advance past debounce
      act(() => {
        jest.advanceTimersByTime(RATE_LIMIT_CONFIG.debounceMs);
      });

      act(() => {
        result.current.incrementCount();
      });

      // Should correctly show 2 searches used
      expect(result.current.remainingSearches).toBe(1);

      // Advance past debounce
      act(() => {
        jest.advanceTimersByTime(RATE_LIMIT_CONFIG.debounceMs);
      });

      act(() => {
        result.current.incrementCount();
      });

      // Should correctly show 3 searches used (all exhausted)
      expect(result.current.remainingSearches).toBe(0);
      expect(result.current.canSearch).toBe(false);
    });

    // P1-03 FIX: Updated to use startDebounce() separately from incrementCount()
    it('should not lose counts when incrementing while debouncing', () => {
      const { result } = renderHook(() => useNearbySearchRateLimit('listing-1'));

      // First search: start debounce then increment on success
      act(() => {
        result.current.startDebounce();
        result.current.incrementCount();
      });

      expect(result.current.remainingSearches).toBe(2);
      expect(result.current.isDebounceBusy).toBe(true);

      // Wait for debounce to clear
      act(() => {
        jest.advanceTimersByTime(RATE_LIMIT_CONFIG.debounceMs);
      });

      // Second search
      act(() => {
        result.current.startDebounce();
        result.current.incrementCount();
      });

      expect(result.current.remainingSearches).toBe(1);

      // Third search after debounce
      act(() => {
        jest.advanceTimersByTime(RATE_LIMIT_CONFIG.debounceMs);
      });
      act(() => {
        result.current.startDebounce();
        result.current.incrementCount();
      });

      expect(result.current.remainingSearches).toBe(0);

      // Verify storage has correct final count
      const stored = JSON.parse(
        mockSessionStorage.getItem('nearby-search-limit-listing-1') || '{}'
      );
      expect(stored.searchCount).toBe(3);
    });
  });

  describe('debounce behavior', () => {
    // P1-03 FIX: Updated to use startDebounce() to trigger debounce state
    it('should block canSearch during debounce even with remaining searches', () => {
      const { result } = renderHook(() => useNearbySearchRateLimit('listing-1'));

      act(() => {
        result.current.startDebounce();
        result.current.incrementCount();
      });

      expect(result.current.remainingSearches).toBe(2);
      expect(result.current.isDebounceBusy).toBe(true);
      expect(result.current.canSearch).toBe(false);
    });

    // P1-03 FIX: Updated to use startDebounce()
    it('should allow search after debounce period', () => {
      const { result } = renderHook(() => useNearbySearchRateLimit('listing-1'));

      act(() => {
        result.current.startDebounce();
        result.current.incrementCount();
      });

      expect(result.current.canSearch).toBe(false);

      act(() => {
        jest.advanceTimersByTime(RATE_LIMIT_CONFIG.debounceMs);
      });

      expect(result.current.canSearch).toBe(true);
    });

    it('should restore debounce state from storage on mount', () => {
      const recentTime = Date.now() - 5000; // 5 seconds ago
      const existingState = {
        searchCount: 1,
        lastSearchTime: recentTime,
      };
      mockSessionStorage.setItem(
        'nearby-search-limit-listing-1',
        JSON.stringify(existingState)
      );

      const { result } = renderHook(() => useNearbySearchRateLimit('listing-1'));

      // Should be in debounce since last search was recent
      expect(result.current.isDebounceBusy).toBe(true);
      expect(result.current.canSearch).toBe(false);

      // Wait for remaining debounce time
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      expect(result.current.isDebounceBusy).toBe(false);
      expect(result.current.canSearch).toBe(true);
    });
  });

  describe('reset', () => {
    it('should reset all state', () => {
      const { result } = renderHook(() => useNearbySearchRateLimit('listing-1'));

      // Use some searches
      act(() => {
        result.current.incrementCount();
      });
      act(() => {
        jest.advanceTimersByTime(RATE_LIMIT_CONFIG.debounceMs);
        result.current.incrementCount();
      });

      expect(result.current.remainingSearches).toBe(1);

      // Reset
      act(() => {
        result.current.reset();
      });

      expect(result.current.remainingSearches).toBe(3);
      expect(result.current.canSearch).toBe(true);
      expect(result.current.isDebounceBusy).toBe(false);
    });

    it('should clear sessionStorage on reset', () => {
      const { result } = renderHook(() => useNearbySearchRateLimit('listing-1'));

      act(() => {
        result.current.incrementCount();
      });

      act(() => {
        result.current.reset();
      });

      const stored = JSON.parse(
        mockSessionStorage.getItem('nearby-search-limit-listing-1') || '{}'
      );
      expect(stored.searchCount).toBe(0);
      expect(stored.lastSearchTime).toBe(0);
    });

    // P1-03 FIX: Updated to use startDebounce() to trigger debounce state
    it('should clear debounce timer on reset', () => {
      const { result } = renderHook(() => useNearbySearchRateLimit('listing-1'));

      act(() => {
        result.current.startDebounce();
        result.current.incrementCount();
      });

      expect(result.current.isDebounceBusy).toBe(true);

      act(() => {
        result.current.reset();
      });

      expect(result.current.isDebounceBusy).toBe(false);
    });
  });

  describe('session expiry', () => {
    it('should reset state if session is expired', () => {
      const expiredTime = Date.now() - RATE_LIMIT_CONFIG.sessionExpiryMs - 1000;
      const existingState = {
        searchCount: 3,
        lastSearchTime: expiredTime,
      };
      mockSessionStorage.setItem(
        'nearby-search-limit-listing-1',
        JSON.stringify(existingState)
      );

      const { result } = renderHook(() => useNearbySearchRateLimit('listing-1'));

      // Should have reset due to expiry
      expect(result.current.remainingSearches).toBe(3);
      expect(result.current.canSearch).toBe(true);
    });

    it('should preserve state if session is not expired', () => {
      const recentTime = Date.now() - 60000; // 1 minute ago
      const existingState = {
        searchCount: 2,
        lastSearchTime: recentTime,
      };
      mockSessionStorage.setItem(
        'nearby-search-limit-listing-1',
        JSON.stringify(existingState)
      );

      const { result } = renderHook(() => useNearbySearchRateLimit('listing-1'));

      expect(result.current.remainingSearches).toBe(1);
    });
  });

  describe('listing ID changes', () => {
    it('should update state when listingId changes', () => {
      const { result, rerender } = renderHook(
        ({ listingId }) => useNearbySearchRateLimit(listingId),
        { initialProps: { listingId: 'listing-1' } }
      );

      // Use a search on listing-1
      act(() => {
        result.current.incrementCount();
      });

      expect(result.current.remainingSearches).toBe(2);

      // Change to listing-2
      rerender({ listingId: 'listing-2' });

      // Should have full searches for new listing
      expect(result.current.remainingSearches).toBe(3);
    });

    it('should preserve state when returning to previous listingId', () => {
      const { result, rerender } = renderHook(
        ({ listingId }) => useNearbySearchRateLimit(listingId),
        { initialProps: { listingId: 'listing-1' } }
      );

      // Use a search on listing-1
      act(() => {
        result.current.incrementCount();
        jest.advanceTimersByTime(RATE_LIMIT_CONFIG.debounceMs);
      });

      expect(result.current.remainingSearches).toBe(2);

      // Switch to listing-2
      rerender({ listingId: 'listing-2' });
      expect(result.current.remainingSearches).toBe(3);

      // Return to listing-1
      rerender({ listingId: 'listing-1' });
      expect(result.current.remainingSearches).toBe(2);
    });
  });

  describe('edge cases', () => {
    it('should handle invalid sessionStorage data gracefully', () => {
      mockSessionStorage.setItem('nearby-search-limit-listing-1', 'invalid-json');

      const { result } = renderHook(() => useNearbySearchRateLimit('listing-1'));

      expect(result.current.remainingSearches).toBe(3);
      expect(result.current.canSearch).toBe(true);
    });

    it('should handle missing fields in stored data', () => {
      mockSessionStorage.setItem(
        'nearby-search-limit-listing-1',
        JSON.stringify({ searchCount: 'not-a-number' })
      );

      const { result } = renderHook(() => useNearbySearchRateLimit('listing-1'));

      expect(result.current.remainingSearches).toBe(3);
    });

    it('should not go below 0 remaining searches', () => {
      const existingState = {
        searchCount: 10, // More than max
        lastSearchTime: Date.now() - 60000,
      };
      mockSessionStorage.setItem(
        'nearby-search-limit-listing-1',
        JSON.stringify(existingState)
      );

      const { result } = renderHook(() => useNearbySearchRateLimit('listing-1'));

      expect(result.current.remainingSearches).toBe(0);
      expect(result.current.canSearch).toBe(false);
    });
  });

  // P1-04 FIX: Tests for debounceRemainingMs countdown feature
  describe('debounceRemainingMs countdown (P1-04)', () => {
    it('should initialize debounceRemainingMs to 0', () => {
      const { result } = renderHook(() => useNearbySearchRateLimit('listing-1'));

      expect(result.current.debounceRemainingMs).toBe(0);
    });

    it('should set debounceRemainingMs when startDebounce is called', () => {
      const { result } = renderHook(() => useNearbySearchRateLimit('listing-1'));

      act(() => {
        result.current.startDebounce();
      });

      // Should be approximately DEBOUNCE_MS (may be slightly less due to timing)
      expect(result.current.debounceRemainingMs).toBeGreaterThan(RATE_LIMIT_CONFIG.debounceMs - 200);
      expect(result.current.debounceRemainingMs).toBeLessThanOrEqual(RATE_LIMIT_CONFIG.debounceMs);
    });

    it('should decrease debounceRemainingMs over time', () => {
      const { result } = renderHook(() => useNearbySearchRateLimit('listing-1'));

      act(() => {
        result.current.startDebounce();
      });

      const initialRemaining = result.current.debounceRemainingMs;

      // Advance timer by 1 second
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      // Should have decreased by approximately 1000ms
      expect(result.current.debounceRemainingMs).toBeLessThan(initialRemaining);
      expect(result.current.debounceRemainingMs).toBeGreaterThan(RATE_LIMIT_CONFIG.debounceMs - 1200);
    });

    it('should reset debounceRemainingMs to 0 after debounce period', () => {
      const { result } = renderHook(() => useNearbySearchRateLimit('listing-1'));

      act(() => {
        result.current.startDebounce();
      });

      expect(result.current.debounceRemainingMs).toBeGreaterThan(0);

      act(() => {
        jest.advanceTimersByTime(RATE_LIMIT_CONFIG.debounceMs + 100);
      });

      expect(result.current.debounceRemainingMs).toBe(0);
    });

    it('should reset debounceRemainingMs on reset()', () => {
      const { result } = renderHook(() => useNearbySearchRateLimit('listing-1'));

      act(() => {
        result.current.startDebounce();
      });

      expect(result.current.debounceRemainingMs).toBeGreaterThan(0);

      act(() => {
        result.current.reset();
      });

      expect(result.current.debounceRemainingMs).toBe(0);
    });

    it('should restore debounceRemainingMs from storage on mount', () => {
      const recentTime = Date.now() - 5000; // 5 seconds ago
      const existingState = {
        searchCount: 1,
        lastSearchTime: recentTime,
      };
      mockSessionStorage.setItem(
        'nearby-search-limit-listing-1',
        JSON.stringify(existingState)
      );

      const { result } = renderHook(() => useNearbySearchRateLimit('listing-1'));

      // Should have approximately 5 seconds remaining
      expect(result.current.debounceRemainingMs).toBeGreaterThan(4000);
      expect(result.current.debounceRemainingMs).toBeLessThanOrEqual(5100);
    });
  });

  describe('exported constants', () => {
    it('should export correct rate limit configuration', () => {
      expect(RATE_LIMIT_CONFIG.maxSearchesPerListing).toBe(3);
      expect(RATE_LIMIT_CONFIG.debounceMs).toBe(10000);
      expect(RATE_LIMIT_CONFIG.sessionExpiryMs).toBe(30 * 60 * 1000);
    });
  });
});
