import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import PlanCardEditor from "@/components/admin/plans/plan-card-editor";
import type { Plan } from "@/hooks/admin/use-admin-plans";

const STARTER_PLAN: Plan = {
  id: "starter-id",
  name: "starter",
  display_name: "Starter",
  description: "Plan de test",
  price_monthly: 8.9,
  price_yearly: 85,
  limits: {
    ats_scores_per_day: 10,
    assistant_messages_per_day: 20,
    job_searches_per_day: 10,
    cv_adapt_per_day: 30,
    cover_letter_per_day: 30,
    saved_jobs_per_day: 30,
    jobs_visible: -1,
    job_views: -1,
    recruiter_searches_per_day: 20,
  },
  features: [],
  features_excluded: [],
  feature_flags: {},
  is_active: true,
  sort_order: 1,
  stripe_prices: [],
};

describe("PlanCardEditor", () => {
  it("édite et envoie uniquement les clés de quota réellement appliquées", async () => {
    const onUpdateLimits = vi.fn().mockResolvedValue(true);
    const { container } = render(
      <PlanCardEditor
        plan={STARTER_PLAN}
        onUpdateLimits={onUpdateLimits}
        onUpdateFeatures={vi.fn().mockResolvedValue(true)}
        onUpdatePrice={vi.fn().mockResolvedValue(true)}
        onUpdateStripePrice={vi.fn().mockResolvedValue({})}
        onUpdateWording={vi.fn().mockResolvedValue(true)}
        onTranslatePlan={vi.fn().mockResolvedValue(true)}
      />,
    );

    const numericInputs = container.querySelectorAll<HTMLInputElement>(
      'input[type="number"]',
    );
    expect(Array.from(numericInputs).slice(0, 9).map((input) => input.value)).toEqual([
      "10",
      "20",
      "10",
      "30",
      "30",
      "30",
      "-1",
      "-1",
      "20",
    ]);

    fireEvent.change(numericInputs[3], { target: { value: "31" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Sauvegarder" })[0]);

    await waitFor(() => {
      expect(onUpdateLimits).toHaveBeenCalledWith("starter-id", {
        ats_scores_per_day: 10,
        assistant_messages_per_day: 20,
        job_searches_per_day: 10,
        cv_adapt_per_day: 31,
        cover_letter_per_day: 30,
        saved_jobs_per_day: 30,
        jobs_visible: -1,
        job_views: -1,
        recruiter_searches_per_day: 20,
      });
    });
  });
});
