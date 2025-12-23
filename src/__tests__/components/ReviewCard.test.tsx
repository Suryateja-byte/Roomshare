import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ReviewCard from '@/components/ReviewCard'

// Mock dependencies
jest.mock('@/components/UserAvatar', () => {
  return function MockUserAvatar({ name, image, size }: any) {
    return <div data-testid="user-avatar" data-name={name} data-image={image} data-size={size}>Avatar</div>
  }
})

jest.mock('@/components/ReviewResponseForm', () => {
  return function MockReviewResponseForm({ reviewId, existingResponse, onClose }: any) {
    return (
      <div data-testid="review-response-form">
        <span data-testid="form-review-id">{reviewId}</span>
        <button onClick={onClose}>Close</button>
      </div>
    )
  }
})

jest.mock('@/app/actions/review-response', () => ({
  deleteReviewResponse: jest.fn(),
}))

const mockRefresh = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: mockRefresh,
  }),
}))

const baseReview = {
  id: 'review-123',
  rating: 4,
  comment: 'Great place to stay! Very clean and comfortable.',
  createdAt: new Date('2024-01-15'),
  author: {
    name: 'John Doe',
    image: '/john.jpg',
  },
}

describe('ReviewCard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders review author name', () => {
      render(<ReviewCard review={baseReview} />)
      expect(screen.getByText('John Doe')).toBeInTheDocument()
    })

    it('renders Anonymous for null author name', () => {
      const review = { ...baseReview, author: { name: null, image: null } }
      render(<ReviewCard review={review} />)
      expect(screen.getByText('Anonymous')).toBeInTheDocument()
    })

    it('renders review comment', () => {
      render(<ReviewCard review={baseReview} />)
      expect(screen.getByText('Great place to stay! Very clean and comfortable.')).toBeInTheDocument()
    })

    it('renders review date', () => {
      render(<ReviewCard review={baseReview} />)
      expect(screen.getByText('January 2024')).toBeInTheDocument()
    })

    it('renders UserAvatar component', () => {
      render(<ReviewCard review={baseReview} />)
      const avatar = screen.getByTestId('user-avatar')
      expect(avatar).toHaveAttribute('data-name', 'John Doe')
      expect(avatar).toHaveAttribute('data-image', '/john.jpg')
    })
  })

  describe('rating display', () => {
    it('renders correct number of filled stars', () => {
      const { container } = render(<ReviewCard review={baseReview} />)
      const filledStars = container.querySelectorAll('svg.fill-amber-400')
      expect(filledStars).toHaveLength(4)
    })

    it('renders 5 stars total', () => {
      const { container } = render(<ReviewCard review={baseReview} />)
      const allStars = container.querySelectorAll('svg.w-4.h-4')
      expect(allStars).toHaveLength(5)
    })

    it('handles 5-star rating', () => {
      const review = { ...baseReview, rating: 5 }
      const { container } = render(<ReviewCard review={review} />)
      const filledStars = container.querySelectorAll('svg.fill-amber-400')
      expect(filledStars).toHaveLength(5)
    })

    it('handles 1-star rating', () => {
      const review = { ...baseReview, rating: 1 }
      const { container } = render(<ReviewCard review={review} />)
      const filledStars = container.querySelectorAll('svg.fill-amber-400')
      expect(filledStars).toHaveLength(1)
    })
  })

  describe('owner features', () => {
    it('shows respond button when owner and no response', () => {
      render(<ReviewCard review={baseReview} isOwner={true} />)
      expect(screen.getByText('Respond to this review')).toBeInTheDocument()
    })

    it('does not show respond button when not owner', () => {
      render(<ReviewCard review={baseReview} isOwner={false} />)
      expect(screen.queryByText('Respond to this review')).not.toBeInTheDocument()
    })

    it('shows response form when respond button clicked', async () => {
      render(<ReviewCard review={baseReview} isOwner={true} />)

      await userEvent.click(screen.getByText('Respond to this review'))

      expect(screen.getByTestId('review-response-form')).toBeInTheDocument()
    })

    it('hides respond button after clicking', async () => {
      render(<ReviewCard review={baseReview} isOwner={true} />)

      await userEvent.click(screen.getByText('Respond to this review'))

      expect(screen.queryByText('Respond to this review')).not.toBeInTheDocument()
    })
  })

  describe('with existing response', () => {
    const reviewWithResponse = {
      ...baseReview,
      response: {
        id: 'response-123',
        content: 'Thank you for your kind words!',
        createdAt: new Date('2024-01-16'),
      },
    }

    it('renders host response', () => {
      render(<ReviewCard review={reviewWithResponse} />)
      expect(screen.getByText('Host Response')).toBeInTheDocument()
      expect(screen.getByText('Thank you for your kind words!')).toBeInTheDocument()
    })

    it('renders response date', () => {
      render(<ReviewCard review={reviewWithResponse} />)
      // Date format depends on locale - there may be multiple dates
      const dates = screen.getAllByText(/2024/)
      expect(dates.length).toBeGreaterThanOrEqual(1)
    })

    it('does not show respond button when response exists', () => {
      render(<ReviewCard review={reviewWithResponse} isOwner={true} />)
      expect(screen.queryByText('Respond to this review')).not.toBeInTheDocument()
    })

    it('shows edit button for owner', () => {
      render(<ReviewCard review={reviewWithResponse} isOwner={true} />)
      expect(screen.getByTitle('Edit response')).toBeInTheDocument()
    })

    it('shows delete button for owner', () => {
      render(<ReviewCard review={reviewWithResponse} isOwner={true} />)
      expect(screen.getByTitle('Delete response')).toBeInTheDocument()
    })

    it('does not show edit/delete for non-owner', () => {
      render(<ReviewCard review={reviewWithResponse} isOwner={false} />)
      expect(screen.queryByTitle('Edit response')).not.toBeInTheDocument()
      expect(screen.queryByTitle('Delete response')).not.toBeInTheDocument()
    })

    it('shows edit form when edit button clicked', async () => {
      render(<ReviewCard review={reviewWithResponse} isOwner={true} />)

      await userEvent.click(screen.getByTitle('Edit response'))

      expect(screen.getByTestId('review-response-form')).toBeInTheDocument()
    })

    it('hides response when editing', async () => {
      render(<ReviewCard review={reviewWithResponse} isOwner={true} />)

      await userEvent.click(screen.getByTitle('Edit response'))

      expect(screen.queryByText('Host Response')).not.toBeInTheDocument()
    })
  })

  describe('delete response', () => {
    const reviewWithResponse = {
      ...baseReview,
      response: {
        id: 'response-123',
        content: 'Thank you!',
        createdAt: new Date(),
      },
    }

    beforeEach(() => {
      // Mock window.confirm
      window.confirm = jest.fn(() => true)
    })

    it('calls confirm before deleting', async () => {
      const { deleteReviewResponse } = require('@/app/actions/review-response')
      deleteReviewResponse.mockResolvedValue({ success: true })

      render(<ReviewCard review={reviewWithResponse} isOwner={true} />)

      await userEvent.click(screen.getByTitle('Delete response'))

      expect(window.confirm).toHaveBeenCalledWith('Are you sure you want to delete your response?')
    })

    it('does not delete if user cancels', async () => {
      window.confirm = jest.fn(() => false)
      const { deleteReviewResponse } = require('@/app/actions/review-response')

      render(<ReviewCard review={reviewWithResponse} isOwner={true} />)

      await userEvent.click(screen.getByTitle('Delete response'))

      expect(deleteReviewResponse).not.toHaveBeenCalled()
    })

    it('calls deleteReviewResponse on confirm', async () => {
      const { deleteReviewResponse } = require('@/app/actions/review-response')
      deleteReviewResponse.mockResolvedValue({ success: true })

      render(<ReviewCard review={reviewWithResponse} isOwner={true} />)

      await userEvent.click(screen.getByTitle('Delete response'))

      await waitFor(() => {
        expect(deleteReviewResponse).toHaveBeenCalledWith('response-123')
      })
    })

    it('refreshes router after successful delete', async () => {
      const { deleteReviewResponse } = require('@/app/actions/review-response')
      deleteReviewResponse.mockResolvedValue({ success: true })

      render(<ReviewCard review={reviewWithResponse} isOwner={true} />)

      await userEvent.click(screen.getByTitle('Delete response'))

      await waitFor(() => {
        expect(mockRefresh).toHaveBeenCalled()
      })
    })

    it('handles delete error gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()
      const { deleteReviewResponse } = require('@/app/actions/review-response')
      deleteReviewResponse.mockRejectedValue(new Error('Delete failed'))

      render(<ReviewCard review={reviewWithResponse} isOwner={true} />)

      await userEvent.click(screen.getByTitle('Delete response'))

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalled()
      })

      consoleSpy.mockRestore()
    })
  })

  describe('styling', () => {
    it('has border styling', () => {
      const { container } = render(<ReviewCard review={baseReview} />)
      expect(container.firstChild).toHaveClass('border-b')
    })

    it('response has border-left styling', () => {
      const reviewWithResponse = {
        ...baseReview,
        response: {
          id: 'response-123',
          content: 'Thanks!',
          createdAt: new Date(),
        },
      }
      const { container } = render(<ReviewCard review={reviewWithResponse} />)
      const responseDiv = container.querySelector('.border-l-2')
      expect(responseDiv).toBeInTheDocument()
    })
  })
})
