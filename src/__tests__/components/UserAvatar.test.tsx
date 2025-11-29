import { render, screen } from '@testing-library/react'
import UserAvatar from '@/components/UserAvatar'

describe('UserAvatar', () => {
  describe('with image', () => {
    it('renders image when provided', () => {
      render(<UserAvatar image="/avatar.jpg" name="John Doe" />)
      const img = screen.getByRole('img')
      expect(img).toHaveAttribute('src', '/avatar.jpg')
      expect(img).toHaveAttribute('alt', 'John Doe')
    })

    it('uses "User" as alt when name is not provided', () => {
      render(<UserAvatar image="/avatar.jpg" />)
      const img = screen.getByRole('img')
      expect(img).toHaveAttribute('alt', 'User')
    })

    it('handles null name', () => {
      render(<UserAvatar image="/avatar.jpg" name={null} />)
      const img = screen.getByRole('img')
      expect(img).toHaveAttribute('alt', 'User')
    })
  })

  describe('without image', () => {
    it('renders default SVG avatar', () => {
      const { container } = render(<UserAvatar />)
      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })

    it('renders SVG when image is null', () => {
      const { container } = render(<UserAvatar image={null} />)
      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })

    it('renders SVG when image is undefined', () => {
      const { container } = render(<UserAvatar image={undefined} />)
      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })

    it('does not render img element', () => {
      render(<UserAvatar />)
      expect(screen.queryByRole('img')).not.toBeInTheDocument()
    })
  })

  describe('sizes', () => {
    it('renders sm size', () => {
      const { container } = render(<UserAvatar size="sm" />)
      const wrapper = container.firstChild
      expect(wrapper).toHaveClass('w-8', 'h-8')
    })

    it('renders md size by default', () => {
      const { container } = render(<UserAvatar />)
      const wrapper = container.firstChild
      expect(wrapper).toHaveClass('w-10', 'h-10')
    })

    it('renders lg size', () => {
      const { container } = render(<UserAvatar size="lg" />)
      const wrapper = container.firstChild
      expect(wrapper).toHaveClass('w-12', 'h-12')
    })

    it('renders xl size', () => {
      const { container } = render(<UserAvatar size="xl" />)
      const wrapper = container.firstChild
      expect(wrapper).toHaveClass('w-16', 'h-16')
    })
  })

  describe('with image and sizes', () => {
    it('renders sm size with image', () => {
      const { container } = render(<UserAvatar image="/avatar.jpg" size="sm" />)
      const wrapper = container.firstChild
      expect(wrapper).toHaveClass('w-8', 'h-8')
      expect(screen.getByRole('img')).toBeInTheDocument()
    })

    it('renders lg size with image', () => {
      const { container } = render(<UserAvatar image="/avatar.jpg" size="lg" />)
      const wrapper = container.firstChild
      expect(wrapper).toHaveClass('w-12', 'h-12')
    })
  })

  describe('className prop', () => {
    it('applies custom className with image', () => {
      const { container } = render(
        <UserAvatar image="/avatar.jpg" className="custom-class" />
      )
      expect(container.firstChild).toHaveClass('custom-class')
    })

    it('applies custom className without image', () => {
      const { container } = render(
        <UserAvatar className="custom-class" />
      )
      expect(container.firstChild).toHaveClass('custom-class')
    })

    it('merges custom className with size classes', () => {
      const { container } = render(
        <UserAvatar size="lg" className="border-2" />
      )
      const wrapper = container.firstChild
      expect(wrapper).toHaveClass('w-12', 'h-12', 'border-2')
    })
  })

  describe('styling', () => {
    it('has rounded-full class with image', () => {
      const { container } = render(<UserAvatar image="/avatar.jpg" />)
      expect(container.firstChild).toHaveClass('rounded-full')
    })

    it('has rounded-full class without image', () => {
      const { container } = render(<UserAvatar />)
      expect(container.firstChild).toHaveClass('rounded-full')
    })

    it('has overflow-hidden with image', () => {
      const { container } = render(<UserAvatar image="/avatar.jpg" />)
      expect(container.firstChild).toHaveClass('overflow-hidden')
    })

    it('has flex and center classes without image', () => {
      const { container } = render(<UserAvatar />)
      const wrapper = container.firstChild
      expect(wrapper).toHaveClass('flex', 'items-center', 'justify-center')
    })
  })

  describe('image styling', () => {
    it('image has correct classes', () => {
      render(<UserAvatar image="/avatar.jpg" />)
      const img = screen.getByRole('img')
      expect(img).toHaveClass('w-full', 'h-full', 'object-cover')
    })
  })

  describe('SVG avatar', () => {
    it('SVG has correct viewBox', () => {
      const { container } = render(<UserAvatar />)
      const svg = container.querySelector('svg')
      expect(svg).toHaveAttribute('viewBox', '0 0 24 24')
    })

    it('SVG has width and height percentages', () => {
      const { container } = render(<UserAvatar />)
      const svg = container.querySelector('svg')
      expect(svg).toHaveAttribute('width', '60%')
      expect(svg).toHaveAttribute('height', '60%')
    })

    it('SVG contains circle and path elements', () => {
      const { container } = render(<UserAvatar />)
      const circle = container.querySelector('circle')
      const path = container.querySelector('path')
      expect(circle).toBeInTheDocument()
      expect(path).toBeInTheDocument()
    })
  })
})
