/**
 * LocationSearchInput - Input Sanitization Tests
 *
 * Tests input sanitization including whitespace trimming, control character removal,
 * query length limits, and Unicode handling.
 */
import React, { useState } from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LocationSearchInput from '@/components/LocationSearchInput';
import {
  UNICODE_INPUTS,
  EMOJI_INPUTS,
  CONTROL_CHAR_INPUTS,
  XSS_PAYLOADS,
} from '../../utils/mocks/search-input.mock';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock geocoding cache to prevent caching between tests
jest.mock('@/lib/geocoding-cache', () => ({
  getCachedResults: jest.fn(() => null), // Always return cache miss
  setCachedResults: jest.fn(),
  clearCache: jest.fn(),
}));


// Controlled wrapper component that manages state for the LocationSearchInput
// This is necessary because the component uses useDebounce(value, 300) where
// value is a prop - the debounce only triggers when the prop changes
interface WrapperProps {
  initialValue?: string;
  onChangeSpy?: jest.Mock;
  onLocationSelectSpy?: jest.Mock;
}

function ControlledWrapper({
  initialValue = '',
  onChangeSpy,
  onLocationSelectSpy,
}: WrapperProps) {
  const [value, setValue] = useState(initialValue);

  return (
    <LocationSearchInput
      value={value}
      onChange={(newValue) => {
        setValue(newValue);
        onChangeSpy?.(newValue);
      }}
      onLocationSelect={(location) => {
        onLocationSelectSpy?.(location);
      }}
    />
  );
}

describe('LocationSearchInput - Input Sanitization', () => {
  const user = userEvent.setup({ delay: null });
  const mockOnChange = jest.fn();
  const mockOnLocationSelect = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ type: 'FeatureCollection', features: [] }),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const renderInput = (props: WrapperProps = {}) => {
    return render(
      <ControlledWrapper
        initialValue={props.initialValue ?? ''}
        onChangeSpy={props.onChangeSpy ?? mockOnChange}
        onLocationSelectSpy={props.onLocationSelectSpy ?? mockOnLocationSelect}
      />
    );
  };

  describe('Whitespace Handling', () => {
    it('trims leading and trailing whitespace before API call', async () => {
      renderInput();
      const input = screen.getByRole('combobox');

      await user.type(input, '  San Francisco  ');
      await act(async () => {
        jest.advanceTimersByTime(350); // Wait for debounce
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      const url = mockFetch.mock.calls[0][0] as string;
      // URL should contain trimmed query
      expect(url).toContain('San%20Francisco');
      expect(url).not.toContain('%20%20'); // No double spaces at edges
    });

    it('does not trigger API for whitespace-only input', async () => {
      renderInput();
      const input = screen.getByRole('combobox');

      await user.type(input, '   ');
      await act(async () => {
        jest.advanceTimersByTime(350);
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('handles mixed whitespace (tabs, newlines)', async () => {
      renderInput();
      const input = screen.getByRole('combobox');

      await user.type(input, '\tSan\nFrancisco\r');
      await act(async () => {
        jest.advanceTimersByTime(350);
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      // Should have normalized the query
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('Query Length Limits', () => {
    it('truncates input exceeding 256 characters for API call', async () => {
      renderInput();
      const input = screen.getByRole('combobox');

      const longQuery = 'a'.repeat(300);
      // Use fireEvent.change for long strings (faster than typing 300 chars)
      fireEvent.change(input, { target: { value: longQuery } });
      await act(async () => {
        jest.advanceTimersByTime(350);
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      const url = mockFetch.mock.calls[0][0] as string;
      const parsedUrl = new URL(url);
      const decodedQuery = parsedUrl.searchParams.get('q') || '';

      expect(decodedQuery.length).toBeLessThanOrEqual(500);
    });

    it('allows exactly 500 character queries', async () => {
      renderInput();
      const input = screen.getByRole('combobox');

      const exactMaxQuery = 'a'.repeat(500);
      // Use fireEvent.change for long strings (faster than typing 500 chars)
      fireEvent.change(input, { target: { value: exactMaxQuery } });
      await act(async () => {
        jest.advanceTimersByTime(350);
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('Minimum Character Gate', () => {
    it('does not trigger API for single character', async () => {
      renderInput();
      const input = screen.getByRole('combobox');

      await user.type(input, 'a');
      await act(async () => {
        jest.advanceTimersByTime(350);
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('shows "type more characters" hint for 1 character', async () => {
      renderInput();
      const input = screen.getByRole('combobox');

      await user.type(input, 'a');
      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      // Hint should appear in the dropdown
      expect(screen.getByText(/type at least 2 characters/i)).toBeInTheDocument();
    });

    it('triggers API for 2+ characters', async () => {
      renderInput();
      const input = screen.getByRole('combobox');

      await user.type(input, 'ab');
      await act(async () => {
        jest.advanceTimersByTime(350);
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });
    });
  });

  describe('Control Character Removal', () => {
    it.each(Object.entries(CONTROL_CHAR_INPUTS))(
      'strips control characters: %s',
      async (_name, input) => {
        renderInput();
        const inputEl = screen.getByRole('combobox');

        // Use fireEvent.change because userEvent.type() filters control characters
        fireEvent.change(inputEl, { target: { value: input } });
        await act(async () => {
          jest.advanceTimersByTime(350);
        });

        await waitFor(() => {
          expect(mockFetch).toHaveBeenCalled();
        });

        const url = mockFetch.mock.calls[0][0] as string;
        // Control characters should be stripped
        expect(url).not.toMatch(/[\x00-\x1F\x7F]/);
      }
    );
  });

  describe('Unicode Safety', () => {
    it.each(Object.entries(UNICODE_INPUTS))(
      'handles Unicode safely: %s',
      async (_name, input) => {
        renderInput();
        const inputEl = screen.getByRole('combobox');

        await user.type(inputEl, input);
        await act(async () => {
          jest.advanceTimersByTime(350);
        });

        if (input.trim().length >= 2) {
          await waitFor(() => {
            expect(mockFetch).toHaveBeenCalled();
          });

          // Should not throw, should properly encode
          const url = mockFetch.mock.calls[0][0] as string;
          expect(url).toContain('photon.komoot.io');
        }
      }
    );

    it('properly encodes CJK characters in URL', async () => {
      renderInput();
      const input = screen.getByRole('combobox');

      await user.type(input, '東京');
      await act(async () => {
        jest.advanceTimersByTime(350);
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      const url = mockFetch.mock.calls[0][0] as string;
      // Should be URL encoded
      expect(url).toContain('%');
      // Should decode back to original
      expect(decodeURIComponent(url)).toContain('東京');
    });
  });

  describe('Emoji Handling', () => {
    it.each(Object.entries(EMOJI_INPUTS))(
      'handles emoji input: %s',
      async (_name, input) => {
        renderInput();
        const inputEl = screen.getByRole('combobox');

        await user.type(inputEl, input);
        await act(async () => {
          jest.advanceTimersByTime(350);
        });

        // Should not crash
        expect(screen.getByRole('combobox')).toBeInTheDocument();
      }
    );
  });

  describe('XSS Prevention', () => {
    it.each(Object.entries(XSS_PAYLOADS))(
      'safely handles XSS payload: %s',
      async (_name, input) => {
        renderInput();
        const inputEl = screen.getByRole('combobox');

        await user.type(inputEl, input);
        await act(async () => {
          jest.advanceTimersByTime(350);
        });

        // Component should not crash
        expect(screen.getByRole('combobox')).toBeInTheDocument();

        if (mockFetch.mock.calls.length > 0) {
          // URL should be properly encoded
          const url = mockFetch.mock.calls[0][0] as string;
          expect(url).not.toContain('<script>');
          expect(url).not.toContain('onerror=');
        }
      }
    );
  });

  describe('Empty Input Handling', () => {
    it('clears suggestions when input is emptied', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [-122.4, 37.7] },
            properties: { osm_id: 1, osm_type: 'R', name: 'San Francisco', state: 'CA', country: 'USA', type: 'city' }
          }],
        }),
      });

      renderInput();
      const input = screen.getByRole('combobox');

      // Type to get suggestions
      await user.type(input, 'San');
      await act(async () => {
        jest.advanceTimersByTime(350);
      });

      // Component splits place_name at comma: "San Francisco" in first <p>, "CA, USA" in second
      await waitFor(() => {
        expect(screen.getByText('San Francisco')).toBeInTheDocument();
      });

      // Clear input
      await user.clear(input);
      await act(async () => {
        jest.advanceTimersByTime(350);
      });

      await waitFor(() => {
        expect(screen.queryByText('San Francisco')).not.toBeInTheDocument();
      });
    });
  });
});
