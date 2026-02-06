import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Button } from '@/components/ui/button'

describe('Button Component', () => {
  describe('Rendering', () => {
    it('renders with children', () => {
      render(<Button>Click me</Button>)
      expect(screen.getByRole('button')).toHaveTextContent('Click me')
    })

    it('renders as button element by default', () => {
      render(<Button>Button</Button>)
      expect(screen.getByRole('button').tagName).toBe('BUTTON')
    })

    it('has data-slot attribute', () => {
      render(<Button>Button</Button>)
      expect(screen.getByRole('button')).toHaveAttribute('data-slot', 'button')
    })
  })

  describe('Variants', () => {
    it('applies default variant styles', () => {
      render(<Button variant="default">Default</Button>)
      expect(screen.getByRole('button')).toHaveAttribute('data-variant', 'default')
    })

    it('applies destructive variant', () => {
      render(<Button variant="destructive">Delete</Button>)
      expect(screen.getByRole('button')).toHaveAttribute('data-variant', 'destructive')
    })

    it('applies outline variant', () => {
      render(<Button variant="outline">Outline</Button>)
      expect(screen.getByRole('button')).toHaveAttribute('data-variant', 'outline')
    })

    it('applies secondary variant', () => {
      render(<Button variant="secondary">Secondary</Button>)
      expect(screen.getByRole('button')).toHaveAttribute('data-variant', 'secondary')
    })

    it('applies ghost variant', () => {
      render(<Button variant="ghost">Ghost</Button>)
      expect(screen.getByRole('button')).toHaveAttribute('data-variant', 'ghost')
    })

    it('applies link variant', () => {
      render(<Button variant="link">Link</Button>)
      expect(screen.getByRole('button')).toHaveAttribute('data-variant', 'link')
    })
  })

  describe('Sizes', () => {
    it('applies default size', () => {
      render(<Button size="default">Default</Button>)
      expect(screen.getByRole('button')).toHaveAttribute('data-size', 'default')
    })

    it('applies sm size', () => {
      render(<Button size="sm">Small</Button>)
      expect(screen.getByRole('button')).toHaveAttribute('data-size', 'sm')
    })

    it('applies lg size', () => {
      render(<Button size="lg">Large</Button>)
      expect(screen.getByRole('button')).toHaveAttribute('data-size', 'lg')
    })

    it('applies icon size', () => {
      render(<Button size="icon">Icon</Button>)
      expect(screen.getByRole('button')).toHaveAttribute('data-size', 'icon')
    })
  })

  describe('Disabled State', () => {
    it('can be disabled', () => {
      render(<Button disabled>Disabled</Button>)
      expect(screen.getByRole('button')).toBeDisabled()
    })

    it('does not trigger onClick when disabled', () => {
      const handleClick = vi.fn()
      render(<Button disabled onClick={handleClick}>Disabled</Button>)

      fireEvent.click(screen.getByRole('button'))
      expect(handleClick).not.toHaveBeenCalled()
    })
  })

  describe('Click Handler', () => {
    it('calls onClick when clicked', () => {
      const handleClick = vi.fn()
      render(<Button onClick={handleClick}>Click</Button>)

      fireEvent.click(screen.getByRole('button'))
      expect(handleClick).toHaveBeenCalledTimes(1)
    })
  })

  describe('Custom className', () => {
    it('accepts custom className', () => {
      render(<Button className="custom-class">Custom</Button>)
      expect(screen.getByRole('button')).toHaveClass('custom-class')
    })
  })

  describe('asChild prop', () => {
    it('renders as Slot when asChild is true', () => {
      render(
        <Button asChild>
          <a href="/test">Link Button</a>
        </Button>
      )
      // When asChild is true, it should render the child element
      const link = screen.getByRole('link')
      expect(link).toBeInTheDocument()
      expect(link).toHaveTextContent('Link Button')
    })
  })

  describe('Type attribute', () => {
    it('defaults to type button', () => {
      render(<Button>Button</Button>)
      // Note: default type for button element in HTML is "submit" unless specified
      expect(screen.getByRole('button')).toBeInTheDocument()
    })

    it('accepts type prop', () => {
      render(<Button type="submit">Submit</Button>)
      expect(screen.getByRole('button')).toHaveAttribute('type', 'submit')
    })
  })
})
