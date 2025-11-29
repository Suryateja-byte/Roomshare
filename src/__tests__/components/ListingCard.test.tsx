import { render, screen } from '@testing-library/react'
import ListingCard from '@/components/ListingCard'

// Mock FavoriteButton
jest.mock('@/components/FavoriteButton', () => {
  return function MockFavoriteButton({ listingId, initialIsSaved }: { listingId: string; initialIsSaved?: boolean }) {
    return (
      <button data-testid="favorite-button" data-listing-id={listingId} data-saved={initialIsSaved}>
        Favorite
      </button>
    )
  }
})

// Mock next/image
jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt, onError, ...props }: any) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} {...props} />
  ),
}))

const mockListing = {
  id: 'listing-123',
  title: 'Cozy Room in Downtown',
  price: 800,
  description: 'A beautiful cozy room.',
  location: {
    city: 'San Francisco',
    state: 'CA',
  },
  amenities: ['WiFi', 'Parking', 'Laundry', 'Pool'],
  availableSlots: 2,
  images: ['/image1.jpg'],
}

describe('ListingCard', () => {
  describe('rendering', () => {
    it('renders listing title', () => {
      render(<ListingCard listing={mockListing} />)
      expect(screen.getByText('Cozy Room in Downtown')).toBeInTheDocument()
    })

    it('renders formatted price', () => {
      render(<ListingCard listing={mockListing} />)
      expect(screen.getByText('$800')).toBeInTheDocument()
      expect(screen.getByText('/mo')).toBeInTheDocument()
    })

    it('renders location', () => {
      render(<ListingCard listing={mockListing} />)
      expect(screen.getByText('San Francisco, CA')).toBeInTheDocument()
    })

    it('renders amenities (max 3)', () => {
      render(<ListingCard listing={mockListing} />)
      expect(screen.getByText('WiFi')).toBeInTheDocument()
      expect(screen.getByText('Parking')).toBeInTheDocument()
      expect(screen.getByText('Laundry')).toBeInTheDocument()
      // Fourth amenity should not be visible
      expect(screen.queryByText('Pool')).not.toBeInTheDocument()
    })

    it('renders availability badge as Available', () => {
      render(<ListingCard listing={mockListing} />)
      expect(screen.getByText('Available')).toBeInTheDocument()
    })

    it('renders availability badge as Filled when no slots', () => {
      const filledListing = { ...mockListing, availableSlots: 0 }
      render(<ListingCard listing={filledListing} />)
      expect(screen.getByText('Filled')).toBeInTheDocument()
    })

    it('renders FavoriteButton', () => {
      render(<ListingCard listing={mockListing} />)
      expect(screen.getByTestId('favorite-button')).toBeInTheDocument()
    })

    it('passes isSaved prop to FavoriteButton', () => {
      render(<ListingCard listing={mockListing} isSaved={true} />)
      const favoriteBtn = screen.getByTestId('favorite-button')
      expect(favoriteBtn).toHaveAttribute('data-saved', 'true')
    })

    it('links to listing detail page', () => {
      render(<ListingCard listing={mockListing} />)
      const link = screen.getByRole('link')
      expect(link).toHaveAttribute('href', '/listings/listing-123')
    })
  })

  describe('price formatting', () => {
    it('formats price with comma for thousands', () => {
      const expensiveListing = { ...mockListing, price: 1500 }
      render(<ListingCard listing={expensiveListing} />)
      expect(screen.getByText('$1,500')).toBeInTheDocument()
    })

    it('shows Free for zero price', () => {
      const freeListing = { ...mockListing, price: 0 }
      render(<ListingCard listing={freeListing} />)
      expect(screen.getByText('Free')).toBeInTheDocument()
    })

    it('handles negative price', () => {
      const negativeListing = { ...mockListing, price: -100 }
      render(<ListingCard listing={negativeListing} />)
      expect(screen.getByText('$0')).toBeInTheDocument()
    })
  })

  describe('location formatting', () => {
    it('abbreviates full state names', () => {
      const listing = {
        ...mockListing,
        location: { city: 'Austin', state: 'Texas' },
      }
      render(<ListingCard listing={listing} />)
      expect(screen.getByText('Austin, TX')).toBeInTheDocument()
    })

    it('keeps state abbreviation as is', () => {
      const listing = {
        ...mockListing,
        location: { city: 'Denver', state: 'CO' },
      }
      render(<ListingCard listing={listing} />)
      expect(screen.getByText('Denver, CO')).toBeInTheDocument()
    })

    it('removes duplicate state from city', () => {
      const listing = {
        ...mockListing,
        location: { city: 'Irving, TX', state: 'TX' },
      }
      render(<ListingCard listing={listing} />)
      expect(screen.getByText('Irving, TX')).toBeInTheDocument()
      // Should not show "Irving, TX, TX"
      expect(screen.queryByText('Irving, TX, TX')).not.toBeInTheDocument()
    })
  })

  describe('title fallback', () => {
    it('shows Untitled Listing for empty title', () => {
      const listing = { ...mockListing, title: '' }
      render(<ListingCard listing={listing} />)
      expect(screen.getByText('Untitled Listing')).toBeInTheDocument()
    })

    it('shows Untitled Listing for whitespace title', () => {
      const listing = { ...mockListing, title: '   ' }
      render(<ListingCard listing={listing} />)
      expect(screen.getByText('Untitled Listing')).toBeInTheDocument()
    })

    it('trims title whitespace', () => {
      const listing = { ...mockListing, title: '  Nice Room  ' }
      render(<ListingCard listing={listing} />)
      // The component should handle trimming
      expect(screen.getByText('Nice Room')).toBeInTheDocument()
    })
  })

  describe('images', () => {
    it('renders listing image when available', () => {
      render(<ListingCard listing={mockListing} />)
      const img = screen.getByRole('img')
      expect(img).toHaveAttribute('src', '/image1.jpg')
    })

    it('renders placeholder when no images', () => {
      const listing = { ...mockListing, images: [] }
      render(<ListingCard listing={listing} />)
      expect(screen.getByText('No Photos')).toBeInTheDocument()
    })

    it('renders placeholder when images undefined', () => {
      const listing = { ...mockListing, images: undefined }
      render(<ListingCard listing={listing} />)
      expect(screen.getByText('No Photos')).toBeInTheDocument()
    })
  })

  describe('accessibility', () => {
    it('has accessible link', () => {
      render(<ListingCard listing={mockListing} />)
      const link = screen.getByRole('link')
      expect(link).toBeInTheDocument()
    })

    it('has alt text on image', () => {
      render(<ListingCard listing={mockListing} />)
      const img = screen.getByRole('img')
      expect(img).toHaveAttribute('alt', 'Cozy Room in Downtown')
    })

    it('has rating aria-label', () => {
      render(<ListingCard listing={mockListing} />)
      const rating = screen.getByLabelText(/rating/i)
      expect(rating).toBeInTheDocument()
    })
  })

  describe('rating display', () => {
    it('displays rating value', () => {
      render(<ListingCard listing={mockListing} />)
      expect(screen.getByText('4.9')).toBeInTheDocument()
    })

    it('displays star icon', () => {
      const { container } = render(<ListingCard listing={mockListing} />)
      const starSvg = container.querySelector('svg.text-amber-400')
      expect(starSvg).toBeInTheDocument()
    })
  })
})
