import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CVUploadAsyncWizard } from "@/components/cv/cv-upload-async-wizard";

const { router, query } = vi.hoisted(() => ({
  router: { replace: vi.fn() },
  query: { step: "3" },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams({ step: query.step }),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ session: { access_token: "synthetic" }, user: { id: "synthetic" }, loading: false }),
}));
vi.mock("@/hooks/use-documents", () => ({ useDocuments: () => ({ saveDocument: vi.fn() }) }));
vi.mock("@/hooks/use-cv-analysis", () => ({
  useCVAnalysis: () => ({ status: "pending", isUploading: false, isPolling: false, progress: 0 }),
}));
afterEach(cleanup);

it.each(["2", "3"])("rend le dépôt accessible après rechargement de l'étape %s sans CV en mémoire", (step) => {
  query.step = step;
  const { container } = render(<CVUploadAsyncWizard
    canUse={() => true} incrementUsage={vi.fn()} refreshQuotas={vi.fn()}
    openPricingModal={vi.fn()} hasFeatures={{ hasCVHistory: false, hasPDFExport: false }}
  />);
  expect(container.querySelector('input[type="file"]')).not.toBeNull();
  expect(container.textContent).not.toContain("Analyse en cours");
});
