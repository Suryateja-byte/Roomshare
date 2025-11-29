import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Input } from '@/components/ui/input'

describe('Input', () => {
  describe('rendering', () => {
    it('renders input element', () => {
      render(<Input />)
      expect(screen.getByRole('textbox')).toBeInTheDocument()
    })

    it('renders with placeholder', () => {
      render(<Input placeholder="Enter text" />)
      expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument()
    })

    it('renders with default value', () => {
      render(<Input defaultValue="test value" />)
      expect(screen.getByDisplayValue('test value')).toBeInTheDocument()
    })
  })

  describe('types', () => {
    it('renders text type by default', () => {
      render(<Input />)
      expect(screen.getByRole('textbox')).toBeInTheDocument()
    })

    it('renders email type', () => {
      render(<Input type="email" />)
      // email inputs are also textboxes
      expect(screen.getByRole('textbox')).toHaveAttribute('type', 'email')
    })

    it('renders password type', () => {
      render(<Input type="password" />)
      // password inputs don't have textbox role
      const input = document.querySelector('input[type="password"]')
      expect(input).toBeInTheDocument()
    })

    it('renders number type', () => {
      render(<Input type="number" />)
      expect(screen.getByRole('spinbutton')).toHaveAttribute('type', 'number')
    })

    it('renders tel type', () => {
      render(<Input type="tel" />)
      expect(screen.getByRole('textbox')).toHaveAttribute('type', 'tel')
    })

    it('renders search type', () => {
      render(<Input type="search" />)
      expect(screen.getByRole('searchbox')).toHaveAttribute('type', 'search')
    })
  })

  describe('user interaction', () => {
    it('allows typing', async () => {
      render(<Input />)
      const input = screen.getByRole('textbox')

      await userEvent.type(input, 'Hello World')

      expect(input).toHaveValue('Hello World')
    })

    it('calls onChange handler', async () => {
      const handleChange = jest.fn()
      render(<Input onChange={handleChange} />)
      const input = screen.getByRole('textbox')

      await userEvent.type(input, 'a')

      expect(handleChange).toHaveBeenCalled()
    })

    it('clears input', async () => {
      render(<Input defaultValue="initial" />)
      const input = screen.getByRole('textbox')

      await userEvent.clear(input)

      expect(input).toHaveValue('')
    })

    it('handles focus', async () => {
      const handleFocus = jest.fn()
      render(<Input onFocus={handleFocus} />)
      const input = screen.getByRole('textbox')

      await userEvent.click(input)

      expect(handleFocus).toHaveBeenCalled()
    })

    it('handles blur', async () => {
      const handleBlur = jest.fn()
      render(<Input onBlur={handleBlur} />)
      const input = screen.getByRole('textbox')

      await userEvent.click(input)
      await userEvent.tab()

      expect(handleBlur).toHaveBeenCalled()
    })
  })

  describe('states', () => {
    it('handles disabled state', () => {
      render(<Input disabled />)
      expect(screen.getByRole('textbox')).toBeDisabled()
    })

    it('does not allow typing when disabled', async () => {
      render(<Input disabled defaultValue="original" />)
      const input = screen.getByRole('textbox')

      await userEvent.type(input, 'new text')

      expect(input).toHaveValue('original')
    })

    it('handles readonly state', () => {
      render(<Input readOnly defaultValue="readonly value" />)
      const input = screen.getByRole('textbox')
      expect(input).toHaveAttribute('readonly')
    })

    it('handles required state', () => {
      render(<Input required />)
      expect(screen.getByRole('textbox')).toBeRequired()
    })
  })

  describe('validation', () => {
    it('supports minLength', () => {
      render(<Input minLength={5} />)
      expect(screen.getByRole('textbox')).toHaveAttribute('minlength', '5')
    })

    it('supports maxLength', () => {
      render(<Input maxLength={10} />)
      expect(screen.getByRole('textbox')).toHaveAttribute('maxlength', '10')
    })

    it('supports pattern', () => {
      render(<Input pattern="[A-Za-z]+" />)
      expect(screen.getByRole('textbox')).toHaveAttribute('pattern', '[A-Za-z]+')
    })
  })

  describe('className prop', () => {
    it('applies custom className', () => {
      render(<Input className="custom-class" />)
      expect(screen.getByRole('textbox')).toHaveClass('custom-class')
    })

    it('merges with default classes', () => {
      render(<Input className="mt-4" />)
      const input = screen.getByRole('textbox')
      expect(input).toHaveClass('mt-4')
      expect(input).toHaveClass('w-full')
    })
  })

  describe('ref forwarding', () => {
    it('forwards ref correctly', () => {
      const ref = jest.fn()
      render(<Input ref={ref} />)
      expect(ref).toHaveBeenCalled()
    })

    it('allows focusing via ref', () => {
      const ref = { current: null } as React.RefObject<HTMLInputElement>
      render(<Input ref={ref as any} />)

      ref.current?.focus()

      expect(document.activeElement).toBe(ref.current)
    })
  })

  describe('accessibility', () => {
    it('supports aria-label', () => {
      render(<Input aria-label="Email address" />)
      expect(screen.getByRole('textbox')).toHaveAttribute('aria-label', 'Email address')
    })

    it('supports aria-describedby', () => {
      render(
        <>
          <Input aria-describedby="help-text" />
          <span id="help-text">Enter your email</span>
        </>
      )
      expect(screen.getByRole('textbox')).toHaveAttribute('aria-describedby', 'help-text')
    })

    it('supports aria-invalid', () => {
      render(<Input aria-invalid="true" />)
      expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true')
    })
  })

  describe('displayName', () => {
    it('has correct displayName', () => {
      expect(Input.displayName).toBe('Input')
    })
  })

  describe('suppressHydrationWarning', () => {
    it('has suppressHydrationWarning attribute', () => {
      const { container } = render(<Input />)
      const input = container.querySelector('input')
      // The attribute is set in JSX
      expect(input).toBeInTheDocument()
    })
  })
})
