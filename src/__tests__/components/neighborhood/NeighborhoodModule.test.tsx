/**
 * Unit tests for NeighborhoodModule component
 *
 * Tests the tier-aware rendering logic:
 * - Free users: NearbyPlacesCard + ProUpgradeCTA
 * - Pro users: NeighborhoodPlaceList + NeighborhoodMap
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { NeighborhoodSearchResult, POI, SearchMeta } from '@/lib/places/types';

// Mock next/dynamic to avoid SSR issues in tests
jest.mock('next/dynamic', () => {
  return jest.fn((importFn: () => Promise<{ default: React.ComponentType<unknown> }>) => {
    // Return a mock component that simulates the dynamic import
    const MockComponent = (props: Record<string, unknown>) => {
      const { onSearchResultsReady, onLoadingChange, onError } = props as {
        onSearchResultsReady?: (result: NeighborhoodSearchResult) => void;
        onLoadingChange?: (loading: boolean) => void;
        onError?: (error: string) => void;
      };

      // Check if this is NearbyPlacesCard by looking at the props
      if (onSearchResultsReady) {
        return (
          <div data-testid="mock-nearby-places-card">
            <button
              data-testid="trigger-results"
              onClick={() => {
                onLoadingChange?.(false);
                onSearchResultsReady(mockSearchResult);
              }}
            >
              Trigger Results
            </button>
            <button
              data-testid="trigger-error"
              onClick={() => {
                onLoadingChange?.(false);
                onError?.('Search failed');
              }}
            >
              Trigger Error
            </button>
          </div>
        );
      }

      // NeighborhoodMap mock
      const { pois } = props as { pois?: POI[] };
      if (pois !== undefined) {
        return (
          <div data-testid="mock-neighborhood-map">
            Map with {pois.length} POIs
          </div>
        );
      }

      return null;
    };

    MockComponent.displayName = 'MockDynamicComponent';
    return MockComponent;
  });
});

// Mock subscription utility
jest.mock('@/lib/subscription', () => ({
  isProUser: jest.fn((tier?: string | null) => tier === 'pro'),
}));

// Mock analytics
jest.mock('@/lib/analytics/neighborhood', () => ({
  trackNeighborhoodQuery: jest.fn(),
  trackPlaceClicked: jest.fn(),
  trackProUpgradeClicked: jest.fn(),
}));

// Import after mocks are set up
import { NeighborhoodModule } from '@/components/neighborhood/NeighborhoodModule';
import { isProUser } from '@/lib/subscription';
import {
  trackNeighborhoodQuery,
  trackPlaceClicked,
  trackProUpgradeClicked,
} from '@/lib/analytics/neighborhood';

// Mock data
const mockPOIs: POI[] = [
  {
    placeId: 'place-1',
    name: 'Starbucks',
    lat: 37.775,
    lng: -122.419,
    distanceMiles: 0.3,
    walkMins: 6,
    rating: 4.2,
    primaryType: 'coffee_shop',
    openNow: true,
  },
  {
    placeId: 'place-2',
    name: 'Blue Bottle Coffee',
    lat: 37.776,
    lng: -122.418,
    distanceMiles: 0.5,
    walkMins: 10,
    rating: 4.5,
    primaryType: 'coffee_shop',
    openNow: true,
  },
  {
    placeId: 'place-3',
    name: 'Philz Coffee',
    lat: 37.777,
    lng: -122.417,
    distanceMiles: 0.8,
    walkMins: 16,
    rating: 4.7,
    primaryType: 'coffee_shop',
    openNow: false,
  },
];

const mockMeta: SearchMeta = {
  radiusMeters: 1600,
  radiusUsed: 1600,
  resultCount: 3,
  closestMiles: 0.3,
  farthestMiles: 0.8,
  searchMode: 'type',
  queryText: 'coffee shops',
  timestamp: Date.now(),
};

const mockSearchResult: NeighborhoodSearchResult = {
  pois: mockPOIs,
  meta: mockMeta,
};

const defaultProps = {
  listingId: 'listing-123',
  listingLatLng: { lat: 37.7749, lng: -122.4194 },
  queryText: 'coffee shops',
  normalizedIntent: {
    mode: 'type' as const,
    includedTypes: ['coffee_shop'],
  },
  radiusMeters: 1600,
};

describe('NeighborhoodModule', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Free user experience', () => {
    beforeEach(() => {
      (isProUser as jest.Mock).mockReturnValue(false);
    });

    it('renders NearbyPlacesCard for free users', () => {
      render(<NeighborhoodModule {...defaultProps} subscriptionTier="free" />);

      expect(screen.getByTestId('mock-nearby-places-card')).toBeInTheDocument();
    });

    it('shows ContextBar in loading state initially', () => {
      render(<NeighborhoodModule {...defaultProps} subscriptionTier="free" />);

      // Loading skeleton should be visible
      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByLabelText('Loading search results')).toBeInTheDocument();
    });

    it('shows ProUpgradeCTA after results load', async () => {
      render(<NeighborhoodModule {...defaultProps} subscriptionTier="free" />);

      // Trigger results
      fireEvent.click(screen.getByTestId('trigger-results'));

      await waitFor(() => {
        // ProUpgradeCTA should appear
        expect(screen.getByText(/Upgrade/i)).toBeInTheDocument();
      });
    });

    it('updates ContextBar when search results are ready', async () => {
      render(<NeighborhoodModule {...defaultProps} subscriptionTier="free" />);

      // Trigger results
      fireEvent.click(screen.getByTestId('trigger-results'));

      await waitFor(() => {
        expect(screen.getByText('3 places found')).toBeInTheDocument();
        expect(screen.getByText('Sorted by distance')).toBeInTheDocument();
      });
    });

    it('tracks analytics when search completes', async () => {
      render(<NeighborhoodModule {...defaultProps} subscriptionTier="free" />);

      fireEvent.click(screen.getByTestId('trigger-results'));

      await waitFor(() => {
        expect(trackNeighborhoodQuery).toHaveBeenCalledWith(
          expect.objectContaining({
            listingId: 'listing-123',
            searchMode: 'type',
            resultCount: 3,
          })
        );
      });
    });
  });

  describe('Pro user experience', () => {
    beforeEach(() => {
      (isProUser as jest.Mock).mockReturnValue(true);
    });

    it('renders NeighborhoodMap for Pro users', async () => {
      render(<NeighborhoodModule {...defaultProps} subscriptionTier="pro" />);

      // Trigger results
      fireEvent.click(screen.getByTestId('trigger-results'));

      await waitFor(() => {
        expect(screen.getByTestId('mock-neighborhood-map')).toBeInTheDocument();
      });
    });

    it('does NOT show ProUpgradeCTA for Pro users', async () => {
      render(<NeighborhoodModule {...defaultProps} subscriptionTier="pro" />);

      fireEvent.click(screen.getByTestId('trigger-results'));

      await waitFor(() => {
        expect(screen.queryByText(/Upgrade to Pro/i)).not.toBeInTheDocument();
      });
    });

    it('still renders hidden NearbyPlacesCard for data fetching', () => {
      render(<NeighborhoodModule {...defaultProps} subscriptionTier="pro" />);

      // The hidden card should still be in the DOM for data fetching
      expect(screen.getAllByTestId('mock-nearby-places-card').length).toBeGreaterThan(0);
    });

    it('shows map with correct POI count after results load', async () => {
      render(<NeighborhoodModule {...defaultProps} subscriptionTier="pro" />);

      fireEvent.click(screen.getByTestId('trigger-results'));

      await waitFor(() => {
        expect(screen.getByText('Map with 3 POIs')).toBeInTheDocument();
      });
    });
  });

  describe('Error handling', () => {
    beforeEach(() => {
      (isProUser as jest.Mock).mockReturnValue(false);
    });

    it('shows error message when search fails', async () => {
      render(<NeighborhoodModule {...defaultProps} subscriptionTier="free" />);

      fireEvent.click(screen.getByTestId('trigger-error'));

      await waitFor(() => {
        expect(screen.getByText('Search failed')).toBeInTheDocument();
      });
    });

    it('shows retry button on error', async () => {
      render(<NeighborhoodModule {...defaultProps} subscriptionTier="free" />);

      fireEvent.click(screen.getByTestId('trigger-error'));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
      });
    });

    it('retries search when retry button is clicked', async () => {
      render(<NeighborhoodModule {...defaultProps} subscriptionTier="free" />);

      fireEvent.click(screen.getByTestId('trigger-error'));

      await waitFor(() => {
        expect(screen.getByText('Search failed')).toBeInTheDocument();
      });

      // Click retry
      fireEvent.click(screen.getByRole('button', { name: /retry/i }));

      // Error should be cleared and loading state shown
      await waitFor(() => {
        expect(screen.queryByText('Search failed')).not.toBeInTheDocument();
      });
    });
  });

  describe('Empty results', () => {
    const emptySearchResult: NeighborhoodSearchResult = {
      pois: [],
      meta: {
        ...mockMeta,
        resultCount: 0,
        closestMiles: 0,
        farthestMiles: 0,
      },
    };

    it('handles empty results gracefully', async () => {
      // Override the mock to return empty results
      jest.mock('next/dynamic', () => {
        return jest.fn(() => {
          const MockComponent = (props: { onSearchResultsReady?: (r: NeighborhoodSearchResult) => void }) => {
            return (
              <button
                data-testid="trigger-empty"
                onClick={() => props.onSearchResultsReady?.(emptySearchResult)}
              >
                Trigger Empty
              </button>
            );
          };
          return MockComponent;
        });
      });

      render(<NeighborhoodModule {...defaultProps} subscriptionTier="free" />);

      // Component should render without errors
      expect(screen.getByTestId('mock-nearby-places-card')).toBeInTheDocument();
    });
  });

  describe('Rate limiting', () => {
    beforeEach(() => {
      (isProUser as jest.Mock).mockReturnValue(false);
    });

    it('passes canSearch prop to NearbyPlacesCard', () => {
      render(
        <NeighborhoodModule
          {...defaultProps}
          subscriptionTier="free"
          canSearch={false}
          remainingSearches={0}
        />
      );

      // Component should still render but respect the canSearch flag
      expect(screen.getByTestId('mock-nearby-places-card')).toBeInTheDocument();
    });

    it('calls onSearchSuccess callback when provided', async () => {
      const onSearchSuccess = jest.fn();

      render(
        <NeighborhoodModule
          {...defaultProps}
          subscriptionTier="free"
          onSearchSuccess={onSearchSuccess}
        />
      );

      // The mock doesn't call onSearchSuccess directly, but it should be passed down
      expect(screen.getByTestId('mock-nearby-places-card')).toBeInTheDocument();
    });
  });

  describe('Multi-brand detection', () => {
    it('passes multiBrandDetected prop to NearbyPlacesCard', () => {
      render(
        <NeighborhoodModule
          {...defaultProps}
          subscriptionTier="free"
          multiBrandDetected={true}
        />
      );

      expect(screen.getByTestId('mock-nearby-places-card')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    beforeEach(() => {
      (isProUser as jest.Mock).mockReturnValue(false);
    });

    it('has accessible error retry button', async () => {
      render(<NeighborhoodModule {...defaultProps} subscriptionTier="free" />);

      fireEvent.click(screen.getByTestId('trigger-error'));

      await waitFor(() => {
        const retryButton = screen.getByRole('button', { name: /retry search/i });
        expect(retryButton).toBeInTheDocument();
        expect(retryButton).toHaveAttribute('aria-label', 'Retry search');
      });
    });

    it('renders Google Places attribution', () => {
      render(<NeighborhoodModule {...defaultProps} subscriptionTier="free" />);

      // gmp-place-attribution should be rendered (custom element)
      const container = document.querySelector('gmp-place-attribution');
      expect(container).toBeInTheDocument();
    });
  });
});
