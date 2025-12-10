/**
 * Tests for ChatWindow component
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import ChatWindow from '@/components/ChatWindow'
import { toast } from 'sonner'

// Mock dependencies
const mockIsOffline = { isOffline: false }
jest.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => mockIsOffline,
}))

jest.mock('sonner', () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}))

// Mock scrollIntoView
Element.prototype.scrollIntoView = jest.fn()

// Mock fetch
global.fetch = jest.fn()

describe('ChatWindow', () => {
  const defaultProps = {
    conversationId: 'conv-123',
    currentUserId: 'user-456',
  }

  const mockMessages = [
    {
      id: 'msg-1',
      content: 'Hello there!',
      senderId: 'user-456',
      createdAt: new Date().toISOString(),
      sender: { name: 'Current User', image: null },
    },
    {
      id: 'msg-2',
      content: 'Hi! How are you?',
      senderId: 'other-user',
      createdAt: new Date().toISOString(),
      sender: { name: 'Other User', image: null },
    },
  ]

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    mockIsOffline.isOffline = false
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockMessages),
    })
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('rendering', () => {
    it('displays messages after loading', async () => {
      render(<ChatWindow {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('Hello there!')).toBeInTheDocument()
        expect(screen.getByText('Hi! How are you?')).toBeInTheDocument()
      })
    })

    it('shows empty state when no messages', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      })

      render(<ChatWindow {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('No messages yet. Start the conversation!')).toBeInTheDocument()
      })
    })

    it('shows error state when fetch fails', async () => {
      ;(global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'))

      render(<ChatWindow {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('Failed to load messages')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
      })
    })
  })

  describe('message fetching', () => {
    it('fetches messages on mount', async () => {
      render(<ChatWindow {...defaultProps} />)

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/messages?conversationId=conv-123'
        )
      })
    })

    it('polls for messages every 5 seconds', async () => {
      render(<ChatWindow {...defaultProps} />)

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledTimes(1)
      })

      act(() => {
        jest.advanceTimersByTime(5000)
      })

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledTimes(2)
      })
    })

    it('retries on error button click', async () => {
      ;(global.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockMessages),
        })

      render(<ChatWindow {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('Failed to load messages')).toBeInTheDocument()
      })

      const retryButton = screen.getByRole('button', { name: /try again/i })
      fireEvent.click(retryButton)

      await waitFor(() => {
        expect(screen.getByText('Hello there!')).toBeInTheDocument()
      })
    })
  })

  describe('message sending', () => {
    it('sends message on form submit', async () => {
      ;(global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockMessages) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockMessages) })

      render(<ChatWindow {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('Hello there!')).toBeInTheDocument()
      })

      const input = screen.getByPlaceholderText('Type a message...')
      const form = input.closest('form')!

      fireEvent.change(input, { target: { value: 'New message' } })
      fireEvent.submit(form)

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/messages', expect.objectContaining({
          method: 'POST',
        }))
      })
    })

    it('clears input after sending', async () => {
      ;(global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockMessages) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockMessages) })

      render(<ChatWindow {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('Hello there!')).toBeInTheDocument()
      })

      const input = screen.getByPlaceholderText('Type a message...') as HTMLInputElement
      const form = input.closest('form')!

      fireEvent.change(input, { target: { value: 'Test message' } })
      fireEvent.submit(form)

      await waitFor(() => {
        expect(input.value).toBe('')
      })
    })

    it('does not send empty message', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockMessages),
      })

      render(<ChatWindow {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('Hello there!')).toBeInTheDocument()
      })

      // Clear the call count after initial fetch
      const initialFetchCount = (global.fetch as jest.Mock).mock.calls.length

      const input = screen.getByPlaceholderText('Type a message...')
      const form = input.closest('form')!

      fireEvent.change(input, { target: { value: '   ' } })
      fireEvent.submit(form)

      // No additional fetch should be made for empty message
      expect((global.fetch as jest.Mock).mock.calls.length).toBe(initialFetchCount)
    })
  })

  describe('offline handling', () => {
    it('shows offline banner when offline', async () => {
      mockIsOffline.isOffline = true
      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockMessages),
      })

      render(<ChatWindow {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText(/you're offline/i)).toBeInTheDocument()
      })
    })

    it('shows offline placeholder in input when offline', async () => {
      mockIsOffline.isOffline = true
      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockMessages),
      })

      render(<ChatWindow {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByPlaceholderText("You're offline...")).toBeInTheDocument()
      })
    })

    it('shows toast error when trying to send while offline', async () => {
      // Start with offline state to ensure component renders with offline UI
      mockIsOffline.isOffline = true
      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockMessages),
      })

      render(<ChatWindow {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByPlaceholderText("You're offline...")).toBeInTheDocument()
      })

      const input = screen.getByPlaceholderText("You're offline...")
      const form = input.closest('form')!

      fireEvent.change(input, { target: { value: 'Test message' } })
      fireEvent.submit(form)

      expect(toast.error).toHaveBeenCalledWith('You are offline', expect.any(Object))
    })
  })

  describe('failed message handling', () => {
    it('shows failed message indicator when send fails', async () => {
      ;(global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockMessages) })
        .mockRejectedValueOnce(new Error('Failed'))

      render(<ChatWindow {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('Hello there!')).toBeInTheDocument()
      })

      const input = screen.getByPlaceholderText('Type a message...')
      const form = input.closest('form')!

      fireEvent.change(input, { target: { value: 'Failed message' } })
      fireEvent.submit(form)

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Message failed to send', expect.any(Object))
      })
    })
  })

  describe('message display', () => {
    it('aligns current user messages to the right', async () => {
      render(<ChatWindow {...defaultProps} />)

      await waitFor(() => {
        const messageContainer = screen.getByText('Hello there!').closest('div[class*="flex"]')
        expect(messageContainer).toHaveClass('justify-end')
      })
    })

    it('aligns other user messages to the left', async () => {
      render(<ChatWindow {...defaultProps} />)

      await waitFor(() => {
        const messageContainer = screen.getByText('Hi! How are you?').closest('div[class*="flex"]')
        expect(messageContainer).toHaveClass('justify-start')
      })
    })
  })

  describe('accessibility', () => {
    it('has accessible input placeholder', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockMessages),
      })

      render(<ChatWindow {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument()
      })
    })
  })
})
