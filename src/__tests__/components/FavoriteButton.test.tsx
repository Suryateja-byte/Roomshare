import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FavoriteButton from '@/components/FavoriteButton'

// Mock fetch — save original and restore in afterAll to prevent cross-file leaks
const originalFetch = global.fetch
const mockFetch = jest.fn()
beforeAll(() => { global.fetch = mockFetch })
afterAll(() => { global.fetch = originalFetch })

// Mock useRouter
const mockPush = jest.fn()
const mockRefresh = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
}))

describe('FavoriteButton', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFetch.mockReset()
  })

  describe('rendering', () => {
    it('renders unsaved state by default', () => {
      render(<FavoriteButton listingId="listing-123" />)
      const button = screen.getByRole('button')
      expect(button).toBeInTheDocument()
      expect(button).toHaveClass('text-zinc-400')
    })

    it('renders saved state when initialIsSaved is true', () => {
      render(<FavoriteButton listingId="listing-123" initialIsSaved={true} />)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('text-red-500')
    })

    it('renders heart icon', () => {
      const { container } = render(<FavoriteButton listingId="listing-123" />)
      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })

    it('applies custom className', () => {
      render(<FavoriteButton listingId="listing-123" className="custom-class" />)
      expect(screen.getByRole('button')).toHaveClass('custom-class')
    })
  })

  describe('toggle behavior', () => {
    it('toggles to saved state on click', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ saved: true }),
      })

      render(<FavoriteButton listingId="listing-123" />)
      const button = screen.getByRole('button')

      await userEvent.click(button)

      await waitFor(() => {
        expect(button).toHaveClass('text-red-500')
      })
    })

    it('toggles to unsaved state on click', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ saved: false }),
      })

      render(<FavoriteButton listingId="listing-123" initialIsSaved={true} />)
      const button = screen.getByRole('button')

      await userEvent.click(button)

      await waitFor(() => {
        expect(button).toHaveClass('text-zinc-400')
      })
    })

    it('calls API with correct listingId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ saved: true }),
      })

      render(<FavoriteButton listingId="test-listing-456" />)

      await userEvent.click(screen.getByRole('button'))

      expect(mockFetch).toHaveBeenCalledWith('/api/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId: 'test-listing-456' }),
      })
    })

    it('refreshes router after successful toggle', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ saved: true }),
      })

      render(<FavoriteButton listingId="listing-123" />)

      await userEvent.click(screen.getByRole('button'))

      await waitFor(() => {
        expect(mockRefresh).toHaveBeenCalled()
      })
    })
  })

  describe('event handling', () => {
    it('prevents default on click', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ saved: true }),
      })

      render(<FavoriteButton listingId="listing-123" />)
      const button = screen.getByRole('button')

      const clickEvent = new MouseEvent('click', { bubbles: true })
      const preventDefaultSpy = jest.spyOn(clickEvent, 'preventDefault')

      button.dispatchEvent(clickEvent)

      expect(preventDefaultSpy).toHaveBeenCalled()
    })

    it('stops propagation on click', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ saved: true }),
      })

      render(<FavoriteButton listingId="listing-123" />)
      const button = screen.getByRole('button')

      const clickEvent = new MouseEvent('click', { bubbles: true })
      const stopPropagationSpy = jest.spyOn(clickEvent, 'stopPropagation')

      button.dispatchEvent(clickEvent)

      expect(stopPropagationSpy).toHaveBeenCalled()
    })
  })

  describe('loading state', () => {
    it('disables button while loading', async () => {
      // Create a promise we can control
      let resolvePromise: (value: any) => void
      const promise = new Promise(resolve => {
        resolvePromise = resolve
      })
      mockFetch.mockReturnValueOnce(promise)

      render(<FavoriteButton listingId="listing-123" />)
      const button = screen.getByRole('button')

      // Click to start loading
      await userEvent.click(button)

      expect(button).toBeDisabled()

      // Resolve the promise
      resolvePromise!({
        ok: true,
        status: 200,
        json: async () => ({ saved: true }),
      })

      await waitFor(() => {
        expect(button).not.toBeDisabled()
      })
    })

    it('prevents multiple clicks while loading', async () => {
      let resolvePromise: (value: any) => void
      const promise = new Promise(resolve => {
        resolvePromise = resolve
      })
      mockFetch.mockReturnValue(promise)

      render(<FavoriteButton listingId="listing-123" />)
      const button = screen.getByRole('button')

      // Try to click multiple times
      await userEvent.click(button)
      await userEvent.click(button)
      await userEvent.click(button)

      // Should only have been called once
      expect(mockFetch).toHaveBeenCalledTimes(1)

      // Cleanup
      resolvePromise!({
        ok: true,
        status: 200,
        json: async () => ({ saved: true }),
      })
    })
  })

  describe('error handling', () => {
    it('redirects to login on 401', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      })

      render(<FavoriteButton listingId="listing-123" />)

      await userEvent.click(screen.getByRole('button'))

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/login')
      })
    })

    it('reverts state on 401', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      })

      render(<FavoriteButton listingId="listing-123" initialIsSaved={false} />)
      const button = screen.getByRole('button')

      await userEvent.click(button)

      await waitFor(() => {
        expect(button).toHaveClass('text-zinc-400')
      })
    })

    it('reverts state on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      render(<FavoriteButton listingId="listing-123" initialIsSaved={false} />)
      const button = screen.getByRole('button')

      await userEvent.click(button)

      await waitFor(() => {
        expect(button).toHaveClass('text-zinc-400')
      })
    })

    it('reverts state on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

      render(<FavoriteButton listingId="listing-123" initialIsSaved={false} />)
      const button = screen.getByRole('button')

      await userEvent.click(button)

      await waitFor(() => {
        expect(button).toHaveClass('text-zinc-400')
      })

      consoleSpy.mockRestore()
    })
  })

  describe('optimistic update', () => {
    it('updates UI immediately before API response', async () => {
      let resolvePromise: (value: any) => void
      const promise = new Promise(resolve => {
        resolvePromise = resolve
      })
      mockFetch.mockReturnValueOnce(promise)

      render(<FavoriteButton listingId="listing-123" initialIsSaved={false} />)
      const button = screen.getByRole('button')

      // Click to trigger optimistic update
      await userEvent.click(button)

      // Should immediately show as saved (optimistic)
      expect(button).toHaveClass('text-red-500')

      // Now resolve the API call
      resolvePromise!({
        ok: true,
        status: 200,
        json: async () => ({ saved: true }),
      })

      await waitFor(() => {
        expect(button).toHaveClass('text-red-500')
      })
    })
  })
})
