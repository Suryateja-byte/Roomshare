/**
 * Unit tests for ContextBar component
 *
 * Tests the metadata display bar above search results:
 * - Result count
 * - Search radius
 * - Distance range (closest/farthest)
 * - Loading state
 * - Edge cases
 */

import { render, screen } from '@testing-library/react';
import { ContextBar } from '@/components/neighborhood/ContextBar';
import type { SearchMeta } from '@/lib/places/types';

// Mock distance utility to ensure consistent formatting
jest.mock('@/lib/geo/distance', () => ({
  formatDistance: (miles: number) => {
    if (miles < 0.1) {
      return `${Math.round(miles * 5280)} ft`;
    }
    return `${miles.toFixed(1)} mi`;
  },
}));

const baseMeta: SearchMeta = {
  radiusMeters: 1600,
  radiusUsed: 1600,
  resultCount: 5,
  closestMiles: 0.2,
  farthestMiles: 1.5,
  searchMode: 'type',
  timestamp: Date.now(),
};

describe('ContextBar', () => {
  describe('Result count display', () => {
    it('renders singular "place" for 1 result', () => {
      const meta: SearchMeta = { ...baseMeta, resultCount: 1 };
      render(<ContextBar meta={meta} />);

      expect(screen.getByText('1 place found')).toBeInTheDocument();
    });

    it('renders plural "places" for multiple results', () => {
      render(<ContextBar meta={baseMeta} />);

      expect(screen.getByText('5 places found')).toBeInTheDocument();
    });

    it('renders plural "places" for 0 results', () => {
      const meta: SearchMeta = { ...baseMeta, resultCount: 0 };
      render(<ContextBar meta={meta} />);

      expect(screen.getByText('0 places found')).toBeInTheDocument();
    });
  });

  describe('Radius display', () => {
    it('converts meters to miles for display', () => {
      // 1600 meters ≈ 1.0 miles
      render(<ContextBar meta={baseMeta} />);

      expect(screen.getByText(/Within 1\.0 mi/)).toBeInTheDocument();
    });

    it('handles larger radius correctly', () => {
      const meta: SearchMeta = { ...baseMeta, radiusUsed: 8000 }; // ~5 miles
      render(<ContextBar meta={meta} />);

      expect(screen.getByText(/Within 5\.0 mi/)).toBeInTheDocument();
    });

    it('handles small radius correctly', () => {
      const meta: SearchMeta = { ...baseMeta, radiusUsed: 400 }; // ~0.25 miles
      render(<ContextBar meta={meta} />);

      expect(screen.getByText(/Within 0\.2 mi/)).toBeInTheDocument();
    });
  });

  describe('Distance range display', () => {
    it('shows closest and farthest distances', () => {
      render(<ContextBar meta={baseMeta} />);

      // Should show range with formatted distances
      expect(screen.getByText(/0\.2 mi/)).toBeInTheDocument();
      expect(screen.getByText(/1\.5 mi/)).toBeInTheDocument();
    });

    it('shows single distance for 1 result', () => {
      const meta: SearchMeta = {
        ...baseMeta,
        resultCount: 1,
        closestMiles: 0.3,
        farthestMiles: 0.3,
      };
      render(<ContextBar meta={meta} />);

      // Should show single distance, not range
      const distanceElements = screen.getAllByText(/0\.3 mi/);
      expect(distanceElements.length).toBe(1);
    });

    it('formats short distances in feet', () => {
      const meta: SearchMeta = {
        ...baseMeta,
        closestMiles: 0.05, // 264 feet
        farthestMiles: 0.08, // 422 feet
      };
      render(<ContextBar meta={meta} />);

      expect(screen.getByText(/264 ft/)).toBeInTheDocument();
      expect(screen.getByText(/422 ft/)).toBeInTheDocument();
    });

    it('does not show distance range for 0 results', () => {
      const meta: SearchMeta = {
        ...baseMeta,
        resultCount: 0,
        closestMiles: 0,
        farthestMiles: 0,
      };
      render(<ContextBar meta={meta} />);

      expect(screen.queryByText('Sorted by distance')).not.toBeInTheDocument();
    });
  });

  describe('Sort indicator', () => {
    it('shows "Sorted by distance" when results exist', () => {
      render(<ContextBar meta={baseMeta} />);

      expect(screen.getByText('Sorted by distance')).toBeInTheDocument();
    });

    it('does not show sort indicator for 0 results', () => {
      const meta: SearchMeta = { ...baseMeta, resultCount: 0 };
      render(<ContextBar meta={meta} />);

      expect(screen.queryByText('Sorted by distance')).not.toBeInTheDocument();
    });
  });

  describe('Loading state', () => {
    it('shows loading skeleton when isLoading is true', () => {
      render(<ContextBar meta={null} isLoading={true} />);

      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByLabelText('Loading search results')).toBeInTheDocument();
    });

    it('shows skeleton elements during loading', () => {
      const { container } = render(<ContextBar meta={null} isLoading={true} />);

      // Should have animated skeleton divs
      const skeletons = container.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('does not show meta data during loading', () => {
      render(<ContextBar meta={baseMeta} isLoading={true} />);

      expect(screen.queryByText('5 places found')).not.toBeInTheDocument();
    });
  });

  describe('Null meta state', () => {
    it('returns null when meta is null and not loading', () => {
      const { container } = render(<ContextBar meta={null} isLoading={false} />);

      expect(container.firstChild).toBeNull();
    });
  });

  describe('Query text display', () => {
    it('shows query text when provided', () => {
      render(<ContextBar meta={baseMeta} queryText="coffee shops" />);

      expect(screen.getByText('"coffee shops"')).toBeInTheDocument();
    });

    it('does not show query text when not provided', () => {
      render(<ContextBar meta={baseMeta} />);

      expect(screen.queryByText(/"/)).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA role for region', () => {
      render(<ContextBar meta={baseMeta} />);

      expect(screen.getByRole('region')).toBeInTheDocument();
    });

    it('has proper aria-label for context', () => {
      render(<ContextBar meta={baseMeta} />);

      expect(screen.getByLabelText('Search results summary')).toBeInTheDocument();
    });

    it('has aria-live for dynamic updates', () => {
      const { container } = render(<ContextBar meta={baseMeta} />);

      const region = container.querySelector('[aria-live="polite"]');
      expect(region).toBeInTheDocument();
    });

    it('marks decorative separators as aria-hidden', () => {
      const { container } = render(<ContextBar meta={baseMeta} />);

      const separators = container.querySelectorAll('[aria-hidden="true"]');
      expect(separators.length).toBeGreaterThan(0);
    });

    it('has proper loading state accessibility', () => {
      render(<ContextBar meta={null} isLoading={true} />);

      const status = screen.getByRole('status');
      expect(status).toHaveAttribute('aria-label', 'Loading search results');
    });
  });

  describe('Edge cases', () => {
    it('handles same closest and farthest distance', () => {
      const meta: SearchMeta = {
        ...baseMeta,
        resultCount: 2,
        closestMiles: 0.5,
        farthestMiles: 0.5,
      };
      render(<ContextBar meta={meta} />);

      // Should still show range format even if same
      const rangeText = screen.getByText(/0\.5 mi – 0\.5 mi/);
      expect(rangeText).toBeInTheDocument();
    });

    it('handles very large result count', () => {
      const meta: SearchMeta = { ...baseMeta, resultCount: 999 };
      render(<ContextBar meta={meta} />);

      expect(screen.getByText('999 places found')).toBeInTheDocument();
    });

    it('handles very small distances', () => {
      const meta: SearchMeta = {
        ...baseMeta,
        closestMiles: 0.01, // ~53 feet
        farthestMiles: 0.02, // ~106 feet
      };
      render(<ContextBar meta={meta} />);

      expect(screen.getByText(/53 ft/)).toBeInTheDocument();
    });

    it('handles long query text with title attribute', () => {
      const longQuery = 'coffee shops near downtown with outdoor seating';
      render(<ContextBar meta={baseMeta} queryText={longQuery} />);

      const queryElement = screen.getByTitle(`Search: ${longQuery}`);
      expect(queryElement).toBeInTheDocument();
    });
  });
});
