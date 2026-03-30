"use client";

import { PageGate } from "@/components/auth/page-gate";
import { RecruiterEmailFinder } from "@/components/recruiter/recruiter-email-finder";

export default function RecruiterFinderPage() {
  return (
    <PageGate featureFlag="page_recruiter_finder">
      <div className="container max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Contact recruteur via LinkedIn
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Entrez le nom de l'entreprise pour que HuntZen trouve
            automatiquement des recruteurs et contacts RH pertinents à partir de
            LinkedIn.
          </p>
        </div>

        <RecruiterEmailFinder companyName="" />
      </div>
    </PageGate>
  );
}
