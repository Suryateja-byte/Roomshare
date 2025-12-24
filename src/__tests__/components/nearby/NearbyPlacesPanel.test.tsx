/**
 * Tests for NearbyPlacesPanel component
 * TDD: These tests are written before implementation
 *
 * CRITICAL COMPLIANCE TEST: No API call on mount
 */

import { render, screen, waitFor, act } from '@testing-library/react'
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

      // Click a category chip
      const chip = screen.getByRole('button', { name: /indian restaurant/i })
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

      const chip = screen.getByRole('button', { name: /indian restaurant/i })
      await user.click(chip)

      expect(chip).toHaveAttribute('aria-pressed', 'true')
    })

    it('calls API with correct categories on chip click', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      render(<NearbyPlacesPanel {...defaultProps} />)

      const chip = screen.getByRole('button', { name: /indian restaurant/i })
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
      await user.click(screen.getByRole('button', { name: /indian restaurant/i }))

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

      await user.click(screen.getByRole('button', { name: /indian restaurant/i }))

      await waitFor(() => {
        expect(screen.getByText('Indian Restaurant')).toBeInTheDocument()
        expect(screen.getByText('123 Main St')).toBeInTheDocument()
      })
    })

    it('shows distance for each result', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      render(<NearbyPlacesPanel {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /indian restaurant/i }))

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

      await user.click(screen.getByRole('button', { name: /indian restaurant/i }))

      await waitFor(() => {
        expect(screen.getByText(/no places found/i)).toBeInTheDocument()
      })
    })

    it('calls onPlacesChange with results', async () => {
      const onPlacesChange = jest.fn()
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      render(<NearbyPlacesPanel {...defaultProps} onPlacesChange={onPlacesChange} />)

      await user.click(screen.getByRole('button', { name: /indian restaurant/i }))

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

      await user.click(screen.getByRole('button', { name: /indian restaurant/i }))

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

      await user.click(screen.getByRole('button', { name: /indian restaurant/i }))

      // Other chips should be disabled during loading
      const otherChip = screen.getByRole('button', { name: /mall/i })
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

      await user.click(screen.getByRole('button', { name: /indian restaurant/i }))

      await waitFor(() => {
        expect(screen.getByText(/failed to fetch/i)).toBeInTheDocument()
      })
    })

    it('shows error message on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      render(<NearbyPlacesPanel {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /indian restaurant/i }))

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

      await user.click(screen.getByRole('button', { name: /indian restaurant/i }))

      await waitFor(() => {
        expect(screen.getByText(/failed/i)).toBeInTheDocument()
      })

      // Set up successful response for retry
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockPlacesResponse,
      })

      // Click chip again to retry
      await user.click(screen.getByRole('button', { name: /indian restaurant/i }))

      await waitFor(() => {
        expect(screen.getByText('Indian Restaurant')).toBeInTheDocument()
      })
    })
  })

  describe('directions link', () => {
    it('has directions link for each result', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      render(<NearbyPlacesPanel {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /indian restaurant/i }))

      await waitFor(() => {
        const link = screen.getByRole('link', { name: /directions/i })
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

      const chip = screen.getByRole('button', { name: /indian restaurant/i })
      expect(chip).toHaveAttribute('aria-pressed', 'false')

      await user.click(chip)

      expect(chip).toHaveAttribute('aria-pressed', 'true')
    })
  })
})
