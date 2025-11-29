import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SortSelect from '@/components/SortSelect'

// Mock next/navigation
const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useSearchParams: () => new URLSearchParams(),
}))

describe('SortSelect', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders sort select', () => {
    render(<SortSelect currentSort="recommended" />)
    expect(screen.getByText('Sort by:')).toBeInTheDocument()
  })

  it('renders all sort options', () => {
    render(<SortSelect currentSort="recommended" />)

    expect(screen.getByRole('option', { name: 'Recommended' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Price: Low to High' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Price: High to Low' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Newest First' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Top Rated' })).toBeInTheDocument()
  })

  it('shows current sort as selected', () => {
    render(<SortSelect currentSort="price_asc" />)

    const select = screen.getByRole('combobox')
    expect(select).toHaveValue('price_asc')
  })

  it('navigates with sort param on change', async () => {
    render(<SortSelect currentSort="recommended" />)

    await userEvent.selectOptions(screen.getByRole('combobox'), 'price_desc')

    expect(mockPush).toHaveBeenCalledWith('/search?sort=price_desc')
  })

  it('removes sort param when selecting recommended', async () => {
    render(<SortSelect currentSort="price_asc" />)

    await userEvent.selectOptions(screen.getByRole('combobox'), 'recommended')

    expect(mockPush).toHaveBeenCalledWith('/search?')
  })

  it('removes page param when changing sort', async () => {
    // Override mock to include page param
    jest.mock('next/navigation', () => ({
      useRouter: () => ({ push: mockPush }),
      useSearchParams: () => new URLSearchParams('page=3'),
    }))

    render(<SortSelect currentSort="recommended" />)

    await userEvent.selectOptions(screen.getByRole('combobox'), 'newest')

    // Should not include page param
    expect(mockPush).toHaveBeenCalled()
    const url = mockPush.mock.calls[0][0]
    expect(url).not.toContain('page=')
  })
})
