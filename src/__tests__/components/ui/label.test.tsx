import { render, screen } from '@testing-library/react'
import { Label } from '@/components/ui/label'

describe('Label', () => {
  it('renders label element', () => {
    render(<Label>Test Label</Label>)
    expect(screen.getByText('Test Label')).toBeInTheDocument()
  })

  it('associates with input via htmlFor', () => {
    render(
      <>
        <Label htmlFor="test-input">Test Label</Label>
        <input id="test-input" />
      </>
    )
    const label = screen.getByText('Test Label')
    expect(label).toHaveAttribute('for', 'test-input')
  })

  it('applies custom className', () => {
    render(<Label className="custom-class">Label</Label>)
    expect(screen.getByText('Label')).toHaveClass('custom-class')
  })

  it('renders children', () => {
    render(
      <Label>
        <span>Complex Label</span>
      </Label>
    )
    expect(screen.getByText('Complex Label')).toBeInTheDocument()
  })

  it('has default styling', () => {
    render(<Label>Label</Label>)
    const label = screen.getByText('Label')
    expect(label).toHaveClass('text-[11px]')
    expect(label).toHaveClass('font-bold')
    expect(label).toHaveClass('uppercase')
  })

  it('supports required indicator', () => {
    render(
      <Label>
        Email <span className="text-red-500">*</span>
      </Label>
    )
    expect(screen.getByText('*')).toBeInTheDocument()
  })
})
