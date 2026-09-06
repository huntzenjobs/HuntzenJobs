import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { JobDetailsModal } from "@/components/jobs/job-details-modal";
import type { Job } from "@/lib/api/huntzen-client";

const { authenticatedFetch, openPricingModal } = vi.hoisted(() => ({
  authenticatedFetch: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) }),
  openPricingModal: vi.fn(),
}));
vi.mock("@/hooks/use-authenticated-fetch", () => ({ useAuthenticatedFetch: () => ({ authenticatedFetch }) }));
vi.mock("@/contexts/subscription-context", () => ({ useSubscription: () => ({ canUse: () => true, openPricingModal }) }));
vi.mock("@/contexts/auth-context", () => ({ useAuth: () => ({ session: null }) }));
vi.mock("@/hooks/use-full-job-description", () => ({ useFullJobDescription: () => ({ description: null, finalUrl: null, loading: false }) }));
vi.mock("@/hooks/use-career-score", () => ({ sendXpEvent: vi.fn() }));
vi.mock("@/components/jobs/apply-modal", () => ({ ApplyModal: () => null }));
vi.mock("@/components/jobs/contact-finder-drawer", () => ({ ContactFinderDrawer: () => null }));

const job: Job = {
  id: "test-job", title: "Infirmier", company: "Clinique test", location: "Paris",
  description: "Description de test", url: "https://example.com/offre", source: "test",
};

it("expose l'offre externe comme un vrai lien accessible au clavier", () => {
  render(<JobDetailsModal job={job} open onOpenChange={vi.fn()} />);
  expect(screen.getByRole("link", { name: "viewOffer" })).toHaveAttribute("href", job.url);
});
