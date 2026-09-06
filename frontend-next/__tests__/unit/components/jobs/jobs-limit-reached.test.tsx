import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { JobsLimitReached } from "@/components/jobs/gradient-job-card";

const { openPricingModal } = vi.hoisted(() => ({ openPricingModal: vi.fn() }));
vi.mock("@/contexts/subscription-context", () => ({
  useSubscription: () => ({ openPricingModal }),
}));

it("ne propose pas de débloquer des offres quand toutes sont visibles", () => {
  render(<JobsLimitReached totalJobs={8} visibleJobs={10} />);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("ouvre le choix de plan sans lancer de paiement", () => {
  render(<JobsLimitReached totalJobs={30} visibleJobs={10} />);
  fireEvent.click(screen.getByRole("button"));
  expect(openPricingModal).toHaveBeenCalledWith("jobs_visible");
});
