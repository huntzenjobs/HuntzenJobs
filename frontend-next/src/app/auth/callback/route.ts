/**
 * Auth Callback Route
 * Handles OAuth redirect from Google/Email confirmation
 */

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { logSecurityEvent } from "@/lib/security/logger";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const error = requestUrl.searchParams.get("error");
  const errorDescription = requestUrl.searchParams.get("error_description");
  const origin = requestUrl.origin;

  // Read redirect cookie set before OAuth flow
  const redirectCookie = request.cookies.get("huntzen_redirect_after_auth");
  const redirectTo = redirectCookie?.value
    ? decodeURIComponent(redirectCookie.value)
    : null;

  // Handle OAuth errors from Google
  if (error) {
    await logSecurityEvent({
      eventType: "auth.oauth_callback_error",
      severity: "warning",
      metadata: { error, error_description: errorDescription },
    });

    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(errorDescription || error)}`,
    );
  }

  if (code) {
    const supabase = await createClient();
    const type = requestUrl.searchParams.get("type");

    // Exchange code for session
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.session) {
      // Log successful OAuth callback
      await logSecurityEvent({
        eventType: "auth.oauth_callback_success",
        severity: "info",
        userId: data.user.id,
        metadata: {
          email: data.user.email,
          provider: data.user.app_metadata?.provider,
          type: type || "oauth",
        },
      });

      // Password reset flow: redirect to reset-password page
      if (type === "recovery") {
        const recoveryResponse = NextResponse.redirect(
          `${origin}/reset-password`,
        );
        recoveryResponse.cookies.delete("huntzen_redirect_after_auth");
        return recoveryResponse;
      }

      // OAuth / email confirmation flow: redirect to final destination
      const isNewUser = !data.user.user_metadata?.onboarding_completed;

      let finalRedirect: string;
      if (isNewUser) {
        // New users ALWAYS go through onboarding first
        // Preserve the original redirectTo so onboarding can redirect after completion
        const onboardingUrl =
          redirectTo && redirectTo.startsWith("/")
            ? `/onboarding?redirectTo=${encodeURIComponent(redirectTo)}`
            : "/onboarding";
        finalRedirect = onboardingUrl;
      } else {
        finalRedirect =
          redirectTo && redirectTo.startsWith("/") ? redirectTo : "/jobs";
      }

      const response = NextResponse.redirect(`${origin}${finalRedirect}`);

      // Delete cookie after successful use
      response.cookies.delete("huntzen_redirect_after_auth");

      return response;
    }

    // Log session exchange failure
    await logSecurityEvent({
      eventType: "auth.session_exchange_failed",
      severity: "critical",
      metadata: { error: error?.message },
    });

    // Auth error, redirect to login with generic error
    return NextResponse.redirect(
      `${origin}/login?error=Authentication failed. Please try again.`,
    );
  }

  // No code provided, redirect to login
  return NextResponse.redirect(`${origin}/login`);
}
