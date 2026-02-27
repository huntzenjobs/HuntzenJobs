'use client'

import { useEffect, useState } from 'react'
import { useSubscription } from '@/contexts/subscription-context'

interface ScoreRingProps {
  score: number
  size?: 'sm' | 'md' | 'lg' | number // Support both preset sizes and custom numeric sizes
  label?: string
  showAnimation?: boolean
  animationDuration?: number // Duration in milliseconds (default: 750ms)
  className?: string
}

export function ScoreRing({
  score,
  size = 'md',
  label = 'Score ATS',
  showAnimation = true,
  animationDuration = 750, // Default: 750ms (was 1500ms)
  className = '',
}: ScoreRingProps) {
  const { hasFeature } = useSubscription()
  const hasVisualScore = hasFeature('has_visual_score')

  const [animatedScore, setAnimatedScore] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)

  // Size configurations
  const sizePresets = {
    sm: { container: 100, stroke: 6, fontSize: 'text-xl', labelSize: 'text-xs' },
    md: { container: 150, stroke: 8, fontSize: 'text-3xl', labelSize: 'text-sm' },
    lg: { container: 200, stroke: 10, fontSize: 'text-4xl', labelSize: 'text-base' },
  }

  // Support both preset sizes and numeric sizes
  const config = typeof size === 'number'
    ? {
        container: size,
        stroke: Math.max(6, Math.floor(size / 20)),
        fontSize: size < 80 ? 'text-lg' : size < 120 ? 'text-2xl' : 'text-3xl',
        labelSize: size < 80 ? 'text-[10px]' : 'text-xs',
      }
    : sizePresets[size]

  const radius = (config.container - config.stroke) / 2
  const circumference = 2 * Math.PI * radius

  // Get color based on score
  const getColor = (s: number) => {
    if (s >= 70) return { stroke: '#22c55e', bg: 'from-green-500 to-emerald-500' }
    if (s >= 50) return { stroke: '#f59e0b', bg: 'from-amber-500 to-orange-500' }
    return { stroke: '#ef4444', bg: 'from-red-500 to-rose-500' }
  }

  const colors = getColor(score)

  // Animate score on mount
  useEffect(() => {
    if (!showAnimation || !hasVisualScore) {
      setAnimatedScore(score)
      return
    }

    setIsAnimating(true)
    const duration = animationDuration // Use configurable duration
    const steps = 60
    const increment = score / steps
    let current = 0
    let step = 0

    const timer = setInterval(() => {
      step++
      current = Math.min(score, Math.round(increment * step))
      setAnimatedScore(current)

      if (step >= steps) {
        clearInterval(timer)
        setAnimatedScore(score)
        setIsAnimating(false)
      }
    }, duration / steps)

    return () => clearInterval(timer)
  }, [score, showAnimation, hasVisualScore, animationDuration])

  // Calculate stroke offset for progress
  const offset = circumference - (animatedScore / 100) * circumference

  // If user doesn't have visual score feature, show simple text
  if (!hasVisualScore) {
    return (
      <div className={`text-center ${className}`}>
        <div className={`font-bold ${config.fontSize}`} style={{ color: colors.stroke }}>
          {score}%
        </div>
        <p className={`${config.labelSize} text-muted-foreground mt-1`}>{label}</p>
      </div>
    )
  }

  return (
    <div className={`relative inline-flex flex-col items-center ${className}`}>
      <div
        className="relative"
        style={{ width: config.container, height: config.container }}
      >
        {/* Background circle */}
        <svg
          className="transform -rotate-90"
          width={config.container}
          height={config.container}
        >
          {/* Track */}
          <circle
            cx={config.container / 2}
            cy={config.container / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={config.stroke}
            className="text-gray-200"
          />
          {/* Progress */}
          <circle
            cx={config.container / 2}
            cy={config.container / 2}
            r={radius}
            fill="none"
            stroke={colors.stroke}
            strokeWidth={config.stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-300 ease-out"
            style={{
              filter: isAnimating ? 'drop-shadow(0 0 8px currentColor)' : 'none',
            }}
          />
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={`font-bold ${config.fontSize} bg-gradient-to-br ${colors.bg} bg-clip-text text-transparent`}
          >
            {animatedScore}%
          </span>
          <span className={`${config.labelSize} text-muted-foreground`}>
            {label}
          </span>
        </div>
      </div>
    </div>
  )
}

interface ScoreBreakdownProps {
  details: {
    format: number
    keywords: number
    experience: number
    skills: number
    education: number
  }
  className?: string
}

export function ScoreBreakdown({ details, className = '' }: ScoreBreakdownProps) {
  const categories = [
    { name: 'Format', value: details.format, max: 20, color: 'bg-blue-500' },
    { name: 'Mots-cles', value: details.keywords, max: 25, color: 'bg-violet-500' },
    { name: 'Experience', value: details.experience, max: 25, color: 'bg-green-500' },
    { name: 'Competences', value: details.skills, max: 20, color: 'bg-amber-500' },
    { name: 'Formation', value: details.education, max: 10, color: 'bg-rose-500' },
  ]

  return (
    <div className={`space-y-3 ${className}`}>
      {categories.map((cat) => (
        <div key={cat.name}>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-muted-foreground">{cat.name}</span>
            <span className="font-medium">
              {cat.value}/{cat.max}
            </span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full ${cat.color} rounded-full transition-all duration-500`}
              style={{ width: `${(cat.value / cat.max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

interface MatchingScoreProps {
  score: number
  className?: string
}

export function MatchingScore({ score, className = '' }: MatchingScoreProps) {
  const getMatchLevel = (s: number) => {
    if (s >= 80) return { label: 'Excellent match', color: 'text-green-600', emoji: '✨' }
    if (s >= 60) return { label: 'Bon match', color: 'text-amber-600', emoji: '👍' }
    if (s >= 40) return { label: 'Match moyen', color: 'text-orange-600', emoji: '🤔' }
    return { label: 'Match faible', color: 'text-red-600', emoji: '❌' }
  }

  const match = getMatchLevel(score)

  return (
    <div className={`text-center ${className}`}>
      <div className="text-5xl mb-2">{match.emoji}</div>
      <div className={`text-2xl font-bold ${match.color}`}>{score}%</div>
      <div className={`text-sm ${match.color}`}>{match.label}</div>
    </div>
  )
}
