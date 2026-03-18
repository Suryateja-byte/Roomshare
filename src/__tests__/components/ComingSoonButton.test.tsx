import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ComingSoonButton from '@/components/ComingSoonButton'

jest.mock('sonner', () => ({
  toast: { info: jest.fn() },
}))
import { toast } from 'sonner'
const mockToast = toast as jest.Mocked<typeof toast>

describe('ComingSoonButton', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders children', () => {
    render(<ComingSoonButton>Test Label</ComingSoonButton>)
    expect(screen.getByText('Test Label')).toBeInTheDocument()
  })

  it('applies className', () => {
    render(<ComingSoonButton className="test-class">Label</ComingSoonButton>)
    expect(screen.getByRole('button')).toHaveClass('test-class')
  })

  it('shows toast on click', async () => {
    render(<ComingSoonButton>Click Me</ComingSoonButton>)
    await userEvent.click(screen.getByText('Click Me'))
    expect(mockToast.info).toHaveBeenCalledWith('Coming soon')
  })

  it('renders as button with type="button"', () => {
    render(<ComingSoonButton>Label</ComingSoonButton>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
  })
})
