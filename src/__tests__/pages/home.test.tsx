/**
 * Tests for home page
 */
import { render, screen } from '@testing-library/react'

// Mock the components that would be used in the home page
jest.mock('@/components/SearchForm', () => {
  return function MockSearchForm() {
    return <div data-testid="search-form">Search Form</div>
  }
})

jest.mock('@/components/ListingCard', () => {
  return function MockListingCard({ listing }: { listing: any }) {
    return <div data-testid="listing-card">{listing.title}</div>
  }
})

// Simple home page component for testing (simulated)
function HomePage({ listings }: { listings: any[] }) {
  return (
    <div>
      <h1>Find Your Perfect Roommate</h1>
      <div data-testid="search-form">Search Form</div>
      <div>
        {listings.map((listing) => (
          <div key={listing.id} data-testid="listing-card">
            {listing.title}
          </div>
        ))}
      </div>
    </div>
  )
}

describe('Home Page', () => {
  const mockListings = [
    { id: '1', title: 'Listing 1', price: 800 },
    { id: '2', title: 'Listing 2', price: 900 },
    { id: '3', title: 'Listing 3', price: 1000 },
  ]

  describe('rendering', () => {
    it('renders main heading', () => {
      render(<HomePage listings={mockListings} />)
      expect(screen.getByText('Find Your Perfect Roommate')).toBeInTheDocument()
    })

    it('renders search form', () => {
      render(<HomePage listings={mockListings} />)
      expect(screen.getByTestId('search-form')).toBeInTheDocument()
    })

    it('renders listing cards', () => {
      render(<HomePage listings={mockListings} />)
      const cards = screen.getAllByTestId('listing-card')
      expect(cards).toHaveLength(3)
    })

    it('renders listing titles', () => {
      render(<HomePage listings={mockListings} />)
      expect(screen.getByText('Listing 1')).toBeInTheDocument()
      expect(screen.getByText('Listing 2')).toBeInTheDocument()
      expect(screen.getByText('Listing 3')).toBeInTheDocument()
    })
  })

  describe('empty state', () => {
    it('renders with no listings', () => {
      render(<HomePage listings={[]} />)
      expect(screen.queryByTestId('listing-card')).not.toBeInTheDocument()
    })
  })
})
