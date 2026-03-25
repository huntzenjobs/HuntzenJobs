/**
 * Anomaly Detection System
 * Uses Supabase for rate limiting and pattern detection
 */

import { createClient } from "@/lib/supabase/client";
import { logSecurityEvent } from "./logger";

/**
 * Check rate limit using Supabase
 */
export async function checkRateLimit(
  identifier: string, // user ID, IP, email, etc.
  action: string, // login, upload, api_call, etc.
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  try {
    return await checkRateLimitSupabase(
      identifier,
      action,
      limit,
      windowSeconds,
    );
  } catch (error) {
    console.error("Rate limit check failed:", error);
    // Fail open - allow the request
    return {
      allowed: true,
      remaining: limit,
      resetAt: new Date(Date.now() + windowSeconds * 1000),
    };
  }
}

/**
 * Rate limit check using Supabase
 */
async function checkRateLimitSupabase(
  identifier: string,
  action: string,
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const supabase = createClient();
  const windowStart = new Date(Date.now() - windowSeconds * 1000);

  // Count recent events
  const { count, error } = await supabase
    .from("security_events")
    .select("*", { count: "exact", head: true })
    .eq("event_type", action)
    .eq("user_id", identifier)
    .gte("created_at", windowStart.toISOString());

  if (error) {
    console.error("Supabase rate limit check failed:", error);
    // Fail open
    return {
      allowed: true,
      remaining: limit,
      resetAt: new Date(Date.now() + windowSeconds * 1000),
    };
  }

  const currentCount = count || 0;
  const allowed = currentCount < limit;
  const remaining = Math.max(0, limit - currentCount);
  const resetAt = new Date(Date.now() + windowSeconds * 1000);

  if (!allowed) {
    await logSecurityEvent({
      eventType: "api.rate_limit_exceeded",
      severity: "warning",
      metadata: {
        action,
        identifier,
        limit,
        count: currentCount,
        window_seconds: windowSeconds,
      },
    });
  }

  return { allowed, remaining, resetAt };
}

/**
 * Detect failed login anomaly for a user
 */
export async function detectFailedLoginAnomaly(
  userId: string,
  threshold: number = 5,
  windowMinutes: number = 15,
): Promise<boolean> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc("detect_failed_login_anomaly", {
    p_user_id: userId,
    p_threshold: threshold,
    p_time_window: `${windowMinutes} minutes`,
  });

  if (error) {
    console.error("Failed login anomaly detection failed:", error);
    return false;
  }

  return data === true;
}

/**
 * Detect suspicious IP activity
 * Returns true if IP has attempted logins for multiple different accounts
 */
export async function detectSuspiciousIP(
  ipAddress: string,
  uniqueAccountThreshold: number = 3,
  windowMinutes: number = 60,
): Promise<boolean> {
  const supabase = createClient();
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

  const { data, error } = await supabase
    .from("security_events")
    .select("user_id")
    .eq("event_type", "auth.login_failed")
    .eq("ip_address", ipAddress)
    .gte("created_at", windowStart.toISOString());

  if (error || !data) {
    return false;
  }

  const uniqueUsers = new Set(data.map((e) => e.user_id));
  return uniqueUsers.size >= uniqueAccountThreshold;
}

/**
 * Track user account attempt for IP address (no-op, handled by Supabase logs)
 */
export async function trackIPAccountAttempt(
  _ipAddress: string,
  _userId: string,
): Promise<void> {
  // Tracking is handled by security_events table via logSecurityEvent
}

/**
 * Get anomaly score for a user
 * Returns a score from 0-100 (higher = more suspicious)
 */
export async function getUserAnomalyScore(userId: string): Promise<number> {
  let score = 0;

  try {
    const supabase = createClient();
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Count recent security events
    const { count: totalEvents } = await supabase
      .from("security_events")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", last24h.toISOString());

    const { count: failedLogins } = await supabase
      .from("security_events")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("event_type", "auth.login_failed")
      .gte("created_at", last24h.toISOString());

    const { count: criticalEvents } = await supabase
      .from("security_events")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("severity", ["critical", "emergency"])
      .gte("created_at", last24h.toISOString());

    // Calculate score
    score += (totalEvents || 0) > 50 ? 20 : 0; // High activity
    score += (failedLogins || 0) > 5 ? 30 : (failedLogins || 0) * 5; // Failed logins
    score += (criticalEvents || 0) * 25; // Critical events are very suspicious

    return Math.min(100, score);
  } catch (error) {
    console.error("Failed to calculate anomaly score:", error);
    return 0;
  }
}

/**
 * Block user temporarily if anomaly score is too high
 */
export async function checkAndBlockSuspiciousUser(
  userId: string,
): Promise<boolean> {
  const score = await getUserAnomalyScore(userId);

  if (score >= 80) {
    await logSecurityEvent({
      eventType: "api.unauthorized_access",
      severity: "emergency",
      userId,
      metadata: {
        anomaly_score: score,
        action: "temporary_block_recommended",
      },
    });

    return true;
  }

  return false;
}
