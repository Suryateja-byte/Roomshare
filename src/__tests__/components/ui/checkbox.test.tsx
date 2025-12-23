import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Checkbox } from '@/components/ui/checkbox'

describe('Checkbox', () => {
  it('renders checkbox', () => {
    render(<Checkbox />)
    expect(screen.getByRole('checkbox')).toBeInTheDocument()
  })

  it('is unchecked by default', () => {
    render(<Checkbox />)
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })

  it('can be checked', async () => {
    render(<Checkbox />)
    const checkbox = screen.getByRole('checkbox')

    await userEvent.click(checkbox)

    expect(checkbox).toBeChecked()
  })

  it('can be unchecked', async () => {
    render(<Checkbox defaultChecked />)
    const checkbox = screen.getByRole('checkbox')

    await userEvent.click(checkbox)

    expect(checkbox).not.toBeChecked()
  })

  it('handles disabled state', () => {
    render(<Checkbox disabled />)
    expect(screen.getByRole('checkbox')).toBeDisabled()
  })

  it('calls onCheckedChange', async () => {
    const handleChange = jest.fn()
    render(<Checkbox onCheckedChange={handleChange} />)

    await userEvent.click(screen.getByRole('checkbox'))

    expect(handleChange).toHaveBeenCalledWith(true)
  })

  it('applies custom className', () => {
    render(<Checkbox className="custom-class" />)
    // Radix checkbox applies to the button element
    expect(document.querySelector('.custom-class')).toBeInTheDocument()
  })

  it('supports controlled checked state', () => {
    const { rerender } = render(<Checkbox checked={false} />)
    expect(screen.getByRole('checkbox')).not.toBeChecked()

    rerender(<Checkbox checked={true} />)
    expect(screen.getByRole('checkbox')).toBeChecked()
  })

  it('renders with aria-label', () => {
    render(<Checkbox aria-label="Accept terms" />)
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-label', 'Accept terms')
  })

  it('has focus styles', () => {
    render(<Checkbox />)
    const checkbox = screen.getByRole('checkbox')
    expect(checkbox).toHaveClass('focus-visible:ring-2')
  })
})
