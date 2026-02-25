"use client";

/**
 * Auth Context Provider
 * Manages authentication state using Supabase Auth with Hybrid Solution
 * - Auto-refresh token before expiration
 * - Activity detection and inactivity timeout
 * - Cookie-based session persistence
 */

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User, Session, AuthError } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  logLoginSuccess,
  logLoginFailed,
  logLogout,
  logSecurityEvent,
} from "@/lib/security/logger";
import { detectFailedLoginAnomaly } from "@/lib/security/anomaly-detection";
import { tokenRefreshService } from "@/lib/auth/token-refresh-service";
import { useAutoRefreshSession } from "@/hooks/use-auto-refresh-session";

// Development-only logging utility
const isDev = process.env.NODE_ENV !== "production";
const devLog = (...args: any[]) => isDev && console.log(...args);
const devError = (...args: any[]) => isDev && console.error(...args);
const devWarn = (...args: any[]) => isDev && console.warn(...args);

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (
    email: string,
    password: string,
    fullName: string,
  ) => Promise<void>;
  signOut: () => Promise<void>;
  resetPasswordForEmail: (email: string) => Promise<void>;
  resendConfirmationEmail: (email: string) => Promise<void>;
  error: string | null;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Create Supabase client ONCE outside component to avoid re-initialization
const supabaseClient = createClient();

export function AuthProvider({
  children,
  initialUser = null,
}: {
  children: React.ReactNode;
  initialUser?: User | null;
}) {
  const tErr = useTranslations("auth.errors");
  const [user, setUser] = useState<User | null>(initialUser);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(!initialUser);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();

  // Hybrid Solution: Auto-refresh + Activity detection + Inactivity timeout
  useAutoRefreshSession();

  useEffect(() => {
    const initializeAuth = async () => {
      if (initialUser) {
        // User fourni par SSR, fetch seulement session
        try {
          const {
            data: { session },
          } = await supabaseClient.auth.getSession();
          setSession(session);
          // Ne pas toucher user (déjà set par initialUser)
        } catch (err) {
          devError("Failed to get session:", err);
        }
        // Pas de setLoading(false) - déjà false
      } else {
        // Pas d'initialUser, fetch complet
        try {
          const {
            data: { session },
          } = await supabaseClient.auth.getSession();
          setSession(session);
          setUser(session?.user ?? null);
        } catch (err) {
          devError("Failed to get session:", err);
        } finally {
          setLoading(false);
        }
      }
    };

    initializeAuth();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabaseClient.auth.onAuthStateChange(async (event, session) => {
      devLog(
        "[AuthContext] Auth state changed:",
        event,
        session ? "session active" : "no session",
      );

      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

      // Handle different auth events
      switch (event) {
        case "SIGNED_IN":
          // Log OAuth login success (non-blocking)
          if (session?.user) {
            const provider = session.user.app_metadata?.provider;
            if (provider === "google") {
              logLoginSuccess(session.user.id, {
                email: session.user.email,
                method: "oauth_google",
                provider: "google",
              }).catch((err) => {
                devError("Failed to log OAuth login (non-critical):", err);
              });
            }
          }

          // Clear old subscription cache and trigger refresh
          localStorage.removeItem("huntzen_subscription_cache");
          localStorage.removeItem("huntzen_subscription_cache_expiry");
          window.dispatchEvent(new Event("subscription-changed"));
          break;

        case "TOKEN_REFRESHED":
          // Token was automatically refreshed by Supabase
          devLog("[AuthContext] Token refreshed successfully");
          // Invalidate caches to force refetch with new token
          tokenRefreshService.invalidateCaches();
          break;

        case "SIGNED_OUT":
          // User signed out or token expired permanently
          devLog("[AuthContext] User signed out");
          setSession(null);
          setUser(null);

          // Clear subscription cache to prevent data leakage
          localStorage.removeItem("huntzen_subscription_cache");
          localStorage.removeItem("huntzen_subscription_cache_expiry");
          break;

        case "USER_UPDATED":
          // User metadata updated
          devLog("[AuthContext] User updated");
          break;
      }
    });

    return () => subscription.unsubscribe();
  }, [initialUser]);

  const clearError = () => setError(null);

  const signInWithGoogle = async () => {
    try {
      setError(null);

      // Capturer redirectTo et stocker dans cookie avant OAuth
      const params = new URLSearchParams(window.location.search);
      const redirectTo = params.get("redirectTo");

      if (redirectTo) {
        document.cookie = `huntzen_redirect_after_auth=${encodeURIComponent(redirectTo)}; path=/; max-age=600; SameSite=Lax`;
      }

      const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) throw error;
    } catch (err: any) {
      devError("Google sign in error:", err);
      setError(err.message || "Failed to sign in with Google");
      setLoading(false);

      // Log OAuth failure (non-blocking)
      logSecurityEvent({
        eventType: "auth.oauth_failed",
        severity: "warning",
        metadata: { provider: "google", error: err.message },
      }).catch((logErr) => {
        devError("Failed to log OAuth failure (non-critical):", logErr);
      });

      throw err;
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    try {
      setError(null);
      setLoading(true);

      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      // Log successful login (non-blocking)
      if (data.user) {
        logLoginSuccess(data.user.id, { email, method: "email" }).catch(
          (err) => {
            devError("Failed to log login success (non-critical):", err);
          },
        );
      }

      // Check for redirectTo parameter in URL for deep links
      const params = new URLSearchParams(window.location.search);
      const redirectTo = params.get("redirectTo");

      if (redirectTo && redirectTo.startsWith("/")) {
        router.push(redirectTo);
      } else {
        router.push("/jobs");
      }

      // Reset loading après navigation initiale
      setTimeout(() => setLoading(false), 100);
    } catch (err: any) {
      devError("Email sign in error:", err);

      // Détection d'email non confirmé
      const isEmailNotConfirmed =
        err.message?.toLowerCase().includes("email not confirmed") ||
        err.message?.toLowerCase().includes("user not confirmed") ||
        err.message?.toLowerCase().includes("confirm your email");

      if (isEmailNotConfirmed) {
        setError(tErr("emailNotConfirmed"));
      } else {
        setError(err.message || tErr("invalidCredentials"));
      }

      setLoading(false);

      // Log failed login (non-blocking)
      logLoginFailed(email, err.message).catch((logErr) => {
        devError("Failed to log login failure (non-critical):", logErr);
      });

      // Check for anomalies (multiple failed attempts)
      // Note: We don't have userId yet, so we can't check here
      // This will be checked by backend/database triggers

      throw err;
    }
  };

  const signUpWithEmail = async (
    email: string,
    password: string,
    fullName: string,
  ) => {
    try {
      setError(null);
      setLoading(true);

      // ⚡ FIX: Timeout de 30s pour éviter le loading infini
      const SIGNUP_TIMEOUT_MS = 30000;

      // Créer une promesse de timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(tErr("timeout")));
        }, SIGNUP_TIMEOUT_MS);
      });

      // Course entre signup et timeout
      const { data, error } = await Promise.race([
        supabaseClient.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
            },
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        }),
        timeoutPromise,
      ]);

      if (error) throw error;

      // Log successful signup (non-blocking)
      if (data.user) {
        logSecurityEvent({
          eventType: "auth.signup",
          severity: "info",
          userId: data.user.id,
          metadata: { email, full_name: fullName, method: "email" },
        }).catch((err) => {
          devError("Failed to log signup (non-critical):", err);
        });
      }

      setError(null);
      setLoading(false);

      // If session exists, email confirmation is disabled → user is already logged in
      // If session is null, email confirmation is required → show success modal
      if (data?.session) {
        router.push("/jobs");
      } else {
        router.push("/signup?success=true&email=" + encodeURIComponent(email));
      }
    } catch (err: any) {
      devError("Sign up error:", err);

      // Message d'erreur plus clair pour timeout
      const errorMessage = err.message || tErr("signupFailed");

      setError(errorMessage);
      setLoading(false);
      throw err;
    }
  };

  const resetPasswordForEmail = async (email: string) => {
    setError(null);
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
    });
    // Log in dev only — never expose to user to prevent email enumeration
    if (error) {
      devError("Reset password error (not surfaced):", error);
    }
  };

  const resendConfirmationEmail = async (email: string) => {
    try {
      setError(null);
      const { error } = await supabaseClient.auth.resend({
        type: "signup",
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      devError("Resend confirmation error:", err);
      setError(err.message || tErr("resendConfirmationFailed"));
      throw err;
    }
  };

  const signOut = async () => {
    try {
      setError(null);

      // Log logout in background (non-blocking)
      // Don't await to prevent logout delays if logging fails
      if (user) {
        logLogout(user.id).catch((err) => {
          devError("Failed to log logout (non-critical):", err);
        });
      }

      // Attempt to sign out from Supabase
      // If session is already expired, this will fail - that's OK
      const { error } = await supabaseClient.auth.signOut();

      if (error) {
        // Log the error but don't block logout
        // Session might already be expired (AbortError)
        devWarn("Sign out warning (continuing anyway):", error);
      }
    } catch (err: any) {
      // Catch any exception (AbortError, network issues, etc.)
      devWarn("Sign out exception (continuing anyway):", err);
    } finally {
      // ALWAYS clean up local state and redirect, even if signOut failed
      // If session was already expired, we still need to clear local data
      setSession(null);
      setUser(null);

      // Clear subscription cache to prevent data leakage between users
      localStorage.removeItem("huntzen_subscription_cache");
      localStorage.removeItem("huntzen_subscription_cache_expiry");

      // CRITICAL: Use window.location.href instead of router.push()
      // to force a full page reload and clear all in-memory state
      // This prevents "session expired" errors after logout/login
      window.location.href = "/login";
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        signOut,
        resetPasswordForEmail,
        resendConfirmationEmail,
        error,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

/**
 * Hook optionnel pour utiliser le contexte d'authentification
 * Retourne null si le contexte n'est pas disponible (au lieu de throw)
 *
 * Utilisé par des composants qui peuvent fonctionner avec ou sans authentification
 * (par exemple le Sidebar qui peut recevoir user via props OU via contexte)
 */
export function useOptionalAuth() {
  const context = useContext(AuthContext);
  return context ?? null;
}
