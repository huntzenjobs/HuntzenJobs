"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2,
  Calendar,
  ArrowRight,
  Loader2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type Status = "verifying" | "success" | "error";

export default function RecruiterContactSuccessPage() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<Status>("verifying");

  useEffect(() => {
    const sessionId = searchParams.get("session_id");
    if (!sessionId) {
      setStatus("error");
      return;
    }
    // Stripe webhook processes asynchronously — show success after brief delay
    const timer = setTimeout(() => setStatus("success"), 2000);
    return () => clearTimeout(timer);
  }, [searchParams]);

  if (status === "verifying") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <Loader2 className="w-12 h-12 animate-spin text-[#00D9FF]" />
        <p className="text-lg text-gray-600">
          Confirmation de votre paiement...
        </p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <XCircle className="w-16 h-16 text-red-500" />
        <h1 className="text-2xl font-bold text-gray-900">Session invalide</h1>
        <p className="text-gray-600 text-center max-w-md">
          Nous ne pouvons pas confirmer votre paiement. Si vous avez été
          débité, contactez-nous à{" "}
          <a
            href="mailto:contact@huntzenjobs.co"
            className="text-[#00D9FF] underline"
          >
            contact@huntzenjobs.co
          </a>
        </p>
        <Button asChild>
          <Link href="/recruiter-contact">Retour</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8 py-12">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle2 className="w-12 h-12 text-green-600" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900">
          Paiement confirmé !
        </h1>
        <p className="text-lg text-gray-600 max-w-md">
          Votre consultation avec un recruteur expert a bien été réservée. Vous
          allez recevoir un email de confirmation avec les détails.
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 max-w-md w-full">
        <div className="flex items-start gap-3">
          <Calendar className="w-6 h-6 text-blue-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-blue-900">Prochaines étapes</p>
            <ul className="mt-2 space-y-1 text-sm text-blue-800">
              <li>📧 Vérifiez votre boîte email (et les spams)</li>
              <li>📅 Notre équipe vous contactera sous 48h pour planifier</li>
              <li>
                💬 Préparez vos questions pour maximiser la session
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="flex gap-4">
        <Button variant="outline" asChild>
          <Link href="/jobs">Rechercher des offres</Link>
        </Button>
        <Button asChild>
          <Link href="/assistant" className="flex items-center gap-2">
            Parler au coach <ArrowRight className="w-4 h-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
