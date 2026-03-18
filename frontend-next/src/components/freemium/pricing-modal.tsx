"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, Sparkles, Zap, Crown, Gift } from "lucide-react";
import { useSubscription } from "@/contexts/subscription-context";
import { useOptionalAuth } from "@/contexts/auth-context";
import { PlanType } from "@/hooks/use-freemium-limits";
import Link from "next/link";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { usePricingData } from "@/hooks/use-pricing-data";

interface PricingPlan {
  id: PlanType;
  name: string;
  price: string;
  priceYearly: string;
  priceValue: number;
  priceYearlyValue: number;
  period: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  bgGradient: string;
  popular?: boolean;
  features: {
    name: string;
    included: boolean;
    highlight?: boolean;
  }[];
}

type BillingPeriod = "monthly" | "yearly";

export function PricingModal() {
  const tModal = useTranslations("pricingModal");
  const { showPricingModal, closePricingModal, pricingModalFeature } =
    useSubscription();
  const auth = useOptionalAuth();
  const user = auth?.user;
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");

  const {
    plans: dbPlans,
    currentPlan,
    isLoading: plansLoading,
    formatPrice,
  } = usePricingData();

  // Map DB plans to PricingPlan shape for the modal
  const ICON_MAP: Record<string, React.ReactNode> = {
    Gift: <Gift className="w-6 h-6" />,
    Zap: <Zap className="w-6 h-6" />,
    Sparkles: <Sparkles className="w-6 h-6" />,
    Crown: <Crown className="w-6 h-6" />,
  };
  const COLOR_MAP: Record<string, { text: string; gradient: string }> = {
    zinc: { text: "text-gray-600", gradient: "from-gray-400 to-gray-500" },
    blue: { text: "text-blue-600", gradient: "from-blue-500 to-blue-600" },
    purple: {
      text: "text-violet-600",
      gradient: "from-violet-500 to-purple-600",
    },
    amber: { text: "text-amber-600", gradient: "from-amber-500 to-orange-500" },
  };

  const plans: PricingPlan[] = dbPlans.map((p) => {
    const colors = COLOR_MAP[p.color] ?? COLOR_MAP.zinc;
    // Build feature list: included (✓) first, then excluded (✗)
    // First included feature is highlighted (bold)
    const features = [
      ...p.features.map((name, i) => ({
        name,
        included: true,
        highlight: i === 0,
      })),
      ...(p.features_excluded ?? []).map((name) => ({
        name,
        included: false,
        highlight: false,
      })),
    ];
    return {
      id: p.name as PlanType,
      name: p.display_name,
      price: formatPrice(p.price_monthly),
      priceYearly: formatPrice(p.price_yearly ?? 0),
      priceValue: p.price_monthly,
      priceYearlyValue: p.price_yearly ?? 0,
      period: tModal("plans.free.period"),
      description: p.description,
      icon: ICON_MAP[p.icon] ?? <Gift className="w-6 h-6" />,
      color: colors.text,
      bgGradient: colors.gradient,
      popular: p.isPopular,
      features,
    };
  });

  const handleSelectPlan = async (planId: PlanType) => {
    if (planId === "free" || planId === currentPlan) {
      toast.info(tModal("toasts.alreadyOnPlan"));
      closePricingModal();
      return;
    }

    // Check if user is authenticated
    if (!user || !auth?.session) {
      toast.error(tModal("toasts.mustBeLoggedIn"));
      closePricingModal();
      // Redirect to login with pricing redirect
      window.location.href = "/login?redirectTo=/pricing";
      return;
    }

    try {
      toast.loading(tModal("toasts.preparingPayment"), {
        id: "stripe-redirect",
      });
      closePricingModal();

      // ✅ FIX 5: Rafraîchir la session avant le checkout pour garantir user_id valide
      const supabase = createClient();
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.refreshSession();

      if (sessionError || !session) {
        throw new Error(tModal("toasts.sessionExpired"));
      }

      // Call backend to create Stripe checkout session
      const apiUrl =
        process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_API_URL;
      if (!apiUrl) throw new Error("Backend URL not configured");
      const response = await fetch(
        `${apiUrl}/api/stripe/create-checkout-session`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Bearer ${session.access_token}`, // ✅ Utiliser le token rafraîchi
          },
          body: new URLSearchParams({
            plan_name: planId,
            billing_period: billingPeriod,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        const detail: string =
          data.detail || "Failed to create checkout session";
        // Parse annual-to-monthly block: "ANNUAL_TO_MONTHLY_BLOCKED|2026-12-15"
        if (
          typeof detail === "string" &&
          detail.startsWith("ANNUAL_TO_MONTHLY_BLOCKED")
        ) {
          const periodEnd = detail.split("|")[1];
          const formattedDate = periodEnd
            ? new Date(periodEnd).toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })
            : null;
          throw new Error(
            formattedDate
              ? `Changement annuel → mensuel impossible. Votre abonnement annuel court jusqu'au ${formattedDate}. Vous pourrez passer en mensuel à cette date.`
              : "Vous avez un abonnement annuel en cours. Le changement vers mensuel sera possible à la fin de la période.",
          );
        }
        throw new Error(detail);
      }

      toast.dismiss("stripe-redirect");

      // Already on this plan
      if (data.already_subscribed) {
        toast.info(tModal("toasts.alreadyOnPlan"));
        return;
      }

      // Check if it's a subscription modification (upgrade/downgrade) or new subscription
      if (data.modified) {
        // Subscription was modified immediately (upgrade) or scheduled (downgrade)
        if (data.immediate) {
          toast.success(tModal("toasts.upgraded"));
        } else {
          toast.success(tModal("toasts.scheduled"));
        }

        // Redirect to success page with polling to verify update
        const sessionId = `mod_${Date.now()}`;
        window.location.href = `/payment/success?session_id=${sessionId}&type=modification`;
      } else {
        // New subscription - redirect to Stripe Checkout
        window.location.href = data.checkout_url;
      }
    } catch (error: any) {
      console.error("Stripe checkout error:", error);
      toast.dismiss("stripe-redirect");
      toast.error(error.message || tModal("toasts.paymentError"));
    }
  };

  return (
    <Dialog open={showPricingModal} onOpenChange={closePricingModal}>
      <DialogContent className="max-w-[95vw] w-full lg:max-w-6xl max-h-[95vh] overflow-hidden p-0 flex flex-col bg-white text-gray-900">
        <DialogHeader className="px-4 md:px-6 pt-4 md:pt-6 pb-3 flex-shrink-0">
          <DialogTitle className="text-2xl font-bold text-center">
            {tModal("title")}
          </DialogTitle>
          {pricingModalFeature && (
            <p className="text-center text-muted-foreground mt-2 text-sm">
              {tModal("featureRequired")}
            </p>
          )}
        </DialogHeader>

        <div className="px-4 md:px-6 pb-4 md:pb-6 overflow-y-auto flex-1">
          {/* Billing Period Toggle */}
          <div className="flex items-center justify-center gap-3 pt-2 pb-2">
            <span
              className={`text-sm font-medium ${billingPeriod === "monthly" ? "text-gray-900" : "text-gray-400"}`}
            >
              Mensuel
            </span>
            <button
              onClick={() =>
                setBillingPeriod(
                  billingPeriod === "monthly" ? "yearly" : "monthly",
                )
              }
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                billingPeriod === "yearly" ? "bg-violet-600" : "bg-gray-300"
              }`}
              aria-label="Toggle billing period"
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  billingPeriod === "yearly" ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
            <span
              className={`text-sm font-medium ${billingPeriod === "yearly" ? "text-gray-900" : "text-gray-400"}`}
            >
              Annuel
            </span>
            {billingPeriod === "yearly" && (
              <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">
                Économisez ~2 mois
              </Badge>
            )}
          </div>

          {/* Plans Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-4">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className={`relative rounded-xl border-2 p-5 transition-all hover:shadow-lg ${
                  plan.popular
                    ? "border-violet-500 shadow-violet-100 shadow-lg"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                {/* Popular Badge */}
                {plan.popular && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-violet-500 to-purple-600 text-white border-0 text-xs py-1 px-3 whitespace-nowrap">
                    {tModal("popular")}
                  </Badge>
                )}

                {/* Plan Header */}
                <div className="text-center mb-4">
                  <div
                    className={`inline-flex items-center justify-center w-12 h-12 rounded-lg bg-gradient-to-br ${plan.bgGradient} text-white mb-3`}
                  >
                    {plan.icon}
                  </div>
                  <h3 className="text-xl font-bold">{plan.name}</h3>
                  <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                    {plan.description}
                  </p>
                </div>

                {/* Price */}
                <div className="text-center mb-4 py-3 bg-white rounded-lg">
                  <div className="flex items-baseline justify-center gap-1">
                    {plan.id === "free" ? (
                      <span className="text-3xl font-bold text-gray-900">
                        {tModal("free")}
                      </span>
                    ) : (
                      <>
                        <span className="text-3xl font-bold text-gray-900">
                          {billingPeriod === "yearly"
                            ? plan.priceYearly
                            : plan.price}
                          €
                        </span>
                        <span className="text-base text-gray-600">
                          {billingPeriod === "yearly" ? "/an" : plan.period}
                        </span>
                      </>
                    )}
                  </div>
                  {billingPeriod === "yearly" && plan.id !== "free" && (
                    <p className="text-xs text-green-600 mt-1">
                      soit{" "}
                      {(plan.priceYearlyValue / 12)
                        .toFixed(2)
                        .replace(".", ",")}
                      €/mois
                    </p>
                  )}
                </div>

                {/* Features */}
                <ul className="space-y-2 mb-4">
                  {plan.features
                    .filter((f) => f.name)
                    .slice(0, 6)
                    .map((feature, index) => (
                      <li
                        key={index}
                        className={`flex items-start gap-2 text-sm ${
                          feature.highlight ? "font-medium" : ""
                        }`}
                      >
                        {feature.included ? (
                          <div
                            className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                              feature.highlight
                                ? `bg-gradient-to-br ${plan.bgGradient}`
                                : "bg-green-500"
                            }`}
                          >
                            <Check className="w-2.5 h-2.5 text-white" />
                          </div>
                        ) : (
                          <div className="w-4 h-4 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <X className="w-2.5 h-2.5 text-gray-400" />
                          </div>
                        )}
                        <span
                          className={feature.included ? "" : "text-gray-400"}
                        >
                          {feature.name}
                        </span>
                      </li>
                    ))}
                  {plan.features.filter((f) => f.name).length > 6 && (
                    <li className="text-xs text-muted-foreground italic pl-6">
                      {tModal("moreFeatures", {
                        count: plan.features.filter((f) => f.name).length - 6,
                      })}
                    </li>
                  )}
                </ul>

                {/* CTA Button — Skeleton pendant chargement (BUG 2) */}
                {currentPlan === null ? (
                  <Skeleton className="h-9 w-full rounded-md" />
                ) : (
                  <Button
                    onClick={() => handleSelectPlan(plan.id)}
                    className={`w-full h-11 text-sm font-semibold ${
                      plan.popular
                        ? "bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700"
                        : ""
                    }`}
                    variant={plan.popular ? "default" : "outline"}
                    disabled={plan.id === "free" || plan.id === currentPlan}
                  >
                    {plan.id === currentPlan
                      ? tModal("currentPlan")
                      : tModal("choosePlan", { name: plan.name })}
                  </Button>
                )}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="text-center mt-4 space-y-2">
            <p className="text-sm text-muted-foreground font-medium">
              {tModal("guarantee")}
            </p>
            <Link
              href="/pricing"
              onClick={closePricingModal}
              className="text-xs text-primary hover:underline block"
            >
              {tModal("seeComparison")}
            </Link>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Standalone pricing cards for the pricing page
export function PricingCards({
  onSelectPlan,
}: {
  onSelectPlan?: (plan: PlanType) => void;
}) {
  const tModal = useTranslations("pricingModal");
  const { plans: dbPlans, formatPrice } = usePricingData();

  const ICON_MAP: Record<string, React.ReactNode> = {
    Gift: <Gift className="w-6 h-6" />,
    Zap: <Zap className="w-6 h-6" />,
    Sparkles: <Sparkles className="w-6 h-6" />,
    Crown: <Crown className="w-6 h-6" />,
  };
  const GRADIENT_MAP: Record<string, string> = {
    zinc: "from-gray-400 to-gray-500",
    blue: "from-blue-500 to-blue-600",
    purple: "from-violet-500 to-purple-600",
    amber: "from-amber-500 to-orange-500",
  };

  return (
    <div className="grid md:grid-cols-4 gap-6 max-w-6xl mx-auto">
      {dbPlans.map((p) => {
        const gradient = GRADIENT_MAP[p.color] ?? GRADIENT_MAP.zinc;
        const features = [
          ...p.features.map((name, i) => ({
            name,
            included: true,
            highlight: i === 0,
          })),
          ...(p.features_excluded ?? []).map((name) => ({
            name,
            included: false,
            highlight: false,
          })),
        ];
        return (
          <div
            key={p.name}
            className={`relative rounded-2xl border-2 p-6 transition-all hover:shadow-xl ${
              p.isPopular
                ? "border-violet-500 shadow-violet-100 shadow-lg scale-[1.02]"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            {p.isPopular && (
              <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-violet-500 to-purple-600 text-white border-0 px-4">
                {tModal("popular")}
              </Badge>
            )}
            <div className="text-center mb-6">
              <div
                className={`inline-flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-br ${gradient} text-white mb-4`}
              >
                {ICON_MAP[p.icon] ?? <Gift className="w-6 h-6" />}
              </div>
              <h3 className="text-2xl font-bold">{p.display_name}</h3>
              <p className="text-muted-foreground mt-2">{p.description}</p>
            </div>
            <div className="text-center mb-6">
              <div className="flex items-baseline justify-center gap-1">
                {p.name === "free" ? (
                  <span className="text-5xl font-bold">{tModal("free")}</span>
                ) : (
                  <>
                    <span className="text-5xl font-bold">
                      {formatPrice(p.price_monthly)}€
                    </span>
                    <span className="text-xl text-muted-foreground">/mois</span>
                  </>
                )}
              </div>
            </div>
            <ul className="space-y-3 mb-8">
              {features
                .filter((f) => f.name)
                .map((feature, index) => (
                  <li
                    key={index}
                    className={`flex items-center gap-3 ${feature.highlight ? "font-medium" : ""}`}
                  >
                    {feature.included ? (
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center ${feature.highlight ? `bg-gradient-to-br ${gradient}` : "bg-green-500"}`}
                      >
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center">
                        <X className="w-3 h-3 text-gray-400" />
                      </div>
                    )}
                    <span className={feature.included ? "" : "text-gray-400"}>
                      {feature.name}
                    </span>
                  </li>
                ))}
            </ul>
            <Button
              onClick={() => onSelectPlan?.(p.name as PlanType)}
              className={`w-full h-12 text-lg ${p.isPopular ? "bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700" : ""}`}
              variant={p.isPopular ? "default" : "outline"}
              size="lg"
              disabled={p.name === "free"}
            >
              {p.name === "free"
                ? tModal("currentPlan")
                : tModal("startWith", { name: p.display_name })}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
