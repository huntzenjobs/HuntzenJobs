import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CVSourceReview,
  type FactualReference,
} from "@/components/cv/cv-source-review";

const labels: Record<string, string> = {
  title: "Vérifiez les informations de votre CV", guidance: "Corrigez uniquement ce qui ne correspond pas à votre CV.", rawTextTitle: "Texte original extrait", rawTextGuidance: "Conservé comme référence.", confirmationLabel: "J’ai vérifié ces informations", replaceFile: "Remplacer le fichier", confirm: "Confirmer et générer", retry: "Réessayer", loading: "Préparation de la vérification", extractionError: "Lecture impossible. Réessayez ou remplacez le fichier.", missingName: "Ajoutez votre nom avant de générer les documents.", emptySection: "Aucune information détectée", addItem: "Ajouter", removeItem: "Supprimer", addValue: "Ajouter une valeur", removeValue: "Supprimer la valeur", newValue: "Nouvelle valeur", sections_personal_info: "Informations personnelles", sections_experiences: "Expériences", sections_education: "Formations", sections_certifications: "Certifications", sections_projects: "Projets", sections_skills: "Compétences", sections_interests: "Centres d’intérêt", fields_name: "Nom", fields_title: "Poste", fields_company: "Entreprise", fields_degree: "Diplôme", fields_school: "Établissement", fields_technical: "Compétences", fields_value: "Information", fields_description: "Description", addEntry_experiences: "Ajouter une expérience", addEntry_education: "Ajouter une formation", addEntry_certifications: "Ajouter une certification", addEntry_projects: "Ajouter un projet", removeEntry_experiences: "Supprimer l’expérience {index}", removeEntry_education: "Supprimer la formation {index}", removeEntry_certifications: "Supprimer la certification {index}", removeEntry_projects: "Supprimer le projet {index}", addSkillValue: "Ajouter une valeur à {section}", removeSkillValue: "Supprimer la valeur {index} de {section}", addInterest: "Ajouter un centre d’intérêt", removeInterest: "Supprimer le centre d’intérêt {index}",
};

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    Object.entries(values ?? {}).reduce(
      (message, [name, value]) => message.replace("{" + name + "}", String(value)),
      labels[key] ?? key,
    ),
}));

const file = new File(["pdf"], "cv.pdf", { type: "application/pdf" });
const factualReference: FactualReference = {
  personal_info: { name: "Camille Martin", title: "Développeuse" },
  experiences: [{ title: "Développeuse", company: "HuntZen" }],
  education: [{ degree: "Master", school: "Université" }],
  certifications: [{ name: "AWS" }],
  projects: [{ name: "Portfolio", description: "Application web" }],
  skills: { technical: ["TypeScript", "Python"] },
  interests: ["Course à pied"],
};

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("CVSourceReview", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("prépare une revue structurée authentifiée sans lancer la génération", async () => {
    const onConfirm = vi.fn();
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ cv_text: "CV original", factual_reference: factualReference }));
    render(<CVSourceReview file={file} accessToken="token" onConfirm={onConfirm} onCancel={vi.fn()} />);
    expect(await screen.findByDisplayValue("Camille Martin")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/cv-adapter/prepare-structured-review"), expect.objectContaining({ method: "POST", headers: { Authorization: "Bearer token" } }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("affiche toutes les familles et conserve le texte original en lecture seule", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ cv_text: "CV original", factual_reference: factualReference }));
    render(<CVSourceReview file={file} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    for (const heading of ["Informations personnelles", "Expériences", "Formations", "Certifications", "Projets", "Compétences", "Centres d’intérêt"]) {
      expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
    }
    expect(screen.getByDisplayValue("CV original")).toHaveAttribute("readonly");
  });

  it("transmet le texte brut et la référence structurée corrigée", async () => {
    const user = userEvent.setup(); const onConfirm = vi.fn();
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ cv_text: "CV original", factual_reference: factualReference }));
    render(<CVSourceReview file={file} onConfirm={onConfirm} onCancel={vi.fn()} />);
    const personalInfo = (await screen.findByRole("heading", { name: "Informations personnelles" })).closest("section") as HTMLElement;
    const name = within(personalInfo).getByLabelText("Nom");
    await user.clear(name); await user.type(name, "Camille Durand");
    await user.click(screen.getByRole("checkbox", { name: "J’ai vérifié ces informations" }));
    await user.click(screen.getByRole("button", { name: "Confirmer et générer" }));
    expect(onConfirm).toHaveBeenCalledWith("CV original", expect.objectContaining({ personal_info: expect.objectContaining({ name: "Camille Durand" }) }));
  });

  it("invalide la confirmation après chaque modification", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ cv_text: "CV original", factual_reference: factualReference }));
    render(<CVSourceReview file={file} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    await screen.findByDisplayValue("Camille Martin");
    const checkbox = screen.getByRole("checkbox", { name: "J’ai vérifié ces informations" });
    await user.click(checkbox); expect(checkbox).toBeChecked();
    await user.type(screen.getByLabelText("Entreprise"), " France");
    expect(checkbox).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Confirmer et générer" })).toBeDisabled();
  });

  it("bloque la génération tant que le nom vérifié est vide", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(jsonResponse({
      cv_text: "Wissem\nKarboub\nDéveloppeur",
      factual_reference: { ...factualReference, personal_info: { ...factualReference.personal_info, name: "" } },
    }));
    render(<CVSourceReview file={file} onConfirm={vi.fn()} onCancel={vi.fn()} />);

    expect(await screen.findByText(labels.missingName)).toBeInTheDocument();
    const checkbox = screen.getByRole("checkbox", { name: "J’ai vérifié ces informations" });
    expect(checkbox).toBeDisabled();
    expect(screen.getByRole("button", { name: "Confirmer et générer" })).toBeDisabled();

    await user.type(screen.getByLabelText("Nom"), "Wissem Karboub");
    expect(checkbox).toBeEnabled();
    await user.click(checkbox);
    expect(screen.getByRole("button", { name: "Confirmer et générer" })).toBeEnabled();
  });

  it("ajoute puis supprime une expérience", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ cv_text: "CV original", factual_reference: factualReference }));
    render(<CVSourceReview file={file} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    const section = (await screen.findByRole("heading", { name: "Expériences" })).closest("section") as HTMLElement;
    const scope = within(section);
    await user.click(scope.getByRole("button", { name: "Ajouter une expérience" }));
    expect(scope.getAllByLabelText("Poste")).toHaveLength(2);
    await user.click(scope.getByRole("button", { name: "Supprimer l’expérience 2" }));
    expect(scope.getAllByLabelText("Poste")).toHaveLength(1);
  });

  it("ajoute puis supprime une compétence et ajoute un intérêt", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ cv_text: "CV original", factual_reference: factualReference }));
    render(<CVSourceReview file={file} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    const skills = (await screen.findByRole("heading", { name: "Compétences" })).closest("section") as HTMLElement;
    await user.click(within(skills).getByRole("button", { name: "Ajouter une valeur à Compétences" }));
    expect(within(skills).getAllByLabelText("Compétences")).toHaveLength(3);
    await user.click(within(skills).getByRole("button", { name: "Supprimer la valeur 3 de Compétences" }));
    expect(within(skills).getAllByLabelText("Compétences")).toHaveLength(2);
    const interests = screen.getByRole("heading", { name: "Centres d’intérêt" }).closest("section") as HTMLElement;
    await user.click(within(interests).getByRole("button", { name: "Ajouter un centre d’intérêt" }));
    expect(within(interests).getAllByLabelText("Information")).toHaveLength(2);
  });

  it("donne un nom accessible distinct à chaque action répétée", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ cv_text: "CV original", factual_reference: factualReference }));
    render(<CVSourceReview file={file} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    await screen.findByDisplayValue("Camille Martin");

    expect(screen.getByRole("button", { name: "Ajouter une expérience" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Ajouter une formation" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Ajouter une certification" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Ajouter un projet" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Supprimer l’expérience 1" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Supprimer la formation 1" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Supprimer la valeur 1 de Compétences" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Ajouter une valeur à Compétences" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Supprimer le centre d’intérêt 1" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Ajouter un centre d’intérêt" })).toBeEnabled();
  });

  it("affiche un état vide guidé", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ cv_text: "CV original", factual_reference: { ...factualReference, projects: [] } }));
    render(<CVSourceReview file={file} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    const projects = (await screen.findByRole("heading", { name: "Projets" })).closest("section") as HTMLElement;
    expect(within(projects).getByText("Aucune information détectée")).toBeInTheDocument();
    expect(within(projects).getByRole("button", { name: "Ajouter un projet" })).toBeEnabled();
  });

  it("affiche une erreur sûre et permet de réessayer", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ detail: "Provider secret" }, 503)).mockResolvedValueOnce(jsonResponse({ cv_text: "CV original", factual_reference: factualReference }));
    render(<CVSourceReview file={file} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(await screen.findByText(labels.extractionError)).toBeInTheDocument();
    expect(screen.queryByText(/Provider secret/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByDisplayValue("Camille Martin")).toBeInTheDocument();
  });

  it("offre un secours manuel borné et garde la confirmation invalidée", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ detail: "indisponible" }, 503));
    render(<CVSourceReview file={file} onConfirm={onConfirm} onCancel={vi.fn()} />);
    await screen.findByText(labels.extractionError);
    const rawText = screen.getByLabelText("Texte original extrait");
    expect(rawText).not.toHaveAttribute("readonly");
    await user.type(rawText, "x".repeat(100));
    expect(screen.getByRole("checkbox", { name: "J’ai vérifié ces informations" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Confirmer et générer" })).toBeDisabled();
    await user.type(screen.getByLabelText("Nom"), "Camille");
    expect(screen.getByRole("button", { name: "Confirmer et générer" })).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "J’ai vérifié ces informations" }));
    await user.click(screen.getByRole("button", { name: "Confirmer et générer" }));
    expect(onConfirm).toHaveBeenCalledWith("x".repeat(100), expect.objectContaining({ personal_info: expect.objectContaining({ name: "Camille" }) }));
  });

  it("affiche le champ URL pour un nouveau projet", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ cv_text: "CV original", factual_reference: { ...factualReference, projects: [] } }));
    render(<CVSourceReview file={file} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "Ajouter un projet" }));
    expect(screen.getByLabelText("fields_url")).toHaveValue("");
  });

  it("abandonne la requête après démontage", async () => {
    vi.mocked(fetch).mockImplementation(() => new Promise<Response>(() => undefined));
    const { unmount } = render(<CVSourceReview file={file} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const signal = vi.mocked(fetch).mock.calls[0][1]?.signal; unmount();
    expect(signal?.aborted).toBe(true);
  });

  it("ne relance pas la préparation lors d’une rotation du token", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ cv_text: "CV original", factual_reference: factualReference }));
    const { rerender } = render(<CVSourceReview file={file} accessToken="token-1" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    await screen.findByDisplayValue("Camille Martin");
    const personalInfo = screen.getByRole("heading", { name: "Informations personnelles" }).closest("section") as HTMLElement;
    fireEvent.change(within(personalInfo).getByLabelText("Nom"), { target: { value: "Nom corrigé" } });
    rerender(<CVSourceReview file={file} accessToken="token-2" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(within(personalInfo).getByLabelText("Nom")).toHaveValue("Nom corrigé");
  });
});
