import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SignUpPage from '@/app/signup/page'

// Mock next-auth/react
const mockSignIn = jest.fn()
jest.mock('next-auth/react', () => ({
  signIn: (...args: any[]) => mockSignIn(...args),
}))

// Mock next/navigation
const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}))

// Mock next/link
jest.mock('next/link', () => {
  return function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>
  }
})

// Mock fetch
const mockFetch = jest.fn()
global.fetch = mockFetch

describe('SignUpPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders signup form', () => {
    render(<SignUpPage />)

    expect(screen.getByText('Create an account')).toBeInTheDocument()
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
  })

  it('renders google sign up button', () => {
    render(<SignUpPage />)

    expect(screen.getByText('Continue with Google')).toBeInTheDocument()
  })

  it('renders sign in link', () => {
    render(<SignUpPage />)

    const signInLink = screen.getByText('Sign in')
    expect(signInLink.closest('a')).toHaveAttribute('href', '/login')
  })

  it('submits form successfully', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'user-123', name: 'Test User' }),
    })

    render(<SignUpPage />)

    await userEvent.type(screen.getByLabelText(/full name/i), 'Test User')
    await userEvent.type(screen.getByLabelText(/email/i), 'test@example.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'password123')
    await userEvent.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.any(String),
      })
    })

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/login?registered=true')
    })
  })

  it('shows error on registration failure', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'User already exists' }),
    })

    render(<SignUpPage />)

    await userEvent.type(screen.getByLabelText(/full name/i), 'Test User')
    await userEvent.type(screen.getByLabelText(/email/i), 'existing@example.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'password123')
    await userEvent.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => {
      expect(screen.getByText('User already exists')).toBeInTheDocument()
    })
  })

  it('calls Google signIn when clicking Google button', async () => {
    render(<SignUpPage />)

    await userEvent.click(screen.getByText('Continue with Google'))

    expect(mockSignIn).toHaveBeenCalledWith('google', { callbackUrl: '/' })
  })

  it('shows loading state during registration', async () => {
    mockFetch.mockImplementation(() => new Promise(() => {})) // Never resolves

    render(<SignUpPage />)

    await userEvent.type(screen.getByLabelText(/full name/i), 'Test User')
    await userEvent.type(screen.getByLabelText(/email/i), 'test@example.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'password123')
    await userEvent.click(screen.getByRole('button', { name: /create account/i }))

    // Button should be disabled
    expect(screen.getByRole('button', { name: '' })).toBeDisabled()
  })

  it('shows password requirements', () => {
    render(<SignUpPage />)

    expect(screen.getByText(/must be at least 8 characters/i)).toBeInTheDocument()
  })

  it('handles network errors', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))

    render(<SignUpPage />)

    await userEvent.type(screen.getByLabelText(/full name/i), 'Test User')
    await userEvent.type(screen.getByLabelText(/email/i), 'test@example.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'password123')
    await userEvent.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument()
    })
  })
})
