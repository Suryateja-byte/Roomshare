/**
 * Tests for NearbyPlacesPanel component
 * TDD: These tests are written before implementation
 *
 * CRITICAL COMPLIANCE TEST: No API call on mount
 *
 * @see Plan Category D - Search UX & State Sync (22 tests)
 * @see Plan Category F - Directions & Links (7 tests)
 * @see Plan Category H - Accessibility (6 tests)
 */

import { render, screen, waitFor, act, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NearbyPlacesPanel from '@/components/nearby/NearbyPlacesPanel'
import { CATEGORY_CHIPS, RADIUS_OPTIONS } from '@/types/nearby'

// Mock fetch
const mockFetch = jest.fn()
global.fetch = mockFetch

// Mock useSession
const mockSession = {
  data: {
    user: {
      id: 'user-123',
      name: 'Test User',
      email: 'test@example.com',
    },
  },
  status: 'authenticated',
}

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(() => mockSession),
}))

import { useSession } from 'next-auth/react'

describe('NearbyPlacesPanel', () => {
  const defaultProps = {
    listingLat: 37.7749,
    listingLng: -122.4194,
    onPlacesChange: jest.fn(),
  }

  const mockPlacesResponse = {
    places: [
      {
        id: 'place-1',
        name: 'Indian Restaurant',
        address: '123 Main St',
        category: 'indian-restaurant',
        location: { lat: 37.7760, lng: -122.4180 },
        distanceMiles: 0.1,
      },
    ],
    meta: { cached: false, count: 1 },
  }

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    ;(useSession as jest.Mock).mockReturnValue(mockSession)
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockPlacesResponse,
    })
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('authentication gate', () => {
    it('shows login prompt when not authenticated', () => {
      ;(useSession as jest.Mock).mockReturnValue({ data: null, status: 'unauthenticated' })

      render(<NearbyPlacesPanel {...defaultProps} />)

      // Check for the link to login
      expect(screen.getByRole('link', { name: /sign in/i })).toBeInTheDocument()
    })

    it('shows loading state when session is loading', () => {
      ;(useSession as jest.Mock).mockReturnValue({ data: null, status: 'loading' })

      render(<NearbyPlacesPanel {...defaultProps} />)

      // Should show skeleton or loading indicator
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    })

    it('shows search interface when authenticated', () => {
      render(<NearbyPlacesPanel {...defaultProps} />)

      expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument()
    })
  })

  describe('CRITICAL: no API call on mount', () => {
    it('does NOT call API on component mount', async () => {
      render(<NearbyPlacesPanel {...defaultProps} />)

      // Wait a bit to ensure no API call happens
      await act(async () => {
        jest.advanceTimersByTime(1000)
      })

      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('only calls API after explicit user interaction', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      render(<NearbyPlacesPanel {...defaultProps} />)

      // Verify no initial call
      expect(mockFetch).not.toHaveBeenCalled()

      // Click a category chip (Restaurants chip has indian-restaurant category)
      const chip = screen.getByRole('button', { name: /Restaurants/i })
      await user.click(chip)

      // Now API should be called
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled()
      })
    })
  })

  describe('category chips', () => {
    it('renders all category chips', () => {
      render(<NearbyPlacesPanel {...defaultProps} />)

      CATEGORY_CHIPS.forEach(chip => {
        expect(screen.getByRole('button', { name: chip.label })).toBeInTheDocument()
      })
    })

    it('highlights selected chip', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      render(<NearbyPlacesPanel {...defaultProps} />)

      const chip = screen.getByRole('button', { name: /Restaurants/i })
      await user.click(chip)

      expect(chip).toHaveAttribute('aria-pressed', 'true')
    })

    it('calls API with correct categories on chip click', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      render(<NearbyPlacesPanel {...defaultProps} />)

      const chip = screen.getByRole('button', { name: /Restaurants/i })
      await user.click(chip)

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/nearby', expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('indian-restaurant'),
        }))
      })
    })

    it('includes query filter for Indian grocery', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      render(<NearbyPlacesPanel {...defaultProps} />)

      const chip = screen.getByRole('button', { name: /indian grocery/i })
      await user.click(chip)

      await waitFor(() => {
        const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
        expect(callBody.categories).toContain('food-grocery')
        expect(callBody.query).toBe('indian')
      })
    })
  })

  describe('search input', () => {
    it('has debounced input (300ms)', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      render(<NearbyPlacesPanel {...defaultProps} />)

      const input = screen.getByPlaceholderText(/search/i)
      await user.type(input, 'coffee')

      // API should not be called immediately
      expect(mockFetch).not.toHaveBeenCalled()

      // Advance timers by 300ms
      await act(async () => {
        jest.advanceTimersByTime(300)
      })

      // Now API should be called
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled()
      })
    })

    it('does not call API for short queries (<2 chars)', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      render(<NearbyPlacesPanel {...defaultProps} />)

      const input = screen.getByPlaceholderText(/search/i)
      await user.type(input, 'a')

      await act(async () => {
        jest.advanceTimersByTime(500)
      })

      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('calls API with search query', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      render(<NearbyPlacesPanel {...defaultProps} />)

      const input = screen.getByPlaceholderText(/search/i)
      await user.type(input, 'coffee shop')

      await act(async () => {
        jest.advanceTimersByTime(300)
      })

      await waitFor(() => {
        const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
        expect(callBody.query).toBe('coffee shop')
      })
    })
  })

  describe('radius selector', () => {
    it('renders all radius options', () => {
      render(<NearbyPlacesPanel {...defaultProps} />)

      RADIUS_OPTIONS.forEach(option => {
        expect(screen.getByRole('button', { name: option.label })).toBeInTheDocument()
      })
    })

    it('defaults to 1 mi', () => {
      render(<NearbyPlacesPanel {...defaultProps} />)

      const button = screen.getByRole('button', { name: '1 mi' })
      expect(button).toHaveAttribute('aria-pressed', 'true')
    })

    it('triggers refetch with new radius', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      render(<NearbyPlacesPanel {...defaultProps} />)

      // First, click a category to enable radius change
      await user.click(screen.getByRole('button', { name: /Restaurants/i }))

      // Wait for first call and results to display
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled()
        expect(screen.getByText('Indian Restaurant')).toBeInTheDocument()
      })

      // Track how many calls before radius change
      const callsBefore = mockFetch.mock.calls.length

      // Change radius
      await user.click(screen.getByRole('button', { name: '5 mi' }))

      await waitFor(() => {
        expect(mockFetch.mock.calls.length).toBeGreaterThan(callsBefore)
      })

      // Verify the latest call has the new radius
      const latestCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1]
      const callBody = JSON.parse(latestCall[1].body)
      expect(callBody.radiusMeters).toBe(8046)
    })
  })

  describe('results display', () => {
    it('shows results list after search', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      render(<NearbyPlacesPanel {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /Restaurants/i }))

      await waitFor(() => {
        expect(screen.getByText('Indian Restaurant')).toBeInTheDocument()
        expect(screen.getByText('123 Main St')).toBeInTheDocument()
      })
    })

    it('shows distance for each result', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      render(<NearbyPlacesPanel {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /Restaurants/i }))

      await waitFor(() => {
        expect(screen.getByText(/0\.1 mi/)).toBeInTheDocument()
      })
    })

    it('shows "no results" message when empty', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ places: [], meta: { cached: false, count: 0 } }),
      })

      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      render(<NearbyPlacesPanel {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /Restaurants/i }))

      await waitFor(() => {
        expect(screen.getByText(/no places found/i)).toBeInTheDocument()
      })
    })

    it('calls onPlacesChange with results', async () => {
      const onPlacesChange = jest.fn()
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      render(<NearbyPlacesPanel {...defaultProps} onPlacesChange={onPlacesChange} />)

      await user.click(screen.getByRole('button', { name: /Restaurants/i }))

      await waitFor(() => {
        expect(onPlacesChange).toHaveBeenCalledWith(mockPlacesResponse.places)
      })
    })
  })

  describe('loading state', () => {
    it('shows loading skeleton during fetch', async () => {
      let resolvePromise: (value: any) => void
      const promise = new Promise(resolve => {
        resolvePromise = resolve
      })
      mockFetch.mockReturnValue(promise)

      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      render(<NearbyPlacesPanel {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /Restaurants/i }))

      expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument()

      // Resolve promise
      await act(async () => {
        resolvePromise!({
          ok: true,
          json: async () => mockPlacesResponse,
        })
      })

      await waitFor(() => {
        expect(screen.queryByTestId('loading-skeleton')).not.toBeInTheDocument()
      })
    })

    it('disables chips during loading', async () => {
      let resolvePromise: (value: any) => void
      const promise = new Promise(resolve => {
        resolvePromise = resolve
      })
      mockFetch.mockReturnValue(promise)

      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      render(<NearbyPlacesPanel {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /Restaurants/i }))

      // Other chips should be disabled during loading
      const otherChip = screen.getByRole('button', { name: /Shopping/i })
      expect(otherChip).toBeDisabled()

      await act(async () => {
        resolvePromise!({
          ok: true,
          json: async () => mockPlacesResponse,
        })
      })
    })
  })

  describe('error handling', () => {
    it('shows error message on API failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Failed to fetch' }),
      })

      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      render(<NearbyPlacesPanel {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /Restaurants/i }))

      await waitFor(() => {
        expect(screen.getByText(/failed to fetch/i)).toBeInTheDocument()
      })
    })

    it('shows error message on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      render(<NearbyPlacesPanel {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /Restaurants/i }))

      await waitFor(() => {
        expect(screen.getByText(/error/i)).toBeInTheDocument()
      })

      consoleSpy.mockRestore()
    })

    it('allows retry after error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Failed' }),
      })

      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      render(<NearbyPlacesPanel {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /Restaurants/i }))

      await waitFor(() => {
        expect(screen.getByText(/failed/i)).toBeInTheDocument()
      })

      // Set up successful response for retry
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockPlacesResponse,
      })

      // Click chip again to retry
      await user.click(screen.getByRole('button', { name: /Restaurants/i }))

      await waitFor(() => {
        expect(screen.getByText('Indian Restaurant')).toBeInTheDocument()
      })
    })
  })

  describe('directions link', () => {
    it('has directions link for each result', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      render(<NearbyPlacesPanel {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /Restaurants/i }))

      await waitFor(() => {
        const link = screen.getByRole('link', { name: /get directions/i })
        expect(link).toHaveAttribute('href', expect.stringContaining('google.com/maps'))
        expect(link).toHaveAttribute('target', '_blank')
      })
    })
  })

  describe('accessibility', () => {
    it('has accessible search input label', () => {
      render(<NearbyPlacesPanel {...defaultProps} />)

      const input = screen.getByPlaceholderText(/search/i)
      expect(input).toHaveAttribute('aria-label')
    })

    it('chips have proper aria-pressed state', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      render(<NearbyPlacesPanel {...defaultProps} />)

      const chip = screen.getByRole('button', { name: /Restaurants/i })
      expect(chip).toHaveAttribute('aria-pressed', 'false')

      await user.click(chip)

      expect(chip).toHaveAttribute('aria-pressed', 'true')
    })

    it('results area has aria-busy during loading', async () => {
      let resolvePromise: (value: unknown) => void
      const promise = new Promise(resolve => {
        resolvePromise = resolve
      })
      mockFetch.mockReturnValue(promise)

      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      render(<NearbyPlacesPanel {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /Restaurants/i }))

      // Results area should have aria-busy="true" during loading
      const resultsArea = screen.getByTestId('results-area')
      expect(resultsArea).toHaveAttribute('aria-busy', 'true')

      await act(async () => {
        resolvePromise!({
          ok: true,
          json: async () => mockPlacesResponse,
        })
      })

      await waitFor(() => {
        expect(resultsArea).toHaveAttribute('aria-busy', 'false')
      })
    })

    it('error message has role="status" for screen readers', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Failed to fetch' }),
      })

      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      render(<NearbyPlacesPanel {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /Restaurants/i }))

      await waitFor(() => {
        const errorElement = screen.getByRole('status')
        expect(errorElement).toBeInTheDocument()
        expect(errorElement).toHaveAttribute('aria-live', 'polite')
      })
    })

    it('results have proper accessible structure', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      render(<NearbyPlacesPanel {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /Restaurants/i }))

      await waitFor(() => {
        // Results should be accessible links with aria-labels
        const links = screen.getAllByRole('link', { name: /get directions/i })
        expect(links.length).toBeGreaterThan(0)

        // Each link should have proper attributes for accessibility
        links.forEach(link => {
          expect(link).toHaveAttribute('target', '_blank')
          expect(link).toHaveAttribute('rel', 'noopener noreferrer')
        })
      })
    })

    it('radius buttons have aria-pressed state', () => {
      render(<NearbyPlacesPanel {...defaultProps} />)

      // Default 1 mi should be pressed
      const defaultButton = screen.getByRole('button', { name: '1 mi' })
      expect(defaultButton).toHaveAttribute('aria-pressed', 'true')

      // Other buttons should not be pressed
      const otherButton = screen.getByRole('button', { name: '2 mi' })
      expect(otherButton).toHaveAttribute('aria-pressed', 'false')
    })
  })

  describe('Search UX - request cancellation', () => {
    it('makes new request when query changes', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      render(<NearbyPlacesPanel {...defaultProps} />)

      const input = screen.getByPlaceholderText(/search/i)

      // Type first query
      await user.type(input, 'coffee')
      await act(async () => {
        jest.advanceTimersByTime(300)
      })

      // First request made
      expect(mockFetch).toHaveBeenCalledTimes(1)
      const firstCall = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(firstCall.query).toBe('coffee')

      // Wait for response
      await act(async () => {
        jest.advanceTimersByTime(100)
      })

      // Type additional characters for new query
      await user.type(input, ' shop')
      await act(async () => {
        jest.advanceTimersByTime(300)
      })

      // Second request made with updated query
      expect(mockFetch).toHaveBeenCalledTimes(2)
      const secondCall = JSON.parse(mockFetch.mock.calls[1][1].body)
      expect(secondCall.query).toBe('coffee shop')
    })

    it('only makes single API call for rapid typing', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      render(<NearbyPlacesPanel {...defaultProps} />)

      const input = screen.getByPlaceholderText(/search/i)

      // Type rapidly
      await user.type(input, 'c')
      await act(async () => {
        jest.advanceTimersByTime(100)
      })
      await user.type(input, 'o')
      await act(async () => {
        jest.advanceTimersByTime(100)
      })
      await user.type(input, 'f')
      await act(async () => {
        jest.advanceTimersByTime(100)
      })
      await user.type(input, 'f')
      await act(async () => {
        jest.advanceTimersByTime(100)
      })
      await user.type(input, 'ee')

      // Wait for debounce
      await act(async () => {
        jest.advanceTimersByTime(300)
      })

      // Should only make one API call
      expect(mockFetch).toHaveBeenCalledTimes(1)

      // And it should be with the full query
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(callBody.query).toBe('coffee')
    })

    it('does not call API for query with only spaces', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      render(<NearbyPlacesPanel {...defaultProps} />)

      const input = screen.getByPlaceholderText(/search/i)
      await user.type(input, '   ')

      await act(async () => {
        jest.advanceTimersByTime(500)
      })

      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('handles query with punctuation correctly', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      render(<NearbyPlacesPanel {...defaultProps} />)

      const input = screen.getByPlaceholderText(/search/i)
      await user.type(input, "ATM's & Banks")

      await act(async () => {
        jest.advanceTimersByTime(300)
      })

      await waitFor(() => {
        const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
        expect(callBody.query).toBe("ATM's & Banks")
      })
    })
  })

  describe('Search UX - in-flight request handling', () => {
    it('makes new request when chip changes (latest request wins)', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      render(<NearbyPlacesPanel {...defaultProps} />)

      // Click first chip - triggers first request
      await user.click(screen.getByRole('button', { name: /Restaurants/i }))
      expect(mockFetch).toHaveBeenCalledTimes(1)
      const firstCallBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(firstCallBody.categories).toEqual(['indian-restaurant'])

      // Wait for first request to complete (chips re-enabled)
      await waitFor(() => {
        expect(screen.getByText('Indian Restaurant')).toBeInTheDocument()
      })

      // Click second chip - triggers second request with different categories
      await user.click(screen.getByRole('button', { name: /Shopping/i }))
      expect(mockFetch).toHaveBeenCalledTimes(2)
      const secondCallBody = JSON.parse(mockFetch.mock.calls[1][1].body)
      expect(secondCallBody.categories).toEqual(['shopping-mall'])
    })

    it('triggers new request with updated radius when radius button clicked after search', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      render(<NearbyPlacesPanel {...defaultProps} />)

      // Click a chip to start a search
      await user.click(screen.getByRole('button', { name: /Restaurants/i }))
      expect(mockFetch).toHaveBeenCalledTimes(1)
      const firstCallBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(firstCallBody.radiusMeters).toBe(1609) // Default 1 mi

      // Wait for first request to resolve
      await waitFor(() => {
        expect(screen.getByText('Indian Restaurant')).toBeInTheDocument()
      })

      // Now change radius - should trigger new request
      await user.click(screen.getByRole('button', { name: '5 mi' }))
      expect(mockFetch).toHaveBeenCalledTimes(2)
      const secondCallBody = JSON.parse(mockFetch.mock.calls[1][1].body)
      expect(secondCallBody.radiusMeters).toBe(8046) // 5 mi
    })

    it('clicking different chips makes separate requests for each', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      render(<NearbyPlacesPanel {...defaultProps} />)

      // Click first chip and wait for completion (results shown = chips re-enabled)
      await user.click(screen.getByRole('button', { name: /Restaurants/i }))
      await waitFor(() => expect(screen.getByText('Indian Restaurant')).toBeInTheDocument())
      expect(mockFetch).toHaveBeenCalledTimes(1)

      // Click second chip and wait for completion
      await user.click(screen.getByRole('button', { name: /Shopping/i }))
      await waitFor(() => expect(screen.getByText('Indian Restaurant')).toBeInTheDocument())
      expect(mockFetch).toHaveBeenCalledTimes(2)

      // Click third chip and wait for completion
      await user.click(screen.getByRole('button', { name: /Pharmacy/i }))
      await waitFor(() => expect(screen.getByText('Indian Restaurant')).toBeInTheDocument())
      expect(mockFetch).toHaveBeenCalledTimes(3)

      // Verify all 3 requests had correct categories
      expect(JSON.parse(mockFetch.mock.calls[0][1].body).categories).toEqual(['indian-restaurant'])
      expect(JSON.parse(mockFetch.mock.calls[1][1].body).categories).toEqual(['shopping-mall'])
      expect(JSON.parse(mockFetch.mock.calls[2][1].body).categories).toEqual(['pharmacy'])
    })
  })

  describe('Search UX - error state transitions', () => {
    it('clears error state after successful retry', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({ error: 'Server error' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockPlacesResponse,
        })

      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      render(<NearbyPlacesPanel {...defaultProps} />)

      // First click - error
      await user.click(screen.getByRole('button', { name: /Restaurants/i }))

      await waitFor(() => {
        expect(screen.getByText(/server error/i)).toBeInTheDocument()
      })

      // Second click - success
      await user.click(screen.getByRole('button', { name: /Restaurants/i }))

      await waitFor(() => {
        // Error should be cleared
        expect(screen.queryByText(/server error/i)).not.toBeInTheDocument()
        // Results should show
        expect(screen.getByText('Indian Restaurant')).toBeInTheDocument()
      })
    })

    it('shows error with details when both error and details provided', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: async () => ({
          error: 'Radar API authentication failed',
          details: 'Invalid or expired API key',
        }),
      })

      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      render(<NearbyPlacesPanel {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /Restaurants/i }))

      await waitFor(() => {
        expect(screen.getByText(/radar api authentication failed/i)).toBeInTheDocument()
        expect(screen.getByText(/invalid or expired api key/i)).toBeInTheDocument()
      })
    })
  })

  describe('Search UX - UI state', () => {
    it('disables search input during loading', async () => {
      let resolvePromise: (value: unknown) => void
      const promise = new Promise(resolve => {
        resolvePromise = resolve
      })
      mockFetch.mockReturnValue(promise)

      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      render(<NearbyPlacesPanel {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /Restaurants/i }))

      const input = screen.getByPlaceholderText(/search/i)
      expect(input).toBeDisabled()

      await act(async () => {
        resolvePromise!({
          ok: true,
          json: async () => mockPlacesResponse,
        })
      })

      await waitFor(() => {
        expect(input).not.toBeDisabled()
      })
    })

    it('shows initial discover prompt before any search', () => {
      render(<NearbyPlacesPanel {...defaultProps} />)

      // Should show discover prompts (both heading and subtitle)
      expect(screen.getByText(/Discover what's nearby/i)).toBeInTheDocument()
      expect(screen.getByText(/Select a category or search/i)).toBeInTheDocument()
    })
  })

  describe('Directions links - enhanced', () => {
    it('uses lat/lng in directions URL, not address', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      render(<NearbyPlacesPanel {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /Restaurants/i }))

      await waitFor(() => {
        const link = screen.getByRole('link', { name: /directions/i })
        const href = link.getAttribute('href')!

        // Should contain coordinates
        expect(href).toContain('37.776')
        expect(href).toContain('-122.418')
      })
    })

    it('handles place with missing address', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          places: [{
            id: 'place-1',
            name: 'Mystery Place',
            address: '', // Empty address
            category: 'restaurant',
            location: { lat: 37.77, lng: -122.42 },
            distanceMiles: 0.1,
          }],
          meta: { cached: false, count: 1 },
        }),
      })

      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      render(<NearbyPlacesPanel {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /Restaurants/i }))

      await waitFor(() => {
        // Should still render with directions link
        const link = screen.getByRole('link', { name: /directions/i })
        expect(link).toBeInTheDocument()
        // Link should use coordinates
        expect(link.getAttribute('href')).toContain('37.77')
      })
    })

    it('handles special characters in place name for URL', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          places: [{
            id: 'place-1',
            name: "McDonald's & Café <Test>",
            address: '123 Main St',
            category: 'restaurant',
            location: { lat: 37.77, lng: -122.42 },
            distanceMiles: 0.1,
          }],
          meta: { cached: false, count: 1 },
        }),
      })

      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      render(<NearbyPlacesPanel {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /Restaurants/i }))

      await waitFor(() => {
        const link = screen.getByRole('link', { name: /directions/i })
        // URL should be valid (not throw)
        expect(() => new URL(link.getAttribute('href')!)).not.toThrow()
      })
    })
  })

  describe('Hover interaction', () => {
    it('calls onPlaceHover when hovering over a result', async () => {
      const onPlaceHover = jest.fn()
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      render(<NearbyPlacesPanel {...defaultProps} onPlaceHover={onPlaceHover} />)

      await user.click(screen.getByRole('button', { name: /Restaurants/i }))

      await waitFor(() => {
        expect(screen.getByText('Indian Restaurant')).toBeInTheDocument()
      })

      // Hover over the result
      const resultItem = screen.getByText('Indian Restaurant').closest('[data-place-id]') ||
                        screen.getByText('Indian Restaurant').closest('li')
      if (resultItem) {
        await user.hover(resultItem)
        expect(onPlaceHover).toHaveBeenCalledWith('place-1')
      }
    })

    it('calls onPlaceHover with null when mouse leaves', async () => {
      const onPlaceHover = jest.fn()
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      render(<NearbyPlacesPanel {...defaultProps} onPlaceHover={onPlaceHover} />)

      await user.click(screen.getByRole('button', { name: /Restaurants/i }))

      await waitFor(() => {
        expect(screen.getByText('Indian Restaurant')).toBeInTheDocument()
      })

      const resultItem = screen.getByText('Indian Restaurant').closest('[data-place-id]') ||
                        screen.getByText('Indian Restaurant').closest('li')
      if (resultItem) {
        await user.hover(resultItem)
        await user.unhover(resultItem)
        expect(onPlaceHover).toHaveBeenLastCalledWith(null)
      }
    })
  })

  describe('View mode toggle (mobile)', () => {
    it('renders view toggle button when onViewModeChange is provided', () => {
      const onViewModeChange = jest.fn()
      render(
        <NearbyPlacesPanel
          {...defaultProps}
          onViewModeChange={onViewModeChange}
          viewMode="list"
        />
      )

      // Should show toggle button - when in list mode, button says "Map"
      const toggleButton = screen.getByRole('button', { name: /map/i })
      expect(toggleButton).toBeInTheDocument()
    })

    it('calls onViewModeChange when toggle clicked', async () => {
      const onViewModeChange = jest.fn()
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })

      render(
        <NearbyPlacesPanel
          {...defaultProps}
          showViewToggle={true}
          onViewModeChange={onViewModeChange}
        />
      )

      const mapButton = screen.getByRole('button', { name: /map/i })
      await user.click(mapButton)

      expect(onViewModeChange).toHaveBeenCalledWith('map')
    })
  })
})
