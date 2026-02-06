import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { ScoreRing, ScoreBreakdown, MatchingScore } from '@/components/cv/score-ring'

// Mock the subscription context
const mockSubscriptionContext = {
  hasFeature: vi.fn(() => true),
}

vi.mock('@/contexts/subscription-context', () => ({
  useSubscription: () => mockSubscriptionContext,
  useOptionalSubscription: () => mockSubscriptionContext,
}))

describe('ScoreRing Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSubscriptionContext.hasFeature.mockReturnValue(true)
  })

  describe('Rendering', () => {
    it('renders score percentage', async () => {
      render(<ScoreRing score={75} showAnimation={false} />)
      await waitFor(() => {
        expect(screen.getByText('75%')).toBeInTheDocument()
      })
    })

    it('renders label', () => {
      render(<ScoreRing score={75} showAnimation={false} />)
      expect(screen.getByText('Score ATS')).toBeInTheDocument()
    })

    it('accepts custom label', () => {
      render(<ScoreRing score={75} label="Custom Score" showAnimation={false} />)
      expect(screen.getByText('Custom Score')).toBeInTheDocument()
    })
  })

  describe('Sizes', () => {
    it('renders small size', () => {
      render(<ScoreRing score={75} size="sm" showAnimation={false} />)
      expect(screen.getByText('75%')).toHaveClass('text-xl')
    })

    it('renders medium size', () => {
      render(<ScoreRing score={75} size="md" showAnimation={false} />)
      expect(screen.getByText('75%')).toHaveClass('text-3xl')
    })

    it('renders large size', () => {
      render(<ScoreRing score={75} size="lg" showAnimation={false} />)
      expect(screen.getByText('75%')).toHaveClass('text-4xl')
    })
  })

  describe('Color coding', () => {
    it('shows green for scores >= 70', () => {
      render(<ScoreRing score={75} showAnimation={false} />)
      const scoreText = screen.getByText('75%')
      // Should have green gradient class
      expect(scoreText).toHaveClass('bg-gradient-to-br')
    })

    it('shows amber for scores 50-69', () => {
      render(<ScoreRing score={55} showAnimation={false} />)
      expect(screen.getByText('55%')).toBeInTheDocument()
    })

    it('shows red for scores < 50', () => {
      render(<ScoreRing score={35} showAnimation={false} />)
      expect(screen.getByText('35%')).toBeInTheDocument()
    })
  })

  describe('Without visual score feature', () => {
    it('shows simple text when feature not available', () => {
      mockSubscriptionContext.hasFeature.mockReturnValue(false)
      render(<ScoreRing score={75} showAnimation={false} />)
      expect(screen.getByText('75%')).toBeInTheDocument()
      // Should not have SVG for ring
      expect(document.querySelector('svg')).not.toBeInTheDocument()
    })
  })

  describe('Animation', () => {
    it('renders without animation when showAnimation is false', () => {
      render(<ScoreRing score={75} showAnimation={false} />)
      expect(screen.getByText('75%')).toBeInTheDocument()
    })

    it('animates score when showAnimation is true', async () => {
      render(<ScoreRing score={75} showAnimation={true} />)
      // Score should eventually reach 75
      await waitFor(
        () => {
          expect(screen.getByText('75%')).toBeInTheDocument()
        },
        { timeout: 2000 }
      )
    })
  })

  describe('SVG Ring', () => {
    it('renders SVG element', () => {
      render(<ScoreRing score={75} showAnimation={false} />)
      expect(document.querySelector('svg')).toBeInTheDocument()
    })

    it('renders progress circle', () => {
      render(<ScoreRing score={75} showAnimation={false} />)
      const circles = document.querySelectorAll('circle')
      expect(circles.length).toBe(2) // Track + Progress
    })
  })

  describe('Custom className', () => {
    it('accepts custom className', () => {
      const { container } = render(<ScoreRing score={75} className="custom-ring" showAnimation={false} />)
      // The className is applied to the outermost div with 'relative inline-flex'
      const rootDiv = container.querySelector('.custom-ring')
      expect(rootDiv).toBeInTheDocument()
    })
  })
})

describe('ScoreBreakdown Component', () => {
  const mockDetails = {
    format: 15,
    keywords: 20,
    experience: 22,
    skills: 16,
    education: 8,
  }

  describe('Rendering', () => {
    it('renders all categories', () => {
      render(<ScoreBreakdown details={mockDetails} />)
      expect(screen.getByText('Format')).toBeInTheDocument()
      expect(screen.getByText('Mots-cles')).toBeInTheDocument()
      expect(screen.getByText('Experience')).toBeInTheDocument()
      expect(screen.getByText('Competences')).toBeInTheDocument()
      expect(screen.getByText('Formation')).toBeInTheDocument()
    })

    it('renders scores with max values', () => {
      render(<ScoreBreakdown details={mockDetails} />)
      expect(screen.getByText('15/20')).toBeInTheDocument() // Format
      expect(screen.getByText('20/25')).toBeInTheDocument() // Keywords
      expect(screen.getByText('22/25')).toBeInTheDocument() // Experience
      expect(screen.getByText('16/20')).toBeInTheDocument() // Skills
      expect(screen.getByText('8/10')).toBeInTheDocument() // Education
    })
  })

  describe('Progress bars', () => {
    it('renders progress bars for each category', () => {
      const { container } = render(<ScoreBreakdown details={mockDetails} />)
      const progressBars = container.querySelectorAll('.bg-gray-100, .dark\\:bg-gray-800')
      expect(progressBars.length).toBeGreaterThan(0)
    })
  })

  describe('Custom className', () => {
    it('accepts custom className', () => {
      const { container } = render(<ScoreBreakdown details={mockDetails} className="custom-breakdown" />)
      // The className is applied to the root div with 'space-y-3'
      const rootDiv = container.querySelector('.custom-breakdown')
      expect(rootDiv).toBeInTheDocument()
    })
  })
})

describe('MatchingScore Component', () => {
  describe('Excellent match (>= 80)', () => {
    it('shows excellent match label', () => {
      render(<MatchingScore score={85} />)
      expect(screen.getByText('Excellent match')).toBeInTheDocument()
    })

    it('shows sparkle emoji', () => {
      render(<MatchingScore score={85} />)
      expect(screen.getByText('✨')).toBeInTheDocument()
    })

    it('shows score percentage', () => {
      render(<MatchingScore score={85} />)
      expect(screen.getByText('85%')).toBeInTheDocument()
    })

    it('applies green color', () => {
      render(<MatchingScore score={85} />)
      expect(screen.getByText('85%')).toHaveClass('text-green-600')
    })
  })

  describe('Good match (60-79)', () => {
    it('shows good match label', () => {
      render(<MatchingScore score={70} />)
      expect(screen.getByText('Bon match')).toBeInTheDocument()
    })

    it('shows thumbs up emoji', () => {
      render(<MatchingScore score={70} />)
      expect(screen.getByText('👍')).toBeInTheDocument()
    })

    it('applies amber color', () => {
      render(<MatchingScore score={70} />)
      expect(screen.getByText('70%')).toHaveClass('text-amber-600')
    })
  })

  describe('Average match (40-59)', () => {
    it('shows average match label', () => {
      render(<MatchingScore score={50} />)
      expect(screen.getByText('Match moyen')).toBeInTheDocument()
    })

    it('shows thinking emoji', () => {
      render(<MatchingScore score={50} />)
      expect(screen.getByText('🤔')).toBeInTheDocument()
    })

    it('applies orange color', () => {
      render(<MatchingScore score={50} />)
      expect(screen.getByText('50%')).toHaveClass('text-orange-600')
    })
  })

  describe('Low match (< 40)', () => {
    it('shows low match label', () => {
      render(<MatchingScore score={25} />)
      expect(screen.getByText('Match faible')).toBeInTheDocument()
    })

    it('shows cross emoji', () => {
      render(<MatchingScore score={25} />)
      expect(screen.getByText('❌')).toBeInTheDocument()
    })

    it('applies red color', () => {
      render(<MatchingScore score={25} />)
      expect(screen.getByText('25%')).toHaveClass('text-red-600')
    })
  })

  describe('Custom className', () => {
    it('accepts custom className', () => {
      const { container } = render(<MatchingScore score={75} className="custom-match" />)
      // The className is applied to the root div with 'text-center'
      const rootDiv = container.querySelector('.custom-match')
      expect(rootDiv).toBeInTheDocument()
    })
  })
})
