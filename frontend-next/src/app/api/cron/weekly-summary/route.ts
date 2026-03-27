export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Fetch users who have weekly_summary enabled
    const { data: prefs } = await supabase
      .from("user_notification_preferences")
      .select("user_id")
      .eq("weekly_summary", true);

    if (!prefs?.length) {
      return NextResponse.json({ success: true, sent: 0 });
    }

    let sent = 0;
    for (const pref of prefs) {
      try {
        await fetch(`${BACKEND_URL}/api/notifications/send-weekly-summary`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${CRON_SECRET}`,
          },
          body: JSON.stringify({ user_id: pref.user_id }),
        });
        sent++;
      } catch (error) {
        console.error(
          "[Cron] weekly-summary: failed for user",
          pref.user_id,
          error,
        );
      }
    }

    console.log(`[Cron] weekly-summary: sent to ${sent} users`);
    return NextResponse.json({
      success: true,
      sent,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Cron] weekly-summary error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 },
    );
  }
}
