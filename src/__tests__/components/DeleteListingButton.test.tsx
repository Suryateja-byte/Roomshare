import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DeleteListingButton from '@/components/DeleteListingButton'

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

// Mock alert
global.alert = jest.fn()

describe('DeleteListingButton', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders delete button', () => {
    render(<DeleteListingButton listingId="listing-123" />)
    expect(screen.getByText('Delete Listing')).toBeInTheDocument()
  })

  it('shows confirmation dialog on first click', async () => {
    render(<DeleteListingButton listingId="listing-123" />)

    await userEvent.click(screen.getByText('Delete Listing'))

    expect(screen.getByText('Are you sure? This cannot be undone.')).toBeInTheDocument()
    expect(screen.getByText('Cancel')).toBeInTheDocument()
    expect(screen.getByText('Confirm')).toBeInTheDocument()
  })

  it('hides confirmation on cancel', async () => {
    render(<DeleteListingButton listingId="listing-123" />)

    await userEvent.click(screen.getByText('Delete Listing'))
    await userEvent.click(screen.getByText('Cancel'))

    expect(screen.queryByText('Are you sure? This cannot be undone.')).not.toBeInTheDocument()
    expect(screen.getByText('Delete Listing')).toBeInTheDocument()
  })

  it('calls delete API and redirects on success', async () => {
    mockFetch.mockResolvedValue({ ok: true })

    render(<DeleteListingButton listingId="listing-123" />)

    await userEvent.click(screen.getByText('Delete Listing'))
    await userEvent.click(screen.getByText('Confirm'))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/listings/listing-123', {
        method: 'DELETE',
      })
      expect(mockPush).toHaveBeenCalledWith('/search')
      expect(mockRefresh).toHaveBeenCalled()
    })
  })

  it('shows error message on API failure', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Cannot delete listing with active bookings' }),
    })

    render(<DeleteListingButton listingId="listing-123" />)

    await userEvent.click(screen.getByText('Delete Listing'))
    await userEvent.click(screen.getByText('Confirm'))

    await waitFor(() => {
      expect(global.alert).toHaveBeenCalledWith('Cannot delete listing with active bookings')
    })
  })

  it('shows generic error on network failure', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))

    render(<DeleteListingButton listingId="listing-123" />)

    await userEvent.click(screen.getByText('Delete Listing'))
    await userEvent.click(screen.getByText('Confirm'))

    await waitFor(() => {
      expect(global.alert).toHaveBeenCalledWith('Failed to delete listing')
    })
  })

  it('shows loading state while deleting', async () => {
    mockFetch.mockImplementation(() => new Promise(() => {})) // Never resolves

    render(<DeleteListingButton listingId="listing-123" />)

    await userEvent.click(screen.getByText('Delete Listing'))
    await userEvent.click(screen.getByText('Confirm'))

    expect(screen.getByText('Deleting...')).toBeInTheDocument()
    expect(screen.getByText('Cancel')).toBeDisabled()
  })

  it('disables buttons while deleting', async () => {
    mockFetch.mockImplementation(() => new Promise(() => {}))

    render(<DeleteListingButton listingId="listing-123" />)

    await userEvent.click(screen.getByText('Delete Listing'))
    await userEvent.click(screen.getByText('Confirm'))

    expect(screen.getByText('Cancel')).toBeDisabled()
    expect(screen.getByText('Deleting...')).toBeDisabled()
  })
})
