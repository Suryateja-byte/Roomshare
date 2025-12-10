import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SaveSearchButton from '@/components/SaveSearchButton'

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
  useSearchParams: () => new URLSearchParams('q=apartment&minPrice=500&maxPrice=1500'),
}))

// Mock saveSearch
const mockSaveSearch = jest.fn()
jest.mock('@/app/actions/saved-search', () => ({
  saveSearch: (...args: any[]) => mockSaveSearch(...args),
}))

describe('SaveSearchButton', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders save search button', () => {
    render(<SaveSearchButton />)
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('opens modal on click', async () => {
    render(<SaveSearchButton />)

    await userEvent.click(screen.getByRole('button'))

    expect(screen.getByText('Save This Search')).toBeInTheDocument()
    expect(screen.getByText('Search Name')).toBeInTheDocument()
  })

  it('generates default name from filters', async () => {
    render(<SaveSearchButton />)

    await userEvent.click(screen.getByRole('button'))

    const input = screen.getByRole('textbox')
    expect(input).toHaveValue('apartment - $500-$1500')
  })

  it('shows email alerts toggle', async () => {
    render(<SaveSearchButton />)

    await userEvent.click(screen.getByRole('button'))

    expect(screen.getByText('Email Alerts')).toBeInTheDocument()
    expect(screen.getByText('Get notified when new listings match')).toBeInTheDocument()
  })

  it('closes modal on cancel', async () => {
    render(<SaveSearchButton />)

    await userEvent.click(screen.getByRole('button'))
    await userEvent.click(screen.getByText('Cancel'))

    expect(screen.queryByText('Save This Search')).not.toBeInTheDocument()
  })

  it('shows error for empty name', async () => {
    render(<SaveSearchButton />)

    await userEvent.click(screen.getByRole('button'))
    // Clear the input
    const input = screen.getByRole('textbox')
    await userEvent.clear(input)
    // Use getAllByText and pick the button (last element)
    const saveButtons = screen.getAllByText('Save Search')
    await userEvent.click(saveButtons[saveButtons.length - 1])

    expect(screen.getByText('Please enter a name for this search')).toBeInTheDocument()
  })

  it('calls saveSearch on submit', async () => {
    mockSaveSearch.mockResolvedValue({ success: true, searchId: 'search-123' })

    render(<SaveSearchButton />)

    await userEvent.click(screen.getByRole('button'))
    // Use getAllByText and pick the button (last element)
    const saveButtons = screen.getAllByText('Save Search')
    await userEvent.click(saveButtons[saveButtons.length - 1])

    await waitFor(() => {
      expect(mockSaveSearch).toHaveBeenCalledWith({
        name: 'apartment - $500-$1500',
        filters: {
          query: 'apartment',
          minPrice: 500,
          maxPrice: 1500,
        },
        alertEnabled: true,
        alertFrequency: 'DAILY',
      })
    })
  })

  it('shows loading state while saving', async () => {
    mockSaveSearch.mockImplementation(() => new Promise(() => { }))

    render(<SaveSearchButton />)

    await userEvent.click(screen.getByRole('button'))
    // Use getAllByText and pick the button (last element)
    const saveButtons = screen.getAllByText('Save Search')
    await userEvent.click(saveButtons[saveButtons.length - 1])

    expect(screen.getByText('Saving...')).toBeInTheDocument()
  })

  it('shows error from API', async () => {
    mockSaveSearch.mockResolvedValue({ error: 'You can only save up to 10 searches' })

    render(<SaveSearchButton />)

    await userEvent.click(screen.getByRole('button'))
    // Use getAllByText and pick the button (last element)
    const saveButtons = screen.getAllByText('Save Search')
    await userEvent.click(saveButtons[saveButtons.length - 1])

    await waitFor(() => {
      expect(screen.getByText('You can only save up to 10 searches')).toBeInTheDocument()
    })
  })

  it('handles exceptions', async () => {
    mockSaveSearch.mockRejectedValue(new Error('Network error'))

    render(<SaveSearchButton />)

    await userEvent.click(screen.getByRole('button'))
    // Use getAllByText and pick the button (last element)
    const saveButtons = screen.getAllByText('Save Search')
    await userEvent.click(saveButtons[saveButtons.length - 1])

    await waitFor(() => {
      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    })
  })

  it('closes modal on successful save', async () => {
    mockSaveSearch.mockResolvedValue({ success: true, searchId: 'search-123' })

    render(<SaveSearchButton />)

    await userEvent.click(screen.getByRole('button'))
    // Use getAllByText and pick the button (last element)
    const saveButtons = screen.getAllByText('Save Search')
    await userEvent.click(saveButtons[saveButtons.length - 1])

    await waitFor(() => {
      expect(screen.queryByText('Save This Search')).not.toBeInTheDocument()
    })
  })
})
