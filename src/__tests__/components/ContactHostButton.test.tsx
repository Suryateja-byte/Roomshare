import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ContactHostButton from '@/components/ContactHostButton'
import { toast } from 'sonner'

// Mock next/navigation
const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}))

// Mock startConversation
const mockStartConversation = jest.fn()
jest.mock('@/app/actions/chat', () => ({
  startConversation: (...args: any[]) => mockStartConversation(...args),
}))

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}))

describe('ContactHostButton', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders contact host button', () => {
    render(<ContactHostButton listingId="listing-123" />)
    expect(screen.getByText('Contact Host')).toBeInTheDocument()
  })

  it('shows loading state when clicked', async () => {
    mockStartConversation.mockImplementation(() => new Promise(() => { }))

    render(<ContactHostButton listingId="listing-123" />)
    await userEvent.click(screen.getByText('Contact Host'))

    expect(screen.getByText('Starting Chat...')).toBeInTheDocument()
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('redirects to login when unauthorized', async () => {
    mockStartConversation.mockResolvedValue({ error: 'Unauthorized' })

    render(<ContactHostButton listingId="listing-123" />)
    await userEvent.click(screen.getByText('Contact Host'))

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/login')
    })
  })

  it('shows toast error on other errors', async () => {
    mockStartConversation.mockResolvedValue({ error: 'Cannot chat with yourself' })

    render(<ContactHostButton listingId="listing-123" />)
    await userEvent.click(screen.getByText('Contact Host'))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Cannot chat with yourself')
    })
  })

  it('redirects to conversation on success', async () => {
    mockStartConversation.mockResolvedValue({ conversationId: 'conv-123' })

    render(<ContactHostButton listingId="listing-123" />)
    await userEvent.click(screen.getByText('Contact Host'))

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/messages/conv-123')
    })
  })

  it('handles exceptions', async () => {
    mockStartConversation.mockRejectedValue(new Error('Network error'))

    render(<ContactHostButton listingId="listing-123" />)
    await userEvent.click(screen.getByText('Contact Host'))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to start conversation')
    })
  })

  it('resets loading state after error', async () => {
    mockStartConversation.mockRejectedValue(new Error('Network error'))

    render(<ContactHostButton listingId="listing-123" />)
    await userEvent.click(screen.getByText('Contact Host'))

    await waitFor(() => {
      expect(screen.getByText('Contact Host')).toBeInTheDocument()
      expect(screen.getByRole('button')).not.toBeDisabled()
    })
  })
})
