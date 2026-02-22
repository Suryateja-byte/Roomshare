import { render, screen } from '@testing-library/react'
import SearchViewToggle from '@/components/SearchViewToggle'

let matchMediaMatches = true

beforeEach(() => {
  matchMediaMatches = true
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: matchMediaMatches,
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  })
})

jest.mock('@/contexts/ListingFocusContext', () => ({
  useListingFocus: () => ({ activeId: null }),
}))

jest.mock('@/components/search/MobileBottomSheet', () => {
  return function MockSheet({ children }: { children: React.ReactNode }) {
    return <div data-testid="mobile-bottom-sheet">{children}</div>
  }
})

jest.mock('@/components/search/FloatingMapButton', () => {
  return function MockBtn() { return <div data-testid="floating-btn" /> }
})

const props = {
  mapComponent: <div data-testid="map">Map</div>,
  shouldShowMap: true,
  onToggle: jest.fn(),
  isLoading: false,
}

function TestChild() {
  return <div data-testid="child-instance">Child</div>
}

describe('SearchViewToggle', () => {
  it('renders children exactly once on desktop', () => {
    matchMediaMatches = true
    render(<SearchViewToggle {...props}><TestChild /></SearchViewToggle>)
    expect(screen.getAllByTestId('child-instance')).toHaveLength(1)
  })

  it('renders children exactly once on mobile', () => {
    matchMediaMatches = false
    render(<SearchViewToggle {...props}><TestChild /></SearchViewToggle>)
    expect(screen.getAllByTestId('child-instance')).toHaveLength(1)
  })

  it('renders N children once each, not 2N', () => {
    matchMediaMatches = true
    render(
      <SearchViewToggle {...props}>
        <div data-testid="card">A</div>
        <div data-testid="card">B</div>
        <div data-testid="card">C</div>
      </SearchViewToggle>
    )
    expect(screen.getAllByTestId('card')).toHaveLength(3)
  })
})
