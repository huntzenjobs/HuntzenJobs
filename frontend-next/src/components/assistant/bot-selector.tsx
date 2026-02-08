'use client'

/**
 * BotSelector - Menu déroulant pour sélectionner un expert humain
 *
 * WORDING : Utilise "Assistant" ou "Expert" (jamais "IA" ou "Bot")
 * Ce sont des interfaces pour communiquer avec des humains spécialisés
 */

import { useState, useEffect } from 'react'
import { Check, ChevronDown, Lock, Crown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAssistant } from '@/contexts/assistant-context'
import { getAllAssistants, getAssistantConfig } from '@/config/assistants'
import { AssistantType } from '@/types/assistant'
import { useOptionalSubscription } from '@/contexts/subscription-context'
import { useOptionalAuth } from '@/contexts/auth-context'

interface BotSelectorProps {
  /** Classes CSS additionnelles */
  className?: string
  /** Variante d'affichage */
  variant?: 'default' | 'compact'
}

/**
 * Composant de sélection d'assistant (expert humain)
 * Affiche un dropdown avec la liste des experts disponibles
 */
export function BotSelector({ className, variant = 'default' }: BotSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const { selectedAssistant, setSelectedAssistant } = useAssistant()
  const subscription = useOptionalSubscription()
  const auth = useOptionalAuth()

  const currentConfig = getAssistantConfig(selectedAssistant)
  const allAssistants = getAllAssistants()

  const isFreePlan = subscription?.isFreePlan ?? true
  const user = auth?.user ?? null
  const openPricingModal = subscription?.openPricingModal || (() => {})

  // Fermer le dropdown quand on clique ailleurs
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('[data-bot-selector]')) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleSelect = (type: AssistantType) => {
    const config = getAssistantConfig(type)

    // Vérifier si l'assistant est premium et si l'utilisateur a accès
    if (config.isPremium && (!user || isFreePlan)) {
      if (user) {
        // User connecté mais plan gratuit -> ouvrir modal pricing
        openPricingModal()
      } else {
        // User non connecté -> rediriger vers login
        window.location.href = '/login'
      }
      setIsOpen(false)
      return
    }

    // Sélectionner l'assistant
    setSelectedAssistant(type)
    setIsOpen(false)
  }

  if (variant === 'compact') {
    return (
      <div className={cn('relative', className)} data-bot-selector>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
        >
          <currentConfig.icon className="w-4 h-4" style={{ color: currentConfig.color }} />
          <span className="text-sm font-medium text-white">{currentConfig.shortName}</span>
          <ChevronDown className={cn(
            'w-4 h-4 text-white/50 transition-transform',
            isOpen && 'rotate-180'
          )} />
        </button>

        {isOpen && (
          <DropdownMenu
            assistants={allAssistants}
            selectedAssistant={selectedAssistant}
            onSelect={handleSelect}
            isFreePlan={isFreePlan}
            user={user}
          />
        )}
      </div>
    )
  }

  // Variante par défaut (plus grande)
  return (
    <div className={cn('relative', className)} data-bot-selector>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-4 px-4 py-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
      >
        {/* Icône de l'expert */}
        <div
          className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: currentConfig.bgColor + '20' }}
        >
          <currentConfig.icon className="w-6 h-6" style={{ color: currentConfig.color }} />
        </div>

        {/* Info expert */}
        <div className="flex-1 text-left min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-base font-semibold text-white truncate">
              {currentConfig.shortName}
            </h3>
            {currentConfig.certificationBadge && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 font-medium">
                {currentConfig.certificationBadge}
              </span>
            )}
            {currentConfig.isPremium && (
              <Crown className="w-4 h-4 text-amber-400" />
            )}
          </div>
          <p className="text-xs text-white/50 truncate">
            {currentConfig.description}
          </p>
        </div>

        {/* Flèche dropdown */}
        <ChevronDown className={cn(
          'w-5 h-5 text-white/50 transition-transform shrink-0',
          isOpen && 'rotate-180'
        )} />
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <DropdownMenu
          assistants={allAssistants}
          selectedAssistant={selectedAssistant}
          onSelect={handleSelect}
          isFreePlan={isFreePlan}
          user={user}
        />
      )}
    </div>
  )
}

/**
 * Menu déroulant des assistants
 */
interface DropdownMenuProps {
  assistants: ReturnType<typeof getAllAssistants>
  selectedAssistant: AssistantType
  onSelect: (type: AssistantType) => void
  isFreePlan: boolean
  user: any
}

function DropdownMenu({ assistants, selectedAssistant, onSelect, isFreePlan, user }: DropdownMenuProps) {
  return (
    <div className="absolute top-full left-0 mt-2 z-50 w-[480px] bg-[#1a1f2e] border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="p-2 max-h-[400px] overflow-y-auto overflow-x-hidden">
        {assistants.map((assistant) => {
          const isSelected = assistant.id === selectedAssistant
          const isLocked = assistant.isPremium && (!user || isFreePlan)

          return (
            <button
              key={assistant.id}
              onClick={() => onSelect(assistant.id)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-all',
                isSelected
                  ? 'bg-white/10 ring-1 ring-white/20'
                  : 'hover:bg-white/5',
                isLocked && 'opacity-60'
              )}
            >
              {/* Icône */}
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: assistant.bgColor + '20' }}
              >
                <assistant.icon className="w-5 h-5" style={{ color: assistant.color }} />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium text-white truncate">
                    {assistant.shortName}
                  </span>
                  {assistant.certificationBadge && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400 font-medium shrink-0">
                      {assistant.certificationBadge}
                    </span>
                  )}
                </div>
                <p className="text-xs text-white/50 truncate">
                  {assistant.description}
                </p>
              </div>

              {/* État (sélectionné, locked, premium) */}
              <div className="shrink-0">
                {isSelected ? (
                  <Check className="w-4 h-4 text-green-400" />
                ) : isLocked ? (
                  <Lock className="w-4 h-4 text-white/40" />
                ) : assistant.isPremium ? (
                  <Crown className="w-4 h-4 text-amber-400" />
                ) : null}
              </div>
            </button>
          )
        })}
      </div>

      {/* Footer info */}
      <div className="px-4 py-3 border-t border-white/10 bg-white/5">
        <p className="text-xs text-white/50 text-center">
          💬 Vous discutez avec des <span className="text-white font-medium">experts humains certifiés</span>
        </p>
      </div>
    </div>
  )
}
