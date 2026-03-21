/**
 * Vercel Cron endpoint for daily database cleanup
 *
 * Runs daily at 3:00 AM UTC (0 3 * * *)
 * Calls 4 Supabase RPC functions to clean up stale data:
 * - cleanup_old_security_events (90 days)
 * - cleanup_expired_cache
 * - cleanup_old_user_sessions (30 days)
 * - cleanup_old_records_rpc
 */

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const CRON_SECRET = process.env.CRON_SECRET || "";

export async function GET(request: Request) {
  try {
    // Security: Verify cron secret (Vercel sets this automatically)
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      console.error("[Cron Cleanup] Unauthorized access attempt");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("[Cron Cleanup] Starting daily database cleanup...");

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const results: Record<string, { success: boolean; error?: string }> = {};

    // 1. Cleanup old security events (90 days)
    const { error: securityError } = await supabase.rpc(
      "cleanup_old_security_events",
      { days: 90 },
    );
    results.security_events = securityError
      ? { success: false, error: securityError.message }
      : { success: true };

    // 2. Cleanup expired cache
    const { error: cacheError } = await supabase.rpc(
      "cleanup_expired_cache",
    );
    results.expired_cache = cacheError
      ? { success: false, error: cacheError.message }
      : { success: true };

    // 3. Cleanup old user sessions (30 days)
    const { error: sessionsError } = await supabase.rpc(
      "cleanup_old_user_sessions",
      { days: 30 },
    );
    results.user_sessions = sessionsError
      ? { success: false, error: sessionsError.message }
      : { success: true };

    // 4. Cleanup old records
    const { error: recordsError } = await supabase.rpc(
      "cleanup_old_records_rpc",
    );
    results.old_records = recordsError
      ? { success: false, error: recordsError.message }
      : { success: true };

    const allSucceeded = Object.values(results).every((r) => r.success);
    const failedCount = Object.values(results).filter((r) => !r.success).length;

    if (failedCount > 0) {
      console.error(
        `[Cron Cleanup] Completed with ${failedCount} error(s):`,
        results,
      );
    } else {
      console.log("[Cron Cleanup] All cleanup tasks completed successfully");
    }

    return NextResponse.json(
      {
        success: allSucceeded,
        results,
        timestamp: new Date().toISOString(),
      },
      { status: allSucceeded ? 200 : 207 },
    );
  } catch (error) {
    console.error("[Cron Cleanup] Unexpected error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
