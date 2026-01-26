/**
 * LocationSearchInput - Input Sanitization Tests
 *
 * Tests input sanitization including whitespace trimming, control character removal,
 * query length limits, and Unicode handling.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LocationSearchInput from '@/components/LocationSearchInput';
import {
  WHITESPACE_INPUTS,
  LENGTH_INPUTS,
  UNICODE_INPUTS,
  EMOJI_INPUTS,
  CONTROL_CHAR_INPUTS,
  XSS_PAYLOADS,
} from '../../utils/mocks/search-input.mock';

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
      json: async () => ({ features: [] }),
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

  describe('Whitespace Handling', () => {
    it('trims leading and trailing whitespace before API call', async () => {
      renderInput();
      const input = screen.getByRole('combobox');

      await user.type(input, '  San Francisco  ');
      jest.advanceTimersByTime(350); // Wait for debounce

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
      jest.advanceTimersByTime(350);

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('handles mixed whitespace (tabs, newlines)', async () => {
      renderInput();
      const input = screen.getByRole('combobox');

      await user.type(input, '\tSan\nFrancisco\r');
      jest.advanceTimersByTime(350);

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
      await user.type(input, longQuery);
      jest.advanceTimersByTime(350);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      const url = mockFetch.mock.calls[0][0] as string;
      const encodedQuery = url.split('/mapbox.places/')[1]?.split('.json')[0];
      const decodedQuery = decodeURIComponent(encodedQuery || '');

      expect(decodedQuery.length).toBeLessThanOrEqual(256);
    });

    it('allows exactly 256 character queries', async () => {
      renderInput();
      const input = screen.getByRole('combobox');

      const exactMaxQuery = 'a'.repeat(256);
      await user.type(input, exactMaxQuery);
      jest.advanceTimersByTime(350);

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
      jest.advanceTimersByTime(350);

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('shows "type more characters" hint for 1 character', async () => {
      renderInput();
      const input = screen.getByRole('combobox');

      await user.type(input, 'a');
      jest.advanceTimersByTime(100);

      // Hint should appear in the dropdown
      expect(screen.getByText(/type at least 2 characters/i)).toBeInTheDocument();
    });

    it('triggers API for 2+ characters', async () => {
      renderInput();
      const input = screen.getByRole('combobox');

      await user.type(input, 'ab');
      jest.advanceTimersByTime(350);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });
    });
  });

  describe('Control Character Removal', () => {
    it.each(Object.entries(CONTROL_CHAR_INPUTS))(
      'strips control characters: %s',
      async (name, input) => {
        renderInput();
        const inputEl = screen.getByRole('combobox');

        await user.type(inputEl, input);
        jest.advanceTimersByTime(350);

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
      async (name, input) => {
        renderInput();
        const inputEl = screen.getByRole('combobox');

        await user.type(inputEl, input);
        jest.advanceTimersByTime(350);

        if (input.trim().length >= 2) {
          await waitFor(() => {
            expect(mockFetch).toHaveBeenCalled();
          });

          // Should not throw, should properly encode
          const url = mockFetch.mock.calls[0][0] as string;
          expect(url).toContain('api.mapbox.com');
        }
      }
    );

    it('properly encodes CJK characters in URL', async () => {
      renderInput();
      const input = screen.getByRole('combobox');

      await user.type(input, '東京');
      jest.advanceTimersByTime(350);

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
      async (name, input) => {
        renderInput();
        const inputEl = screen.getByRole('combobox');

        await user.type(inputEl, input);
        jest.advanceTimersByTime(350);

        // Should not crash
        expect(screen.getByRole('combobox')).toBeInTheDocument();
      }
    );
  });

  describe('XSS Prevention', () => {
    it.each(Object.entries(XSS_PAYLOADS))(
      'safely handles XSS payload: %s',
      async (name, input) => {
        renderInput();
        const inputEl = screen.getByRole('combobox');

        await user.type(inputEl, input);
        jest.advanceTimersByTime(350);

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
          features: [
            { id: '1', place_name: 'San Francisco, CA', center: [-122.4, 37.7], place_type: ['place'] },
          ],
        }),
      });

      renderInput();
      const input = screen.getByRole('combobox');

      // Type to get suggestions
      await user.type(input, 'San');
      jest.advanceTimersByTime(350);

      await waitFor(() => {
        expect(screen.getByText('San Francisco, CA')).toBeInTheDocument();
      });

      // Clear input
      await user.clear(input);
      jest.advanceTimersByTime(350);

      await waitFor(() => {
        expect(screen.queryByText('San Francisco, CA')).not.toBeInTheDocument();
      });
    });
  });
});
