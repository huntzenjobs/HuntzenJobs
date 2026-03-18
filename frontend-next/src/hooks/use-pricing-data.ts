"use client";

import { useCallback } from "react";
import { usePlansConfig, type PlanConfig } from "./use-plans-config";
import { useSubscriptionApi } from "./use-subscription-api";

// Static visual config — icons and colors only, never changes
const PLAN_META: Record<
  string,
  { icon: string; color: string }
> = {
  free: { icon: "Gift", color: "zinc" },
  starter: { icon: "Zap", color: "blue" },
  pro: { icon: "Sparkles", color: "purple" },
  premium: { icon: "Crown", color: "amber" },
};

export interface PricingPlanBase extends PlanConfig {
  icon: string;
  color: string;
  isPopular: boolean;
}

export interface PricingPlanWithCurrent extends PricingPlanBase {
  isCurrentPlan: boolean;
}

function enrichPlan(plan: PlanConfig): PricingPlanBase {
  const meta = PLAN_META[plan.name] ?? { icon: "Gift", color: "zinc" };
  return {
    ...plan,
    features_excluded: plan.features_excluded ?? [],
    icon: meta.icon,
    color: meta.color,
    isPopular: plan.name === "starter",
  };
}

/**
 * usePricingPlans — for landing page and /pricing page (anonymous visitors OK).
 * Does NOT call useSubscriptionApi — safe for unauthenticated users.
 */
export function usePricingPlans() {
  const { plans, isLoading, formatPrice } = usePlansConfig();

  const enrichedPlans: PricingPlanBase[] = plans.map(enrichPlan);

  return { plans: enrichedPlans, isLoading, formatPrice };
}

/**
 * usePricingData — for pricing modal (authenticated users).
 * Includes currentPlan from API. Returns null during loading to prevent BUG 2.
 */
export function usePricingData() {
  const { plans, isLoading: plansLoading, formatPrice } = usePlansConfig();
  const apiData = useSubscriptionApi();

  // GARDE-FOU BUG 2: null during loading → CTA buttons show skeleton
  const currentPlan: string | null = apiData.isLoading
    ? null
    : (apiData.subscription?.plan_name ?? "free");

  const isLoading = plansLoading || apiData.isLoading;

  const enrichedPlans: PricingPlanWithCurrent[] = plans.map((plan) => ({
    ...enrichPlan(plan),
    isCurrentPlan: currentPlan !== null && plan.name === currentPlan,
  }));

  return { plans: enrichedPlans, currentPlan, isLoading, formatPrice };
}
