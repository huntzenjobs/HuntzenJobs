"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { LandingHeader } from "@/components/landing-header";
import {
  Check,
  X,
  Sparkles,
  Zap,
  Crown,
  ArrowLeft,
  Rocket,
  Star,
  TrendingUp,
  Users,
  Shield,
  Gift,
  User,
  ChevronDown,
  Search,
  FileText,
  MessageSquare,
  Calendar,
  Target,
  Briefcase,
  Award,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOptionalAuth } from "@/contexts/auth-context";
import { useOptionalSubscription } from "@/contexts/subscription-context";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useConversionPopup } from "@/components/freemium/conversion-popups";
import { usePricingPlans } from "@/hooks/use-pricing-data";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

// Icon mapping — décoratives, statiques
const PLAN_ICONS: Record<string, React.ElementType> = {
  Gift,
  Zap,
  Sparkles,
  Crown,
};
const PLAN_COLORS: Record<string, string> = {
  zinc: "#9CA3AF",
  blue: "#00D9FF",
  purple: "#9333EA",
  amber: "#F97316",
};

const testimonials = [
  {
    name: "Marie L.",
    role: "Chef de projet",
    content:
      "J'ai trouvé mon poste actuel en 3 semaines. L'analyse CV et les simulations d'entretien m'ont vraiment aidée.",
    rating: 5,
    plan: "Pro",
  },
  {
    name: "Thomas D.",
    role: "Développeur Full Stack",
    content:
      "Le coaching personnel est exceptionnel. Il m'a aidé à optimiser mon CV et mes candidatures. Le plan Premium vaut le coup !",
    rating: 5,
    plan: "Premium",
  },
  {
    name: "Sophie M.",
    role: "Responsable Marketing",
    content:
      "Les alertes instantanées m'ont permis de postuler en premier sur des offres qui correspondaient à mon profil.",
    rating: 5,
    plan: "Premium",
  },
];

const faqs = [
  {
    question: "Puis-je changer de plan à tout moment ?",
    answer:
      "Absolument ! Vous pouvez upgrader ou downgrader votre abonnement à tout moment depuis votre tableau de bord. Le changement prend effet immédiatement.",
  },
  {
    question: "Y a-t-il un engagement de durée ?",
    answer:
      "Non, aucun engagement ! Tous nos abonnements sont mensuels et sans engagement. Vous êtes libre d'annuler à tout moment.",
  },
  {
    question: "Quelle est votre politique de remboursement ?",
    answer:
      "Nous offrons une garantie satisfait ou remboursé de 14 jours sur tous nos plans. Si vous n'êtes pas satisfait, contactez notre support et nous vous rembourserons.",
  },
  {
    question: "Les prix incluent-ils la TVA ?",
    answer:
      "Oui, tous les prix affichés sont TTC (Toutes Taxes Comprises). Aucun frais supplémentaire ne sera ajouté lors du paiement.",
  },
  {
    question: "Quels moyens de paiement acceptez-vous ?",
    answer:
      "Nous acceptons toutes les cartes bancaires principales (Visa, Mastercard, American Express) via notre partenaire sécurisé Stripe.",
  },
  {
    question: "Puis-je essayer avant de m'engager ?",
    answer:
      "Oui ! Notre plan gratuit vous permet de découvrir HuntZen sans carte bancaire. Aucune carte requise pour commencer.",
  },
];

export default function PricingPage() {
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">(
    "monthly",
  );
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const auth = useOptionalAuth();
  const user = auth?.user;
  const subscription = useOptionalSubscription();
  const tPricing = useTranslations("pricing");
  const router = useRouter();
  const {
    plans: dbPlans,
    isLoading: plansLoading,
    formatPrice,
  } = usePricingPlans();

  const pricingHoverPopup = useConversionPopup("pricing_hover");

  const plans = dbPlans.map((p) => ({
    id: p.name,
    name: p.display_name,
    priceMonthly: formatPrice(p.price_monthly),
    priceYearly: formatPrice(p.price_yearly ?? 0),
    priceMonthlyRaw: p.price_monthly,
    priceYearlyRaw: p.price_yearly ?? 0,
    tagline: p.description,
    description: p.description,
    icon: PLAN_ICONS[p.icon] ?? Gift,
    color: PLAN_COLORS[p.color] ?? "#9CA3AF",
    popular: p.isPopular,
    features: [
      ...p.features.map((name) => ({ icon: Check, name, excluded: false })),
      ...(p.features_excluded ?? []).map((name) => ({
        icon: X,
        name,
        excluded: true,
      })),
    ],
  }));

  // Show pricing_hover popup after 20s (once per session)
  useEffect(() => {
    if (
      typeof sessionStorage !== "undefined" &&
      sessionStorage.getItem("pricing_popup_shown")
    )
      return;
    const t = setTimeout(() => {
      sessionStorage.setItem("pricing_popup_shown", "1");
      pricingHoverPopup.open();
    }, 20000);
    return () => clearTimeout(t);
  }, []);

  const currentPlan = subscription?.plan || "free";

  const getPrice = (plan: (typeof plans)[0]) => {
    return billingPeriod === "monthly" ? plan.priceMonthly : plan.priceYearly;
  };

  const getMonthlyEquivalent = (yearlyRaw: number) => {
    if (!yearlyRaw) return "0,00";
    return (yearlyRaw / 12).toFixed(2).replace(".", ",");
  };

  const getSavings = (monthlyRaw: number, yearlyRaw: number) => {
    const monthlyCost = monthlyRaw * 12;
    const yearlyCost = yearlyRaw;
    const savings = monthlyCost - yearlyCost;
    const percentage =
      monthlyCost > 0 ? Math.round((savings / monthlyCost) * 100) : 0;
    return { amount: savings.toFixed(2).replace(".", ","), percentage };
  };

  const handleSelectPlan = async (planId: string) => {
    if (planId === "free" || planId === currentPlan) {
      toast.info(tPricing("toasts.alreadyOnPlan"));
      return;
    }

    if (!user || !auth?.session) {
      toast.error(tPricing("toasts.mustBeLoggedIn"));
      window.location.href = "/login?redirectTo=/pricing";
      return;
    }

    try {
      toast.loading(tPricing("toasts.redirecting"), {
        id: "stripe-redirect",
      });

      // BUG 3 FIX: Refresh session avant Stripe pour garantir token valide
      const supabase = createClient();
      const {
        data: { session: refreshedSession },
        error: refreshErr,
      } = await supabase.auth.refreshSession();
      if (refreshErr || !refreshedSession) {
        toast.dismiss("stripe-redirect");
        toast.error(tPricing("toasts.sessionExpired"));
        router.push("/login?redirectTo=/pricing");
        return;
      }
      const accessToken = refreshedSession.access_token;

      const apiUrl =
        process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_API_URL;
      if (!apiUrl) throw new Error("Backend URL not configured");

      const response = await fetch(
        `${apiUrl}/api/stripe/create-checkout-session`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Bearer ${accessToken}`,
          },
          body: new URLSearchParams({
            plan_name: planId,
            billing_period: billingPeriod,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Failed to create checkout session");
      }

      toast.dismiss("stripe-redirect");

      if (data.modified) {
        if (data.immediate) {
          toast.success(tPricing("toasts.upgraded"));
        } else {
          toast.success(tPricing("toasts.scheduledChange"));
        }
        window.location.href = `/payment/success?session_id=mod_${Date.now()}&type=modification`;
      } else {
        if (!data.checkout_url) {
          throw new Error("Checkout URL manquante");
        }
        window.location.href = data.checkout_url;
      }
    } catch (error: unknown) {
      toast.dismiss("stripe-redirect");
      const message =
        error instanceof Error
          ? error.message
          : "Erreur lors de la création de la session de paiement";
      toast.error(message);
    }
  };

  return (
    <>
      <div className="min-h-screen bg-white dark:bg-gray-900">
        <LandingHeader />

        {/* Hero Section */}
        <section className="relative min-h-[50vh] flex items-center justify-center overflow-hidden bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 pt-20 pb-16">
          {/* Background effects */}
          <div className="absolute inset-0">
            <div
              className="absolute inset-0 opacity-20"
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%2300D9FF' fill-opacity='0.15'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
                backgroundSize: "60px 60px",
              }}
            />
          </div>

          <motion.div
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.1, 0.15, 0.1],
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="absolute top-1/4 left-1/4 w-64 sm:w-96 h-64 sm:h-96 bg-[#00D9FF]/10 rounded-full blur-3xl"
          />

          <div className="container mx-auto px-4 sm:px-6 relative z-10 text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#00D9FF]/10 border border-[#00D9FF]/20 mb-6"
            >
              <Star className="w-4 h-4 text-[#00D9FF]" />
              <span className="text-sm font-medium text-white">
                +100 000 candidats accompagnés
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-4xl sm:text-5xl md:text-6xl font-black text-white mb-6"
            >
              Choisissez votre plan
              <br />
              <span className="text-[#00D9FF]">et décrochez votre job</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-lg sm:text-xl text-white/80 max-w-2xl mx-auto mb-8"
            >
              Des outils puissants pour optimiser votre recherche, préparer vos
              entretiens et trouver l&apos;emploi qui vous correspond
            </motion.p>

            {/* Trust indicators */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="flex items-center justify-center gap-6 sm:gap-8 flex-wrap text-sm text-white/70"
            >
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-green-400" />
                <span>{tPricing("secure")}</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-5 h-5 text-[#00D9FF]" />
                <span>{tPricing("noCommitment")}</span>
              </div>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-purple-400" />
                <span>{tPricing("responseRate")}</span>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Billing Toggle */}
        <section className="py-8 bg-white dark:bg-gray-900">
          <div className="container mx-auto px-4 sm:px-6">
            <div className="flex items-center justify-center gap-4 flex-wrap">
              <span
                className={`text-base sm:text-lg font-semibold transition-colors ${billingPeriod === "monthly" ? "text-gray-900 dark:text-gray-100" : "text-gray-400 dark:text-gray-500"}`}
              >
                {tPricing("monthly")}
              </span>
              <button
                onClick={() =>
                  setBillingPeriod(
                    billingPeriod === "monthly" ? "yearly" : "monthly",
                  )
                }
                className="relative w-16 h-8 bg-gray-200 rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-[#00D9FF] focus:ring-offset-2"
                style={{
                  backgroundColor:
                    billingPeriod === "yearly" ? "#00D9FF" : "#e5e7eb",
                }}
                aria-label={tPricing("toggleBillingLabel")}
              >
                <span
                  className="absolute top-1 left-1 w-6 h-6 bg-white rounded-full shadow-md transition-transform duration-300"
                  style={{
                    transform:
                      billingPeriod === "yearly"
                        ? "translateX(32px)"
                        : "translateX(0)",
                  }}
                />
              </button>
              <span
                className={`text-base sm:text-lg font-semibold transition-colors ${billingPeriod === "yearly" ? "text-gray-900 dark:text-gray-100" : "text-gray-400 dark:text-gray-500"}`}
              >
                Annuel
              </span>
              {billingPeriod === "yearly" && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="px-3 py-1 bg-green-100 text-green-700 text-sm font-bold rounded-full"
                >
                  {"🎉 "}
                  {tPricing("saveBadge")}
                </motion.span>
              )}
            </div>
          </div>
        </section>

        {/* Pricing Cards */}
        <section className="py-12 sm:py-16 bg-white dark:bg-gray-900">
          <div className="container mx-auto px-4 sm:px-6">
            {plansLoading && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8 max-w-7xl mx-auto">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-96 bg-gray-100 dark:bg-gray-700 rounded-3xl animate-pulse"
                  />
                ))}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8 max-w-7xl mx-auto">
              {plans.map((plan, index) => (
                <motion.div
                  key={plan.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className={`relative rounded-3xl border-2 p-6 sm:p-8 bg-white dark:bg-gray-800 transition-all hover:shadow-2xl flex flex-col h-full ${
                    plan.popular
                      ? "border-[#00D9FF] shadow-2xl lg:scale-105"
                      : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                  }`}
                >
                  {/* Popular badge */}
                  {plan.popular && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
                      <span className="inline-flex items-center gap-2 px-4 sm:px-6 py-2 rounded-full bg-[#00D9FF] text-white text-xs sm:text-sm font-bold shadow-lg">
                        <Sparkles className="w-4 h-4" />
                        {plan.tagline}
                      </span>
                    </div>
                  )}

                  {/* Plan header */}
                  <div className="text-center mb-6">
                    <div
                      className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-2xl mb-4 shadow-lg"
                      style={{
                        backgroundColor: `${plan.color}15`,
                      }}
                    >
                      <plan.icon
                        className="w-7 h-7 sm:w-8 sm:h-8"
                        style={{ color: plan.color }}
                      />
                    </div>
                    <h3 className="text-2xl sm:text-3xl font-black mb-2 text-gray-900 dark:text-white">
                      {plan.name}
                    </h3>
                    {!plan.popular && (
                      <p className="text-xs sm:text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                        {plan.tagline}
                      </p>
                    )}
                  </div>

                  {/* Price */}
                  <div className="text-center mb-6 py-4 rounded-2xl bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-800">
                    {plan.id !== "free" && billingPeriod === "yearly" && (
                      <div className="mb-2">
                        <span className="inline-block px-3 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full">
                          -
                          {
                            getSavings(
                              plan.priceMonthlyRaw,
                              plan.priceYearlyRaw,
                            ).percentage
                          }
                          % soit{" "}
                          {
                            getSavings(
                              plan.priceMonthlyRaw,
                              plan.priceYearlyRaw,
                            ).amount
                          }
                          €/an
                        </span>
                      </div>
                    )}
                    <div className="flex items-baseline justify-center gap-1">
                      {plan.id === "free" ? (
                        <span className="text-4xl sm:text-5xl font-black text-gray-900 dark:text-white">
                          Gratuit
                        </span>
                      ) : (
                        <>
                          <span className="text-4xl sm:text-5xl font-black text-gray-900 dark:text-white">
                            {billingPeriod === "monthly"
                              ? plan.priceMonthly
                              : getMonthlyEquivalent(plan.priceYearlyRaw)}
                            €
                          </span>
                          <span className="text-lg text-gray-600 dark:text-gray-300 font-semibold">
                            /mois
                          </span>
                        </>
                      )}
                    </div>
                    {plan.id !== "free" && billingPeriod === "yearly" && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {plan.priceYearly}€ facturé annuellement
                      </p>
                    )}
                    {plan.id !== "free" && billingPeriod === "monthly" && (
                      <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 font-medium">
                        {tPricing("noCommitment")}
                      </p>
                    )}
                  </div>

                  {/* Description */}
                  <p className="text-sm text-gray-600 dark:text-gray-300 text-center mb-6 leading-relaxed">
                    {plan.description}
                  </p>

                  {/* Features */}
                  <ul className="space-y-3 mb-6 flex-grow">
                    {plan.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-3">
                        <div
                          className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{
                            backgroundColor: `${plan.color}15`,
                          }}
                        >
                          <feature.icon
                            className="w-4 h-4"
                            style={{ color: plan.color }}
                          />
                        </div>
                        <span className="text-sm text-gray-700 dark:text-gray-200 font-medium leading-relaxed pt-1">
                          {feature.name}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  <Button
                    onClick={() => handleSelectPlan(plan.id)}
                    className={`w-full h-12 sm:h-14 text-sm sm:text-base font-bold rounded-xl shadow-lg transition-all mt-auto ${
                      plan.popular
                        ? "bg-[#00D9FF] hover:bg-[#00C4EA] text-white hover:scale-[1.02]"
                        : "border-2 hover:scale-[1.02]"
                    }`}
                    style={{
                      backgroundColor: plan.popular ? "#00D9FF" : "white",
                      borderColor: plan.popular ? "#00D9FF" : plan.color,
                      color: plan.popular ? "white" : plan.color,
                    }}
                    disabled={plan.id === currentPlan}
                  >
                    {plan.id === currentPlan
                      ? tPricing("currentPlan")
                      : tPricing("choosePlan", { name: plan.name })}
                  </Button>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Testimonials */}
        <section className="py-16 bg-gray-50 dark:bg-gray-800">
          <div className="container mx-auto px-4 sm:px-6">
            <div className="text-center mb-12">
              <motion.h2
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="text-3xl sm:text-4xl font-bold mb-4 text-gray-900 dark:text-white"
              >
                {tPricing("testimonialsTitle")}
              </motion.h2>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 }}
                className="text-base sm:text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto"
              >
                {tPricing("testimonialsSubtitle")}
              </motion.p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 max-w-6xl mx-auto">
              {testimonials.map((testimonial, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="bg-white dark:bg-gray-700 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-shadow"
                >
                  <div className="flex gap-1 mb-4">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <Star
                        key={i}
                        className="w-5 h-5 text-yellow-400 fill-yellow-400"
                      />
                    ))}
                  </div>
                  <p className="text-gray-700 dark:text-gray-200 mb-4 leading-relaxed">
                    &ldquo;{testimonial.content}&rdquo;
                  </p>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-gray-900 dark:text-white">
                        {testimonial.name}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        {testimonial.role}
                      </p>
                    </div>
                    <span className="px-3 py-1 bg-[#00D9FF]/10 text-[#00D9FF] text-xs font-bold rounded-full">
                      {testimonial.plan}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-16 sm:py-20 bg-white dark:bg-gray-900">
          <div className="container mx-auto px-4 sm:px-6">
            <div className="text-center mb-12">
              <motion.h2
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="text-3xl sm:text-4xl font-bold mb-4 text-gray-900 dark:text-white"
              >
                {tPricing("faqTitle")}
              </motion.h2>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 }}
                className="text-base sm:text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto"
              >
                {tPricing("faqSubtitle")}
              </motion.p>
            </div>

            <div className="max-w-3xl mx-auto space-y-4">
              {faqs.map((faq, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.05 }}
                  className="bg-gray-50 dark:bg-gray-800 rounded-2xl overflow-hidden hover:shadow-lg transition-shadow"
                >
                  <button
                    onClick={() =>
                      setExpandedFaq(expandedFaq === index ? null : index)
                    }
                    className="w-full px-6 py-5 flex items-center justify-between text-left"
                  >
                    <h3 className="font-bold text-base sm:text-lg text-gray-900 dark:text-white pr-4">
                      {faq.question}
                    </h3>
                    <ChevronDown
                      className={`w-5 h-5 text-gray-600 dark:text-gray-400 flex-shrink-0 transition-transform ${
                        expandedFaq === index ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  {expandedFaq === index && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="px-6 pb-5"
                    >
                      <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                        {faq.answer}
                      </p>
                    </motion.div>
                  )}
                </motion.div>
              ))}
            </div>

            <div className="text-center mt-12">
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                {tPricing("faqMore")}
              </p>
              <Button
                variant="outline"
                size="lg"
                className="rounded-xl border-2 hover:bg-gray-50 dark:hover:bg-gray-800 dark:border-gray-700 dark:text-gray-200"
              >
                {tPricing("faqContact")}
              </Button>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="relative py-20 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 overflow-hidden">
          {/* Background effects */}
          <div className="absolute inset-0 opacity-20">
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%2300D9FF' fill-opacity='0.15'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
                backgroundSize: "60px 60px",
              }}
            />
          </div>

          <motion.div
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.1, 0.15, 0.1],
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="absolute top-1/4 right-1/4 w-96 h-96 bg-[#00D9FF]/10 rounded-full blur-3xl"
          />

          <div className="container mx-auto px-4 sm:px-6 text-center relative z-10">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-3xl sm:text-4xl md:text-5xl font-black text-white mb-6"
            >
              {tPricing("ctaTitle")}
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-lg sm:text-xl text-white/80 max-w-3xl mx-auto mb-10 leading-relaxed"
            >
              {tPricing("ctaSubtitle")}
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-4"
            >
              <Link href="/signup">
                <Button
                  size="lg"
                  className="bg-[#00D9FF] hover:bg-[#00C4EA] text-white h-12 sm:h-14 px-8 sm:px-10 text-base sm:text-lg font-bold rounded-xl shadow-2xl hover:scale-105 transition-transform w-full sm:w-auto"
                >
                  <Rocket className="w-5 h-5 mr-2" />
                  {tPricing("ctaButton")}
                </Button>
              </Link>
              <Link href="/">
                <Button
                  size="lg"
                  variant="outline"
                  className="border-2 border-white text-white hover:bg-white/10 h-12 sm:h-14 px-8 sm:px-10 text-base sm:text-lg font-semibold rounded-xl backdrop-blur-sm w-full sm:w-auto"
                >
                  En savoir plus
                </Button>
              </Link>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
              className="mt-10 flex items-center justify-center gap-6 sm:gap-8 text-white/70 text-sm flex-wrap"
            >
              <div className="flex items-center gap-2">
                <Check className="w-5 h-5 text-[#00D9FF]" />
                <span>{tPricing("noCommitment")}</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-5 h-5 text-[#00D9FF]" />
                <span>{tPricing("frenchSupport")}</span>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Footer */}
        <footer className="bg-black text-white py-10 sm:py-12">
          <div className="container mx-auto px-4 sm:px-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-8">
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg sm:text-xl">HuntZen</span>
                <span className="w-2 h-2 rounded-full bg-[#00D9FF] animate-pulse"></span>
              </div>
              <p className="text-white/60 text-xs sm:text-sm text-center md:text-right max-w-md">
                Votre allié carrière pour transformer votre recherche
                d&apos;emploi en succès.
              </p>
            </div>
            <hr className="border-white/10 mb-8" />
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-white/50 text-xs sm:text-sm">
              <p>
                &copy; {new Date().getFullYear()} HuntZen. Tous droits réservés.
              </p>
              <div className="flex items-center gap-4 sm:gap-6">
                <Link
                  href="/privacy"
                  className="hover:text-[#00D9FF] transition-colors"
                >
                  Politique de confidentialité
                </Link>
                <Link
                  href="/terms"
                  className="hover:text-[#00D9FF] transition-colors"
                >
                  Conditions générales
                </Link>
                <Link
                  href="mailto:contact@huntzenjobs.co"
                  className="hover:text-[#00D9FF] transition-colors"
                >
                  Contact
                </Link>
              </div>
            </div>
          </div>
        </footer>

        <style jsx global>{`
          body {
            font-family:
              var(--font-dm-sans),
              -apple-system,
              BlinkMacSystemFont,
              "Segoe UI",
              sans-serif;
          }
        `}</style>
      </div>
      <pricingHoverPopup.PopupComponent />
    </>
  );
}
