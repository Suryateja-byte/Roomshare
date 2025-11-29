import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Textarea } from '@/components/ui/textarea'

describe('Textarea', () => {
  it('renders textarea element', () => {
    render(<Textarea />)
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('renders with placeholder', () => {
    render(<Textarea placeholder="Enter description" />)
    expect(screen.getByPlaceholderText('Enter description')).toBeInTheDocument()
  })

  it('renders with default value', () => {
    render(<Textarea defaultValue="test value" />)
    expect(screen.getByDisplayValue('test value')).toBeInTheDocument()
  })

  it('allows typing', async () => {
    render(<Textarea />)
    const textarea = screen.getByRole('textbox')

    await userEvent.type(textarea, 'Hello World')

    expect(textarea).toHaveValue('Hello World')
  })

  it('handles disabled state', () => {
    render(<Textarea disabled />)
    expect(screen.getByRole('textbox')).toBeDisabled()
  })

  it('handles readonly state', () => {
    render(<Textarea readOnly defaultValue="readonly" />)
    expect(screen.getByRole('textbox')).toHaveAttribute('readonly')
  })

  it('applies custom className', () => {
    render(<Textarea className="custom-class" />)
    expect(screen.getByRole('textbox')).toHaveClass('custom-class')
  })

  it('forwards ref', () => {
    const ref = jest.fn()
    render(<Textarea ref={ref} />)
    expect(ref).toHaveBeenCalled()
  })

  it('supports rows attribute', () => {
    render(<Textarea rows={5} />)
    expect(screen.getByRole('textbox')).toHaveAttribute('rows', '5')
  })

  it('calls onChange handler', async () => {
    const handleChange = jest.fn()
    render(<Textarea onChange={handleChange} />)

    await userEvent.type(screen.getByRole('textbox'), 'a')

    expect(handleChange).toHaveBeenCalled()
  })
})
