/**
 * Track — Helpers de tracking événements vers le backend HuntZen.
 * Tous les appels sont fire-and-forget (erreurs ignorées silencieusement).
 * Le label dynamique utilise le prénom si disponible depuis le contexte auth.
 */

function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "";
}

interface TrackPayload {
  event_name: string;
  event_label?: string;
  category?: string;
  feature?: string;
  severity?: "info" | "success" | "warning" | "error";
  properties?: Record<string, unknown>;
}

async function trackEvent(payload: TrackPayload, token?: string): Promise<void> {
  try {
    const baseUrl = getApiBaseUrl();
    if (!baseUrl) return;

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    await fetch(`${baseUrl}/api/track/event`, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...payload, source: "frontend" }),
      keepalive: true,
    });
  } catch {
    // Jamais bloquer l'UX pour un événement de tracking
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Auth events
// ──────────────────────────────────────────────────────────────────────────────

export const track = {
  auth: {
    signUp: (plan: string = "free", token?: string) =>
      trackEvent(
        {
          event_name: "sign_up",
          event_label: "Nouvel inscrit",
          category: "auth",
          severity: "success",
          properties: { plan },
        },
        token,
      ),

    signIn: (token?: string) =>
      trackEvent(
        {
          event_name: "sign_in",
          event_label: "Connexion utilisateur",
          category: "auth",
          severity: "info",
        },
        token,
      ),

    signOut: (token?: string) =>
      trackEvent(
        {
          event_name: "sign_out",
          event_label: "Déconnexion utilisateur",
          category: "auth",
          severity: "info",
        },
        token,
      ),
  },

  payment: {
    pricingViewed: (token?: string) =>
      trackEvent(
        {
          event_name: "pricing_viewed",
          event_label: "Visite page tarifs",
          category: "payment",
          feature: "pricing",
          severity: "info",
        },
        token,
      ),

    ctaClicked: (popup: string, plan: string, token?: string) =>
      trackEvent(
        {
          event_name: "cta_clicked",
          event_label: `CTA cliqué — popup ${popup} vers plan ${plan}`,
          category: "payment",
          feature: "conversion",
          severity: "info",
          properties: { popup, plan },
        },
        token,
      ),
  },

  jobs: {
    saved: (company: string, token?: string) =>
      trackEvent(
        {
          event_name: "job_saved",
          event_label: `Offre sauvegardée — ${company}`,
          category: "action",
          feature: "jobs",
          severity: "info",
          properties: { company },
        },
        token,
      ),
  },
};
