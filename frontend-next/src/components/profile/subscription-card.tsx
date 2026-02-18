"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useSubscription } from "@/contexts/subscription-context";
import { PLAN_LIMITS } from "@/hooks/use-freemium-limits";
import { UsageCounter } from "@/components/freemium/usage-counter";
import { Check, X, Crown, Sparkles, Zap, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

// Plan configuration - Prices synced with database (subscription_plans table)
const PLAN_CONFIG = {
  free: {
    name: "Gratuit",
    price: "0€",
    period: "",
    color: "bg-gray-500",
    icon: null,
    description: "Découvrez les fonctionnalités de base",
  },
  starter: {
    name: "Starter",
    price: "8,90€",
    period: "/mois",
    color: "bg-blue-500",
    icon: <Sparkles className="w-4 h-4" />,
    description: "Idéal pour une recherche active",
  },
  pro: {
    name: "Pro",
    price: "13,90€",
    period: "/mois",
    color: "bg-violet-500",
    icon: <Zap className="w-4 h-4" />,
    description: "Pour les professionnels exigeants",
  },
  premium: {
    name: "Premium",
    price: "19,90€",
    period: "/mois",
    color: "bg-amber-500",
    icon: <Crown className="w-4 h-4" />,
    description: "L'expérience ultime",
  },
};

// Feature labels in French
const FEATURE_LABELS: Record<string, string> = {
  has_advanced_filters: "Filtres avancés",
  has_favorites: "Favoris illimités",
  has_email_alerts: "Alertes email",
  has_visual_score: "Score visuel CV",
  has_pdf_export: "Export PDF",
  has_cv_history: "Historique CV",
  has_interview_sim: "Simulation d'entretien",
  has_personalized_advice: "Conseils personnalisés",
  has_coach_history: "Historique Coach",
};

export function SubscriptionCard() {
  const { plan, planName, isFreePlan, isPaidPlan, openPricingModal, limits } =
    useSubscription();

  const planConfig = PLAN_CONFIG[plan];
  const planLimits = PLAN_LIMITS[plan];

  // Get list of features (boolean flags)
  const features = Object.entries(planLimits)
    .filter(([key]) => key.startsWith("has_"))
    .map(([key, value]) => ({
      key,
      label: FEATURE_LABELS[key] || key,
      enabled: value as boolean,
    }));

  // Get next plan for upgrade
  const getNextPlan = () => {
    if (plan === "free") return "starter";
    if (plan === "starter") return "pro";
    if (plan === "pro") return "premium";
    return null;
  };

  const nextPlan = getNextPlan();
  const canUpgrade = nextPlan !== null;

  return (
    <Card
      className={cn(
        "p-6 space-y-6",
        isPaidPlan &&
          "border-2 border-gradient-to-r from-violet-500 to-purple-500",
      )}
    >
      {/* Plan Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge className={cn("gap-1", planConfig.color)}>
              {planConfig.icon}
              {planConfig.name}
            </Badge>
            {isPaidPlan && (
              <Badge
                variant="outline"
                className="gap-1 text-green-600 border-green-600"
              >
                <Check className="w-3 h-3" />
                Actif
              </Badge>
            )}
          </div>
          <div>
            <p className="text-2xl font-bold">
              {planConfig.price}
              <span className="text-sm font-normal text-gray-500">
                {planConfig.period}
              </span>
            </p>
            <p className="text-sm text-gray-600">
              {planConfig.description}
            </p>
          </div>
        </div>

        {canUpgrade && (
          <Button
            onClick={() => openPricingModal()}
            size="sm"
            className="gap-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
            aria-label={`Passer au plan ${PLAN_CONFIG[nextPlan].name} pour ${PLAN_CONFIG[nextPlan].price}${PLAN_CONFIG[nextPlan].period}`}
          >
            <TrendingUp className="w-4 h-4" aria-hidden="true" />
            Passer à {PLAN_CONFIG[nextPlan].name}
          </Button>
        )}
      </div>

      <Separator />

      {/* Features List */}
      <div className="space-y-3">
        <h3 className="font-semibold text-sm text-gray-700">
          Fonctionnalités incluses
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {features.map(({ key, label, enabled }) => (
            <div
              key={key}
              className={cn(
                "flex items-center gap-2 text-sm",
                enabled ? "text-gray-700" : "text-gray-400",
              )}
            >
              {enabled ? (
                <Check
                  className="w-4 h-4 text-green-600 shrink-0"
                  aria-hidden="true"
                />
              ) : (
                <X
                  className="w-4 h-4 text-gray-400 shrink-0"
                  aria-hidden="true"
                />
              )}
              <span className={!enabled ? "line-through" : ""}>{label}</span>
            </div>
          ))}
        </div>

        {/* Quota limits */}
        <div className="pt-2 space-y-1 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-green-600" aria-hidden="true" />
            <span>
              {planLimits.cv_analyses_per_day === Infinity
                ? "Analyses CV illimitées"
                : `${planLimits.cv_analyses_per_day} analyse(s) CV par jour`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-green-600" aria-hidden="true" />
            <span>
              {planLimits.coach_minutes_per_day === Infinity
                ? "Coach IA illimité"
                : `${planLimits.coach_minutes_per_day} min de Coach IA par jour`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-green-600" aria-hidden="true" />
            <span>
              {planLimits.job_searches_per_day === Infinity
                ? "Recherches d'emploi illimitées"
                : `${planLimits.job_searches_per_day} recherches d'emploi par jour`}
            </span>
          </div>
        </div>
      </div>

      <Separator />

      {/* Usage Quotas */}
      <div className="space-y-4">
        <h3 className="font-semibold text-sm text-gray-700">
          Utilisation du jour
        </h3>

        {/* CV Analysis */}
        <div className="space-y-1">
          <p className="text-xs text-gray-500 font-medium">
            Analyses CV
          </p>
          <UsageCounter feature="cv_analysis" showIcon={false} />
        </div>

        {/* Coach Time */}
        <div className="space-y-1">
          <p className="text-xs text-gray-500 font-medium">
            Temps Coach IA
          </p>
          <UsageCounter feature="coach_time" showIcon={false} />
        </div>

        {/* Job Searches */}
        <div className="space-y-1">
          <p className="text-xs text-gray-500 font-medium">
            Recherches d'emploi
          </p>
          <UsageCounter feature="job_search" showIcon={false} />
        </div>
      </div>

      {/* Upgrade CTA for free plan */}
      {isFreePlan && (
        <>
          <Separator />
          <div className="bg-gradient-to-r from-violet-50 to-purple-50 border border-violet-200 rounded-lg p-4 space-y-3">
            <div className="flex items-start gap-3">
              <Crown
                className="w-5 h-5 text-violet-600 shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <div className="space-y-1">
                <p className="font-semibold text-violet-900">
                  Débloquez tout le potentiel de HuntZen
                </p>
                <p className="text-sm text-violet-700">
                  Passez à un plan payant pour des analyses illimitées, plus de
                  temps de coaching, et des fonctionnalités exclusives.
                </p>
              </div>
            </div>
            <Button
              onClick={() => openPricingModal()}
              className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
              aria-label="Voir tous les plans d'abonnement disponibles"
            >
              Voir les plans
            </Button>
          </div>
        </>
      )}

      {/* Manage subscription for paid plans */}
      {isPaidPlan && (
        <>
          <Separator />
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              className="sm:flex-1"
              onClick={() => openPricingModal()}
              aria-label="Changer de plan d'abonnement"
            >
              Changer de plan
            </Button>
            <Button
              variant="ghost"
              className="sm:flex-1 text-red-600 hover:text-red-700 hover:bg-red-50"
              disabled
              aria-label="Annuler l'abonnement (bientôt disponible)"
            >
              Annuler l'abonnement
            </Button>
          </div>
          <p className="text-xs text-gray-500 text-center">
            💡 L'annulation d'abonnement sera disponible prochainement
          </p>
        </>
      )}
    </Card>
  );
}
