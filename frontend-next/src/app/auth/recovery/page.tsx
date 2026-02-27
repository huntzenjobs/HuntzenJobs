"use client";

/**
 * Auth Recovery Page (Client Component)
 *
 * Dedicated page for password reset email links.
 * Handles both Supabase auth flows for recovery:
 *  - PKCE flow  : ?code=xxx in query string → exchangeCodeForSession
 *  - Implicit   : #access_token=xxx in hash  → onAuthStateChange PASSWORD_RECOVERY
 *
 * Why client-side and not route.ts:
 * Browsers never send URL hash fragments (#...) to the server.
 * A server Route Handler cannot read #access_token — it always sees an empty
 * hash. This page runs in the browser and can handle both cases.
 */

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2 } from "lucide-react";

function RecoveryInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState("Vérification du lien...");

  useEffect(() => {
    const supabase = createClient();
    const code = searchParams.get("code");
    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    // Error from Supabase (e.g. expired link)
    if (error) {
      router.replace(
        `/forgot-password?error=${encodeURIComponent(errorDescription || error)}`,
      );
      return;
    }

    // --- PKCE flow: ?code=xxx ---
    if (code) {
      setStatus("Validation du lien de réinitialisation...");
      supabase.auth.exchangeCodeForSession(code).then(({ error: exchangeError }) => {
        if (exchangeError) {
          router.replace("/forgot-password?error=expired");
          return;
        }
        router.replace("/reset-password");
      });
      return;
    }

    // --- Implicit flow: #access_token=xxx in hash ---
    // Supabase client auto-detects the hash via detectSessionInUrl: true
    // and fires PASSWORD_RECOVERY when a recovery token is found.
    setStatus("Vérification de la session...");

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        router.replace("/reset-password");
      } else if (event === "SIGNED_IN") {
        // Shouldn't happen on recovery page, but handle gracefully
        router.replace("/jobs");
      }
    });

    // Safety timeout: if nothing fires in 6s, the link is invalid/expired
    const timeout = setTimeout(() => {
      router.replace("/forgot-password?error=expired");
    }, 6000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-[#00D9FF]/10 rounded-full flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-[#00D9FF]" />
          </div>
        </div>
        <p className="text-gray-600 text-sm">{status}</p>
      </div>
    </div>
  );
}

export default function AuthRecoveryPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <Loader2 className="w-8 h-8 animate-spin text-[#00D9FF]" />
        </div>
      }
    >
      <RecoveryInner />
    </Suspense>
  );
}
