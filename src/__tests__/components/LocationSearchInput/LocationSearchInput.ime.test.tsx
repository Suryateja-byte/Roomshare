/**
 * LocationSearchInput - IME Composition Tests
 *
 * Tests Input Method Editor handling for CJK (Chinese, Japanese, Korean) input.
 * Ensures API is not called during composition and fires after compositionend.
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LocationSearchInput from '@/components/LocationSearchInput';

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

describe('LocationSearchInput - IME Composition', () => {
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

  describe('Composition Events', () => {
    it('does not fetch during composition', async () => {
      renderInput();
      const input = screen.getByRole('combobox');

      // Start IME composition
      fireEvent.compositionStart(input);

      // Type partial composition characters (simulating IME)
      fireEvent.change(input, { target: { value: '東' } });
      jest.advanceTimersByTime(350);

      // Should NOT fetch during composition
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('fetches after compositionEnd', async () => {
      renderInput();
      const input = screen.getByRole('combobox');

      // Start composition
      fireEvent.compositionStart(input);

      // Type during composition
      fireEvent.change(input, { target: { value: '東京' } });

      // End composition
      fireEvent.compositionEnd(input, { currentTarget: { value: '東京' } });
      jest.advanceTimersByTime(350);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(decodeURIComponent(url)).toContain('東京');
    });

    it('handles rapid composition cancel and restart', async () => {
      renderInput();
      const input = screen.getByRole('combobox');

      // First composition - cancelled
      fireEvent.compositionStart(input);
      fireEvent.change(input, { target: { value: '東' } });
      fireEvent.compositionEnd(input, { currentTarget: { value: '' } });
      jest.advanceTimersByTime(100);

      // Second composition
      fireEvent.compositionStart(input);
      fireEvent.change(input, { target: { value: '大阪' } });
      fireEvent.compositionEnd(input, { currentTarget: { value: '大阪' } });
      jest.advanceTimersByTime(350);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      // Should have fetched with the final value
      const lastUrl = mockFetch.mock.calls[mockFetch.mock.calls.length - 1][0] as string;
      expect(decodeURIComponent(lastUrl)).toContain('大阪');
    });

    it('handles Japanese hiragana to kanji conversion', async () => {
      renderInput();
      const input = screen.getByRole('combobox');

      // Simulate typical Japanese IME flow:
      // User types "tokyo" in romaji
      // IME shows ひらがな (hiragana): とうきょう
      // User selects kanji: 東京
      fireEvent.compositionStart(input);
      fireEvent.change(input, { target: { value: 'と' } });
      fireEvent.change(input, { target: { value: 'とう' } });
      fireEvent.change(input, { target: { value: 'とうきょう' } });

      // No fetch yet
      jest.advanceTimersByTime(350);
      expect(mockFetch).not.toHaveBeenCalled();

      // User selects kanji
      fireEvent.compositionEnd(input, { currentTarget: { value: '東京' } });
      jest.advanceTimersByTime(350);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });
    });

    it('handles Chinese pinyin input', async () => {
      renderInput();
      const input = screen.getByRole('combobox');

      // Simulate Chinese pinyin input:
      // User types "beijing"
      // IME shows: 北京
      fireEvent.compositionStart(input);
      fireEvent.change(input, { target: { value: 'b' } });
      fireEvent.change(input, { target: { value: 'bei' } });
      fireEvent.change(input, { target: { value: 'beij' } });
      fireEvent.change(input, { target: { value: 'beijing' } });

      // Still in composition, no fetch
      jest.advanceTimersByTime(350);
      expect(mockFetch).not.toHaveBeenCalled();

      // User selects the character
      fireEvent.compositionEnd(input, { currentTarget: { value: '北京' } });
      jest.advanceTimersByTime(350);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(decodeURIComponent(url)).toContain('北京');
    });

    it('handles Korean Hangul composition', async () => {
      renderInput();
      const input = screen.getByRole('combobox');

      // Simulate Korean input:
      // User types ㅅㅓㅇㅜㄹ which becomes 서울
      fireEvent.compositionStart(input);
      fireEvent.change(input, { target: { value: 'ㅅ' } });
      fireEvent.change(input, { target: { value: '서' } });
      fireEvent.change(input, { target: { value: '서우' } });
      fireEvent.change(input, { target: { value: '서울' } });

      jest.advanceTimersByTime(350);
      expect(mockFetch).not.toHaveBeenCalled();

      fireEvent.compositionEnd(input, { currentTarget: { value: '서울' } });
      jest.advanceTimersByTime(350);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(decodeURIComponent(url)).toContain('서울');
    });

    it('allows normal typing after composition ends', async () => {
      renderInput();
      const input = screen.getByRole('combobox');

      // Complete one composition
      fireEvent.compositionStart(input);
      fireEvent.change(input, { target: { value: '東京' } });
      fireEvent.compositionEnd(input, { currentTarget: { value: '東京' } });
      jest.advanceTimersByTime(350);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      // Now type normally (Latin characters)
      fireEvent.change(input, { target: { value: '東京 station' } });
      jest.advanceTimersByTime(350);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });

      const lastUrl = mockFetch.mock.calls[1][0] as string;
      expect(decodeURIComponent(lastUrl)).toContain('東京');
      expect(lastUrl.toLowerCase()).toContain('station');
    });

    it('does not show type-more hint during composition', async () => {
      renderInput();
      const input = screen.getByRole('combobox');

      // Start composition with single character
      fireEvent.compositionStart(input);
      fireEvent.change(input, { target: { value: '東' } });

      // Should not show "type more" hint during composition
      // (since we don't know if user is done)
      expect(screen.queryByText(/type at least 2 characters/i)).not.toBeInTheDocument();
    });
  });

  describe('Mixed Input Modes', () => {
    it('handles switching between IME and direct input', async () => {
      renderInput();
      const input = screen.getByRole('combobox');

      // Start with direct input
      await userEvent.type(input, 'Tokyo ');
      jest.advanceTimersByTime(350);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });
      const firstCallCount = mockFetch.mock.calls.length;

      // Switch to IME
      fireEvent.compositionStart(input);
      fireEvent.change(input, { target: { value: 'Tokyo 駅' } });
      fireEvent.compositionEnd(input, { currentTarget: { value: 'Tokyo 駅' } });
      jest.advanceTimersByTime(350);

      await waitFor(() => {
        expect(mockFetch.mock.calls.length).toBeGreaterThan(firstCallCount);
      });
    });
  });
});
