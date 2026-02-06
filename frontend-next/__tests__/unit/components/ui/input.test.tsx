import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Input } from '@/components/ui/input'

describe('Input Component', () => {
  describe('Rendering', () => {
    it('renders input element', () => {
      render(<Input />)
      expect(screen.getByRole('textbox')).toBeInTheDocument()
    })

    it('has data-slot attribute', () => {
      render(<Input />)
      expect(screen.getByRole('textbox')).toHaveAttribute('data-slot', 'input')
    })

    it('accepts placeholder', () => {
      render(<Input placeholder="Enter text..." />)
      expect(screen.getByPlaceholderText('Enter text...')).toBeInTheDocument()
    })
  })

  describe('Types', () => {
    it('renders as textbox by default', () => {
      render(<Input />)
      // Input without explicit type still renders as textbox
      expect(screen.getByRole('textbox')).toBeInTheDocument()
    })

    it('accepts email type', () => {
      render(<Input type="email" />)
      expect(screen.getByRole('textbox')).toHaveAttribute('type', 'email')
    })

    it('accepts password type', () => {
      render(<Input type="password" data-testid="password-input" />)
      expect(screen.getByTestId('password-input')).toHaveAttribute('type', 'password')
    })

    it('accepts number type', () => {
      render(<Input type="number" />)
      expect(screen.getByRole('spinbutton')).toHaveAttribute('type', 'number')
    })

    it('accepts explicit text type', () => {
      render(<Input type="text" />)
      expect(screen.getByRole('textbox')).toHaveAttribute('type', 'text')
    })
  })

  describe('Value and onChange', () => {
    it('accepts value prop', () => {
      render(<Input value="test value" onChange={() => {}} />)
      expect(screen.getByRole('textbox')).toHaveValue('test value')
    })

    it('calls onChange when typing', async () => {
      const handleChange = vi.fn()
      render(<Input onChange={handleChange} />)

      const input = screen.getByRole('textbox')
      await userEvent.type(input, 'hello')

      expect(handleChange).toHaveBeenCalled()
    })

    it('updates value when typing', async () => {
      render(<Input defaultValue="" />)

      const input = screen.getByRole('textbox')
      await userEvent.type(input, 'hello')

      expect(input).toHaveValue('hello')
    })
  })

  describe('Disabled State', () => {
    it('can be disabled', () => {
      render(<Input disabled />)
      expect(screen.getByRole('textbox')).toBeDisabled()
    })

    it('does not allow input when disabled', async () => {
      render(<Input disabled />)

      const input = screen.getByRole('textbox')
      await userEvent.type(input, 'test')

      expect(input).toHaveValue('')
    })
  })

  describe('Required State', () => {
    it('can be required', () => {
      render(<Input required />)
      expect(screen.getByRole('textbox')).toBeRequired()
    })
  })

  describe('Custom className', () => {
    it('accepts custom className', () => {
      render(<Input className="custom-input" />)
      expect(screen.getByRole('textbox')).toHaveClass('custom-input')
    })
  })

  describe('Aria attributes', () => {
    it('accepts aria-label', () => {
      render(<Input aria-label="Custom label" />)
      expect(screen.getByLabelText('Custom label')).toBeInTheDocument()
    })

    it('accepts aria-invalid', () => {
      render(<Input aria-invalid="true" />)
      expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true')
    })
  })

  describe('Focus behavior', () => {
    it('can receive focus', async () => {
      render(<Input />)

      const input = screen.getByRole('textbox')
      await userEvent.click(input)

      expect(input).toHaveFocus()
    })

    it('calls onFocus when focused', async () => {
      const handleFocus = vi.fn()
      render(<Input onFocus={handleFocus} />)

      const input = screen.getByRole('textbox')
      await userEvent.click(input)

      expect(handleFocus).toHaveBeenCalledTimes(1)
    })

    it('calls onBlur when blurred', async () => {
      const handleBlur = vi.fn()
      render(<Input onBlur={handleBlur} />)

      const input = screen.getByRole('textbox')
      await userEvent.click(input)
      await userEvent.tab()

      expect(handleBlur).toHaveBeenCalledTimes(1)
    })
  })
})
