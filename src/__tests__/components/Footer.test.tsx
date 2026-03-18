import { render, screen } from '@testing-library/react'
import Footer from '@/components/Footer'

// Mock next/link
jest.mock('next/link', () => {
  return function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>
  }
})

// Mock FooterNavLink — renders as a plain link (usePathname tested separately)
jest.mock('@/components/FooterNavLink', () => {
  return function MockFooterNavLink({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) {
    return <a href={href} className={className}>{children}</a>
  }
})

// Mock ComingSoonButton — Footer no longer imports sonner directly
jest.mock('@/components/ComingSoonButton', () => {
  return function MockComingSoonButton({ children, className }: { children: React.ReactNode; className?: string }) {
    return <button className={className}>{children}</button>
  }
})

describe('Footer', () => {
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

  it('has Platform nav landmark', () => {
    render(<Footer />)
    expect(screen.getByRole('navigation', { name: /platform/i })).toBeInTheDocument()
  })

  it('has Company nav landmark', () => {
    render(<Footer />)
    expect(screen.getByRole('navigation', { name: /company/i })).toBeInTheDocument()
  })

  it('has Support nav landmark', () => {
    render(<Footer />)
    expect(screen.getByRole('navigation', { name: /support/i })).toBeInTheDocument()
  })

  it('has Legal nav landmark', () => {
    render(<Footer />)
    expect(screen.getByRole('navigation', { name: /legal/i })).toBeInTheDocument()
  })

  it('has exactly 4 nav landmarks', () => {
    render(<Footer />)
    const navs = screen.getAllByRole('navigation')
    expect(navs).toHaveLength(4)
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

  it('uses h2 headings for proper hierarchy', () => {
    render(<Footer />)
    const headings = screen.getAllByRole('heading', { level: 2 })
    const headingTexts = headings.map(h => h.textContent)
    expect(headingTexts).toContain('Platform')
    expect(headingTexts).toContain('Company')
    expect(headingTexts).toContain('Support')
    expect(headingTexts).toContain('Legal')
  })
})
