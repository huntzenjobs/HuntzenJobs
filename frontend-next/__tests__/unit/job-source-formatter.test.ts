import { expect, it } from "vitest";
import { formatJobSource } from "@/lib/utils/job-source-formatter";

it("distingue les fournisseurs pour permettre de choisir une source", () => {
  expect(formatJobSource("adzuna")).toBe("Adzuna");
  expect(formatJobSource("indeed")).toBe("Indeed");
  expect(formatJobSource("google_jobs")).toBe("Google Jobs");
});

it("ne prétend pas vérifier une source inconnue", () => {
  expect(formatJobSource("Portail régional")).toBe("Portail régional");
});
