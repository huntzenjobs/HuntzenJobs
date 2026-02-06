import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { UsageCounter, CoachTimer, UsageSummary } from '@/components/freemium/usage-counter'

// Mock the subscription context
const mockSubscriptionContext = {
  getRemaining: vi.fn(),
  limits: {
    job_searches_per_day: 3,
    jobs_visible: 5,
    cv_analyses_per_day: 1,
    coach_minutes_per_day: 5,
  },
  isFreePlan: true,
  plan: 'free',
  coachTimeRemaining: 300,
  isCoachSessionActive: false,
  hasFeature: vi.fn(() => true),
}

vi.mock('@/contexts/subscription-context', () => ({
  useSubscription: () => mockSubscriptionContext,
}))

describe('UsageCounter Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSubscriptionContext.getRemaining.mockReturnValue(2)
    mockSubscriptionContext.isFreePlan = true
    mockSubscriptionContext.limits.job_searches_per_day = 3
  })

  describe('Rendering', () => {
    it('renders job_search feature counter', () => {
      render(<UsageCounter feature="job_search" />)
      // Should display remaining searches
      expect(screen.getByText(/recherches/i)).toBeInTheDocument()
    })

    it('renders cv_analysis feature counter', () => {
      mockSubscriptionContext.getRemaining.mockReturnValue(1)
      render(<UsageCounter feature="cv_analysis" />)
      // Use getAllByText since "analyses" appears multiple times
      const elements = screen.getAllByText(/analyses/i)
      expect(elements.length).toBeGreaterThan(0)
    })

    it('renders coach_time feature counter', () => {
      mockSubscriptionContext.getRemaining.mockReturnValue(300)
      render(<UsageCounter feature="coach_time" />)
      // Should display time in minutes:seconds format
      expect(screen.getByText(/5:00|restantes/)).toBeInTheDocument()
    })
  })

  describe('Icon display', () => {
    it('shows icon by default', () => {
      render(<UsageCounter feature="job_search" showIcon={true} />)
      // Icon should be present (SVG element)
      const container = screen.getByText(/recherches/i).closest('div')
      expect(container?.querySelector('svg')).toBeInTheDocument()
    })

    it('hides icon when showIcon is false', () => {
      render(<UsageCounter feature="job_search" showIcon={false} />)
      const container = screen.getByText(/recherches/i).closest('span')
      expect(container?.querySelector('svg')).toBeNull()
    })
  })

  describe('Progress bar', () => {
    it('shows progress bar by default', () => {
      render(<UsageCounter feature="job_search" showBar={true} />)
      // Progress bar should be visible
      const container = document.querySelector('.bg-gray-100')
      expect(container).toBeInTheDocument()
    })
  })

  describe('Compact mode', () => {
    it('renders in compact mode', () => {
      render(<UsageCounter feature="job_search" compact={true} />)
      // Compact mode uses inline-flex and rounded-full
      const element = screen.getByText(/1\/3|2\/3/).closest('span')
      expect(element).toHaveClass('inline-flex')
    })
  })

  describe('Color coding', () => {
    it('shows counter when remaining is more than half', () => {
      mockSubscriptionContext.getRemaining.mockReturnValue(2) // 2/3 = 66%
      render(<UsageCounter feature="job_search" />)
      const text = screen.getByText(/recherches/i)
      expect(text).toBeInTheDocument()
    })

    it('shows counter when remaining is between 25-50%', () => {
      mockSubscriptionContext.getRemaining.mockReturnValue(1) // 1/3 = 33%
      render(<UsageCounter feature="job_search" />)
      expect(screen.getByText(/recherches/i)).toBeInTheDocument()
    })

    it('shows counter when remaining is less than 25%', () => {
      mockSubscriptionContext.getRemaining.mockReturnValue(0) // 0/3 = 0%
      render(<UsageCounter feature="job_search" />)
      expect(screen.getByText(/recherches/i)).toBeInTheDocument()
    })
  })

  describe('Unlimited features', () => {
    it('returns null for unlimited features on paid plans', () => {
      mockSubscriptionContext.isFreePlan = false
      mockSubscriptionContext.limits.job_searches_per_day = Infinity
      mockSubscriptionContext.getRemaining.mockReturnValue(Infinity)

      const { container } = render(<UsageCounter feature="job_search" />)
      expect(container.firstChild).toBeNull()
    })
  })

  describe('Custom className', () => {
    it('accepts custom className', () => {
      render(<UsageCounter feature="job_search" className="custom-class" />)
      const container = screen.getByText(/recherches/i).closest('div')
      expect(container?.parentElement).toHaveClass('custom-class')
    })
  })
})

describe('CoachTimer Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSubscriptionContext.coachTimeRemaining = 300
    mockSubscriptionContext.isCoachSessionActive = false
    mockSubscriptionContext.limits.coach_minutes_per_day = 5
  })

  describe('Rendering', () => {
    it('renders timer display', () => {
      render(<CoachTimer />)
      expect(screen.getByText('5:00')).toBeInTheDocument()
    })

    it('formats time correctly for different values', () => {
      mockSubscriptionContext.coachTimeRemaining = 125 // 2:05
      render(<CoachTimer />)
      expect(screen.getByText('2:05')).toBeInTheDocument()
    })
  })

  describe('Sizes', () => {
    it('renders in small size', () => {
      render(<CoachTimer size="sm" />)
      expect(screen.getByText('5:00')).toHaveClass('font-mono')
    })

    it('renders in medium size', () => {
      render(<CoachTimer size="md" />)
      expect(screen.getByText('5:00')).toHaveClass('font-medium')
    })

    it('renders in large size', () => {
      render(<CoachTimer size="lg" />)
      expect(screen.getByText('5:00')).toBeInTheDocument()
    })
  })

  describe('Active session indicator', () => {
    it('shows active indicator when session is active', () => {
      mockSubscriptionContext.isCoachSessionActive = true
      render(<CoachTimer />)
      expect(screen.getByText('(en cours)')).toBeInTheDocument()
    })

    it('does not show indicator when session is not active', () => {
      mockSubscriptionContext.isCoachSessionActive = false
      render(<CoachTimer />)
      expect(screen.queryByText('(en cours)')).not.toBeInTheDocument()
    })
  })

  describe('Color based on time remaining', () => {
    it('shows green when more than 50% time remaining', () => {
      mockSubscriptionContext.coachTimeRemaining = 200 // 200/300 = 66%
      render(<CoachTimer />)
      const timer = screen.getByText(/3:20/)
      expect(timer).toHaveClass('text-green-600')
    })

    it('shows orange when 20-50% time remaining', () => {
      mockSubscriptionContext.coachTimeRemaining = 100 // 100/300 = 33%
      render(<CoachTimer />)
      const timer = screen.getByText('1:40')
      expect(timer).toHaveClass('text-orange-600')
    })

    it('shows red when less than 20% time remaining', () => {
      mockSubscriptionContext.coachTimeRemaining = 30 // 30/300 = 10%
      render(<CoachTimer />)
      const timer = screen.getByText('0:30')
      expect(timer).toHaveClass('text-red-600')
    })
  })
})

describe('UsageSummary Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSubscriptionContext.isFreePlan = true
    mockSubscriptionContext.getRemaining.mockReturnValue(2)
    mockSubscriptionContext.limits.job_searches_per_day = 3
    mockSubscriptionContext.limits.cv_analyses_per_day = 1
  })

  describe('Rendering', () => {
    it('renders summary for free plan', () => {
      render(<UsageSummary />)
      expect(screen.getByText('Utilisation du jour')).toBeInTheDocument()
    })

    it('does not render for paid plan', () => {
      mockSubscriptionContext.isFreePlan = false
      const { container } = render(<UsageSummary />)
      expect(container.firstChild).toBeNull()
    })
  })

  describe('Features displayed', () => {
    it('displays job search counter', () => {
      render(<UsageSummary />)
      expect(screen.getByText(/recherches/i)).toBeInTheDocument()
    })

    it('displays cv analysis counter', () => {
      render(<UsageSummary />)
      // Use getAllByText since "analyses" appears multiple times
      const elements = screen.getAllByText(/analyses/i)
      expect(elements.length).toBeGreaterThan(0)
    })

    it('displays coach time counter', () => {
      render(<UsageSummary />)
      // The mock returns 2 seconds used, so it displays as 0:02
      expect(screen.getByText(/\d+:\d+/)).toBeInTheDocument()
    })
  })

  describe('Custom className', () => {
    it('accepts custom className', () => {
      render(<UsageSummary className="custom-summary" />)
      const container = screen.getByText('Utilisation du jour').closest('div')
      expect(container).toHaveClass('custom-summary')
    })
  })
})
