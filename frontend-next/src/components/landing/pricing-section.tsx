"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Check, AlertCircle } from "lucide-react";
import { usePricingPlans } from "@/hooks/use-pricing-data";

const PLAN_COLORS: Record<string, string> = {
  zinc: "#9CA3AF",
  blue: "#00D9FF",
  purple: "#9333EA",
  amber: "#F97316",
};

export function LandingPricingSection() {
  const { plans, isLoading } = usePricingPlans();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 max-w-7xl mx-auto">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-96 bg-slate-100 rounded-2xl animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 max-w-7xl mx-auto">
      {plans.map((plan, index) => {
        const color = PLAN_COLORS[plan.color] ?? "#9CA3AF";
        return (
          <motion.div
            key={plan.name}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: index * 0.1 }}
            className={`relative rounded-2xl border-2 p-6 bg-white flex flex-col h-full ${
              plan.isPopular
                ? "border-[#00D9FF] shadow-lg shadow-[#00D9FF]/10"
                : "border-slate-200"
            } hover:shadow-lg transition-all`}
          >
            {plan.isPopular && (
              <div
                className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 text-white text-xs font-bold rounded-full"
                style={{ backgroundColor: color }}
              >
                Le plus populaire
              </div>
            )}

            <div className="text-center mb-6">
              <div className="text-slate-600 font-bold text-xs mb-2">
                {plan.display_name}
              </div>
              <div className="flex items-baseline justify-center gap-1">
                {plan.name === "free" ? (
                  <span
                    className="text-4xl sm:text-5xl font-black"
                    style={{ color }}
                  >
                    Gratuit
                  </span>
                ) : (
                  <>
                    <span
                      className="text-4xl sm:text-5xl font-black"
                      style={{ color }}
                    >
                      {plan.price_monthly.toFixed(2).replace(".", ",")}€
                    </span>
                    <span className="text-slate-400 text-xs">/mois</span>
                  </>
                )}
              </div>
              {plan.description && (
                <p className="text-xs text-slate-500 mt-2">
                  {plan.description}
                </p>
              )}
            </div>

            <ul className="space-y-2.5 sm:space-y-3 mb-6 flex-grow">
              {plan.features.map((feature, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2 text-xs sm:text-sm"
                >
                  <Check
                    className="w-4 h-4 flex-shrink-0 mt-0.5"
                    style={{ color }}
                  />
                  <span
                    className={`text-slate-700 ${idx === 0 ? "font-semibold" : ""}`}
                  >
                    {feature}
                  </span>
                </li>
              ))}
              {(plan.features_excluded ?? []).map((feature, idx) => (
                <li
                  key={`x-${idx}`}
                  className="flex items-start gap-2 text-xs sm:text-sm text-slate-400"
                >
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <Link
              href="/signup"
              className="block w-full text-center px-4 py-2.5 sm:py-3 rounded-xl font-semibold text-white text-xs sm:text-sm transition-all hover:shadow-lg mt-auto"
              style={{ backgroundColor: color }}
            >
              {plan.name === "free"
                ? "Commencer gratuitement"
                : `Choisir ${plan.display_name}`}
            </Link>
          </motion.div>
        );
      })}
    </div>
  );
}
