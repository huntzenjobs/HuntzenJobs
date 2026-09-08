import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CVUploadAsyncWizard } from "@/components/cv/cv-upload-async-wizard";
import { ApplyModal } from "@/components/jobs/apply-modal";
import type { Job } from "@/lib/api/huntzen-client";

const confirmedText = "Camille Martin\n" + "expérience source corrigée ".repeat(6);
const confirmedReference = {
  personal_info: { name: "Camille Martin" },
  experiences: [],
  education: [],
  certifications: [],
  projects: [],
  skills: {},
  interests: [],
};
const router = { replace: vi.fn(), push: vi.fn() };

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/components/cv/cv-source-review", () => ({
  CVSourceReview: ({ onConfirm, onCancel }: {
    onConfirm: (text: string, reference: typeof confirmedReference) => void;
    onCancel: () => void;
  }) => (
    <div data-testid="source-review-mounted">
      <span data-testid="review-text">{confirmedText}</span>
      <button onClick={() => onConfirm(confirmedText, confirmedReference)}>confirm-source</button>
      <button onClick={onCancel}>cancel-source</button>
    </div>
  ),
}));
vi.mock("@/components/cv-builder/cv-builder-wizard", () => ({
  CvBuilderWizard: () => null,
}));
vi.mock("@/components/coach/queue-waiting-indicator", () => ({
  QueueWaitingIndicator: () => null,
}));
vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({
    session: { access_token: "synthetic-token" },
    user: { id: "user-1" },
    loading: false,
  }),
}));
vi.mock("@/contexts/subscription-context", () => ({
  useSubscription: () => ({
    canUse: () => true,
    openPricingModal: vi.fn(),
    refreshQuotas: vi.fn(),
    reconcileSubscription: vi.fn(),
    incrementUsage: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-cv-profiles", () => ({
  useCvProfiles: () => ({
    profiles: [],
    loading: false,
    fetchProfiles: vi.fn(),
    saveProfile: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-documents", () => ({
  useDocuments: () => ({ saveDocument: vi.fn() }),
}));
vi.mock("@/hooks/use-authenticated-fetch", () => ({
  useAuthenticatedFetch: () => ({ authenticatedFetch: vi.fn() }),
}));
vi.mock("@/hooks/use-cv-analysis", () => ({
  useCVAnalysis: () => ({
    uploadCV: vi.fn(),
    uploadCVText: vi.fn(),
    status: "idle",
    result: null,
    error: null,
    isUploading: false,
    isPolling: false,
    progress: 0,
    estimatedTimeRemaining: 0,
    elapsedTime: 0,
    reset: vi.fn(),
  }),
}));

const job = {
  id: "job-123",
  title: "Développeuse Python",
  company: "HuntZen Test",
  location: "Paris",
  description: "Description suffisamment longue du poste de développeuse Python.",
  url: "https://example.test/job",
  source: "test",
} as Job;

function pendingResponse(): Promise<Response> {
  return new Promise(() => undefined);
}

describe("vérification de source dans les parcours d’adaptation", () => {
  beforeEach(() => {
    router.replace.mockReset();
    vi.stubGlobal("fetch", vi.fn(pendingResponse));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ApplyModal attend la confirmation puis envoie uniquement le texte confirmé à /adapt", async () => {
    const user = userEvent.setup();
    render(
      <ApplyModal
        open
        onOpenChange={vi.fn()}
        job={job}
        jobDescription={job.description}
      />,
    );
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["pdf"], "cv.pdf", { type: "application/pdf" })] },
    });

    await user.click(screen.getByRole("button", { name: "generateButton" }));
    expect(screen.getByTestId("source-review-mounted")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "confirm-source" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain("/api/cv-adapter/adapt");
    expect(String(url)).not.toContain("/adapt/upload");
    const body = options?.body as FormData;
    expect(body.get("cv_text")).toBe(confirmedText);
    expect(body.get("file")).toBeNull();
    expect(body.get("confirmed_factual_reference")).toBe(
      JSON.stringify(confirmedReference),
    );
  });

  it("le wizard adapt attend la confirmation puis envoie le texte confirmé à /adapt", async () => {
    const user = userEvent.setup();
    render(
      <CVUploadAsyncWizard
        canUse={() => true}
        incrementUsage={vi.fn()}
        refreshQuotas={vi.fn()}
        openPricingModal={vi.fn()}
        hasFeatures={{ hasCVHistory: false, hasPDFExport: false }}
      />,
    );
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["pdf"], "cv.pdf", { type: "application/pdf" })] },
    });
    await user.click(screen.getByRole("button", { name: /Suivant/ }));
    await user.click(await screen.findByRole("button", { name: /Adapter mon CV/ }));
    await user.type(
      screen.getByPlaceholderText("placeholders.pasteJobDescriptionHere"),
      "Une description de poste suffisamment longue",
    );
    await user.click(screen.getByRole("button", { name: /Analyser/ }));

    expect(screen.getByTestId("source-review-mounted")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "confirm-source" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain("/api/cv-adapter/adapt");
    expect(String(url)).not.toContain("/adapt/upload");
    const body = options?.body as FormData;
    expect(body.get("cv_text")).toBe(confirmedText);
    expect(body.get("file")).toBeNull();
    expect(body.get("confirmed_factual_reference")).toBe(
      JSON.stringify(confirmedReference),
    );
  });

  it("le wizard conserve la revue si un quota devient indisponible avant confirmation", async () => {
    const user = userEvent.setup();
    let quotaAvailable = true;
    const openPricingModal = vi.fn();
    render(
      <CVUploadAsyncWizard
        canUse={() => quotaAvailable}
        incrementUsage={vi.fn()}
        refreshQuotas={vi.fn()}
        openPricingModal={openPricingModal}
        hasFeatures={{ hasCVHistory: false, hasPDFExport: false }}
      />,
    );
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["pdf"], "cv.pdf", { type: "application/pdf" })] },
    });
    await user.click(screen.getByRole("button", { name: /Suivant/ }));
    await user.click(await screen.findByRole("button", { name: /Adapter mon CV/ }));
    await user.type(
      screen.getByPlaceholderText("placeholders.pasteJobDescriptionHere"),
      "Une description de poste suffisamment longue",
    );
    await user.click(screen.getByRole("button", { name: /Analyser/ }));
    quotaAvailable = false;

    await user.click(screen.getByRole("button", { name: "confirm-source" }));

    expect(screen.getByTestId("source-review-mounted")).toBeInTheDocument();
    expect(screen.getByTestId("review-text").textContent).toBe(confirmedText);
    expect(fetch).not.toHaveBeenCalled();
    expect(openPricingModal).toHaveBeenCalledWith("cv_adapt_per_day");
  });

  it.each(["apply", "wizard"])("conserve la référence après une erreur adapt dans %s", async (journey) => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ detail: "temporaire" }), { status: 503 })).mockImplementation(pendingResponse);
    if (journey === "apply") {
      render(<ApplyModal open onOpenChange={vi.fn()} job={job} jobDescription={job.description} />);
      fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [new File(["pdf"], "cv.pdf", { type: "application/pdf" })] } });
      await user.click(screen.getByRole("button", { name: "generateButton" }));
    } else {
      render(<CVUploadAsyncWizard canUse={() => true} incrementUsage={vi.fn()} refreshQuotas={vi.fn()} openPricingModal={vi.fn()} hasFeatures={{ hasCVHistory: false, hasPDFExport: false }} />);
      fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [new File(["pdf"], "cv.pdf", { type: "application/pdf" })] } });
      await user.click(screen.getByRole("button", { name: /Suivant/ }));
      await user.click(await screen.findByRole("button", { name: /Adapter mon CV/ }));
      await user.type(screen.getByPlaceholderText("placeholders.pasteJobDescriptionHere"), "Une description de poste suffisamment longue");
      await user.click(screen.getByRole("button", { name: /Analyser/ }));
    }
    await user.click(screen.getByRole("button", { name: "confirm-source" }));
    expect(await screen.findByTestId("source-review-mounted")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "confirm-source" }));
    expect(fetch).toHaveBeenCalledTimes(2);
    const secondBody = vi.mocked(fetch).mock.calls[1][1]?.body as FormData;
    expect(secondBody.get("confirmed_factual_reference")).toBe(JSON.stringify(confirmedReference));
  });
});
