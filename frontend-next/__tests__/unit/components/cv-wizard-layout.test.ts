import { expect, it } from "vitest";

import { cvWizardHeaderClassName } from "@/components/cv/cv-upload-async-wizard";

it("empile le contrôle d'historique sous les étapes sur mobile", () => {
  expect(cvWizardHeaderClassName).toContain("flex-col");
  expect(cvWizardHeaderClassName).toContain("sm:flex-row");
});
