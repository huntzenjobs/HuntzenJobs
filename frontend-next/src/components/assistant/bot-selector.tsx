"use client";

/**
 * BotSelector - Menu déroulant pour sélectionner un expert humain
 *
 * WORDING : Utilise "Assistant" ou "Expert" (jamais "IA" ou "Bot")
 * Ce sont des interfaces pour communiquer avec des humains spécialisés
 */

import { useState, useEffect } from "react";
import {
  Check,
  ChevronDown,
  Lock,
  Crown,
  Sparkles,
  Mic,
  Zap,
  Brain,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAssistant } from "@/contexts/assistant-context";
import { getAllAssistants, getAssistantConfig } from "@/config/assistants";
import { AssistantType } from "@/types/assistant";
import { useOptionalSubscription } from "@/contexts/subscription-context";
import { useOptionalAuth } from "@/contexts/auth-context";
import type { User } from "@supabase/supabase-js";

interface BotSelectorProps {
  /** Classes CSS additionnelles */
  className?: string;
  /** Variante d'affichage */
  variant?: "default" | "compact";
  /** Callback appelé à la sélection d'un assistant — remplace setSelectedAssistant direct */
  onAssistantChange?: (type: AssistantType) => void;
}

/**
 * Composant de sélection d'assistant (expert humain)
 * Affiche un dropdown avec la liste des experts disponibles
 */
export function BotSelector({
  className,
  variant = "default",
  onAssistantChange,
}: BotSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showComingSoon, setShowComingSoon] = useState(false);
  const { selectedAssistant, setSelectedAssistant } = useAssistant();
  const subscription = useOptionalSubscription();
  const auth = useOptionalAuth();

  const currentConfig = getAssistantConfig(selectedAssistant);
  const allAssistants = getAllAssistants();

  const isFreePlan = subscription?.isFreePlan ?? true;
  const user = auth?.user ?? null;
  const openPricingModal = subscription?.openPricingModal || (() => {});

  // Fermer le dropdown quand on clique ailleurs
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest("[data-bot-selector]")) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  const handleSelect = (type: AssistantType) => {
    const config = getAssistantConfig(type);

    // Feature coming soon — show teaser instead of selecting
    if (config.isComingSoon) {
      setIsOpen(false);
      setShowComingSoon(true);
      return;
    }

    // Vérifier si l'assistant est premium et si l'utilisateur a accès
    if (config.isPremium && (!user || isFreePlan)) {
      if (user) {
        // User connecté mais plan gratuit -> ouvrir modal pricing
        openPricingModal();
      } else {
        // User non connecté -> rediriger vers login
        window.location.href = "/login";
      }
      setIsOpen(false);
      return;
    }

    // Sélectionner l'assistant (via callback ou directement)
    if (onAssistantChange) {
      onAssistantChange(type);
    } else {
      setSelectedAssistant(type);
    }
    setIsOpen(false);
  };

  if (variant === "compact") {
    return (
      <div className={cn("relative", className)} data-bot-selector>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-slate-200 hover:border-[#00D9FF]/40 hover:bg-slate-50 transition-colors shadow-sm"
        >
          <currentConfig.icon
            className="w-4 h-4"
            style={{ color: currentConfig.color }}
          />
          <span className="text-sm font-medium text-slate-900">
            {currentConfig.shortName}
          </span>
          <ChevronDown
            className={cn(
              "w-4 h-4 text-slate-400 transition-transform",
              isOpen && "rotate-180",
            )}
          />
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
    );
  }

  // Variante par défaut (plus grande)
  return (
    <div className={cn("relative", className)} data-bot-selector>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-4 px-4 py-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
      >
        {/* Icône de l'expert */}
        <div
          className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: currentConfig.bgColor + "20" }}
        >
          <currentConfig.icon
            className="w-6 h-6"
            style={{ color: currentConfig.color }}
          />
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
          <p className="text-xs text-white/70 truncate">
            {currentConfig.description}
          </p>
        </div>

        {/* Flèche dropdown */}
        <ChevronDown
          className={cn(
            "w-5 h-5 text-white/70 transition-transform shrink-0",
            isOpen && "rotate-180",
          )}
        />
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

      {/* Coming Soon modal — Interview Simulator */}
      {showComingSoon && (
        <InterviewSimComingSoon onClose={() => setShowComingSoon(false)} />
      )}
    </div>
  );
}

/**
 * Modale "Coming Soon" pour l'Interview Simulator
 */
function InterviewSimComingSoon({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Gradient header */}
        <div className="relative bg-gradient-to-br from-orange-500 via-orange-600 to-amber-500 px-6 pt-8 pb-10 text-white overflow-hidden">
          <div className="absolute inset-0 opacity-20">
            <div className="absolute top-2 right-8 w-32 h-32 rounded-full bg-white blur-2xl" />
            <div className="absolute -bottom-4 left-4 w-24 h-24 rounded-full bg-white blur-2xl" />
          </div>
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-sm uppercase tracking-wider">
                Bientôt disponible
              </span>
            </div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <Mic className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-2xl font-bold">Interview Simulator</h2>
            </div>
            <p className="text-white/80 text-sm leading-relaxed">
              Préparez vos entretiens comme jamais auparavant — avec une IA qui
              joue le recruteur en temps réel.
            </p>
          </div>
        </div>

        {/* Features */}
        <div className="px-6 py-5 space-y-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
            Ce qui arrive
          </p>
          {[
            {
              icon: Zap,
              label: "Entretiens en temps réel",
              desc: "Simulation live face à un recruteur IA",
            },
            {
              icon: Brain,
              label: "Feedback instantané",
              desc: "Analyse de vos réponses, posture, mots-clés",
            },
            {
              icon: Star,
              label: "Tous types d'entretiens",
              desc: "Tech, RH, comportemental, cas pratiques",
            },
            {
              icon: Sparkles,
              label: "Coaching post-entretien",
              desc: "Plan d'amélioration personnalisé",
            },
          ].map(({ icon: Icon, label, desc }) => (
            <div key={label} className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center shrink-0 mt-0.5">
                <Icon className="w-4 h-4 text-orange-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900">{label}</p>
                <p className="text-xs text-slate-500">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="px-6 pb-6">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold text-sm hover:from-orange-600 hover:to-amber-600 transition-all shadow-lg shadow-orange-200"
          >
            J&apos;ai hâte ! Fermer
          </button>
          <p className="text-center text-xs text-slate-400 mt-3">
            Vous serez notifié dès le lancement 🚀
          </p>
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors"
          aria-label="Fermer"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

/**
 * Menu déroulant des assistants
 */
interface DropdownMenuProps {
  assistants: ReturnType<typeof getAllAssistants>;
  selectedAssistant: AssistantType;
  onSelect: (type: AssistantType) => void;
  isFreePlan: boolean;
  user: User | null;
}

function DropdownMenu({
  assistants,
  selectedAssistant,
  onSelect,
  isFreePlan,
  user,
}: DropdownMenuProps) {
  return (
    <div className="absolute top-full left-0 mt-2 z-50 w-[calc(100vw-2rem)] sm:w-[480px] bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="p-2 max-h-[400px] overflow-y-auto overflow-x-hidden">
        {assistants.map((assistant) => {
          const isSelected = assistant.id === selectedAssistant;
          const isLocked = assistant.isPremium && (!user || isFreePlan);
          const isComingSoon = !!assistant.isComingSoon;

          return (
            <button
              key={assistant.id}
              onClick={() => onSelect(assistant.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-all",
                isSelected
                  ? "bg-[#00D9FF]/10 ring-1 ring-[#00D9FF]/30"
                  : isComingSoon
                    ? "opacity-50 cursor-default hover:bg-transparent"
                    : "hover:bg-slate-50",
                isLocked && !isComingSoon && "opacity-60",
              )}
            >
              {/* Icône */}
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: assistant.bgColor + "20" }}
              >
                <assistant.icon
                  className="w-5 h-5"
                  style={{ color: assistant.color }}
                />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  {assistant.personaName ? (
                    <span className="text-sm font-bold text-slate-900 truncate">
                      {assistant.personaName}
                    </span>
                  ) : (
                    <span className="text-sm font-medium text-slate-900 truncate">
                      {assistant.shortName}
                    </span>
                  )}
                  {assistant.certificationBadge && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-700 font-medium shrink-0">
                      {assistant.certificationBadge}
                    </span>
                  )}
                </div>
                {assistant.personaName ? (
                  <p className="text-xs text-slate-600 truncate font-medium">
                    {assistant.shortName}
                  </p>
                ) : null}
                <p className="text-xs text-slate-500 truncate">
                  {assistant.description}
                </p>
              </div>

              {/* État (sélectionné, coming soon, locked, premium) */}
              <div className="shrink-0">
                {isComingSoon ? (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600 font-semibold">
                    Bientôt
                  </span>
                ) : isSelected ? (
                  <Check className="w-4 h-4 text-[#00D9FF]" />
                ) : isLocked ? (
                  <Lock className="w-4 h-4 text-slate-300" />
                ) : assistant.isPremium ? (
                  <Crown className="w-4 h-4 text-amber-400" />
                ) : null}
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer info */}
      <div className="px-4 py-3 border-t border-slate-100 bg-slate-50">
        <p className="text-xs text-slate-500 text-center">
          💬 Vous discutez avec des{" "}
          <span className="text-slate-900 font-medium">
            experts humains certifiés
          </span>
        </p>
      </div>
    </div>
  );
}
