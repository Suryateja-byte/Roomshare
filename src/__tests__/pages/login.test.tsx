import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LoginPage from '@/app/login/page'

// Mock next-auth/react
const mockSignIn = jest.fn()
jest.mock('next-auth/react', () => ({
  signIn: (...args: any[]) => mockSignIn(...args),
}))

// Mock next/navigation
const mockPush = jest.fn()
const mockRefresh = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
  useSearchParams: () => new URLSearchParams(),
}))

// Mock next/link
jest.mock('next/link', () => {
  return function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>
  }
})

describe('LoginPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders login form', () => {
    render(<LoginPage />)

    expect(screen.getByText('Welcome back')).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
  })

  it('renders google sign in button', () => {
    render(<LoginPage />)

    expect(screen.getByText('Continue with Google')).toBeInTheDocument()
  })

  it('renders sign up link', () => {
    render(<LoginPage />)

    const signUpLink = screen.getByText('Sign up')
    expect(signUpLink.closest('a')).toHaveAttribute('href', '/signup')
  })

  it('renders forgot password link', () => {
    render(<LoginPage />)

    const forgotLink = screen.getByText('Forgot password?')
    expect(forgotLink.closest('a')).toHaveAttribute('href', '/forgot-password')
  })

  it('calls signIn on form submit', async () => {
    mockSignIn.mockResolvedValue({ error: null })

    render(<LoginPage />)

    await userEvent.type(screen.getByLabelText(/email/i), 'test@example.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'password123')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('credentials', {
        email: 'test@example.com',
        password: 'password123',
        redirect: false,
      })
    })
  })

  it('redirects on successful login', async () => {
    mockSignIn.mockResolvedValue({ error: null })

    render(<LoginPage />)

    await userEvent.type(screen.getByLabelText(/email/i), 'test@example.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'password123')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/')
      expect(mockRefresh).toHaveBeenCalled()
    })
  })

  it('shows error on failed login', async () => {
    mockSignIn.mockResolvedValue({ error: 'Invalid credentials' })

    render(<LoginPage />)

    await userEvent.type(screen.getByLabelText(/email/i), 'test@example.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'wrongpassword')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByText('Invalid email or password')).toBeInTheDocument()
    })
  })

  it('calls Google signIn when clicking Google button', async () => {
    render(<LoginPage />)

    await userEvent.click(screen.getByText('Continue with Google'))

    expect(mockSignIn).toHaveBeenCalledWith('google', { callbackUrl: '/' })
  })

  it('shows loading state during login', async () => {
    mockSignIn.mockImplementation(() => new Promise(() => {})) // Never resolves

    render(<LoginPage />)

    await userEvent.type(screen.getByLabelText(/email/i), 'test@example.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'password123')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))

    // Button should be disabled
    expect(screen.getByRole('button', { name: '' })).toBeDisabled()
  })
})
