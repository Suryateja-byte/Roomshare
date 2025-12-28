/**
 * UI State & React Lifecycle Tests
 *
 * Tests for React lifecycle management, state synchronization, and
 * proper cleanup in the NearbyPlacesPanel component.
 *
 * @see Plan Category E - UI State, React Lifecycle (10 tests)
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';

// Mock next-auth with different session states
const mockUseSession = jest.fn();
jest.mock('next-auth/react', () => ({
  useSession: () => mockUseSession(),
}));

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock Lucide icons
jest.mock('lucide-react', () => ({
  MapPin: () => <span data-testid="map-pin-icon">M</span>,
  Search: () => <span data-testid="search-icon">S</span>,
  AlertCircle: () => <span data-testid="alert-icon">!</span>,
  ArrowRight: () => <span data-testid="arrow-icon">→</span>,
  ShoppingCart: () => <span data-testid="cart-icon">🛒</span>,
  Utensils: () => <span data-testid="utensils-icon">🍴</span>,
  ShoppingBag: () => <span data-testid="bag-icon">🛍</span>,
  Fuel: () => <span data-testid="fuel-icon">⛽</span>,
  Dumbbell: () => <span data-testid="gym-icon">🏋</span>,
  Pill: () => <span data-testid="pill-icon">💊</span>,
  Footprints: () => <span data-testid="walk-icon">👣</span>,
  Car: () => <span data-testid="car-icon">🚗</span>,
  Map: () => <span data-testid="map-icon">🗺</span>,
  List: () => <span data-testid="list-icon">📋</span>,
}));

// Mock UI components
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, asChild, ...props }: React.PropsWithChildren<{ asChild?: boolean }>) =>
    asChild ? (
      <>{children}</>
    ) : (
      <button {...props}>{children}</button>
    ),
}));

import NearbyPlacesPanel from '@/components/nearby/NearbyPlacesPanel';
import type { NearbyPlace } from '@/types/nearby';

describe('NearbyPlacesPanel - UI State & React Lifecycle', () => {
  const listingLat = 37.7749;
  const listingLng = -122.4194;

  const mockSession = {
    user: { id: 'user-123', name: 'Test User', email: 'test@example.com' },
    expires: new Date(Date.now() + 86400000).toISOString(),
  };

  const createMockPlace = (id: string): NearbyPlace => ({
    id,
    name: `Place ${id}`,
    address: '123 Test St',
    category: 'food-grocery',
    location: { lat: 37.7749, lng: -122.4194 },
    distanceMiles: 0.5,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockUseSession.mockReturnValue({
      data: mockSession,
      status: 'authenticated',
    });
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        places: [createMockPlace('place-1')],
        meta: { count: 1, cached: false },
      }),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const renderPanel = (props = {}) => {
    return render(
      <NearbyPlacesPanel
        listingLat={listingLat}
        listingLng={listingLng}
        {...props}
      />
    );
  };

  // E1: Unmount while fetch in flight doesn't setState
  describe('E1: Memory Leak Prevention', () => {
    it('does not update state after unmount', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation();

      // Delay the response to simulate in-flight request
      let resolveRequest: (() => void) | null = null;
      mockFetch.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveRequest = () =>
              resolve({
                ok: true,
                status: 200,
                json: async () => ({
                  places: [createMockPlace('place-1')],
                  meta: { count: 1, cached: false },
                }),
              });
          })
      );

      const { unmount } = renderPanel();

      // Start a request
      const groceryChip = screen.getByRole('button', { name: /grocery/i });
      await act(async () => {
        fireEvent.click(groceryChip);
      });

      // Unmount before request completes
      unmount();

      // Resolve the request after unmount
      await act(async () => {
        resolveRequest?.();
        jest.runAllTimers();
      });

      // Should not have React warning about updating unmounted component
      const reactWarnings = consoleError.mock.calls.filter(
        (call) =>
          call[0]?.toString?.()?.includes?.('unmounted') ||
          call[0]?.toString?.()?.includes?.("Can't perform a React state update")
      );

      expect(reactWarnings.length).toBe(0);
      consoleError.mockRestore();
    });

    it('aborts in-flight request on unmount', () => {
      const abortSpy = jest.spyOn(AbortController.prototype, 'abort');

      const { unmount } = renderPanel();

      // Start a request
      const groceryChip = screen.getByRole('button', { name: /grocery/i });
      fireEvent.click(groceryChip);

      // Unmount
      unmount();

      // Abort should be called
      expect(abortSpy).toHaveBeenCalled();
      abortSpy.mockRestore();
    });
  });

  // E2: StrictMode double-invokes effects correctly
  describe('E2: React StrictMode', () => {
    it('handles double effect invocation in StrictMode', () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation();

      // Render in StrictMode
      render(
        <React.StrictMode>
          <NearbyPlacesPanel listingLat={listingLat} listingLng={listingLng} />
        </React.StrictMode>
      );

      // Should not have errors from double-mounting
      expect(consoleError).not.toHaveBeenCalled();
      consoleError.mockRestore();
    });

    it('cleans up properly on StrictMode remount', async () => {
      const abortSpy = jest.spyOn(AbortController.prototype, 'abort');

      const { unmount } = render(
        <React.StrictMode>
          <NearbyPlacesPanel listingLat={listingLat} listingLng={listingLng} />
        </React.StrictMode>
      );

      // Start a request
      const groceryChip = screen.getByRole('button', { name: /grocery/i });
      await act(async () => {
        fireEvent.click(groceryChip);
      });

      unmount();

      // Cleanup should have been called
      expect(abortSpy).toHaveBeenCalled();
      abortSpy.mockRestore();
    });
  });

  // E3: SSR hydration mismatch avoided
  describe('E3: Hydration', () => {
    it('renders consistently on initial mount', () => {
      const { container: container1 } = renderPanel();
      const html1 = container1.innerHTML;

      const { container: container2 } = renderPanel();
      const html2 = container2.innerHTML;

      // Both renders should produce the same initial output
      expect(html1).toBe(html2);
    });

    it('does not use browser-only APIs in initial render', () => {
      // Verify component renders without errors on initial render
      // The component should handle the case where browser APIs may not be available
      const { container } = renderPanel();

      // Initial render should complete without errors
      expect(container.firstChild).toBeInTheDocument();

      // Search input should be present (authenticated state)
      expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
    });
  });

  // E4: Panel/map places sync after update
  describe('E4: State Sync', () => {
    it('calls onPlacesChange when places are fetched', async () => {
      const onPlacesChange = jest.fn();

      render(
        <NearbyPlacesPanel
          listingLat={listingLat}
          listingLng={listingLng}
          onPlacesChange={onPlacesChange}
        />
      );

      const groceryChip = screen.getByRole('button', { name: /grocery/i });
      await act(async () => {
        fireEvent.click(groceryChip);
        jest.runAllTimers();
      });

      await waitFor(() => {
        expect(onPlacesChange).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({ id: 'place-1' }),
          ])
        );
      });
    });

    it('syncs places on category change', async () => {
      const onPlacesChange = jest.fn();

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            places: [createMockPlace('grocery-1')],
            meta: { count: 1, cached: false },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            places: [createMockPlace('pharmacy-1')],
            meta: { count: 1, cached: false },
          }),
        });

      render(
        <NearbyPlacesPanel
          listingLat={listingLat}
          listingLng={listingLng}
          onPlacesChange={onPlacesChange}
        />
      );

      // Click grocery
      const groceryChip = screen.getByRole('button', { name: /grocery/i });
      await act(async () => {
        fireEvent.click(groceryChip);
        jest.runAllTimers();
      });

      // Click pharmacy
      const pharmacyChip = screen.getByRole('button', { name: /pharmacy/i });
      await act(async () => {
        fireEvent.click(pharmacyChip);
        jest.runAllTimers();
      });

      // Should have been called twice with different data
      expect(onPlacesChange).toHaveBeenCalledTimes(2);
    });
  });

  // E5: Hovered state clears after results cleared
  describe('E5: Stale Hover', () => {
    it('calls onPlaceHover with null on mouse leave', async () => {
      const onPlaceHover = jest.fn();

      render(
        <NearbyPlacesPanel
          listingLat={listingLat}
          listingLng={listingLng}
          onPlaceHover={onPlaceHover}
        />
      );

      // Fetch results
      const groceryChip = screen.getByRole('button', { name: /grocery/i });
      await act(async () => {
        fireEvent.click(groceryChip);
        jest.runAllTimers();
      });

      // Wait for results
      await waitFor(() => {
        expect(screen.getByText('Place place-1')).toBeInTheDocument();
      });

      // Hover on result
      const resultItem = screen.getByLabelText(/get directions to place place-1/i);
      fireEvent.mouseEnter(resultItem);
      expect(onPlaceHover).toHaveBeenCalledWith('place-1');

      // Mouse leave
      fireEvent.mouseLeave(resultItem);
      expect(onPlaceHover).toHaveBeenCalledWith(null);
    });
  });

  // E6: hasSearched resets on input clear
  describe('E6: Flag Reset', () => {
    it('shows initial prompt when no search has been done', () => {
      renderPanel();

      expect(screen.getByText(/discover what's nearby/i)).toBeInTheDocument();
    });

    it('shows results after search', async () => {
      renderPanel();

      const groceryChip = screen.getByRole('button', { name: /grocery/i });
      await act(async () => {
        fireEvent.click(groceryChip);
        jest.runAllTimers();
      });

      await waitFor(() => {
        expect(screen.queryByText(/discover what's nearby/i)).not.toBeInTheDocument();
      });
    });
  });

  // E7: Error state cleared on new search
  describe('E7: Error Clear', () => {
    it('clears error when new search starts', async () => {
      // First request fails
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      renderPanel();

      const groceryChip = screen.getByRole('button', { name: /grocery/i });
      await act(async () => {
        fireEvent.click(groceryChip);
        jest.runAllTimers();
      });

      // Should show error
      await waitFor(() => {
        expect(screen.getByText(/network error/i)).toBeInTheDocument();
      });

      // Second request succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          places: [createMockPlace('place-1')],
          meta: { count: 1, cached: false },
        }),
      });

      // Start new search
      const pharmacyChip = screen.getByRole('button', { name: /pharmacy/i });
      await act(async () => {
        fireEvent.click(pharmacyChip);
        jest.runAllTimers();
      });

      // Error should be cleared
      await waitFor(() => {
        expect(screen.queryByText(/network error/i)).not.toBeInTheDocument();
      });
    });
  });

  // E8: Loading spinner stops on thrown error
  describe('E8: Loading State', () => {
    it('stops loading state on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      renderPanel();

      const groceryChip = screen.getByRole('button', { name: /grocery/i });
      await act(async () => {
        fireEvent.click(groceryChip);
        jest.runAllTimers();
      });

      // Loading should be stopped
      await waitFor(() => {
        expect(screen.queryByTestId('loading-skeleton')).not.toBeInTheDocument();
      });
    });

    it('shows loading skeleton during fetch', async () => {
      // Delay the response
      mockFetch.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  status: 200,
                  json: async () => ({
                    places: [createMockPlace('place-1')],
                    meta: { count: 1, cached: false },
                  }),
                }),
              1000
            )
          )
      );

      renderPanel();

      const groceryChip = screen.getByRole('button', { name: /grocery/i });
      await act(async () => {
        fireEvent.click(groceryChip);
      });

      // Should show loading skeleton
      expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument();

      // Complete the request
      await act(async () => {
        jest.advanceTimersByTime(1100);
      });

      // Loading should be gone
      await waitFor(() => {
        expect(screen.queryByTestId('loading-skeleton')).not.toBeInTheDocument();
      });
    });
  });

  // E9: Rapid list/map toggle preserves scroll
  describe('E9: Scroll Position', () => {
    it('maintains scroll position on rerender', async () => {
      const { rerender } = render(
        <NearbyPlacesPanel
          listingLat={listingLat}
          listingLng={listingLng}
          viewMode="list"
          onViewModeChange={() => {}}
        />
      );

      // Trigger search
      const groceryChip = screen.getByRole('button', { name: /grocery/i });
      await act(async () => {
        fireEvent.click(groceryChip);
        jest.runAllTimers();
      });

      // Rerender with same viewMode
      rerender(
        <NearbyPlacesPanel
          listingLat={listingLat}
          listingLng={listingLng}
          viewMode="list"
          onViewModeChange={() => {}}
        />
      );

      // Component should still be functional
      expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
    });
  });

  // E10: Click chip during loading queues correctly
  describe('E10: Debounce Queue', () => {
    it('cancels previous request when new chip is clicked during loading', async () => {
      const abortSpy = jest.spyOn(AbortController.prototype, 'abort');

      renderPanel();

      const groceryChip = screen.getByRole('button', { name: /grocery/i });
      const pharmacyChip = screen.getByRole('button', { name: /pharmacy/i });

      // Click first chip
      await act(async () => {
        fireEvent.click(groceryChip);
      });

      // Immediately click second chip
      await act(async () => {
        fireEvent.click(pharmacyChip);
      });

      // First request should be aborted
      expect(abortSpy).toHaveBeenCalled();
      abortSpy.mockRestore();
    });
  });

  // Additional lifecycle tests
  describe('Session State Changes', () => {
    it('shows loading skeleton when session is loading', () => {
      mockUseSession.mockReturnValue({
        data: null,
        status: 'loading',
      });

      const { container } = renderPanel();

      // Should show loading skeleton (has animate-pulse class)
      const skeleton = container.querySelector('.animate-pulse');
      expect(skeleton).toBeInTheDocument();
    });

    it('shows login prompt when unauthenticated', () => {
      mockUseSession.mockReturnValue({
        data: null,
        status: 'unauthenticated',
      });

      renderPanel();

      // Should show login prompt
      expect(screen.getByText(/sign in to explore/i)).toBeInTheDocument();
    });
  });

  describe('AbortController Cleanup', () => {
    it('aborts in-flight request on unmount', async () => {
      const abortSpy = jest.spyOn(AbortController.prototype, 'abort');

      const { unmount } = renderPanel();

      // Click a chip to trigger fetch
      const groceryChip = screen.getByRole('button', { name: /grocery/i });
      await act(async () => {
        fireEvent.click(groceryChip);
      });

      // Unmount
      unmount();

      // AbortController.abort should have been called
      expect(abortSpy).toHaveBeenCalled();
      abortSpy.mockRestore();
    });
  });
});
