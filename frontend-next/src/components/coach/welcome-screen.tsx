'use client'

import * as React from 'react'
import { Sparkles, MessageSquare, Target, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * WelcomeScreen - Engaging empty state for Coach chat
 *
 * Features:
 * - Animated coach avatar
 * - Quick start questions
 * - Value proposition
 * - Smooth fade-in animation
 *
 * UX Benefits:
 * - Reduces blank screen anxiety
 * - Provides clear starting points
 * - Sets expectations for AI capabilities
 */

export interface WelcomeScreenProps {
  /** Quick start questions */
  quickQuestions?: Array<{
    id: string
    text: string
    category: 'cv' | 'interview' | 'career' | 'salary'
  }>
  /** Handler for question click */
  onQuestionClick?: (question: string) => void
  /** Custom className */
  className?: string
}

const DEFAULT_QUESTIONS = [
  {
    id: '1',
    text: 'Comment améliorer mon CV pour un poste de développeur ?',
    category: 'cv' as const,
  },
  {
    id: '2',
    text: 'Quelles questions poser lors d\'un entretien ?',
    category: 'interview' as const,
  },
  {
    id: '3',
    text: 'Comment négocier mon salaire efficacement ?',
    category: 'salary' as const,
  },
  {
    id: '4',
    text: 'Quelles sont les tendances du marché dans mon secteur ?',
    category: 'career' as const,
  },
]

export function WelcomeScreen({
  quickQuestions = DEFAULT_QUESTIONS,
  onQuestionClick,
  className,
}: WelcomeScreenProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center',
        'h-full min-h-[500px] px-4 py-12',
        'animate-fade-in',
        className
      )}
    >
      {/* Animated Avatar */}
      <div className="relative mb-8">
        {/* Main avatar */}
        <div className="relative size-20 rounded-full bg-gradient-to-br from-violet-500 via-purple-600 to-indigo-600 flex items-center justify-center shadow-2xl">
          <Sparkles className="size-10 text-white animate-pulse" />
          
          {/* Glow rings */}
          <div 
            className="absolute inset-0 rounded-full bg-violet-400/30 animate-ping" 
            style={{ animationDuration: '2s' }}
          />
          <div 
            className="absolute inset-0 rounded-full bg-purple-400/20 animate-ping" 
            style={{ animationDuration: '3s', animationDelay: '0.5s' }}
          />
        </div>

        {/* Floating particles */}
        <div className="absolute -top-2 -right-2 size-3 rounded-full bg-yellow-400 animate-bounce" 
             style={{ animationDelay: '0ms', animationDuration: '2s' }} />
        <div className="absolute -bottom-2 -left-2 size-2 rounded-full bg-blue-400 animate-bounce" 
             style={{ animationDelay: '400ms', animationDuration: '2s' }} />
        <div className="absolute top-0 -left-4 size-2 rounded-full bg-pink-400 animate-bounce" 
             style={{ animationDelay: '800ms', animationDuration: '2s' }} />
      </div>

      {/* Welcome message */}
      <div className="text-center mb-10 max-w-2xl">
        <h1 className="text-3xl font-bold text-gray-900 mb-3">
          Bonjour ! Je suis votre Coach IA
        </h1>
        <p className="text-lg text-gray-600 leading-relaxed">
          Je suis là pour vous aider à{' '}
          <span className="text-violet-600 font-semibold">
            booster votre carrière
          </span>
          . Posez-moi n'importe quelle question sur votre recherche d'emploi,
          votre CV, vos entretiens, ou votre développement professionnel.
        </p>
      </div>

      {/* Value propositions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10 max-w-4xl w-full">
        <ValuePropCard
          icon={<MessageSquare className="size-5" />}
          title="Conseils personnalisés"
          description="Réponses adaptées à votre situation unique"
        />
        <ValuePropCard
          icon={<Target className="size-5" />}
          title="Stratégies éprouvées"
          description="Techniques utilisées par les meilleurs recruteurs"
        />
        <ValuePropCard
          icon={<Zap className="size-5" />}
          title="Résultats rapides"
          description="Optimisez votre recherche d'emploi immédiatement"
        />
      </div>

      {/* Quick start questions */}
      <div className="w-full max-w-3xl">
        <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide text-center mb-4">
          Questions fréquentes pour commencer
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {quickQuestions.map((question) => (
            <button
              key={question.id}
              onClick={() => onQuestionClick?.(question.text)}
              className={cn(
                'group',
                'flex items-start gap-3 p-4',
                'bg-white hover:bg-gradient-to-br hover:from-violet-50 hover:to-purple-50',
                'border-2 border-gray-200 hover:border-violet-300',
                'rounded-xl',
                'text-left',
                'transition-all duration-200',
                'shadow-sm hover:shadow-md',
                'transform hover:-translate-y-0.5'
              )}
            >
              {/* Category icon */}
              <div className={cn(
                'flex-shrink-0 size-8 rounded-lg',
                'flex items-center justify-center',
                'transition-colors duration-200',
                getCategoryStyles(question.category)
              )}>
                {getCategoryIcon(question.category)}
              </div>

              {/* Question text */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 group-hover:text-violet-700 transition-colors">
                  {question.text}
                </p>
              </div>

              {/* Arrow icon */}
              <svg 
                className="flex-shrink-0 size-5 text-gray-400 group-hover:text-violet-600 transform group-hover:translate-x-1 transition-all" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))}
        </div>
      </div>

      {/* Pro tip */}
      <div className="mt-8 flex items-center gap-2 text-sm text-gray-500">
        <Sparkles className="size-4" />
        <span>
          Astuce : Soyez précis dans vos questions pour obtenir les meilleurs conseils
        </span>
      </div>
    </div>
  )
}

/**
 * ValuePropCard - Small card showing a value proposition
 */
function ValuePropCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="flex flex-col items-center text-center p-4 bg-gradient-to-br from-gray-50 to-white rounded-xl border border-gray-200">
      <div className="size-10 rounded-full bg-violet-100 flex items-center justify-center text-violet-600 mb-3">
        {icon}
      </div>
      <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
      <p className="text-sm text-gray-600">{description}</p>
    </div>
  )
}

/**
 * Get category-specific styles
 */
function getCategoryStyles(category: string): string {
  switch (category) {
    case 'cv':
      return 'bg-blue-100 group-hover:bg-blue-200 text-blue-600'
    case 'interview':
      return 'bg-green-100 group-hover:bg-green-200 text-green-600'
    case 'career':
      return 'bg-purple-100 group-hover:bg-purple-200 text-purple-600'
    case 'salary':
      return 'bg-amber-100 group-hover:bg-amber-200 text-amber-600'
    default:
      return 'bg-gray-100 group-hover:bg-gray-200 text-gray-600'
  }
}

/**
 * Get category-specific icon
 */
function getCategoryIcon(category: string): React.ReactNode {
  switch (category) {
    case 'cv':
      return (
        <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      )
    case 'interview':
      return (
        <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      )
    case 'career':
      return (
        <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
      )
    case 'salary':
      return (
        <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    default:
      return <Sparkles className="size-4" />
  }
}
