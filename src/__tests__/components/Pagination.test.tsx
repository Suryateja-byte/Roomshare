import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Pagination from '@/components/Pagination'

// Mock next/navigation
const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useSearchParams: () => new URLSearchParams(),
}))

describe('Pagination', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns null when totalPages is 1', () => {
    const { container } = render(
      <Pagination currentPage={1} totalPages={1} totalItems={5} itemsPerPage={10} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders pagination for multiple pages', () => {
    render(<Pagination currentPage={1} totalPages={5} totalItems={50} itemsPerPage={10} />)

    expect(screen.getByLabelText('Page 1')).toBeInTheDocument()
    expect(screen.getByLabelText('Page 5')).toBeInTheDocument()
    expect(screen.getByLabelText('Go to previous page')).toBeInTheDocument()
    expect(screen.getByLabelText('Go to next page')).toBeInTheDocument()
  })

  it('shows correct results info', () => {
    render(<Pagination currentPage={2} totalPages={5} totalItems={50} itemsPerPage={10} />)

    // Results text is in a paragraph with spans, use regex to find the container
    expect(screen.getByText(/Showing/)).toBeInTheDocument()
    expect(screen.getByText(/results/)).toBeInTheDocument()
  })

  it('disables previous button on first page', () => {
    render(<Pagination currentPage={1} totalPages={5} totalItems={50} itemsPerPage={10} />)

    expect(screen.getByLabelText('Go to previous page')).toBeDisabled()
    expect(screen.getByLabelText('Go to next page')).not.toBeDisabled()
  })

  it('disables next button on last page', () => {
    render(<Pagination currentPage={5} totalPages={5} totalItems={50} itemsPerPage={10} />)

    expect(screen.getByLabelText('Go to previous page')).not.toBeDisabled()
    expect(screen.getByLabelText('Go to next page')).toBeDisabled()
  })

  it('navigates to next page on click', async () => {
    render(<Pagination currentPage={2} totalPages={5} totalItems={50} itemsPerPage={10} />)

    await userEvent.click(screen.getByLabelText('Go to next page'))

    expect(mockPush).toHaveBeenCalledWith('?page=3', { scroll: false })
  })

  it('navigates to previous page on click', async () => {
    render(<Pagination currentPage={3} totalPages={5} totalItems={50} itemsPerPage={10} />)

    await userEvent.click(screen.getByLabelText('Go to previous page'))

    expect(mockPush).toHaveBeenCalledWith('?page=2', { scroll: false })
  })

  it('navigates to specific page on click', async () => {
    render(<Pagination currentPage={1} totalPages={5} totalItems={50} itemsPerPage={10} />)

    await userEvent.click(screen.getByLabelText('Page 3'))

    expect(mockPush).toHaveBeenCalledWith('?page=3', { scroll: false })
  })

  it('marks current page with aria-current', () => {
    render(<Pagination currentPage={3} totalPages={5} totalItems={50} itemsPerPage={10} />)

    expect(screen.getByLabelText('Page 3')).toHaveAttribute('aria-current', 'page')
  })

  it('shows ellipsis for many pages', () => {
    render(<Pagination currentPage={5} totalPages={10} totalItems={100} itemsPerPage={10} />)

    // Should show ellipsis between page 1 and current page range
    const ellipses = screen.getAllByText('...')
    expect(ellipses.length).toBeGreaterThanOrEqual(1)
  })

  it('handles last page with partial items', () => {
    render(<Pagination currentPage={5} totalPages={5} totalItems={43} itemsPerPage={10} />)

    // Check that the pagination renders correctly on the last page
    // Using getAllByText since numbers appear in multiple places (page numbers and results text)
    expect(screen.getAllByText('43').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/results/)).toBeInTheDocument()
  })
})
