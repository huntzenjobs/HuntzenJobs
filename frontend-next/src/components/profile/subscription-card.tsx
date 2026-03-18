"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useSubscription } from "@/contexts/subscription-context";
import { useAuth } from "@/contexts/auth-context";
import { useSubscriptionApi } from "@/hooks/use-subscription-api";
import { PLAN_LIMITS } from "@/hooks/use-freemium-limits";
import { UsageCounter } from "@/components/freemium/usage-counter";
import {
  Check,
  X,
  Crown,
  Sparkles,
  Zap,
  TrendingUp,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { useConversionPopup } from "@/components/freemium/conversion-popups";
import { usePlansConfig } from "@/hooks/use-plans-config";

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
  const { session } = useAuth();
  const apiData = useSubscriptionApi();
  const t = useTranslations("profile");

  const antiChurnPopup = useConversionPopup("anti_churn", {
    onUpgrade: (checkoutUrl) => {
      if (checkoutUrl) {
        window.location.href = checkoutUrl;
      } else {
        openPricingModal();
      }
    },
    onSecondaryAction: () => setShowCancelDialog(true),
  });

  const [isCancelling, setIsCancelling] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelSuccess, setCancelSuccess] = useState<string | null>(null);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);

  // Enriched data from API (cancel_at_period_end, past_due status)
  const subStatus = apiData.subscription?.status ?? "active";
  const cancelAtPeriodEnd = apiData.subscription?.cancel_at_period_end ?? false;
  const periodEnd = apiData.subscription?.current_period_end ?? null;
  const isPastDue = subStatus === "past_due";

  const formattedPeriodEnd = periodEnd
    ? new Date(periodEnd).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  const handleOpenPortal = async () => {
    setIsOpeningPortal(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/stripe/create-portal-session`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${session?.access_token}` },
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Erreur");
      window.location.href = data.portal_url;
    } catch (err) {
      console.error("Portal error:", err);
    } finally {
      setIsOpeningPortal(false);
    }
  };

  const planConfig = PLAN_CONFIG[plan];
  const planLimits = PLAN_LIMITS[plan];
  const { getPlan, formatPrice } = usePlansConfig();

  const dynamicPrice = (() => {
    const p = getPlan(plan);
    if (!p || p.price_monthly === 0) return "0€";
    return `${formatPrice(p.price_monthly)}€/mois`;
  })();

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

  const handleOpenCancelDialog = () => {
    // Reset state fresh each time dialog opens
    setCancelError(null);
    setCancelSuccess(null);
    // Show anti-churn offer first; user can click cancel again to proceed
    antiChurnPopup.open();
  };

  const handleCloseCancelDialog = () => {
    if (isCancelling) return; // Prevent closing while request in flight
    setShowCancelDialog(false);
    setCancelError(null);
    setCancelSuccess(null);
  };

  const handleCancelSubscription = async () => {
    setIsCancelling(true);
    setCancelError(null);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/stripe/cancel-subscription`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
            "Content-Type": "application/json",
          },
        },
      );
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Erreur lors de l'annulation");
      }
      const data = await response.json();
      setCancelSuccess(data.plan_name || plan);
      // Close dialog and reload after showing success message
      setTimeout(() => {
        setShowCancelDialog(false);
        window.location.reload();
      }, 2500);
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <>
      <Card
        className={cn(
          "p-6 space-y-6",
          isPaidPlan &&
            "border-2 border-gradient-to-r from-violet-500 to-purple-500",
        )}
      >
        {/* Banner: paiement en échec */}
        {isPastDue && (
          <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-2">
              <p className="text-sm font-semibold text-red-800">
                Paiement en échec
              </p>
              <p className="text-xs text-red-700">
                Votre dernier paiement a échoué. Mettez à jour votre moyen de
                paiement pour conserver votre accès
                {formattedPeriodEnd ? ` jusqu'au ${formattedPeriodEnd}` : ""}.
              </p>
              <Button
                size="sm"
                onClick={handleOpenPortal}
                disabled={isOpeningPortal}
                className="bg-red-600 hover:bg-red-700 text-white h-8 text-xs"
              >
                {isOpeningPortal ? "Ouverture..." : "Mettre à jour ma carte"}
              </Button>
            </div>
          </div>
        )}

        {/* Banner: annulation programmée */}
        {cancelAtPeriodEnd && !isPastDue && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-amber-800">
                Annulation programmée
              </p>
              <p className="text-xs text-amber-700">
                Votre abonnement{" "}
                {getPlan(plan)?.display_name ?? planConfig.name} restera actif
                {formattedPeriodEnd
                  ? ` jusqu'au ${formattedPeriodEnd}`
                  : " jusqu'à la fin de la période"}
                , puis passera au plan Gratuit.
              </p>
            </div>
          </div>
        )}

        {/* Plan Header */}
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge className={cn("gap-1", planConfig.color)}>
                {planConfig.icon}
                {getPlan(plan)?.display_name ?? planConfig.name}
              </Badge>
              {isPaidPlan && !cancelAtPeriodEnd && !isPastDue && (
                <Badge
                  variant="outline"
                  className="gap-1 text-green-600 border-green-600"
                >
                  <Check className="w-3 h-3" />
                  Actif
                </Badge>
              )}
              {isPaidPlan && cancelAtPeriodEnd && (
                <Badge
                  variant="outline"
                  className="gap-1 text-amber-600 border-amber-400"
                >
                  <Clock className="w-3 h-3" />
                  {formattedPeriodEnd
                    ? `Fin le ${formattedPeriodEnd}`
                    : "Annulation prévue"}
                </Badge>
              )}
              {isPastDue && (
                <Badge
                  variant="outline"
                  className="gap-1 text-red-600 border-red-400"
                >
                  <AlertTriangle className="w-3 h-3" />
                  Paiement en échec
                </Badge>
              )}
            </div>
            <div>
              <p className="text-2xl font-bold">{dynamicPrice}</p>
              <p className="text-sm text-gray-600">
                {getPlan(plan)?.description ?? planConfig.description}
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
                {planLimits.assistant_messages_per_day === Infinity
                  ? "Messages Assistant illimités"
                  : `${planLimits.assistant_messages_per_day} messages Assistant par jour`}
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
            <p className="text-xs text-gray-500 font-medium">Analyses CV</p>
            <UsageCounter feature="cv_analysis" showIcon={false} />
          </div>

          {/* Assistant Messages */}
          <div className="space-y-1">
            <p className="text-xs text-gray-500 font-medium">
              Messages Assistant
            </p>
            <UsageCounter feature="assistant_messages" showIcon={false} />
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
                    Passez à un plan payant pour des analyses illimitées, plus
                    de temps de coaching, et des fonctionnalités exclusives.
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
                onClick={handleOpenCancelDialog}
                disabled={isCancelling}
                aria-label={t("cancelSubscription")}
              >
                {isCancelling ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin h-4 w-4 border-2 border-red-400 border-t-transparent rounded-full inline-block" />
                    {t("cancelling")}
                  </span>
                ) : (
                  t("cancelSubscription")
                )}
              </Button>
            </div>
          </>
        )}
      </Card>

      <antiChurnPopup.PopupComponent />

      <AlertDialog
        open={showCancelDialog}
        onOpenChange={handleCloseCancelDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {cancelSuccess
                ? t("cancelDialog.successTitle")
                : t("cancelDialog.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {cancelSuccess
                ? t("cancelDialog.successDescription", {
                    plan: cancelSuccess,
                  })
                : t("cancelDialog.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {cancelError && (
            <p className="text-sm text-red-600 px-1">{cancelError}</p>
          )}
          {!cancelSuccess && (
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isCancelling}>
                {t("cancelDialog.keep")}
              </AlertDialogCancel>
              {/* Use regular Button (not AlertDialogAction) to prevent auto-close before async resolves */}
              <Button
                onClick={handleCancelSubscription}
                disabled={isCancelling}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {isCancelling ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full inline-block" />
                    {t("cancelling")}
                  </span>
                ) : (
                  t("cancelDialog.confirm")
                )}
              </Button>
            </AlertDialogFooter>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
