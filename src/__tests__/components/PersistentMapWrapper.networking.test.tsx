/**
 * PersistentMapWrapper Networking & Race Condition Tests
 *
 * P1-7: Tests for network race conditions, timing issues, and concurrent requests
 * in the PersistentMapWrapper component.
 */

import { render, waitFor, act } from "@testing-library/react";

// Mock next/navigation
const mockSearchParams = new URLSearchParams();
jest.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
}));

// Mock the DynamicMap component (lazy loaded)
jest.mock("@/components/DynamicMap", () => ({
  __esModule: true,
  default: ({ listings }: { listings: unknown[] }) => (
    <div data-testid="dynamic-map" data-listings-count={listings.length}>
      Map with {listings.length} listings
    </div>
  ),
}));

// Mock SearchV2DataContext
const mockV2MapData = {
  geojson: {
    type: "FeatureCollection" as const,
    features: [],
  },
  mode: "geojson" as const,
};

let mockIsV2Enabled = false;
let mockHasV2Data = false;

jest.mock("@/contexts/SearchV2DataContext", () => ({
  useSearchV2Data: () => ({
    v2MapData: mockHasV2Data ? mockV2MapData : null,
    isV2Enabled: mockIsV2Enabled,
  }),
}));

// Mock SearchTransitionContext
jest.mock("@/contexts/SearchTransitionContext", () => ({
  useSearchTransitionSafe: () => ({ isPending: false }),
}));

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Import component after mocks
import PersistentMapWrapper from "@/components/PersistentMapWrapper";
const MAP_FETCH_DEBOUNCE_MS = 250;

describe("PersistentMapWrapper - Networking & Race Conditions (P1-7)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Reset mocks
    mockIsV2Enabled = false;
    mockHasV2Data = false;

    // Reset search params with valid bounds
    mockSearchParams.delete("minLng");
    mockSearchParams.delete("maxLng");
    mockSearchParams.delete("minLat");
    mockSearchParams.delete("maxLat");
    mockSearchParams.set("minLng", "-122.5");
    mockSearchParams.set("maxLng", "-122.0");
    mockSearchParams.set("minLat", "37.5");
    mockSearchParams.set("maxLat", "38.0");

    // Default successful response
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "x-request-id": "test-123" }),
      json: async () => ({
        listings: [{ id: "1", title: "Test", price: 1000, location: { lat: 37.7, lng: -122.4 } }],
      }),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("AbortController Cleanup", () => {
    it("aborts in-flight request when component unmounts", async () => {
      const abortSpy = jest.spyOn(AbortController.prototype, "abort");

      // Mock fetch that never resolves (simulates slow request)
      mockFetch.mockImplementation(
        () =>
          new Promise(() => {
            // Never resolves
          })
      );

      const { unmount } = render(
        <PersistentMapWrapper shouldRenderMap={true} />
      );

      // Advance timer to trigger debounced fetch
      await act(async () => {
        jest.advanceTimersByTime(MAP_FETCH_DEBOUNCE_MS);
      });

      // Verify fetch was called
      expect(mockFetch).toHaveBeenCalled();

      // Unmount while request is in flight
      unmount();

      // Abort should have been called
      expect(abortSpy).toHaveBeenCalled();

      abortSpy.mockRestore();
    });

    it("does not update state after unmount (no React warnings)", async () => {
      const consoleError = jest.spyOn(console, "error").mockImplementation();

      // Mock fetch with delayed response
      mockFetch.mockImplementation(
        (_url: string, options?: { signal?: AbortSignal }) =>
          new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              if (options?.signal?.aborted) {
                reject(new DOMException("Aborted", "AbortError"));
                return;
              }
              resolve({
                ok: true,
                status: 200,
                headers: new Headers(),
                json: async () => ({ listings: [] }),
              });
            }, 500);

            options?.signal?.addEventListener("abort", () => {
              clearTimeout(timeout);
              reject(new DOMException("Aborted", "AbortError"));
            });
          })
      );

      const { unmount } = render(
        <PersistentMapWrapper shouldRenderMap={true} />
      );

      // Advance timer to trigger fetch
      await act(async () => {
        jest.advanceTimersByTime(MAP_FETCH_DEBOUNCE_MS);
      });

      // Unmount immediately
      unmount();

      // Advance timers to let aborted response handling complete
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });

      // Should not have React "can't update unmounted component" warning
      const reactWarnings = consoleError.mock.calls.filter(
        (call) =>
          call[0]?.includes?.("unmounted") ||
          call[0]?.includes?.("Can't perform a React state update")
      );

      expect(reactWarnings.length).toBe(0);

      consoleError.mockRestore();
    });
  });

  describe("Request Debounce (250ms)", () => {
    it("waits for debounce before making API request", async () => {
      render(<PersistentMapWrapper shouldRenderMap={true} />);

      // Initially no fetch
      expect(mockFetch).not.toHaveBeenCalled();

      // Advance half debounce time - still no fetch
      await act(async () => {
        jest.advanceTimersByTime(MAP_FETCH_DEBOUNCE_MS / 2);
      });
      expect(mockFetch).not.toHaveBeenCalled();

      // Advance remaining half debounce - fetch should trigger
      await act(async () => {
        jest.advanceTimersByTime(MAP_FETCH_DEBOUNCE_MS / 2);
      });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("uses abort controller to cancel in-flight requests when new params arrive", async () => {
      // Track abort signals
      const abortSignals: AbortSignal[] = [];
      mockFetch.mockImplementation(
        (_url: string, options?: { signal?: AbortSignal }) => {
          if (options?.signal) {
            abortSignals.push(options.signal);
          }
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers(),
            json: async () => ({ listings: [] }),
          });
        }
      );

      render(<PersistentMapWrapper shouldRenderMap={true} />);

      // Trigger first fetch
      await act(async () => {
        jest.advanceTimersByTime(MAP_FETCH_DEBOUNCE_MS);
      });

      // Verify abort signal was captured
      expect(abortSignals.length).toBeGreaterThanOrEqual(1);
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe("Request Deduplication (lastFetchedParamsRef)", () => {
    it("skips fetch when params match last fetched params", async () => {
      const { rerender } = render(
        <PersistentMapWrapper shouldRenderMap={true} />
      );

      // First fetch
      await act(async () => {
        jest.advanceTimersByTime(MAP_FETCH_DEBOUNCE_MS);
      });
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Re-render with same params
      rerender(<PersistentMapWrapper shouldRenderMap={true} />);

      // Advance timer
      await act(async () => {
        jest.advanceTimersByTime(MAP_FETCH_DEBOUNCE_MS);
      });

      // No additional fetch
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("includes map-relevant params in fetch URL", async () => {
      // Set up search params with map-relevant filters
      mockSearchParams.set("q", "cozy room");
      mockSearchParams.set("minPrice", "500");
      mockSearchParams.set("maxPrice", "1500");

      render(<PersistentMapWrapper shouldRenderMap={true} />);

      await act(async () => {
        jest.advanceTimersByTime(MAP_FETCH_DEBOUNCE_MS);
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const fetchUrl = mockFetch.mock.calls[0][0];

      // Verify map-relevant params are included
      expect(fetchUrl).toContain("q=cozy+room");
      expect(fetchUrl).toContain("minPrice=500");
      expect(fetchUrl).toContain("maxPrice=1500");
    });

    it("normalizes language filters before map fetch", async () => {
      mockSearchParams.set("languages", "Telugu");

      render(<PersistentMapWrapper shouldRenderMap={true} />);

      await act(async () => {
        jest.advanceTimersByTime(MAP_FETCH_DEBOUNCE_MS);
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const fetchUrl = mockFetch.mock.calls[0][0];

      // Language names should be canonicalized to codes so map/list use identical filters.
      expect(fetchUrl).toContain("languages=te");
      expect(fetchUrl).not.toContain("languages=Telugu");
    });

    it("does NOT refetch when pagination params change", async () => {
      const { rerender } = render(
        <PersistentMapWrapper shouldRenderMap={true} />
      );

      // First fetch
      await act(async () => {
        jest.advanceTimersByTime(MAP_FETCH_DEBOUNCE_MS);
      });
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Change page param (not map-relevant)
      mockSearchParams.set("page", "2");

      rerender(<PersistentMapWrapper shouldRenderMap={true} />);

      await act(async () => {
        jest.advanceTimersByTime(MAP_FETCH_DEBOUNCE_MS);
      });

      // No additional fetch - page is not map-relevant
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("V2 Race Guard (100ms timeout)", () => {
    it("shows loading placeholder when v2 enabled but data not yet arrived", () => {
      mockIsV2Enabled = true;
      mockHasV2Data = false;

      const { container } = render(
        <PersistentMapWrapper shouldRenderMap={true} />
      );

      // Should show loading placeholder
      expect(container.textContent).toContain("Loading map");

      // Should NOT have made API call (waiting for v2 data)
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("skips v1 fetch when v2 data is available", async () => {
      mockIsV2Enabled = true;
      mockHasV2Data = true;

      render(<PersistentMapWrapper shouldRenderMap={true} />);

      // Advance all timers
      await act(async () => {
        jest.advanceTimersByTime(5000);
      });

      // No v1 API call when v2 data is present
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("uses v2 data when available instead of v1 listings", () => {
      mockIsV2Enabled = true;
      mockHasV2Data = true;

      const { getByTestId } = render(
        <PersistentMapWrapper shouldRenderMap={true} />
      );

      // Map should render with 0 listings (empty v2 features)
      const map = getByTestId("dynamic-map");
      expect(map).toHaveAttribute("data-listings-count", "0");
    });

    it("clears stale cached v2 data when switching to v1 mode", async () => {
      // Start in v2 mode with v2 data present
      mockIsV2Enabled = true;
      mockHasV2Data = true;

      const { rerender, getByTestId } = render(
        <PersistentMapWrapper shouldRenderMap={true} />
      );

      // v2 features are empty in this test fixture
      expect(getByTestId("dynamic-map")).toHaveAttribute(
        "data-listings-count",
        "0"
      );

      // Switch to v1 mode with no v2 data
      mockIsV2Enabled = false;
      mockHasV2Data = false;

      rerender(<PersistentMapWrapper shouldRenderMap={true} />);

      // Trigger throttled v1 fetch
      await act(async () => {
        jest.advanceTimersByTime(MAP_FETCH_DEBOUNCE_MS);
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      // Should now render fetched v1 listing count (not stale v2 cache)
      await waitFor(() => {
        expect(getByTestId("dynamic-map")).toHaveAttribute(
          "data-listings-count",
          "1"
        );
      });
    });

    it("ignores stale v2 map data when v2 mode is disabled", async () => {
      // Simulate stale context: v2MapData still present but mode is disabled.
      mockIsV2Enabled = false;
      mockHasV2Data = true;

      const { getByTestId } = render(
        <PersistentMapWrapper shouldRenderMap={true} />
      );

      // Should fall back to v1 API fetch instead of rendering stale v2 markers.
      await act(async () => {
        jest.advanceTimersByTime(MAP_FETCH_DEBOUNCE_MS);
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(getByTestId("dynamic-map")).toHaveAttribute(
          "data-listings-count",
          "1",
        );
      });
    });
  });

  describe("Error Handling", () => {
    it("handles fetch error gracefully", async () => {
      const consoleSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});

      mockFetch.mockRejectedValue(new Error("Network error"));

      const { findByRole } = render(
        <PersistentMapWrapper shouldRenderMap={true} />
      );

      await act(async () => {
        jest.advanceTimersByTime(MAP_FETCH_DEBOUNCE_MS);
      });

      // Error banner should be visible
      const errorAlert = await findByRole("alert");
      expect(errorAlert).toBeInTheDocument();

      consoleSpy.mockRestore();
    });

    it("handles 429 rate limit response", async () => {
      // Component auto-retries once on 429, so mock needs to return 429 twice
      // First 429 triggers automatic retry, second 429 shows error
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Headers({ "Retry-After": "2" }), // 2 second retry
        json: async () => ({ error: "Too many requests", retryAfter: 2 }),
      });

      const { findByRole } = render(
        <PersistentMapWrapper shouldRenderMap={true} />
      );

      // Initial fetch after debounce
      await act(async () => {
        jest.advanceTimersByTime(MAP_FETCH_DEBOUNCE_MS);
      });

      // First 429 schedules a retry - advance past retry delay (2000ms from Retry-After: 2)
      await act(async () => {
        jest.advanceTimersByTime(2500);
      });

      // Second 429 (retry also fails) should now show error banner
      const errorAlert = await findByRole("alert");
      expect(errorAlert).toBeInTheDocument();
      expect(errorAlert.textContent).toContain("Too many requests");
    });

    it("clears error on successful retry", async () => {
      // First request fails
      mockFetch
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ listings: [] }),
        });

      const consoleSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const { findByRole, queryByRole } = render(
        <PersistentMapWrapper shouldRenderMap={true} />
      );

      // First fetch fails
      await act(async () => {
        jest.advanceTimersByTime(MAP_FETCH_DEBOUNCE_MS);
      });

      // Error shown
      const errorAlert = await findByRole("alert");
      expect(errorAlert).toBeInTheDocument();

      // Click retry button
      const retryButton = await findByRole("button", { name: /retry/i });
      await act(async () => {
        retryButton.click();
      });

      // Wait for retry fetch
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });

      // Error should be cleared
      await waitFor(() => {
        expect(queryByRole("alert")).not.toBeInTheDocument();
      });

      consoleSpy.mockRestore();
    });
  });

  describe("Viewport Validation", () => {
    it("clamps oversized viewport and still fetches (P1-5 client-side check)", async () => {
      // Set oversized bounds (> MAX_LAT_SPAN/MAX_LNG_SPAN of 5)
      mockSearchParams.set("minLng", "-130.0");
      mockSearchParams.set("maxLng", "-120.0"); // 10 degree span
      mockSearchParams.set("minLat", "30.0");
      mockSearchParams.set("maxLat", "42.0"); // 12 degree span

      const { queryByRole } = render(
        <PersistentMapWrapper shouldRenderMap={true} />
      );

      // Informational banner shows that bounds were clamped
      // P2-FIX (#151): Changed from alert to status role since this is informational, not an error
      const infoBanner = queryByRole("status");
      expect(infoBanner).toBeInTheDocument();
      expect(infoBanner?.textContent).toContain("Zoomed in to show results");

      // Fetch should proceed with clamped bounds
      await act(async () => {
        jest.advanceTimersByTime(MAP_FETCH_DEBOUNCE_MS);
      });
      expect(mockFetch).toHaveBeenCalled();
    });

    it("does not show error for valid viewport bounds", async () => {
      // Valid bounds (within MAX_LAT_SPAN/MAX_LNG_SPAN of 5)
      mockSearchParams.set("minLng", "-122.5");
      mockSearchParams.set("maxLng", "-122.0"); // 0.5 degree span
      mockSearchParams.set("minLat", "37.5");
      mockSearchParams.set("maxLat", "38.0"); // 0.5 degree span

      const { queryByRole } = render(
        <PersistentMapWrapper shouldRenderMap={true} />
      );

      // No error shown for valid viewport
      expect(queryByRole("alert")).not.toBeInTheDocument();

      // Fetch should proceed
      await act(async () => {
        jest.advanceTimersByTime(MAP_FETCH_DEBOUNCE_MS);
      });

      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe("No Render When Disabled", () => {
    it("returns null when shouldRenderMap is false", () => {
      const { container } = render(
        <PersistentMapWrapper shouldRenderMap={false} />
      );

      expect(container.firstChild).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
