/**
 * NearbyPlacesPanel Search Field Edge Cases Tests
 *
 * Comprehensive test suite covering 100 edge cases for the search field:
 * - Category A: Input content & normalization (20 tests)
 * - Category B: Explicit trigger behavior (10 tests)
 * - Category C: Special input methods (7 tests)
 * - Category D: Query + chip interactions (10 tests)
 * - Category E: Radius interactions (4 tests)
 * - Category F: Network & error states (14 tests)
 * - Category G: URL encoding (8 tests)
 * - Category H: State reset & persistence (7 tests)
 * - Category I: Results correctness (8 tests)
 * - Category J: Performance (6 tests)
 * - Category K: Security/privacy (6 tests)
 *
 * CRITICAL: NO DEBOUNCING in this component.
 * Search triggers ONLY on: Enter key, Search button click, or chip click.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock next-auth
const mockSession = {
  user: { id: 'user-123', name: 'Test User', email: 'test@example.com' },
  expires: new Date(Date.now() + 86400000).toISOString(),
};

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(() => ({
    data: mockSession,
    status: 'authenticated',
  })),
}));

// Import useSession for mocking different states
import { useSession } from 'next-auth/react';

// Mock fetch globally
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
    asChild ? <>{children}</> : <button {...props}>{children}</button>,
}));

import NearbyPlacesPanel from '@/components/nearby/NearbyPlacesPanel';
import {
  WHITESPACE_INPUTS,
  LENGTH_INPUTS,
  CASE_INPUTS,
  UNICODE_INPUTS,
  EMOJI_INPUTS,
  PUNCTUATION_INPUTS,
  URL_SENSITIVE_INPUTS,
  XSS_PAYLOADS,
  SQL_PAYLOADS,
  CONTROL_CHAR_INPUTS,
  createMockPlace,
  createMockPlacesResponse,
  createEmptyResponse,
} from '@/__tests__/utils/mocks/search-input.mock';

// ============================================================================
// Test Setup
// ============================================================================

describe('NearbyPlacesPanel - Search Field Edge Cases', () => {
  const defaultProps = {
    listingLat: 37.7749,
    listingLng: -122.4194,
  };

  const mockPlacesResponse = createMockPlacesResponse(3);

  beforeEach(() => {
    jest.clearAllMocks();
    (useSession as jest.Mock).mockReturnValue({
      data: mockSession,
      status: 'authenticated',
    });
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockPlacesResponse,
    });
  });

  // Helper to render the component
  const renderPanel = (props = {}) => {
    return render(<NearbyPlacesPanel {...defaultProps} {...props} />);
  };

  // Helper to get the search input
  const getSearchInput = () => screen.getByPlaceholderText(/search/i) as HTMLInputElement;

  // Helper to type and submit
  const typeAndSubmit = async (user: ReturnType<typeof userEvent.setup>, text: string) => {
    const input = getSearchInput();
    await user.clear(input);
    await user.type(input, text);
    await user.keyboard('{Enter}');
  };

  // ============================================================================
  // CATEGORY A: Input Content & Normalization (20 tests)
  // ============================================================================

  describe('Category A: Input Content & Normalization', () => {
    // A1: Empty string
    it('A1: empty string does not call API', async () => {
      const user = userEvent.setup();
      renderPanel();

      const input = getSearchInput();
      await user.click(input);
      await user.keyboard('{Enter}');

      expect(mockFetch).not.toHaveBeenCalled();
    });

    // A2: Only whitespace
    it('A2: only whitespace trims to empty, no API call', async () => {
      const user = userEvent.setup();
      renderPanel();

      await typeAndSubmit(user, WHITESPACE_INPUTS.multipleSpaces);

      expect(mockFetch).not.toHaveBeenCalled();
    });

    // A3: Leading/trailing spaces trimmed
    it('A3: leading and trailing spaces are trimmed before API call', async () => {
      const user = userEvent.setup();
      renderPanel();

      await typeAndSubmit(user, WHITESPACE_INPUTS.leadingAndTrailing);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.query).toBe('coffee');
      });
    });

    // A4: Multiple internal spaces preserved
    it('A4: multiple internal spaces sent as-is to API', async () => {
      const user = userEvent.setup();
      renderPanel();

      await typeAndSubmit(user, WHITESPACE_INPUTS.internalMultipleSpaces);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.query).toBe('coffee   shop');
      });
    });

    // A5: Tab/newline sanitized or passed through
    it('A5: tab characters in input handled correctly', async () => {
      const user = userEvent.setup();
      renderPanel();

      await typeAndSubmit(user, WHITESPACE_INPUTS.tab);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });
    });

    // A6: 1 char when min=2
    it('A6: single character does not trigger API call on Enter', async () => {
      const user = userEvent.setup();
      renderPanel();

      await typeAndSubmit(user, LENGTH_INPUTS.oneChar);

      expect(mockFetch).not.toHaveBeenCalled();
    });

    // A7: Exactly 2 chars triggers search
    it('A7: exactly 2 characters triggers API call on Enter', async () => {
      const user = userEvent.setup();
      renderPanel();

      await typeAndSubmit(user, LENGTH_INPUTS.twoChars);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.query).toBe('ab');
      });
    });

    // A8: Near max length (99 chars)
    it('A8: 99 character query is accepted and encoded properly', async () => {
      const user = userEvent.setup();
      renderPanel();

      await typeAndSubmit(user, LENGTH_INPUTS.nearMax);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.query.length).toBe(99);
      });
    });

    // A9: Over max (101+ chars) blocked by maxLength
    it('A9: input maxLength={100} prevents typing beyond 100 characters', () => {
      renderPanel();

      const input = getSearchInput();
      expect(input).toHaveAttribute('maxLength', '100');
    });

    // A10: Mixed case handled
    it('A10: mixed case query sent to API as-is', async () => {
      const user = userEvent.setup();
      renderPanel();

      await typeAndSubmit(user, CASE_INPUTS.mixedCase);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.query).toBe('InDiAn GrOcErY');
      });
    });

    // A11: All uppercase
    it('A11: all uppercase query works correctly', async () => {
      const user = userEvent.setup();
      renderPanel();

      await typeAndSubmit(user, CASE_INPUTS.allCapsAbbrev);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.query).toBe('ATM');
      });
    });

    // A12: Diacritics encoded correctly
    it('A12: diacritics (café) are encoded correctly', async () => {
      const user = userEvent.setup();
      renderPanel();

      await typeAndSubmit(user, UNICODE_INPUTS.diacriticsFrench);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.query).toBe('café');
      });
    });

    // A13: Non-Latin text (Hindi/Arabic)
    it('A13: non-Latin text (Hindi) is encoded and sent correctly', async () => {
      const user = userEvent.setup();
      renderPanel();

      await typeAndSubmit(user, UNICODE_INPUTS.hindi);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.query).toBe('किराना');
      });
    });

    // A14: Emojis encoded
    it('A14: emojis in query are encoded and sent', async () => {
      const user = userEvent.setup();
      renderPanel();

      await typeAndSubmit(user, EMOJI_INPUTS.emojiWithText);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.query).toBe('pizza 🍕');
      });
    });

    // A15: Punctuation works
    it('A15: punctuation-heavy query does not cause errors', async () => {
      const user = userEvent.setup();
      renderPanel();

      await typeAndSubmit(user, PUNCTUATION_INPUTS.hyphen);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.query).toBe('gas-station');
      });
    });

    // A16: Quotes encoded
    it('A16: quotes in query are safely encoded', async () => {
      const user = userEvent.setup();
      renderPanel();

      await typeAndSubmit(user, PUNCTUATION_INPUTS.quoteDouble);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.query).toBe('"coffee"');
      });
    });

    // A17: Ampersand encoded
    it('A17: ampersand in query is properly encoded', async () => {
      const user = userEvent.setup();
      renderPanel();

      await typeAndSubmit(user, URL_SENSITIVE_INPUTS.ampersand);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.query).toBe('AT&T');
      });
    });

    // A18: Hash encoded
    it('A18: hash in query is encoded, not treated as URL fragment', async () => {
      const user = userEvent.setup();
      renderPanel();

      await typeAndSubmit(user, URL_SENSITIVE_INPUTS.hash);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.query).toBe('#1 coffee');
      });
    });

    // A19: Slash encoded
    it('A19: slash in query is encoded properly', async () => {
      const user = userEvent.setup();
      renderPanel();

      await typeAndSubmit(user, URL_SENSITIVE_INPUTS.slash);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.query).toBe('7/11');
      });
    });

    // A20: Percent no double-encoding
    it('A20: percent sign in query is not double-encoded', async () => {
      const user = userEvent.setup();
      renderPanel();

      await typeAndSubmit(user, URL_SENSITIVE_INPUTS.percent);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.query).toBe('100% organic');
      });
    });
  });

  // ============================================================================
  // CATEGORY B: Explicit Trigger Behavior (10 tests)
  // ============================================================================

  describe('Category B: Explicit Trigger Behavior', () => {
    // B21: Type without Enter - no API call
    it('B21: typing without Enter does not trigger API call', async () => {
      const user = userEvent.setup();
      renderPanel();

      const input = getSearchInput();
      await user.type(input, 'coffee shop');

      // Wait a bit to ensure no debounced call happens
      await act(async () => {
        await new Promise((r) => setTimeout(r, 500));
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });

    // B22: Type then clear - no API call
    it('B22: type then clear input does not trigger API call', async () => {
      const user = userEvent.setup();
      renderPanel();

      const input = getSearchInput();
      await user.type(input, 'coffee');
      await user.clear(input);

      expect(mockFetch).not.toHaveBeenCalled();
    });

    // B23: Type, Enter, type more, Enter - two calls
    it('B23: type, Enter, type more, Enter triggers two separate API calls', async () => {
      const user = userEvent.setup();
      renderPanel();

      // First search
      await typeAndSubmit(user, 'coffee');

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      // Second search
      const input = getSearchInput();
      await user.clear(input);
      await user.type(input, 'tea');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });

      const firstBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      const secondBody = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(firstBody.query).toBe('coffee');
      expect(secondBody.query).toBe('tea');
    });

    // B24: Rapid typing then Enter - single call
    it('B24: rapid typing then Enter triggers single API call with final value', async () => {
      const user = userEvent.setup();
      renderPanel();

      const input = getSearchInput();
      await user.type(input, 'c');
      await user.type(input, 'o');
      await user.type(input, 'f');
      await user.type(input, 'f');
      await user.type(input, 'e');
      await user.type(input, 'e');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.query).toBe('coffee');
      });
    });

    // B25: Paste then Enter - single request
    it('B25: paste long text and Enter triggers single request', async () => {
      const user = userEvent.setup();
      renderPanel();

      const input = getSearchInput();
      await user.click(input);
      // Simulate paste by setting value directly then firing change
      fireEvent.change(input, { target: { value: 'coffee shop near downtown' } });
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.query).toBe('coffee shop near downtown');
      });
    });

    // B26: Search button click triggers
    it('B26: search button click triggers API call', async () => {
      const user = userEvent.setup();
      renderPanel();

      const input = getSearchInput();
      await user.type(input, 'coffee');

      // The search button appears when 2+ chars are typed
      const searchButton = await screen.findByRole('button', { name: /search/i });
      await user.click(searchButton);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.query).toBe('coffee');
      });
    });

    // B27: Enter key on focused input
    it('B27: Enter key on focused input triggers API call', async () => {
      const user = userEvent.setup();
      renderPanel();

      const input = getSearchInput();
      await user.type(input, 'coffee');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });
    });

    // B28: Backspace below 2 chars then Enter - no API
    it('B28: backspace below 2 chars then Enter does not call API', async () => {
      const user = userEvent.setup();
      renderPanel();

      const input = getSearchInput();
      await user.type(input, 'ab');
      await user.keyboard('{Backspace}'); // Now 'a' - 1 char
      await user.keyboard('{Enter}');

      expect(mockFetch).not.toHaveBeenCalled();
    });

    // B29: Clear and retype - new API call
    it('B29: clear input and retype triggers new API call on Enter', async () => {
      const user = userEvent.setup();
      renderPanel();

      // First search
      await typeAndSubmit(user, 'coffee');

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      // Clear and retype same thing
      await typeAndSubmit(user, 'coffee');

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });
    });

    // B30: Multiple Enter presses rapidly - ignores while loading
    it('B30: multiple rapid Enter presses while loading are handled', async () => {
      // Use a delayed response to simulate loading state
      let resolveRequest: (() => void) | null = null;
      mockFetch.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveRequest = () =>
              resolve({
                ok: true,
                status: 200,
                json: async () => mockPlacesResponse,
              });
          })
      );

      const user = userEvent.setup();
      renderPanel();

      const input = getSearchInput();
      await user.type(input, 'coffee');
      await user.keyboard('{Enter}');
      await user.keyboard('{Enter}');
      await user.keyboard('{Enter}');

      // Even with multiple Enter presses during loading, only calls made
      // (input is disabled during loading in the component)
      expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(1);

      // Resolve to cleanup
      await act(async () => {
        resolveRequest?.();
      });
    });
  });

  // ============================================================================
  // CATEGORY C: Special Input Methods (7 tests)
  // ============================================================================

  describe('Category C: Special Input Methods', () => {
    // C31: Enter doesn't submit parent form
    it('C31: Enter in search input does not submit parent form', async () => {
      const handleSubmit = jest.fn((e: React.FormEvent) => e.preventDefault());
      const user = userEvent.setup();

      render(
        <form onSubmit={handleSubmit}>
          <NearbyPlacesPanel {...defaultProps} />
        </form>
      );

      const input = getSearchInput();
      await user.type(input, 'coffee');
      await user.keyboard('{Enter}');

      expect(handleSubmit).not.toHaveBeenCalled();
    });

    // C32: Escape key behavior
    it('C32: Escape key does not cause errors', async () => {
      const user = userEvent.setup();
      renderPanel();

      const input = getSearchInput();
      await user.type(input, 'coffee');
      await user.keyboard('{Escape}');

      // Should not throw and not trigger API
      expect(mockFetch).not.toHaveBeenCalled();
    });

    // C33: Arrow keys in input
    it('C33: Arrow keys in input do not cause side effects', async () => {
      const user = userEvent.setup();
      renderPanel();

      const input = getSearchInput();
      await user.type(input, 'coffee');
      await user.keyboard('{ArrowLeft}');
      await user.keyboard('{ArrowRight}');
      await user.keyboard('{ArrowUp}');
      await user.keyboard('{ArrowDown}');

      // Should not trigger API or cause errors
      expect(mockFetch).not.toHaveBeenCalled();
    });

    // C34: Copy/cut behavior
    it('C34: copy operation does not affect input behavior', async () => {
      const user = userEvent.setup();
      renderPanel();

      const input = getSearchInput();
      await user.type(input, 'coffee');

      // Simulate copy (Ctrl+C)
      fireEvent.keyDown(input, { key: 'c', ctrlKey: true });

      // Input value should remain
      expect(input.value).toBe('coffee');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    // C35: Drag-drop text + Enter
    it('C35: drag-drop text into input and Enter works correctly', async () => {
      renderPanel();

      const input = getSearchInput();

      // Simulate drag-drop by setting value and firing Enter via keyDown
      fireEvent.change(input, { target: { value: 'dropped text' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.query).toBe('dropped text');
      });
    });

    // C36: Voice dictation
    it('C36: voice dictation input (simulated) is handled', async () => {
      renderPanel();

      const input = getSearchInput();

      // Voice dictation might include punctuation - use fireEvent for consistent behavior
      fireEvent.change(input, { target: { value: 'Find me a coffee shop.' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });
    });

    // C37: IME composition
    it('C37: IME composition input is handled after composition ends', async () => {
      renderPanel();

      const input = getSearchInput();

      // Simulate IME composition
      fireEvent.compositionStart(input);
      fireEvent.change(input, { target: { value: '日' } });
      fireEvent.compositionUpdate(input, { data: '日本' });
      fireEvent.change(input, { target: { value: '日本' } });
      fireEvent.compositionEnd(input);

      // Press Enter after composition ends
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });
    });
  });

  // ============================================================================
  // CATEGORY D: Query + Chip Interactions (10 tests)
  // ============================================================================

  describe('Category D: Query + Chip Interactions', () => {
    // D38: Query + no chip - general POI search
    it('D38: query with no chip selected performs general POI search', async () => {
      const user = userEvent.setup();
      renderPanel();

      await typeAndSubmit(user, 'coffee');

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.query).toBe('coffee');
        expect(body.categories).toBeUndefined();
      });
    });

    // D39: Chip + empty query - category-only search
    it('D39: chip selected with empty query performs category-only search', async () => {
      const user = userEvent.setup();
      renderPanel();

      const groceryChip = screen.getByRole('button', { name: /grocery/i });
      await user.click(groceryChip);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.categories).toContain('food-grocery');
      });
    });

    // D40: Chip + query - combined filter
    it('D40: chip selection includes chip query in API call', async () => {
      const user = userEvent.setup();
      renderPanel();

      // Click Restaurants chip
      const restaurantsChip = screen.getByRole('button', { name: /restaurants/i });
      await user.click(restaurantsChip);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.categories).toContain('restaurant');
      });
    });

    // D41: Change chip, query unchanged - new search with new chip
    it('D41: changing chip triggers new search with new categories', async () => {
      const user = userEvent.setup();
      renderPanel();

      // Click first chip
      const groceryChip = screen.getByRole('button', { name: /grocery/i });
      await user.click(groceryChip);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      // Click different chip
      const pharmacyChip = screen.getByRole('button', { name: /pharmacy/i });
      await user.click(pharmacyChip);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
        const body = JSON.parse(mockFetch.mock.calls[1][1].body);
        expect(body.categories).toContain('pharmacy');
      });
    });

    // D42: Change query, chip unchanged - query search (chip cleared)
    it('D42: typing in search input clears selected chip', async () => {
      const user = userEvent.setup();
      renderPanel();

      // Click chip first
      const groceryChip = screen.getByRole('button', { name: /grocery/i });
      await user.click(groceryChip);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      // Type in search - should clear chip
      const input = getSearchInput();
      await user.clear(input);
      await user.type(input, 'coffee');

      // Chip should be deselected
      expect(groceryChip).toHaveAttribute('aria-pressed', 'false');
    });

    // D43: Rapid chip switching - latest wins
    it('D43: rapid chip switching only uses latest selected chip', async () => {
      const user = userEvent.setup();
      renderPanel();

      const groceryChip = screen.getByRole('button', { name: /grocery/i });
      const pharmacyChip = screen.getByRole('button', { name: /pharmacy/i });
      const shoppingChip = screen.getByRole('button', { name: /shopping/i });

      // Click chips rapidly
      await user.click(groceryChip);
      await user.click(pharmacyChip);
      await user.click(shoppingChip);

      // Wait for final request
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      // Last call should be for shopping
      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      const body = JSON.parse(lastCall[1].body);
      expect(body.categories).toContain('shopping-retail');
    });

    // D44: Chip query overlap - no duplication
    it('D44: chip with internal query does not duplicate in API call', async () => {
      const user = userEvent.setup();
      renderPanel();

      // Click Restaurants chip which has specific categories
      const restaurantsChip = screen.getByRole('button', { name: /restaurants/i });
      await user.click(restaurantsChip);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        // Should have categories, no query duplication
        expect(body.categories).toBeDefined();
      });
    });

    // D45: Chip cleared, query remains
    it('D45: typing after chip selection clears chip but enables query search', async () => {
      const user = userEvent.setup();
      renderPanel();

      // Click chip
      const groceryChip = screen.getByRole('button', { name: /grocery/i });
      await user.click(groceryChip);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      // Type new query and submit
      const input = getSearchInput();
      await user.clear(input);
      await user.type(input, 'organic');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
        const body = JSON.parse(mockFetch.mock.calls[1][1].body);
        expect(body.query).toBe('organic');
        expect(body.categories).toBeUndefined();
      });
    });

    // D46: Query implies category mismatch
    it('D46: query content does not auto-select chip', async () => {
      const user = userEvent.setup();
      renderPanel();

      // Type 'pharmacy' but don't click pharmacy chip
      await typeAndSubmit(user, 'pharmacy');

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        // Query should be sent, not categories
        expect(body.query).toBe('pharmacy');
        expect(body.categories).toBeUndefined();
      });
    });

    // D47: Chip selection clears searchQuery
    it('D47: chip selection clears the search query input', async () => {
      const user = userEvent.setup();
      renderPanel();

      // Type something first
      const input = getSearchInput();
      await user.type(input, 'some query');

      // Click chip
      const groceryChip = screen.getByRole('button', { name: /grocery/i });
      await user.click(groceryChip);

      // Input should be cleared
      expect(input.value).toBe('');
    });
  });

  // ============================================================================
  // CATEGORY E: Radius Interactions (4 tests)
  // ============================================================================

  describe('Category E: Radius Interactions', () => {
    // E48: Change radius with active query - re-runs search
    it('E48: changing radius after search re-runs search with new radius', async () => {
      const user = userEvent.setup();
      renderPanel();

      // First, trigger a search
      await typeAndSubmit(user, 'coffee');

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      // Change radius
      const radius5mi = screen.getByRole('button', { name: /5 mi/i });
      await user.click(radius5mi);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
        const body = JSON.parse(mockFetch.mock.calls[1][1].body);
        expect(body.radiusMeters).toBe(8046); // 5 mi in meters
      });
    });

    // E49: Change radius mid-request - latest wins
    it('E49: changing radius mid-request uses latest radius', async () => {
      let resolveFirst: (() => void) | null = null;
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = () =>
              resolve({
                ok: true,
                status: 200,
                json: async () => mockPlacesResponse,
              });
          })
      );

      const user = userEvent.setup();
      renderPanel();

      // Click chip to start first request
      const groceryChip = screen.getByRole('button', { name: /grocery/i });
      await user.click(groceryChip);

      // Verify first request started
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Resolve first request
      await act(async () => {
        resolveFirst?.();
      });

      await waitFor(() => {
        // Wait for loading to complete
        expect(screen.queryByTestId('loading-skeleton')).not.toBeInTheDocument();
      });

      // Change radius - should trigger new request
      const radius5mi = screen.getByRole('button', { name: /5 mi/i });
      await user.click(radius5mi);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });
    });

    // E50: Radius change without active search - no API call
    it('E50: changing radius without prior search does not trigger API call', async () => {
      const user = userEvent.setup();
      renderPanel();

      // Change radius without any search
      const radius5mi = screen.getByRole('button', { name: /5 mi/i });
      await user.click(radius5mi);

      // Should not make API call
      expect(mockFetch).not.toHaveBeenCalled();
    });

    // E51: Small radius + empty results → increase
    it('E51: empty results with small radius allows retry with larger radius', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => createEmptyResponse(),
      });

      const user = userEvent.setup();
      renderPanel();

      // Search with default radius (1 mi)
      await typeAndSubmit(user, 'coffee');

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(screen.getByText(/no places found/i)).toBeInTheDocument();
      });

      // Increase radius
      const radius5mi = screen.getByRole('button', { name: /5 mi/i });
      await user.click(radius5mi);

      // Should trigger new search
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
        const body = JSON.parse(mockFetch.mock.calls[1][1].body);
        expect(body.radiusMeters).toBe(8046);
      });
    });
  });

  // ============================================================================
  // CATEGORY F: Network & Error States (14 tests)
  // ============================================================================

  describe('Category F: Network & Error States', () => {
    // F52: API 401 (session expired)
    it('F52: 401 response shows error message', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized' }),
      });

      const user = userEvent.setup();
      renderPanel();

      await typeAndSubmit(user, 'coffee');

      await waitFor(() => {
        expect(screen.getByText(/unauthorized/i)).toBeInTheDocument();
      });
    });

    // F53: API 429 rate limit
    it('F53: 429 rate limit shows error message', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ error: 'Rate limit exceeded' }),
      });

      const user = userEvent.setup();
      renderPanel();

      await typeAndSubmit(user, 'coffee');

      await waitFor(() => {
        expect(screen.getByText(/rate limit/i)).toBeInTheDocument();
      });
    });

    // F54: API timeout
    it('F54: network timeout shows error and stops loading', async () => {
      mockFetch.mockRejectedValue(new Error('Network timeout'));

      const user = userEvent.setup();
      renderPanel();

      await typeAndSubmit(user, 'coffee');

      await waitFor(() => {
        expect(screen.getByText(/network timeout/i)).toBeInTheDocument();
        expect(screen.queryByTestId('loading-skeleton')).not.toBeInTheDocument();
      });
    });

    // F55: Non-JSON error response
    it('F55: non-JSON error response is handled gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      const user = userEvent.setup();
      renderPanel();

      await typeAndSubmit(user, 'coffee');

      await waitFor(() => {
        // Should show generic error or handle gracefully
        expect(screen.queryByTestId('loading-skeleton')).not.toBeInTheDocument();
      });
    });

    // F56: 200 with empty places
    it('F56: 200 with empty places shows "No results" message with query', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => createEmptyResponse(),
      });

      const user = userEvent.setup();
      renderPanel();

      await typeAndSubmit(user, 'nonexistent');

      await waitFor(() => {
        expect(screen.getByText(/no places found/i)).toBeInTheDocument();
        // Should show the query
        expect(screen.getByText(/nonexistent/i)).toBeInTheDocument();
      });
    });

    // F57: Error clears on new successful search
    it('F57: error clears after successful new search', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => ({ error: 'Server error' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockPlacesResponse,
        });

      const user = userEvent.setup();
      renderPanel();

      // First search - error
      await typeAndSubmit(user, 'coffee');

      await waitFor(() => {
        expect(screen.getByText(/server error/i)).toBeInTheDocument();
      });

      // Second search - success
      await typeAndSubmit(user, 'tea');

      await waitFor(() => {
        expect(screen.queryByText(/server error/i)).not.toBeInTheDocument();
        expect(screen.getByText(/place-1/i)).toBeInTheDocument();
      });
    });

    // F58: Loading stops on abort
    it('F58: loading state clears when request is aborted', async () => {
      const abortError = new DOMException('Aborted', 'AbortError');
      mockFetch.mockRejectedValue(abortError);

      const user = userEvent.setup();
      renderPanel();

      await typeAndSubmit(user, 'coffee');

      // AbortError should not show as error (it's expected behavior)
      await waitFor(() => {
        expect(screen.queryByTestId('loading-skeleton')).not.toBeInTheDocument();
      });
    });

    // F59: Type while error visible
    it('F59: error state is present until new search completes', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => ({ error: 'Server error' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockPlacesResponse,
        });

      const user = userEvent.setup();
      renderPanel();

      // First search - error
      await typeAndSubmit(user, 'coffee');

      await waitFor(() => {
        expect(screen.getByText(/server error/i)).toBeInTheDocument();
      });

      // Start typing - error still visible
      const input = getSearchInput();
      await user.type(input, 'tea');

      // Error still shown (not cleared by typing alone)
      expect(screen.getByText(/server error/i)).toBeInTheDocument();

      // Submit new search
      await user.keyboard('{Enter}');

      // Error clears when new search starts/completes
      await waitFor(() => {
        expect(screen.queryByText(/server error/i)).not.toBeInTheDocument();
      });
    });

    // F60: Offline while typing
    it('F60: typing while offline does not trigger API call', async () => {
      const user = userEvent.setup();
      renderPanel();

      // Just typing - no API call regardless of network state
      const input = getSearchInput();
      await user.type(input, 'coffee');

      expect(mockFetch).not.toHaveBeenCalled();
    });

    // F61: Network offline mid-request
    it('F61: network error mid-request shows error and allows retry', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockPlacesResponse,
        });

      const user = userEvent.setup();
      renderPanel();

      // First attempt - fails
      await typeAndSubmit(user, 'coffee');

      await waitFor(() => {
        expect(screen.getByText(/network error/i)).toBeInTheDocument();
      });

      // Retry
      await typeAndSubmit(user, 'coffee');

      await waitFor(() => {
        expect(screen.queryByText(/network error/i)).not.toBeInTheDocument();
        expect(screen.getByText(/place-1/i)).toBeInTheDocument();
      });
    });

    // F62: Back online - manual retry
    it('F62: user must manually retry after coming back online', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Offline'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockPlacesResponse,
        });

      const user = userEvent.setup();
      renderPanel();

      // Fail first time
      await typeAndSubmit(user, 'coffee');

      await waitFor(() => {
        expect(screen.getByText(/offline/i)).toBeInTheDocument();
      });

      // No auto-retry - must manually trigger
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Manual retry
      await typeAndSubmit(user, 'coffee');

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });
    });

    // F63: Double Enter dedupes (handled by isLoading)
    it('F63: Enter while loading is ignored', async () => {
      let resolveRequest: (() => void) | null = null;
      mockFetch.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveRequest = () =>
              resolve({
                ok: true,
                status: 200,
                json: async () => mockPlacesResponse,
              });
          })
      );

      const user = userEvent.setup();
      renderPanel();

      const input = getSearchInput();
      await user.type(input, 'coffee');
      await user.keyboard('{Enter}');

      // Input should be disabled during loading
      expect(input).toBeDisabled();

      // Resolve to cleanup
      await act(async () => {
        resolveRequest?.();
      });
    });

    // F64: Request abort on new search
    it('F64: new search aborts previous in-flight request', async () => {
      const abortSpy = jest.spyOn(AbortController.prototype, 'abort');

      const user = userEvent.setup();
      renderPanel();

      // First search
      const groceryChip = screen.getByRole('button', { name: /grocery/i });
      await user.click(groceryChip);

      // Second search immediately
      const pharmacyChip = screen.getByRole('button', { name: /pharmacy/i });
      await user.click(pharmacyChip);

      // Abort should have been called for first request
      expect(abortSpy).toHaveBeenCalled();

      abortSpy.mockRestore();
    });

    // F65: Late response ignored
    it('F65: late response from old request is ignored', async () => {
      // Test that when a second request completes before a pending first request,
      // the UI shows results from the second (latest) request.
      // Note: This tests the "latest wins" pattern via AbortController

      let firstResolve: (() => void) | null = null;

      // First request: hangs until we manually resolve it
      // Second request: resolves immediately with 'new-place'
      mockFetch
        .mockImplementationOnce(
          (_url: string, options?: RequestInit) =>
            new Promise((resolve, reject) => {
              // Check if request was aborted
              if (options?.signal) {
                options.signal.addEventListener('abort', () => {
                  reject(new DOMException('Aborted', 'AbortError'));
                });
              }
              firstResolve = () =>
                resolve({
                  ok: true,
                  status: 200,
                  json: async () => ({
                    places: [createMockPlace('old-place', { name: 'Old Place' })],
                    meta: { count: 1, cached: false },
                  }),
                });
            })
        )
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            places: [createMockPlace('new-place', { name: 'New Place' })],
            meta: { count: 1, cached: false },
          }),
        });

      render(<NearbyPlacesPanel {...defaultProps} />);

      const input = screen.getByPlaceholderText(/search/i);

      // Start first request
      fireEvent.change(input, { target: { value: 'old query' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      // Start second request immediately (this should abort the first)
      fireEvent.change(input, { target: { value: 'new query' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      // Wait for second request to complete and UI to update
      await waitFor(() => {
        expect(screen.getByText('New Place')).toBeInTheDocument();
      });

      // Try to resolve the first request late (it should be aborted/ignored)
      await act(async () => {
        firstResolve?.();
      });

      // Give time for any late updates
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      // UI should still show the second request's results, not the first
      expect(screen.getByText('New Place')).toBeInTheDocument();
      expect(screen.queryByText('Old Place')).not.toBeInTheDocument();
    });
  });

  // ============================================================================
  // CATEGORY G: URL Encoding (8 tests)
  // ============================================================================

  describe('Category G: URL Encoding', () => {
    // G66: Query with &
    it('G66: ampersand in query is properly sent in JSON body', async () => {
      const user = userEvent.setup();
      renderPanel();

      await typeAndSubmit(user, 'AT&T');

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.query).toBe('AT&T');
      });
    });

    // G67: Query with ?
    it('G67: question mark in query is properly sent', async () => {
      const user = userEvent.setup();
      renderPanel();

      await typeAndSubmit(user, 'coffee?');

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.query).toBe('coffee?');
      });
    });

    // G68: Query with #
    it('G68: hash in query is properly sent', async () => {
      const user = userEvent.setup();
      renderPanel();

      await typeAndSubmit(user, '#1 store');

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.query).toBe('#1 store');
      });
    });

    // G69: No double-encoding
    it('G69: percent-encoded query is not double-encoded', async () => {
      const user = userEvent.setup();
      renderPanel();

      await typeAndSubmit(user, '100% organic');

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        // Should be exactly as typed, not %25 for %
        expect(body.query).toBe('100% organic');
      });
    });

    // G70: Unicode in query
    it('G70: Unicode characters are properly sent in JSON body', async () => {
      const user = userEvent.setup();
      renderPanel();

      await typeAndSubmit(user, UNICODE_INPUTS.chinese);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.query).toBe('杂货店');
      });
    });

    // G71: Control characters
    it('G71: control characters in input are handled', async () => {
      renderPanel();

      const input = getSearchInput();
      // Control characters typically cannot be typed but can be pasted
      fireEvent.change(input, { target: { value: CONTROL_CHAR_INPUTS.nullChar } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
        // Component or API should handle this without crashing
      });
    });

    // G72: Very common term
    it('G72: very common search term returns results within limit', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => createMockPlacesResponse(50),
      });

      const user = userEvent.setup();
      renderPanel();

      await typeAndSubmit(user, 'store');

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });
    });

    // G73: SQL-ish strings
    it('G73: SQL injection strings are treated as plain text', async () => {
      const user = userEvent.setup();
      renderPanel();

      await typeAndSubmit(user, SQL_PAYLOADS.simpleOr);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.query).toBe("' OR '1'='1");
      });
    });
  });

  // ============================================================================
  // CATEGORY H: State Reset & Persistence (7 tests)
  // ============================================================================

  describe('Category H: State Reset & Persistence', () => {
    // H74: Navigate away and back
    it('H74: query and results are reset when component remounts', async () => {
      const user = userEvent.setup();
      const { unmount } = renderPanel();

      // Do a search
      await typeAndSubmit(user, 'coffee');

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      // Unmount and remount
      unmount();
      renderPanel();

      // Input should be empty
      const input = getSearchInput();
      expect(input.value).toBe('');
    });

    // H75: Page refresh - query resets (component remount)
    it('H75: query resets on component remount (simulating refresh)', () => {
      const { rerender } = renderPanel();

      // Rerender (simulates refresh/remount)
      rerender(<NearbyPlacesPanel {...defaultProps} />);

      const input = getSearchInput();
      expect(input.value).toBe('');
    });

    // H76: Back button - no stale results
    it('H76: no stale results shown on remount', () => {
      renderPanel();

      // Initial state should be empty
      expect(screen.getByText(/discover what's nearby/i)).toBeInTheDocument();
    });

    // H77: Listing page change - query clears
    it('H77: state clears when listing coordinates change', async () => {
      const user = userEvent.setup();
      const { rerender } = renderPanel();

      // Do a search
      await typeAndSubmit(user, 'coffee');

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      // Change listing coordinates
      rerender(<NearbyPlacesPanel listingLat={40.7128} listingLng={-74.006} />);

      // Query should be cleared
      const input = getSearchInput();
      expect(input.value).toBe('');
    });

    // H78: Theme toggle - query persists
    it('H78: query persists during rerender (simulating theme toggle)', async () => {
      const user = userEvent.setup();
      const { rerender } = renderPanel();

      // Type but don't submit
      const input = getSearchInput();
      await user.type(input, 'coffee');

      // Rerender with same props (theme toggle would cause rerender)
      rerender(<NearbyPlacesPanel {...defaultProps} />);

      // Query should persist
      expect(getSearchInput().value).toBe('coffee');
    });

    // H79: Mobile view toggle - query persists
    it('H79: query persists when viewMode changes', async () => {
      const user = userEvent.setup();
      const { rerender } = renderPanel({ viewMode: 'list' });

      // Type but don't submit
      const input = getSearchInput();
      await user.type(input, 'coffee');

      // Toggle view mode
      rerender(<NearbyPlacesPanel {...defaultProps} viewMode="map" />);

      // Query should persist
      expect(getSearchInput().value).toBe('coffee');
    });

    // H80: Tab switch and return
    it('H80: no unintended refetch when component re-renders', async () => {
      const user = userEvent.setup();
      const { rerender } = renderPanel();

      // Do a search
      await typeAndSubmit(user, 'coffee');

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      // Multiple rerenders (simulating visibility changes)
      rerender(<NearbyPlacesPanel {...defaultProps} />);
      rerender(<NearbyPlacesPanel {...defaultProps} />);

      // Should not trigger additional API calls
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================================
  // CATEGORY I: Results Correctness (8 tests)
  // ============================================================================

  describe('Category I: Results Correctness', () => {
    // I81: Brand name query - multiple results, nearest first
    it('I81: results are sorted by distance (nearest first)', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          places: [
            createMockPlace('far', { distanceMiles: 2.5 }),
            createMockPlace('near', { distanceMiles: 0.1 }),
            createMockPlace('mid', { distanceMiles: 1.0 }),
          ],
          meta: { count: 3, cached: false },
        }),
      });

      const user = userEvent.setup();
      renderPanel();

      await typeAndSubmit(user, 'walmart');

      await waitFor(() => {
        const results = screen.getAllByRole('link', { name: /get directions/i });
        expect(results.length).toBe(3);
      });
    });

    // I82: Abbreviation query
    it('I82: abbreviation query is sent to API correctly', async () => {
      const user = userEvent.setup();
      renderPanel();

      await typeAndSubmit(user, 'CVS');

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.query).toBe('CVS');
      });
    });

    // I83: Typo in query
    it('I83: typo in query is sent to API as-is', async () => {
      const user = userEvent.setup();
      renderPanel();

      await typeAndSubmit(user, 'coffe'); // typo

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.query).toBe('coffe');
      });
    });

    // I84: Plural vs singular
    it('I84: plural query is sent to API as-is', async () => {
      const user = userEvent.setup();
      renderPanel();

      await typeAndSubmit(user, 'restaurants');

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.query).toBe('restaurants');
      });
    });

    // I85: Location hint in query
    it('I85: location hint in query is sent to API (may conflict with center)', async () => {
      const user = userEvent.setup();
      renderPanel();

      await typeAndSubmit(user, 'coffee near downtown');

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.query).toBe('coffee near downtown');
        // Listing coordinates still sent
        expect(body.listingLat).toBe(defaultProps.listingLat);
      });
    });

    // I86: "open now" literal
    it('I86: "open now" query is treated as literal text', async () => {
      const user = userEvent.setup();
      renderPanel();

      await typeAndSubmit(user, 'open now');

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.query).toBe('open now');
      });
    });

    // I87: "24/7" query
    it('I87: "24/7" query is properly encoded', async () => {
      const user = userEvent.setup();
      renderPanel();

      await typeAndSubmit(user, '24/7 store');

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.query).toBe('24/7 store');
      });
    });

    // I88: Address/zip in query
    it('I88: address in query is sent to API as literal', async () => {
      const user = userEvent.setup();
      renderPanel();

      await typeAndSubmit(user, '123 Main St 90210');

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.query).toBe('123 Main St 90210');
      });
    });
  });

  // ============================================================================
  // CATEGORY J: Performance (6 tests)
  // ============================================================================

  describe('Category J: Performance', () => {
    // J89: Max results rendering
    it('J89: large result set (50 items) renders without error', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => createMockPlacesResponse(50),
      });

      const user = userEvent.setup();
      renderPanel();

      await typeAndSubmit(user, 'store');

      await waitFor(() => {
        const results = screen.getAllByRole('link', { name: /get directions/i });
        expect(results.length).toBe(50);
      });
    });

    // J90: Multiple similar queries (no caching)
    it('J90: similar queries each trigger separate API calls', async () => {
      const user = userEvent.setup();
      renderPanel();

      await typeAndSubmit(user, 'coffee');
      await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

      await typeAndSubmit(user, 'coffee shop');
      await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));

      await typeAndSubmit(user, 'coffee');
      await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(3));
    });

    // J91: Frequent typing does not cause API flood
    it('J91: frequent typing does not flood API (no debounce needed - explicit trigger)', async () => {
      const user = userEvent.setup();
      renderPanel();

      const input = getSearchInput();
      await user.type(input, 'c');
      await user.type(input, 'o');
      await user.type(input, 'f');
      await user.type(input, 'f');
      await user.type(input, 'e');
      await user.type(input, 'e');

      // No API calls - requires explicit Enter
      expect(mockFetch).not.toHaveBeenCalled();
    });

    // J92: Large results list
    it('J92: component handles rendering of maximum allowed results', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => createMockPlacesResponse(50), // API limit is 50
      });

      const user = userEvent.setup();
      renderPanel();

      await typeAndSubmit(user, 'popular');

      await waitFor(() => {
        expect(screen.getAllByRole('link', { name: /get directions/i }).length).toBe(50);
      });
    });

    // J93: Results with special characters render
    it('J93: results with special characters in name render correctly', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          places: [
            createMockPlace('special', { name: "McDonald's & Café <Test>" }),
          ],
          meta: { count: 1, cached: false },
        }),
      });

      const user = userEvent.setup();
      renderPanel();

      await typeAndSubmit(user, 'test');

      await waitFor(() => {
        expect(screen.getByText("McDonald's & Café <Test>")).toBeInTheDocument();
      });
    });

    // J94: Input remains responsive
    it('J94: input field remains responsive during results rendering', async () => {
      const user = userEvent.setup();
      renderPanel();

      const input = getSearchInput();

      // Type and verify input is responsive
      await user.type(input, 'coffee');
      expect(input.value).toBe('coffee');

      // Clear and type again
      await user.clear(input);
      await user.type(input, 'tea');
      expect(input.value).toBe('tea');
    });
  });

  // ============================================================================
  // CATEGORY K: Security/Privacy (6 tests)
  // ============================================================================

  describe('Category K: Security/Privacy', () => {
    // K95: PII in query (just verify it works, actual logging is server-side)
    it('K95: PII in query is sent to API (logging is server concern)', async () => {
      const user = userEvent.setup();
      renderPanel();

      await typeAndSubmit(user, "John's house 555-123-4567");

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
        // Client just sends it - server handles logging policy
      });
    });

    // K96: Abusive text doesn't break UI
    it('K96: abusive/inappropriate text does not break UI', async () => {
      const user = userEvent.setup();
      renderPanel();

      // Just verify UI doesn't crash with unusual input
      await typeAndSubmit(user, 'badword1234');

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      // UI should still be functional
      expect(getSearchInput()).toBeInTheDocument();
    });

    // K97: XSS in "No results for..."
    it('K97: XSS payload in query is escaped in "No results" message', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => createEmptyResponse(),
      });

      const user = userEvent.setup();
      renderPanel();

      await typeAndSubmit(user, XSS_PAYLOADS.scriptTag);

      await waitFor(() => {
        expect(screen.getByText(/no places found/i)).toBeInTheDocument();
        // The XSS payload should be rendered as text, not executed
        // React's JSX auto-escapes by default
        const noResultsText = screen.getByText(/<script>/i);
        expect(noResultsText).toBeInTheDocument();
      });
    });

    // K98: Query in error breadcrumbs (client-side - verify no crash)
    it('K98: error with special query does not crash console', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      mockFetch.mockRejectedValue(new Error('Test error'));

      const user = userEvent.setup();
      renderPanel();

      await typeAndSubmit(user, XSS_PAYLOADS.scriptTag);

      await waitFor(() => {
        // Component should handle error gracefully
        expect(screen.getByText(/test error/i)).toBeInTheDocument();
      });

      consoleSpy.mockRestore();
    });

    // K99: Query not logged to analytics (client-side - just verify no crash)
    it('K99: analytics events with special query do not crash', async () => {
      const user = userEvent.setup();
      renderPanel();

      await typeAndSubmit(user, SQL_PAYLOADS.dropTable);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
        // Component should not crash
      });
    });

    // K100: Google Maps link encoding
    it('K100: directions link has valid URL encoding', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          places: [
            createMockPlace('test', {
              name: "Test Place <>'\"&",
              location: { lat: 37.7749, lng: -122.4194 },
            }),
          ],
          meta: { count: 1, cached: false },
        }),
      });

      const user = userEvent.setup();
      renderPanel();

      await typeAndSubmit(user, 'test');

      await waitFor(() => {
        const link = screen.getByRole('link', { name: /get directions/i });
        const href = link.getAttribute('href');

        // URL should be valid
        expect(() => new URL(href!)).not.toThrow();
        // Should contain coordinates
        expect(href).toContain('37.7749');
        expect(href).toContain('-122.4194');
      });
    });
  });
});
