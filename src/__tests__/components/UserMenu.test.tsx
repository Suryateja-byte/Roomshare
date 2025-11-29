import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import UserMenu from '@/components/UserMenu'

// Mock next-auth/react
const mockSignOut = jest.fn()
jest.mock('next-auth/react', () => ({
  signOut: (...args: any[]) => mockSignOut(...args),
}))

// Mock next/link
jest.mock('next/link', () => {
  return function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>
  }
})

describe('UserMenu', () => {
  const mockUser = {
    id: 'user-123',
    name: 'John Doe',
    email: 'john@example.com',
    image: null,
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders user initial', () => {
    render(<UserMenu user={mockUser} />)
    expect(screen.getByText('J')).toBeInTheDocument()
  })

  it('renders user name on larger screens', () => {
    render(<UserMenu user={mockUser} />)
    expect(screen.getByText('John Doe')).toBeInTheDocument()
  })

  it('opens menu on click', async () => {
    render(<UserMenu user={mockUser} />)

    await userEvent.click(screen.getByRole('button'))

    expect(screen.getByText('john@example.com')).toBeInTheDocument()
    expect(screen.getByText('Profile')).toBeInTheDocument()
    expect(screen.getByText('Sign out')).toBeInTheDocument()
  })

  it('shows profile link', async () => {
    render(<UserMenu user={mockUser} />)

    await userEvent.click(screen.getByRole('button'))

    const profileLink = screen.getByText('Profile')
    expect(profileLink.closest('a')).toHaveAttribute('href', '/profile')
  })

  it('calls signOut when clicking sign out', async () => {
    render(<UserMenu user={mockUser} />)

    await userEvent.click(screen.getByRole('button'))
    await userEvent.click(screen.getByText('Sign out'))

    expect(mockSignOut).toHaveBeenCalled()
  })

  it('closes menu when clicking outside', async () => {
    render(<UserMenu user={mockUser} />)

    // Open menu
    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByText('john@example.com')).toBeInTheDocument()

    // Click overlay
    const overlay = document.querySelector('.fixed.inset-0')
    if (overlay) {
      await userEvent.click(overlay)
    }

    // Menu should be closed (email no longer visible)
    expect(screen.queryByText('john@example.com')).not.toBeInTheDocument()
  })

  it('handles user without name', () => {
    const userWithoutName = { ...mockUser, name: undefined }
    render(<UserMenu user={userWithoutName} />)
    expect(screen.getByText('U')).toBeInTheDocument()
  })
})
