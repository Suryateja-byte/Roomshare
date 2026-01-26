/**
 * LocationSearchInput - Integration Tests
 *
 * End-to-end integration tests covering complete user workflows,
 * dropdown lifecycle, click-outside behavior, and combined scenarios.
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LocationSearchInput from '@/components/LocationSearchInput';
import { clearCache } from '@/lib/geocoding-cache';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock environment variable
const MOCK_MAPBOX_TOKEN = 'pk.test_token_12345';
const originalEnv = process.env;

beforeAll(() => {
  process.env = {
    ...originalEnv,
    NEXT_PUBLIC_MAPBOX_TOKEN: MOCK_MAPBOX_TOKEN,
  };
});

afterAll(() => {
  process.env = originalEnv;
});

const mockSuggestions = [
  { id: '1', place_name: 'San Francisco, CA, USA', center: [-122.4194, 37.7749], place_type: ['place'] },
  { id: '2', place_name: 'San Jose, CA, USA', center: [-121.8863, 37.3382], place_type: ['place'] },
  { id: '3', place_name: 'San Diego, CA, USA', center: [-117.1611, 32.7157], place_type: ['place'] },
];

const mockEmptyResponse = { features: [] };

describe('LocationSearchInput - Integration Tests', () => {
  const user = userEvent.setup({ delay: null });
  const mockOnChange = jest.fn();
  const mockOnLocationSelect = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    clearCache();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ features: mockSuggestions }),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const renderInput = (props = {}) => {
    return render(
      <LocationSearchInput
        value=""
        onChange={mockOnChange}
        onLocationSelect={mockOnLocationSelect}
        {...props}
      />
    );
  };

  describe('Complete User Flow', () => {
    it('complete flow: type → select → submit', async () => {
      renderInput();
      const input = screen.getByRole('combobox');

      // User focuses input
      await user.click(input);
      expect(document.activeElement).toBe(input);

      // User types location
      await user.type(input, 'San');
      jest.advanceTimersByTime(350);

      // Dropdown opens with suggestions
      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
        expect(screen.getAllByRole('option')).toHaveLength(3);
      });

      // User navigates with keyboard
      await user.keyboard('{ArrowDown}');
      await user.keyboard('{ArrowDown}');

      // User selects with Enter
      await user.keyboard('{Enter}');

      // Callback fired with correct data
      expect(mockOnLocationSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'San Jose, CA, USA',
          lat: 37.3382,
          lng: -121.8863,
        })
      );

      // Dropdown closes
      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });
    });

    it('click selection flow', async () => {
      renderInput();
      const input = screen.getByRole('combobox');

      await user.type(input, 'San');
      jest.advanceTimersByTime(350);

      await waitFor(() => {
        expect(screen.getByText('San Diego, CA, USA')).toBeInTheDocument();
      });

      // Click on option
      await user.click(screen.getByText('San Diego, CA, USA'));

      expect(mockOnLocationSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'San Diego, CA, USA',
        })
      );

      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });
    });
  });

  describe('Dropdown Lifecycle', () => {
    it('opens on focus when there are cached suggestions', async () => {
      renderInput();
      const input = screen.getByRole('combobox');

      // First, get some suggestions cached
      await user.type(input, 'San');
      jest.advanceTimersByTime(350);

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      // Close dropdown
      await user.keyboard('{Escape}');

      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });

      // Focus input again
      await user.click(input);

      // Dropdown should reopen with cached suggestions
      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });
    });

    it('closes on blur (after delay for click events)', async () => {
      const { container } = renderInput();

      // Add another focusable element
      const button = document.createElement('button');
      button.textContent = 'Other';
      container.appendChild(button);

      const input = screen.getByRole('combobox');

      await user.type(input, 'San');
      jest.advanceTimersByTime(350);

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      // Focus another element
      await user.click(button);
      jest.advanceTimersByTime(200); // Wait for blur delay

      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });
    });
  });

  describe('Click Outside', () => {
    it('closes dropdown when clicking outside', async () => {
      const { container } = renderInput();
      const input = screen.getByRole('combobox');

      await user.type(input, 'San');
      jest.advanceTimersByTime(350);

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      // Click outside the component
      fireEvent.mouseDown(container.parentElement || document.body);

      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });
    });

    it('keeps dropdown open when clicking inside dropdown', async () => {
      renderInput();
      const input = screen.getByRole('combobox');

      await user.type(input, 'San');
      jest.advanceTimersByTime(350);

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      // Click on the listbox area (not on an option)
      const listbox = screen.getByRole('listbox');
      fireEvent.mouseDown(listbox);

      // Dropdown should still be open
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });
  });

  describe('No Results', () => {
    it('shows no results message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockEmptyResponse,
      });

      renderInput();
      const input = screen.getByRole('combobox');

      await user.type(input, 'xyznonexistent');
      jest.advanceTimersByTime(350);

      await waitFor(() => {
        expect(screen.getByText(/no results|no locations/i)).toBeInTheDocument();
      });
    });
  });

  describe('Loading State', () => {
    it('shows loading indicator while fetching', async () => {
      let resolvePromise: (value: Response) => void;
      const slowPromise = new Promise<Response>((resolve) => {
        resolvePromise = resolve;
      });

      mockFetch.mockReturnValueOnce(slowPromise);

      renderInput();
      const input = screen.getByRole('combobox');

      await user.type(input, 'San');
      jest.advanceTimersByTime(350);

      // Loading state should be visible
      await waitFor(() => {
        expect(screen.getByRole('combobox')).toHaveAttribute('aria-busy', 'true');
      });

      // Resolve the promise
      resolvePromise!({
        ok: true,
        status: 200,
        json: async () => ({ features: mockSuggestions }),
      } as Response);

      await waitFor(() => {
        expect(screen.getByRole('combobox')).toHaveAttribute('aria-busy', 'false');
      });
    });
  });

  describe('Controlled Component', () => {
    it('works as a controlled component', async () => {
      const ControlledWrapper = () => {
        const [value, setValue] = React.useState('');

        return (
          <LocationSearchInput
            value={value}
            onChange={setValue}
            onLocationSelect={mockOnLocationSelect}
          />
        );
      };

      const React = await import('react');
      render(<ControlledWrapper />);

      const input = screen.getByRole('combobox');

      await user.type(input, 'San Francisco');
      jest.advanceTimersByTime(350);

      expect(input).toHaveValue('San Francisco');
    });

    it('updates value when onLocationSelect changes it', async () => {
      let externalValue = '';
      const setExternalValue = (val: string) => {
        externalValue = val;
      };

      mockOnLocationSelect.mockImplementation((location) => {
        setExternalValue(location.name);
      });

      const { rerender } = renderInput({ value: '' });
      const input = screen.getByRole('combobox');

      await user.type(input, 'San');
      jest.advanceTimersByTime(350);

      await waitFor(() => {
        expect(screen.getByText('San Francisco, CA, USA')).toBeInTheDocument();
      });

      await user.click(screen.getByText('San Francisco, CA, USA'));

      expect(mockOnLocationSelect).toHaveBeenCalled();
      expect(externalValue).toBe('San Francisco, CA, USA');
    });
  });

  describe('Placeholder', () => {
    it('shows placeholder when empty', () => {
      renderInput({ placeholder: 'Search for a location...' });
      expect(screen.getByPlaceholderText('Search for a location...')).toBeInTheDocument();
    });
  });

  describe('Debouncing', () => {
    it('debounces API calls (300ms)', async () => {
      renderInput();
      const input = screen.getByRole('combobox');

      // Type rapidly
      await user.type(input, 'S');
      jest.advanceTimersByTime(100);
      await user.type(input, 'a');
      jest.advanceTimersByTime(100);
      await user.type(input, 'n');
      jest.advanceTimersByTime(100);

      // Should not have called API yet
      expect(mockFetch).not.toHaveBeenCalled();

      // Wait for debounce
      jest.advanceTimersByTime(350);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Mapbox Token Handling', () => {
    it('includes access token in API request', async () => {
      renderInput();
      const input = screen.getByRole('combobox');

      await user.type(input, 'San Francisco');
      jest.advanceTimersByTime(350);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('access_token=');
      expect(url).toContain(MOCK_MAPBOX_TOKEN);
    });
  });

  describe('bbox Support', () => {
    it('passes bbox when available in suggestion', async () => {
      const suggestionsWithBbox = [
        {
          id: '1',
          place_name: 'California, USA',
          center: [-119.4179, 36.7783],
          place_type: ['region'],
          bbox: [-124.4096, 32.5343, -114.1312, 42.0095],
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ features: suggestionsWithBbox }),
      });

      renderInput();
      const input = screen.getByRole('combobox');

      await user.type(input, 'California');
      jest.advanceTimersByTime(350);

      await waitFor(() => {
        expect(screen.getByText('California, USA')).toBeInTheDocument();
      });

      await user.click(screen.getByText('California, USA'));

      expect(mockOnLocationSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          bbox: [-124.4096, 32.5343, -114.1312, 42.0095],
        })
      );
    });
  });

  describe('Accessibility', () => {
    it('has proper label association', () => {
      render(
        <div>
          <label htmlFor="location-input">Location</label>
          <LocationSearchInput
            id="location-input"
            value=""
            onChange={mockOnChange}
            onLocationSelect={mockOnLocationSelect}
          />
        </div>
      );

      expect(screen.getByLabelText('Location')).toBeInTheDocument();
    });

    it('announces loading state to screen readers', async () => {
      let resolvePromise: (value: Response) => void;
      const slowPromise = new Promise<Response>((resolve) => {
        resolvePromise = resolve;
      });

      mockFetch.mockReturnValueOnce(slowPromise);

      renderInput();
      const input = screen.getByRole('combobox');

      await user.type(input, 'San');
      jest.advanceTimersByTime(350);

      // Check aria-busy
      expect(input).toHaveAttribute('aria-busy', 'true');

      resolvePromise!({
        ok: true,
        status: 200,
        json: async () => ({ features: mockSuggestions }),
      } as Response);

      await waitFor(() => {
        expect(input).toHaveAttribute('aria-busy', 'false');
      });
    });
  });

  describe('Edge Case Combinations', () => {
    it('handles rapid type → clear → type', async () => {
      renderInput();
      const input = screen.getByRole('combobox');

      await user.type(input, 'San');
      jest.advanceTimersByTime(100);
      await user.clear(input);
      await user.type(input, 'Los');
      jest.advanceTimersByTime(350);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      // Last call should be for "Los"
      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1][0] as string;
      expect(lastCall.toLowerCase()).toContain('los');
    });

    it('handles select → clear → type again', async () => {
      renderInput();
      const input = screen.getByRole('combobox');

      // First selection
      await user.type(input, 'San');
      jest.advanceTimersByTime(350);

      await waitFor(() => {
        expect(screen.getByText('San Francisco, CA, USA')).toBeInTheDocument();
      });

      await user.click(screen.getByText('San Francisco, CA, USA'));

      expect(mockOnLocationSelect).toHaveBeenCalledTimes(1);

      // Clear and search again
      await user.clear(input);
      await user.type(input, 'Los');
      jest.advanceTimersByTime(350);

      // Should be able to search again
      await waitFor(() => {
        expect(mockFetch.mock.calls.length).toBeGreaterThan(1);
      });
    });
  });
});
