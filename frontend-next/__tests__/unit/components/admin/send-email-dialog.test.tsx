import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SendEmailDialog, {
  campaignPreviewHtml,
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

vi.mock("next-intl", () => ({
  useTranslations: () =>
    (key: string, values?: Record<string, string>) => {
      const translations: Record<string, string> = {
        simpleMode: "Mode simple",
        htmlMode: "Mode HTML",
        mainText: "Texte principal",
        fullHtml: "HTML complet",
        simpleHelp:
          "Le logo HuntzenJobs, le bouton et la mise en page restent automatiques.",
        htmlHelp:
          "Le lien de gestion des communications est ajouté automatiquement. Vous pouvez utiliser {firstName} et {appUrl}.",
        frozenHelp:
          "Le contenu exact sera gelé côté serveur, version {version}.",
      };
      return Object.entries(values || {}).reduce(
        (message, [name, value]) => message.replace(`{${name}}`, value),
        translations[key] || key,
      );
    },
}));

describe("SendEmailDialog", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        const path = String(url);
        const isRelational = path.includes("service-update");
        const isAllActive = path.includes("marketing-reactivation-all");
        return {
          ok: true,
          json: async () => ({
            campaign_type: isRelational
              ? "service-update"
              : isAllActive
                ? "marketing-reactivation-all"
                : "marketing-reactivation",
            template_version: isRelational ? "2026-09-v1" : "2026-09-v3",
            recipient_count: isRelational || isAllActive ? 836 : 12,
            subject: isRelational
              ? "HuntzenJobs a évolué : découvrez votre nouvel espace emploi"
              : "Du nouveau sur HuntzenJobs",
            main_text: isRelational
              ? "Découvrez les nouveautés"
              : "Des offres adaptées, un CV renforcé et des assistants carrière",
            html: isRelational
              ? "<p>Découvrir les nouveautés</p>"
              : '<a href="{{app_url}}/dashboard">Accéder à mon espace</a>',
            html_template: isRelational
              ? "<p>Découvrir les nouveautés</p>"
              : '<a href="{{app_url}}/dashboard">Accéder à mon espace</a>',
          }),
        };
      }),
    );
  });

  it("explique qu'une campagne différée peut reprendre sans doublon", () => {
    expect(campaignFailureMessage("deferred")).toContain(
      "pourra reprendre avec le même identifiant",
    );
    expect(campaignFailureMessage("failed")).toContain("vérification manuelle");
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
      "HuntzenJobs a évolué : découvrez votre nouvel espace emploi",
    );
    const body = (
      screen.getByLabelText("Texte principal") as HTMLTextAreaElement
    ).value;
    expect(body).toContain("Découvrez les nouveautés");
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
      "Du nouveau sur HuntzenJobs",
    );
    expect(
      (screen.getByLabelText("Texte principal") as HTMLTextAreaElement).value,
    ).toContain("Des offres adaptées");
    expect(screen.getByRole("tab", { name: "Mode HTML" })).toBeInTheDocument();
  });

  it("prépare la même campagne commerciale pour tous les comptes actifs", async () => {
    render(
      <SendEmailDialog
        mode="bulk"
        segment="all-active-marketing"
        open={true}
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByLabelText("Sujet")).toHaveValue(
      "Du nouveau sur HuntzenJobs",
    );
    expect(
      screen.getByText(/Je confirme l'envoi à 836 destinataire/),
    ).toBeInTheDocument();
  });

  it("permet d'éditer le HTML complet et envoie exactement le contenu choisi", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (url, init) => {
      if (init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({ ok: true, sent: 1, skipped: 0, failed: 0 }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          campaign_type: "marketing-reactivation-all",
          template_version: "2026-09-v3",
          recipient_count: 1,
          subject: "Sujet initial HuntzenJobs",
          main_text: "Texte initial",
          html: "<p>Texte initial</p>",
          html_template: "<html><p>Texte initial</p></html>",
        }),
      } as Response;
    });

    render(
      <SendEmailDialog
        mode="bulk"
        segment="all-active-marketing"
        open={true}
        onClose={vi.fn()}
      />,
    );

    const subject = await screen.findByLabelText("Sujet");
    expect(subject).not.toHaveAttribute("readonly");
    await user.clear(subject);
    await user.type(subject, "Sujet final HuntzenJobs");
    await user.click(screen.getByRole("tab", { name: "Mode HTML" }));
    const html = screen.getByLabelText("HTML complet");
    fireEvent.change(html, {
      target: {
        value:
          "<html><p>Campagne finale</p></html>",
      },
    });
    await user.click(screen.getByLabelText(/Je confirme l'envoi à 1/));
    await user.click(screen.getByRole("button", { name: "Envoyer" }));

    const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(postCall).toBeDefined();
    expect(JSON.parse(String(postCall?.[1]?.body))).toMatchObject({
      editor_mode: "html",
      subject: "Sujet final HuntzenJobs",
      html_template:
        "<html><p>Campagne finale</p></html>",
    });
  });

  it("résout les liens et le prénom dans l'aperçu HTML", () => {
    const preview = campaignPreviewHtml(
      '<a href="{{app_url}}/dashboard">Bonjour {{first_name}}</a>',
    );

    expect(preview).toContain('href="/dashboard"');
    expect(preview).toContain("Bonjour Camille");
    expect(preview).toContain('http-equiv="Content-Security-Policy"');
    expect(preview).toContain("default-src 'none'");
    expect(preview).toMatch(
      /^<!doctype html><html><head><meta http-equiv="Content-Security-Policy"/,
    );
    expect(preview).not.toContain("{{");
  });
});
