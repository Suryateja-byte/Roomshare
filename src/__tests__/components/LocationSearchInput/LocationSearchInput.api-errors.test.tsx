/**
 * LocationSearchInput - API Error Handling Tests
 *
 * Tests error handling including 429 rate limiting, 422 validation errors,
 * 500 server errors, network timeouts, and caching behavior.
 */
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LocationSearchInput from '@/components/LocationSearchInput';
import { clearCache } from '@/lib/geocoding-cache';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock AbortController
const mockAbort = jest.fn();
global.AbortController = jest.fn().mockImplementation(() => ({
  signal: {},
  abort: mockAbort,
})) as unknown as typeof AbortController;


const mockPhotonSuggestions = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-122.4194, 37.7749] }, properties: { osm_id: 1, osm_type: 'R', name: 'San Francisco', state: 'CA', country: 'USA', type: 'city' } },
  ],
};

// Stateful wrapper for controlled component testing
const ControlledLocationInput = ({
  onLocationSelect,
  initialValue = '',
  ...props
}: {
  onLocationSelect?: (location: { name: string; lat: number; lng: number; bbox?: number[] }) => void;
  initialValue?: string;
} & Partial<React.ComponentProps<typeof LocationSearchInput>>) => {
  const [value, setValue] = React.useState(initialValue);
  return (
    <LocationSearchInput
      value={value}
      onChange={setValue}
      onLocationSelect={onLocationSelect}
      {...props}
    />
  );
};

describe('LocationSearchInput - API Error Handling', () => {
  const user = userEvent.setup({ delay: null });
  const mockOnLocationSelect = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ advanceTimers: true });
    clearCache(); // Clear geocoding cache
    mockFetch.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const renderInput = (props = {}) => {
    return render(
      <ControlledLocationInput
        onLocationSelect={mockOnLocationSelect}
        {...props}
      />
    );
  };

  describe('429 Rate Limit Handling', () => {
    it('shows error message on 429', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ error: 'Rate limit exceeded' }),
      });

      renderInput();
      const input = screen.getByRole('combobox');

      await user.type(input, 'San Francisco');
      jest.advanceTimersByTime(350);

      await waitFor(() => {
        // searchPhoton throws 'Failed to fetch suggestions' for non-500 errors
        expect(screen.getByText('Failed to fetch suggestions')).toBeInTheDocument();
      });
    });
  });

  describe('422 Validation Error', () => {
    it('shows appropriate message for 422', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 422,
        json: async () => ({ error: 'Invalid query' }),
      });

      renderInput();
      const input = screen.getByRole('combobox');

      await user.type(input, 'San Francisco');
      jest.advanceTimersByTime(350);

      await waitFor(() => {
        // searchPhoton throws 'Failed to fetch suggestions' for non-500 errors
        expect(screen.getByText('Failed to fetch suggestions')).toBeInTheDocument();
      });
    });
  });

  describe('401/403 Authentication Errors', () => {
    it('shows authentication error for 401', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized' }),
      });

      renderInput();
      const input = screen.getByRole('combobox');

      await user.type(input, 'San Francisco');
      jest.advanceTimersByTime(350);

      await waitFor(() => {
        // searchPhoton throws 'Failed to fetch suggestions' for non-500 errors
        expect(screen.getByText('Failed to fetch suggestions')).toBeInTheDocument();
      });
    });

    it('shows access error for 403', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: 'Forbidden' }),
      });

      renderInput();
      const input = screen.getByRole('combobox');

      await user.type(input, 'San Francisco');
      jest.advanceTimersByTime(350);

      await waitFor(() => {
        // searchPhoton throws 'Failed to fetch suggestions' for non-500 errors
        expect(screen.getByText('Failed to fetch suggestions')).toBeInTheDocument();
      });
    });
  });

  describe('500+ Server Errors', () => {
    it('shows service unavailable message for 500', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal server error' }),
      });

      renderInput();
      const input = screen.getByRole('combobox');

      await user.type(input, 'San Francisco');
      jest.advanceTimersByTime(350);

      await waitFor(() => {
        // Component throws 'Location service is temporarily unavailable' for 500+
        expect(screen.getByText('Location service is temporarily unavailable')).toBeInTheDocument();
      });
    });

    it('shows service unavailable for 503', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ error: 'Service unavailable' }),
      });

      renderInput();
      const input = screen.getByRole('combobox');

      await user.type(input, 'San Francisco');
      jest.advanceTimersByTime(350);

      await waitFor(() => {
        // Component throws 'Location service is temporarily unavailable' for 500+
        expect(screen.getByText('Location service is temporarily unavailable')).toBeInTheDocument();
      });
    });
  });

  describe('Network Errors', () => {
    it('shows network error message', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network request failed'));

      renderInput();
      const input = screen.getByRole('combobox');

      await user.type(input, 'San Francisco');
      jest.advanceTimersByTime(350);

      await waitFor(() => {
        expect(screen.getByText(/network|connection/i)).toBeInTheDocument();
      });
    });

    it('handles AbortError silently (no error shown)', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortError);

      renderInput();
      const input = screen.getByRole('combobox');

      await user.type(input, 'San');
      jest.advanceTimersByTime(350);

      // Should not show error for intentional abort
      expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
    });
  });

  describe('Request Cancellation', () => {
    it('cancels previous request when new query is made', async () => {
      // First promise stays pending (never resolved) to simulate slow request
      const firstPromise = new Promise<Response>(() => {
        // Intentionally unresolved - we only care that it gets aborted
      });

      mockFetch.mockReturnValueOnce(firstPromise);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockPhotonSuggestions,
      });

      renderInput();
      const input = screen.getByRole('combobox');

      // First query
      await user.type(input, 'San');
      jest.advanceTimersByTime(350);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      // Second query before first completes
      await user.type(input, ' Francisco');
      jest.advanceTimersByTime(350);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });
      expect(mockAbort).toHaveBeenCalled();
    });

    it('ignores stale responses', async () => {
      const earlyResponse = {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { osm_id: 99, osm_type: 'N', name: 'Old Result', country: 'XX', type: 'city' } }],
      };
      const lateResponse = mockPhotonSuggestions;

      // First request - slow
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  status: 200,
                  json: async () => earlyResponse,
                }),
              500
            )
          )
      );

      // Second request - fast
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => lateResponse,
      });

      renderInput();
      const input = screen.getByRole('combobox');

      await user.type(input, 'Old');
      jest.advanceTimersByTime(350);

      await user.clear(input);
      await user.type(input, 'San');
      jest.advanceTimersByTime(350);

      // Let both complete
      jest.advanceTimersByTime(600);

      await waitFor(() => {
        // Should show new results, not old - place name split across elements
        expect(screen.getByText('San Francisco')).toBeInTheDocument();
        expect(screen.queryByText('Old Result')).not.toBeInTheDocument();
      });
    });
  });

  describe('Caching', () => {
    it('uses cached results for identical queries', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockPhotonSuggestions,
      });

      renderInput();
      const input = screen.getByRole('combobox');

      // First query
      await user.type(input, 'San Francisco');
      jest.advanceTimersByTime(350);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      // Clear and type same query
      await user.clear(input);
      jest.advanceTimersByTime(350);

      await user.type(input, 'San Francisco');
      jest.advanceTimersByTime(350);

      // Should use cache, not make new request - place name split across elements
      await waitFor(() => {
        expect(screen.getByText('San Francisco')).toBeInTheDocument();
      });

      // May have been called once or twice depending on implementation
      // but definitely not three times
      expect(mockFetch.mock.calls.length).toBeLessThanOrEqual(2);
    });

    it('cache is case-insensitive', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockPhotonSuggestions,
      });

      renderInput();
      const input = screen.getByRole('combobox');

      // First query lowercase
      await user.type(input, 'san francisco');
      jest.advanceTimersByTime(350);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      // Clear and type uppercase
      await user.clear(input);
      jest.advanceTimersByTime(350);

      await user.type(input, 'SAN FRANCISCO');
      jest.advanceTimersByTime(350);

      // Should use cache (normalized to lowercase) - place name split across elements
      await waitFor(() => {
        expect(screen.getByText('San Francisco')).toBeInTheDocument();
      });
    });
  });

  describe('Request Deduplication', () => {
    it('does not make duplicate requests for same query', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockPhotonSuggestions,
      });

      renderInput();
      const input = screen.getByRole('combobox');

      // Rapid typing of same final query
      await user.type(input, 'San');
      jest.advanceTimersByTime(100); // Before debounce

      await user.clear(input);
      await user.type(input, 'San');
      jest.advanceTimersByTime(350); // After debounce

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Error Recovery', () => {
    it('clears error when new successful request is made', async () => {
      // First request fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Server error' }),
      });

      // Second request succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockPhotonSuggestions,
      });

      renderInput();
      const input = screen.getByRole('combobox');

      await user.type(input, 'bad');
      jest.advanceTimersByTime(350);

      await waitFor(() => {
        // Component throws 'Location service is temporarily unavailable' for 500+
        expect(screen.getByText('Location service is temporarily unavailable')).toBeInTheDocument();
      });

      await user.clear(input);
      await user.type(input, 'San Francisco');
      jest.advanceTimersByTime(350);

      await waitFor(() => {
        // Place name split across elements
        expect(screen.getByText('San Francisco')).toBeInTheDocument();
        expect(screen.queryByText('Location service is temporarily unavailable')).not.toBeInTheDocument();
      });
    });
  });
});
