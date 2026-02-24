import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Footer from '@/components/Footer'

// Mock next/link
jest.mock('next/link', () => {
  return function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>
  }
})

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: { info: jest.fn() },
}))
import { toast } from 'sonner'
const mockToast = toast as jest.Mocked<typeof toast>

describe('Footer', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders brand name', () => {
    render(<Footer />)
    expect(screen.getByText('RoomShare')).toBeInTheDocument()
  })

  it('renders tagline', () => {
    render(<Footer />)
    expect(screen.getByText(/modern standard for shared living/i)).toBeInTheDocument()
  })

  it('renders platform links', () => {
    render(<Footer />)
    expect(screen.getByText('Platform')).toBeInTheDocument()
    expect(screen.getByText('Browse')).toBeInTheDocument()
    expect(screen.getByText('List a Room')).toBeInTheDocument()
  })

  it('renders company links', () => {
    render(<Footer />)
    expect(screen.getByText('Company')).toBeInTheDocument()
    expect(screen.getByText('About')).toBeInTheDocument()
    expect(screen.getByText('Careers')).toBeInTheDocument()
    expect(screen.getByText('Blog')).toBeInTheDocument()
  })

  it('renders support links', () => {
    render(<Footer />)
    expect(screen.getByText('Support')).toBeInTheDocument()
    expect(screen.getByText('Help Center')).toBeInTheDocument()
    expect(screen.getByText('Contact')).toBeInTheDocument()
  })

  it('renders legal links', () => {
    render(<Footer />)
    expect(screen.getByText('Legal')).toBeInTheDocument()
    // Multiple Privacy/Terms links
    expect(screen.getAllByText('Privacy').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Terms').length).toBeGreaterThanOrEqual(1)
  })

  it('renders copyright with current year', () => {
    render(<Footer />)
    const currentYear = new Date().getFullYear().toString()
    expect(screen.getByText(new RegExp(`© ${currentYear} RoomShare Inc.`))).toBeInTheDocument()
  })

  it('shows toast for coming soon links', async () => {
    render(<Footer />)

    await userEvent.click(screen.getByText('Careers'))
    expect(mockToast.info).toHaveBeenNthCalledWith(1, 'Coming soon')

    await userEvent.click(screen.getByText('Blog'))
    expect(mockToast.info).toHaveBeenNthCalledWith(2, 'Coming soon')
  })

  it('has correct links for Browse', () => {
    render(<Footer />)
    const browseLink = screen.getByText('Browse')
    expect(browseLink.closest('a')).toHaveAttribute('href', '/search')
  })

  it('has correct links for About', () => {
    render(<Footer />)
    const aboutLink = screen.getByText('About')
    expect(aboutLink.closest('a')).toHaveAttribute('href', '/about')
  })

  it('has correct links for List a Room', () => {
    render(<Footer />)
    const listLink = screen.getByText('List a Room')
    expect(listLink.closest('a')).toHaveAttribute('href', '/listings/create')
  })
})
