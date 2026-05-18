/**
 * Vercel Cron endpoint — rafraîchissement hebdomadaire des sources expat
 *
 * Exécuté chaque lundi à 3h UTC (0 3 * * 1)
 * Proxie vers le backend POST /api/cron/expat-refresh
 */

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

const CRON_SECRET = process.env.CRON_SECRET;
const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "";

export async function GET(request: Request) {
  if (!CRON_SECRET) {
    console.error("[Cron expat-refresh] CRON_SECRET non configuré");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    console.error("[Cron expat-refresh] Accès non autorisé");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    console.log("[Cron expat-refresh] Déclenchement du rafraîchissement des sources expat...");

    const backendRes = await fetch(`${BACKEND_URL}/api/cron/expat-refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CRON_SECRET}`,
      },
    });

    if (!backendRes.ok) {
      const body = await backendRes.text();
      console.error(`[Cron expat-refresh] Erreur backend ${backendRes.status}: ${body}`);
      return NextResponse.json(
        { success: false, error: `Backend responded ${backendRes.status}`, detail: body },
        { status: 502 },
      );
    }

    const data = await backendRes.json();
    console.log("[Cron expat-refresh] Terminé :", data);
    return NextResponse.json({ success: true, ...data, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error("[Cron expat-refresh] Erreur inattendue :", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
