"use client";

import { useEffect, useState } from "react";
import { useAdminPlans, type Plan } from "@/hooks/admin/use-admin-plans";
import PlanCardEditor from "@/components/admin/plans/plan-card-editor";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminPlansPage() {
  const {
    fetchPlans,
    updateLimits,
    updateFeatures,
    updateDisplayPrice,
    updateWording,
    updateStripePrice,
    translatePlan,
    generateWording,
    loading,
  } = useAdminPlans();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    fetchPlans()
      .then(setPlans)
      .finally(() => setFetching(false));
  }, [fetchPlans]);

  const refresh = () => fetchPlans().then(setPlans);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Éditeur de packages
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Modifiez les limites, fonctionnalités et prix de chaque plan. Les
          changements sont immédiats.
        </p>
      </div>

      {fetching ? (
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {plans.map((plan) => (
            <PlanCardEditor
              key={`${plan.id}-${plan.updated_at ?? ""}`}
              plan={plan}
              onUpdateLimits={async (id, limits) => {
                const ok = await updateLimits(id, limits);
                if (ok) refresh();
                return ok;
              }}
              onUpdateFeatures={async (id, payload) => {
                const ok = await updateFeatures(id, payload);
                if (ok) refresh();
                return ok;
              }}
              onUpdatePrice={async (id, prices) => {
                const ok = await updateDisplayPrice(id, prices);
                if (ok) refresh();
                return ok;
              }}
              onUpdateStripePrice={async (id, period, amount, currency) => {
                const result = await updateStripePrice(
                  id,
                  period,
                  amount,
                  currency,
                );
                if (result) refresh();
                return result;
              }}
              onUpdateWording={async (id, wording) => {
                const ok = await updateWording(id, wording);
                if (ok) refresh();
                return ok;
              }}
              onTranslatePlan={async (id) => {
                const ok = await translatePlan(id);
                if (ok) refresh();
                return ok;
              }}
              onGenerateWording={generateWording}
            />
          ))}
        </div>
      )}
    </div>
  );
}
