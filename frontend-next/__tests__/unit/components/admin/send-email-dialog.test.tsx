import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SendEmailDialog, {
  campaignFailureMessage,
} from "@/components/admin/users/send-email-dialog";

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: "staging-token" } },
      }),
    },
  }),
}));

describe("SendEmailDialog", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        const isRelational = String(url).includes("service-update");
        return {
          ok: true,
          json: async () => ({
            campaign_type: isRelational
              ? "service-update"
              : "marketing-reactivation",
            template_version: "2026-09-v1",
            recipient_count: isRelational ? 836 : 12,
            subject: isRelational
              ? "HuntZen a évolué : découvrez votre nouvel espace emploi"
              : "Votre prochaine opportunité vous attend sur HuntZen",
            html: isRelational
              ? "<p>Choisir mes communications</p>"
              : "<p>Plus de 4 500 personnes</p><p>Découvrir les abonnements</p>",
          }),
        };
      }),
    );
  });

  it("explique qu'une campagne différée peut reprendre sans doublon", () => {
    expect(campaignFailureMessage("deferred")).toContain(
      "pourra reprendre avec le même identifiant",
    );
    expect(campaignFailureMessage("failed")).toContain(
      "vérification manuelle",
    );
  });

  it("prépare l'email relationnel sans promotion des abonnements", async () => {
    render(
      <SendEmailDialog
        mode="bulk"
        segment="active-accounts"
        open={true}
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByLabelText("Sujet")).toHaveValue(
      "HuntZen a évolué : découvrez votre nouvel espace emploi",
    );
    const body = (
      screen.getByLabelText("Corps du message") as HTMLTextAreaElement
    ).value;
    expect(body).toContain("Choisir mes communications");
    expect(body).not.toContain("Découvrir les abonnements");
  });

  it("prépare la campagne de réactivation pour les abonnés newsletter", async () => {
    render(
      <SendEmailDialog
        mode="bulk"
        segment="newsletter-subscribers"
        open={true}
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByLabelText("Sujet")).toHaveValue(
      "Votre prochaine opportunité vous attend sur HuntZen",
    );
    expect(
      (screen.getByLabelText("Corps du message") as HTMLTextAreaElement).value,
    ).toContain("Plus de 4 500 personnes");
    expect(screen.getByTitle("Aperçu de la campagne")).toBeInTheDocument();
  });
});
