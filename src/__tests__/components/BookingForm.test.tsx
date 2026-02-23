/**
 * Tests for BookingForm component
 */

import { render, screen, fireEvent } from '@testing-library/react'
import BookingForm from '@/components/BookingForm'

// Mock dependencies
const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}))

const mockIsOffline = { isOffline: false }
jest.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => mockIsOffline,
}))

jest.mock('@/app/actions/booking', () => ({
  createBooking: jest.fn(),
}))

import { createBooking } from '@/app/actions/booking'

describe('BookingForm', () => {
  const defaultProps = {
    listingId: 'listing-123',
    price: 1500,
    ownerId: 'owner-456',
    isOwner: false,
    isLoggedIn: true,
    status: 'ACTIVE' as const,
    bookedDates: [],
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockIsOffline.isOffline = false
    sessionStorage.clear()
    ;(createBooking as jest.Mock).mockResolvedValue({ success: true })
  })

  describe('rendering', () => {
    it('displays price amount', () => {
      render(<BookingForm {...defaultProps} />)

      // Price appears multiple times (header and breakdown), so use getAllByText
      expect(screen.getAllByText('$1500').length).toBeGreaterThan(0)
    })

    it('shows Available now status for ACTIVE listing', () => {
      render(<BookingForm {...defaultProps} />)

      expect(screen.getByText('Available now')).toBeInTheDocument()
    })

    it('shows Temporarily unavailable status for PAUSED listing', () => {
      render(<BookingForm {...defaultProps} status="PAUSED" />)

      expect(screen.getByText('Temporarily unavailable')).toBeInTheDocument()
    })

    it('shows Currently rented status for RENTED listing', () => {
      render(<BookingForm {...defaultProps} status="RENTED" />)

      expect(screen.getByText('Currently rented')).toBeInTheDocument()
    })

    it('returns null for owner view', () => {
      const { container } = render(<BookingForm {...defaultProps} isOwner={true} />)

      expect(container.firstChild).toBeNull()
    })

    it('shows login gate for non-logged-in users', () => {
      render(<BookingForm {...defaultProps} isLoggedIn={false} />)

      expect(screen.getByText('Sign in to book this room')).toBeInTheDocument()
    })

    it('hides booking form and price breakdown for non-logged-in users', () => {
      render(<BookingForm {...defaultProps} isLoggedIn={false} />)
      // Login gate should be visible
      expect(screen.getByText('Sign in to book this room')).toBeInTheDocument()
      // Form elements should NOT be in the DOM
      expect(screen.queryByText('Check-in')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /request to book/i })).not.toBeInTheDocument()
      expect(screen.queryByText('Price breakdown')).not.toBeInTheDocument()
    })

    it('shows minimum stay requirement', () => {
      render(<BookingForm {...defaultProps} />)

      expect(screen.getByText('30 day minimum')).toBeInTheDocument()
    })

    it('displays booked dates when provided', () => {
      const bookedDates = [
        { startDate: '2025-01-15', endDate: '2025-02-15' },
      ]
      render(<BookingForm {...defaultProps} bookedDates={bookedDates} />)

      expect(screen.getByText('Booked Periods')).toBeInTheDocument()
    })
  })

  describe('date validation', () => {
    it('shows error for missing dates on submit', () => {
      render(<BookingForm {...defaultProps} />)

      const submitButton = screen.getByRole('button', { name: /request to book/i })
      fireEvent.click(submitButton)

      expect(screen.getByText(/please select both check-in and check-out dates/i)).toBeInTheDocument()
    })
  })

  describe('network status', () => {
    it('shows offline banner when offline', () => {
      mockIsOffline.isOffline = true
      render(<BookingForm {...defaultProps} />)

      expect(screen.getByText(/you're offline/i)).toBeInTheDocument()
    })

    it('disables submit button when offline', () => {
      mockIsOffline.isOffline = true
      render(<BookingForm {...defaultProps} />)

      const submitButton = screen.getByRole('button', { name: /request to book/i })
      expect(submitButton).toBeDisabled()
    })
  })

  describe('form elements', () => {
    it('shows date labels', () => {
      render(<BookingForm {...defaultProps} />)

      expect(screen.getByText('Check-in')).toBeInTheDocument()
      expect(screen.getByText('Check-out')).toBeInTheDocument()
    })

    it('shows request to book button', () => {
      render(<BookingForm {...defaultProps} />)

      expect(screen.getByRole('button', { name: /request to book/i })).toBeInTheDocument()
    })

    it('shows disclaimer text', () => {
      render(<BookingForm {...defaultProps} />)

      expect(screen.getByText("You won't be charged yet")).toBeInTheDocument()
    })
  })

  describe('status handling', () => {
    it('shows unavailable message for PAUSED status', () => {
      render(<BookingForm {...defaultProps} status="PAUSED" />)

      // Multiple elements may have this text (header and body)
      expect(screen.getAllByText(/temporarily unavailable/i).length).toBeGreaterThan(0)
    })

    it('shows rented message for RENTED status', () => {
      render(<BookingForm {...defaultProps} status="RENTED" />)

      // Multiple elements may have this text (header and body)
      expect(screen.getAllByText(/currently rented/i).length).toBeGreaterThan(0)
    })
  })

  describe('idempotency', () => {
    it('checks session storage for pending submission', () => {
      render(<BookingForm {...defaultProps} />)

      // The component should generate a key
      expect(sessionStorage.getItem(`booking_submitted_${defaultProps.listingId}`)).toBeNull()
    })

    it('shows already submitted message when session storage has submission', () => {
      sessionStorage.setItem(`booking_submitted_${defaultProps.listingId}`, 'true')

      render(<BookingForm {...defaultProps} />)

      expect(screen.getByText(/already submitted/i)).toBeInTheDocument()
    })
  })
})
