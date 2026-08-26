/**
 * Vercel Cron — déclenche la consommation de l'outbox Stripe durable.
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const cronSecret = process.env.CRON_SECRET;
const backendUrl =
  process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "";

export async function GET(request: Request) {
  if (!cronSecret || !backendUrl) {
    return NextResponse.json(
      { error: "Server misconfiguration" },
      { status: 500 },
    );
  }

  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 115_000);
  try {
    const response = await fetch(`${backendUrl}/api/cron/stripe-effects`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cronSecret}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: "Backend processing unavailable" },
        { status: 502 },
      );
    }

    return NextResponse.json(await response.json());
  } catch {
    if (controller.signal.aborted) {
      return NextResponse.json(
        { success: false, error: "Backend processing timed out" },
        { status: 504 },
      );
    }
    return NextResponse.json(
      { success: false, error: "Backend processing unavailable" },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
