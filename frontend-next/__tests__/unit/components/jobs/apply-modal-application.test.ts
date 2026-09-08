import { describe, expect, it, vi } from "vitest";

import {
  buildCoverLetterRequest,
  buildCoverLetterSource,
  saveConfirmedApplication,
} from "@/components/jobs/apply-modal";
import type { Job } from "@/lib/api/huntzen-client";

const job = {
  id: "job-123",
  title: "Développeur Python",
  company: "HuntZen Test",
  location: "Paris",
  salary: "50 k€",
  url: "https://example.test/jobs/123",
  source: "test",
} as Job;

describe("buildCoverLetterSource", () => {
  const baseline = { personal_info: { location: "Lyon" }, summary: "CDI immédiat inventé", experiences: [{ company: "Entreprise A", start_date: "2020" }] };

  it("ne transforme pas les faits générés inchangés en source autorisée", () => {
    expect(buildCoverLetterSource("Source originale", baseline, baseline)).toBe("Source originale");
  });

  it("ajoute seulement les champs corrigés par la personne, y compris les suppressions", () => {
    const edited = { ...baseline, personal_info: { location: "Nantes" }, experiences: [{ company: "Entreprise A", start_date: "" }] };
    const source = buildCoverLetterSource("Source originale", baseline, edited);
    expect(source).toContain("Source originale");
    expect(source).toContain('"personal_info.location":"Nantes"');
    expect(source).toContain('"experiences.0.start_date":""');
    expect(source).not.toContain("CDI immédiat inventé");
    expect(source).not.toContain("Entreprise A");
  });

  it("ne prétend pas avoir une source originale pour un ancien document", () => {
    expect(buildCoverLetterSource(undefined, baseline, baseline)).toBeUndefined();
  });
});

describe("buildCoverLetterRequest", () => {
  it("transmet le titre exact de l’offre à la génération", () => {
    expect(buildCoverLetterRequest({
      cvData: {
        personal_info: { name: "Wissem Karboub" },
        experiences: [],
        education: [],
        skills: {},
      },
      sourceCvText: "CV source",
      jobDescription: "Offre détaillée",
      language: "fr",
      job,
    })).toMatchObject({
      job_title: "Développeur Python",
      company_name: "HuntZen Test",
      job_description: "Offre détaillée",
    });
  });
});

describe("saveConfirmedApplication", () => {
  it("persiste la candidature avant de permettre le succès UI", async () => {
    const authenticatedFetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 201 }));

    await saveConfirmedApplication(authenticatedFetch, job);

    expect(authenticatedFetch).toHaveBeenCalledOnce();
    const [, options] = authenticatedFetch.mock.calls[0];
    expect(JSON.parse(options.body as string)).toMatchObject({
      external_job_id: "job-123",
      confirmed_by_user: true,
    });
  });

  it("rejette un faux succès lorsque l'API échoue", async () => {
    const authenticatedFetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 500 }));

    await expect(saveConfirmedApplication(authenticatedFetch, job)).rejects.toThrow(
      "Application save failed (500)",
    );
  });
});
