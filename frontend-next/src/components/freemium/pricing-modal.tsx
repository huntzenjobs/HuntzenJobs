"use client";

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
import { useSubscriptionApi } from "@/hooks/use-subscription-api";
import { useOptionalAuth } from "@/contexts/auth-context";
import { PlanType } from "@/hooks/use-freemium-limits";
import Link from "next/link";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useTranslations } from "next-intl";

interface PricingPlan {
  id: PlanType;
  name: string;
  price: string;
  priceValue: number;
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

// Static config: booleans only (no translatable text)
const FEATURE_CONFIGS: Record<
  string,
  { included: boolean; highlight?: boolean }[]
> = {
  free: [
    { included: true },
    { included: true },
    { included: true },
    { included: true },
    { included: false },
    { included: false },
    { included: false },
    { included: false },
    { included: false },
  ],
  starter: [
    { included: true, highlight: true },
    { included: true, highlight: true },
    { included: true },
    { included: true },
    { included: true },
    { included: true },
    { included: false },
    { included: false },
    { included: false },
  ],
  pro: [
    { included: true },
    { included: true, highlight: true },
    { included: true, highlight: true },
    { included: true, highlight: true },
    { included: true },
    { included: false },
    { included: false },
    { included: false },
    { included: false },
  ],
  premium: [
    { included: true },
    { included: true, highlight: true },
    { included: true, highlight: true },
    { included: true, highlight: true },
    { included: true },
    { included: true },
    { included: true },
    { included: true },
    { included: true },
  ],
};

export function PricingModal() {
  const tModal = useTranslations("pricingModal");
  const {
    showPricingModal,
    closePricingModal,
    pricingModalFeature,
    plan: contextPlan,
  } = useSubscription();
  const auth = useOptionalAuth();
  const user = auth?.user;

  const buildFeatures = (id: string) =>
    (tModal.raw(`plans.${id}.featureNames`) as string[]).map((name, i) => ({
      name,
      ...(FEATURE_CONFIGS[id]?.[i] ?? { included: false }),
    }));

  const plans: PricingPlan[] = [
    {
      id: "free",
      name: tModal("plans.free.name"),
      price: "0",
      priceValue: 0,
      period: tModal("plans.free.period"),
      description: tModal("plans.free.description"),
      icon: <Gift className="w-6 h-6" />,
      color: "text-gray-600",
      bgGradient: "from-gray-400 to-gray-500",
      features: buildFeatures("free"),
    },
    {
      id: "starter",
      name: tModal("plans.starter.name"),
      price: "8,90",
      priceValue: 8.9,
      period: tModal("plans.starter.period"),
      description: tModal("plans.starter.description"),
      icon: <Zap className="w-6 h-6" />,
      color: "text-blue-600",
      bgGradient: "from-blue-500 to-blue-600",
      features: buildFeatures("starter"),
    },
    {
      id: "pro",
      name: tModal("plans.pro.name"),
      price: "13,90",
      priceValue: 13.9,
      period: tModal("plans.pro.period"),
      description: tModal("plans.pro.description"),
      icon: <Sparkles className="w-6 h-6" />,
      color: "text-violet-600",
      bgGradient: "from-violet-500 to-purple-600",
      popular: true,
      features: buildFeatures("pro"),
    },
    {
      id: "premium",
      name: tModal("plans.premium.name"),
      price: "19,90",
      priceValue: 19.9,
      period: tModal("plans.premium.period"),
      description: tModal("plans.premium.description"),
      icon: <Crown className="w-6 h-6" />,
      color: "text-amber-600",
      bgGradient: "from-amber-500 to-orange-500",
      features: buildFeatures("premium"),
    },
  ];

  // 🔥 FIX: Use useSubscriptionApi directly to get fresh data from backend
  const apiData = useSubscriptionApi();

  // Use API data as source of truth, fallback to context if API not loaded yet
  const currentPlan = apiData.subscription?.plan_name || contextPlan;

  // 🔍 DEBUG
  console.log("[PRICING MODAL DEBUG]", {
    apiPlan: apiData.subscription?.plan_name,
    contextPlan,
    finalPlan: currentPlan,
    isLoading: apiData.isLoading,
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
            billing_period: "monthly", // Default to monthly in modal
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Failed to create checkout session");
      }

      toast.dismiss("stripe-redirect");

      // Check if it's a subscription modification (upgrade/downgrade) or new subscription
      if (data.modified) {
        // Subscription was modified immediately (upgrade) or scheduled (downgrade)
        if (data.immediate) {
          toast.success(tModal("toasts.upgraded"));
        } else {
          toast.success(tModal("toasts.scheduled"));
        }

        // Redirect to success page with polling to verify update
        // Use a fake session_id to trigger the polling mechanism
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
        <DialogHeader className="px-6 pt-6 pb-3 flex-shrink-0">
          <DialogTitle className="text-2xl font-bold text-center">
            {tModal("title")}
          </DialogTitle>
          {pricingModalFeature && (
            <p className="text-center text-muted-foreground mt-2 text-sm">
              {tModal("featureRequired")}
            </p>
          )}
        </DialogHeader>

        <div className="px-6 pb-6 overflow-y-auto flex-1">
          {/* Plans Grid */}
          <div className="grid md:grid-cols-4 gap-4 pt-4">
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
                          {plan.price}€
                        </span>
                        <span className="text-base text-gray-600">
                          {plan.period}
                        </span>
                      </>
                    )}
                  </div>
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

                {/* CTA Button */}
                <Button
                  onClick={() => handleSelectPlan(plan.id)}
                  className={`w-full h-11 text-sm font-semibold ${
                    plan.popular
                      ? "bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700"
                      : ""
                  }`}
                  variant={plan.popular ? "default" : "outline"}
                  disabled={plan.id === "free"}
                >
                  {plan.id === "free"
                    ? tModal("currentPlan")
                    : tModal("choosePlan", { name: plan.name })}
                </Button>
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

  const buildFeatures = (id: string) =>
    (tModal.raw(`plans.${id}.featureNames`) as string[]).map((name, i) => ({
      name,
      ...(FEATURE_CONFIGS[id]?.[i] ?? { included: false }),
    }));

  const plans: PricingPlan[] = [
    {
      id: "free",
      name: tModal("plans.free.name"),
      price: "0",
      priceValue: 0,
      period: tModal("plans.free.period"),
      description: tModal("plans.free.description"),
      icon: <Gift className="w-6 h-6" />,
      color: "text-gray-600",
      bgGradient: "from-gray-400 to-gray-500",
      features: buildFeatures("free"),
    },
    {
      id: "starter",
      name: tModal("plans.starter.name"),
      price: "8,90",
      priceValue: 8.9,
      period: tModal("plans.starter.period"),
      description: tModal("plans.starter.description"),
      icon: <Zap className="w-6 h-6" />,
      color: "text-blue-600",
      bgGradient: "from-blue-500 to-blue-600",
      features: buildFeatures("starter"),
    },
    {
      id: "pro",
      name: tModal("plans.pro.name"),
      price: "13,90",
      priceValue: 13.9,
      period: tModal("plans.pro.period"),
      description: tModal("plans.pro.description"),
      icon: <Sparkles className="w-6 h-6" />,
      color: "text-violet-600",
      bgGradient: "from-violet-500 to-purple-600",
      popular: true,
      features: buildFeatures("pro"),
    },
    {
      id: "premium",
      name: tModal("plans.premium.name"),
      price: "19,90",
      priceValue: 19.9,
      period: tModal("plans.premium.period"),
      description: tModal("plans.premium.description"),
      icon: <Crown className="w-6 h-6" />,
      color: "text-amber-600",
      bgGradient: "from-amber-500 to-orange-500",
      features: buildFeatures("premium"),
    },
  ];

  return (
    <div className="grid md:grid-cols-4 gap-6 max-w-6xl mx-auto">
      {plans.map((plan) => (
        <div
          key={plan.id}
          className={`relative rounded-2xl border-2 p-6 transition-all hover:shadow-xl ${
            plan.popular
              ? "border-violet-500 shadow-violet-100 shadow-lg scale-[1.02]"
              : "border-gray-200 hover:border-gray-300"
          }`}
        >
          {plan.popular && (
            <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-violet-500 to-purple-600 text-white border-0 px-4">
              {tModal("popular")}
            </Badge>
          )}

          <div className="text-center mb-6">
            <div
              className={`inline-flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-br ${plan.bgGradient} text-white mb-4`}
            >
              {plan.icon}
            </div>
            <h3 className="text-2xl font-bold">{plan.name}</h3>
            <p className="text-muted-foreground mt-2">{plan.description}</p>
          </div>

          <div className="text-center mb-6">
            <div className="flex items-baseline justify-center gap-1">
              {plan.id === "free" ? (
                <span className="text-5xl font-bold">{tModal("free")}</span>
              ) : (
                <>
                  <span className="text-5xl font-bold">{plan.price}</span>
                  <span className="text-xl text-muted-foreground">
                    {plan.period}
                  </span>
                </>
              )}
            </div>
          </div>

          <ul className="space-y-3 mb-8">
            {plan.features
              .filter((f) => f.name)
              .map((feature, index) => (
                <li
                  key={index}
                  className={`flex items-center gap-3 ${
                    feature.highlight ? "font-medium" : ""
                  }`}
                >
                  {feature.included ? (
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center ${
                        feature.highlight
                          ? `bg-gradient-to-br ${plan.bgGradient}`
                          : "bg-green-500"
                      }`}
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
            onClick={() => onSelectPlan?.(plan.id)}
            className={`w-full h-12 text-lg ${
              plan.popular
                ? "bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700"
                : ""
            }`}
            variant={plan.popular ? "default" : "outline"}
            size="lg"
            disabled={plan.id === "free"}
          >
            {plan.id === "free"
              ? tModal("currentPlan")
              : tModal("startWith", { name: plan.name })}
          </Button>
        </div>
      ))}
    </div>
  );
}
