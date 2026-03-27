"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes d'inactivité
const REFRESH_BEFORE_EXPIRY = 5 * 60 * 1000; // Rafraîchir 5 min avant expiration
const isDev = process.env.NODE_ENV === "development";

export function useAutoRefreshSession() {
  const supabase = createClient();

  useEffect(() => {
    let inactivityTimer: NodeJS.Timeout;
    let refreshTimer: NodeJS.Timeout;

    // Hard redirect: forces full page reload so all components unmount cleanly.
    // router.push() is a soft nav that keeps mounted components alive with null session.
    const redirectToLogin = (reason: string) => {
      window.location.href = `/login?reason=${reason}`;
    };

    // Détection d'activité utilisateur
    const resetInactivityTimer = () => {
      clearTimeout(inactivityTimer);

      inactivityTimer = setTimeout(async () => {
        if (isDev)
          console.log("[Auth] Déconnexion automatique après inactivité");
        await supabase.auth.signOut();
        redirectToLogin("inactivity");
      }, INACTIVITY_TIMEOUT);
    };

    // Écouter les événements d'activité
    const events = ["mousedown", "keydown", "scroll", "touchstart"];
    events.forEach((event) => {
      window.addEventListener(event, resetInactivityTimer);
    });

    // Auto-refresh du token avant expiration
    const setupRefreshTimer = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session?.expires_at) {
          const expiresAt = session.expires_at * 1000; // Convert to milliseconds
          const now = Date.now();
          const timeUntilRefresh = expiresAt - now - REFRESH_BEFORE_EXPIRY;

          if (timeUntilRefresh > 0) {
            if (isDev)
              console.log(
                `[Auth] Token rafraîchissement programmé dans ${Math.round(timeUntilRefresh / 1000 / 60)} minutes`,
              );

            refreshTimer = setTimeout(async () => {
              if (isDev) console.log("[Auth] Rafraîchissement du token...");
              const { error } = await supabase.auth.refreshSession();

              if (error) {
                console.error("[Auth] Erreur lors du rafraîchissement:", error);
                redirectToLogin("token_expired");
              } else {
                if (isDev) console.log("[Auth] Token rafraîchi avec succès");
                setupRefreshTimer(); // Re-planifier le prochain refresh
              }
            }, timeUntilRefresh);
          } else {
            // Token déjà expiré ou sur le point d'expirer
            if (isDev)
              console.log("[Auth] Token expiré, rafraîchissement immédiat...");
            const { error } = await supabase.auth.refreshSession();

            if (error) {
              console.error("[Auth] Impossible de rafraîchir le token:", error);
              redirectToLogin("token_expired");
            } else {
              setupRefreshTimer();
            }
          }
        }
      } catch (error) {
        console.error(
          "[Auth] Erreur lors de la configuration du refresh:",
          error,
        );
      }
    };

    // Visibilité: setTimeout ne s'exécute pas pendant le sleep/onglet masqué.
    // Quand l'utilisateur revient, on tente un refresh immédiat pour valider la session.
    // On retry avant de rediriger pour tolérer les pertes réseau temporaires.
    const handleVisibilityChange = async () => {
      if (document.visibilityState !== "visible") return;

      // Vérifier d'abord si on a une session locale (cookies/localStorage)
      const {
        data: { session: localSession },
      } = await supabase.auth.getSession();

      // Pas de session locale du tout → l'utilisateur n'était pas connecté
      if (!localSession) return;

      // Tenter le refresh avec retry (réseau peut être instable au réveil)
      let lastError: Error | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const {
            data: { session },
            error,
          } = await supabase.auth.refreshSession();
          if (!error && session) {
            // Re-schedule refresh timer in case it fired during sleep
            clearTimeout(refreshTimer);
            setupRefreshTimer();
            return; // Succès → on sort
          }
          lastError = error as Error | null;
        } catch (e) {
          lastError = e as Error;
        }
        // Attendre avant le prochain retry (500ms, 1s, 2s)
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
        }
      }

      // 3 tentatives échouées → session vraiment expirée
      if (isDev)
        console.log(
          "[Auth] Session expirée après 3 tentatives:",
          lastError?.message,
        );
      redirectToLogin("session_expired");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Initialisation
    resetInactivityTimer();
    setupRefreshTimer();

    // Cleanup
    return () => {
      clearTimeout(inactivityTimer);
      clearTimeout(refreshTimer);
      events.forEach((event) => {
        window.removeEventListener(event, resetInactivityTimer);
      });
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [supabase]);
}
