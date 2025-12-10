import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DeleteListingButton from '@/components/DeleteListingButton'
import { toast } from 'sonner'

// Mock next/navigation
const mockPush = jest.fn()
const mockRefresh = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
}))

// Mock fetch
const mockFetch = jest.fn()
global.fetch = mockFetch

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}))

describe('DeleteListingButton', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders delete button', () => {
    render(<DeleteListingButton listingId="listing-123" />)
    expect(screen.getByText('Delete Listing')).toBeInTheDocument()
  })

  it('shows checking state on first click', async () => {
    mockFetch.mockImplementation(() => new Promise(() => { })) // Never resolves

    render(<DeleteListingButton listingId="listing-123" />)
    await userEvent.click(screen.getByText('Delete Listing'))

    expect(screen.getByText('Checking...')).toBeInTheDocument()
  })

  it('shows confirmation dialog after can-delete check passes', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ canDelete: true, activeBookings: 0, pendingBookings: 0, activeConversations: 0 }),
    })

    render(<DeleteListingButton listingId="listing-123" />)
    await userEvent.click(screen.getByText('Delete Listing'))

    await waitFor(() => {
      expect(screen.getByText('Are you sure? This action cannot be undone.')).toBeInTheDocument()
      expect(screen.getByText('Cancel')).toBeInTheDocument()
      expect(screen.getByText('Delete Anyway')).toBeInTheDocument()
    })
  })

  it('hides confirmation on cancel', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ canDelete: true, activeBookings: 0, pendingBookings: 0, activeConversations: 0 }),
    })

    render(<DeleteListingButton listingId="listing-123" />)
    await userEvent.click(screen.getByText('Delete Listing'))

    await waitFor(() => {
      expect(screen.getByText('Cancel')).toBeInTheDocument()
    })

    await userEvent.click(screen.getByText('Cancel'))

    expect(screen.queryByText('Are you sure? This action cannot be undone.')).not.toBeInTheDocument()
    expect(screen.getByText('Delete Listing')).toBeInTheDocument()
  })

  it('calls delete API and redirects on success', async () => {
    // First call: can-delete check
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ canDelete: true, activeBookings: 0, pendingBookings: 0, activeConversations: 0 }),
    })
    // Second call: actual delete
    mockFetch.mockResolvedValueOnce({ ok: true })

    render(<DeleteListingButton listingId="listing-123" />)

    await userEvent.click(screen.getByText('Delete Listing'))

    await waitFor(() => {
      expect(screen.getByText('Delete Anyway')).toBeInTheDocument()
    })

    await userEvent.click(screen.getByText('Delete Anyway'))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/listings/listing-123', {
        method: 'DELETE',
      })
      expect(toast.success).toHaveBeenCalledWith('Listing deleted successfully')
      expect(mockPush).toHaveBeenCalledWith('/search')
      expect(mockRefresh).toHaveBeenCalled()
    })
  })

  it('shows error message on API failure', async () => {
    // First call: can-delete check
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ canDelete: true, activeBookings: 0, pendingBookings: 0, activeConversations: 0 }),
    })
    // Second call: delete fails
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Cannot delete listing with active bookings' }),
    })

    render(<DeleteListingButton listingId="listing-123" />)

    await userEvent.click(screen.getByText('Delete Listing'))

    await waitFor(() => {
      expect(screen.getByText('Delete Anyway')).toBeInTheDocument()
    })

    await userEvent.click(screen.getByText('Delete Anyway'))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Cannot delete listing with active bookings')
    })
  })

  it('shows blocking message when canDelete is false due to active bookings', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ canDelete: false, activeBookings: 2, pendingBookings: 0, activeConversations: 0 }),
    })

    render(<DeleteListingButton listingId="listing-123" />)
    await userEvent.click(screen.getByText('Delete Listing'))

    await waitFor(() => {
      expect(screen.getByText('Cannot delete listing')).toBeInTheDocument()
      expect(screen.getByText(/You have 2 active bookings/)).toBeInTheDocument()
    })
  })

  it('shows loading state while deleting', async () => {
    // First call: can-delete check
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ canDelete: true, activeBookings: 0, pendingBookings: 0, activeConversations: 0 }),
    })
    // Second call: delete (never resolves)
    mockFetch.mockImplementationOnce(() => new Promise(() => { }))

    render(<DeleteListingButton listingId="listing-123" />)

    await userEvent.click(screen.getByText('Delete Listing'))

    await waitFor(() => {
      expect(screen.getByText('Delete Anyway')).toBeInTheDocument()
    })

    await userEvent.click(screen.getByText('Delete Anyway'))

    expect(screen.getByText('Deleting...')).toBeInTheDocument()
  })
})
