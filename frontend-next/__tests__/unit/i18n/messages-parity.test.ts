import { describe, expect, it } from "vitest";

import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import fr from "../../../messages/fr.json";
import pt from "../../../messages/pt.json";

function flattenKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }

  return Object.entries(value).flatMap(([key, child]) =>
    flattenKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("catalogues de traduction", () => {
  it.each([
    ["en", en],
    ["es", es],
    ["pt", pt],
  ])("conserve une parité exacte entre fr et %s", (_locale, messages) => {
    expect(flattenKeys(messages).sort()).toEqual(flattenKeys(fr).sort());
  });

  it("localise les libellés visibles du dashboard candidat", () => {
    expect(fr.dashboardFooter.privacy).toBe("Confidentialité");
    expect(fr.dashboardFooter.terms).toBe("Conditions");
    expect(es.dashboard.recruiterContact.finder.companyPlaceholder).toBe(
      "Nombre de la empresa",
    );
    expect(pt.dashboard.recruiterContact.finder.companyPlaceholder).toBe(
      "Nome da empresa",
    );
  });
});
