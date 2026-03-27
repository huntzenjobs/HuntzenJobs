export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

const CRON_SECRET = process.env.CRON_SECRET;
const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "";

export async function GET(request: Request) {
  if (!CRON_SECRET) {
    console.error("[Cron] CRON_SECRET is not configured");
    return NextResponse.json(
      { error: "Server misconfiguration" },
      { status: 500 },
    );
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    console.error(
      "[Cron] Unauthorized access attempt to retention-notifications",
    );
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    console.log("[Cron] Triggering retention notifications...");

    const res = await fetch(`${BACKEND_URL}/api/cron/retention-notifications`, {
      method: "POST",
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });

    const data = await res.json();

    console.log(
      `[Cron] retention-notifications: sent=${data.sent} / total_inactive=${data.total_inactive}`,
    );

    return NextResponse.json({
      success: true,
      ...data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Cron] retention-notifications error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 },
    );
  }
}
