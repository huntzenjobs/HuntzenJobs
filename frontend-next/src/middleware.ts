import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Supported locales
const SUPPORTED_LOCALES = ["fr", "en", "es", "pt"] as const;
const DEFAULT_LOCALE = "fr";

// Country to language mapping (IP geolocation)
const COUNTRY_TO_LANG: Record<string, string> = {
  // French-speaking
  FR: "fr",
  BE: "fr",
  LU: "fr",
  CH: "fr",
  MC: "fr",
  SN: "fr",
  CI: "fr",
  ML: "fr",
  BF: "fr",
  NE: "fr",
  CD: "fr",
  CG: "fr",
  MG: "fr",
  CM: "fr",
  TG: "fr",
  // English-speaking
  GB: "en",
  US: "en",
  CA: "en",
  AU: "en",
  NZ: "en",
  IE: "en",
  IN: "en",
  ZA: "en",
  NG: "en",
  KE: "en",
  // Spanish-speaking
  ES: "es",
  MX: "es",
  AR: "es",
  CO: "es",
  CL: "es",
  PE: "es",
  VE: "es",
  EC: "es",
  GT: "es",
  CU: "es",
  BO: "es",
  DO: "es",
  HN: "es",
  PY: "es",
  SV: "es",
  // Portuguese-speaking
  BR: "pt",
  PT: "pt",
  AO: "pt",
  MZ: "pt",
  GW: "pt",
  // Morocco/MENA (French as default)
  MA: "fr",
  DZ: "fr",
  TN: "fr",
};

// Generate a client ID for freemium tracking
function generateClientId(): string {
  return "hzn_" + crypto.randomUUID().replace(/-/g, "");
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options: CookieOptions;
          }[],
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Set client ID cookie if not present (for freemium tracking)
  const clientIdCookie = request.cookies.get("huntzen_client_id");
  if (!clientIdCookie) {
    const newClientId = generateClientId();
    supabaseResponse.cookies.set("huntzen_client_id", newClientId, {
      path: "/",
      maxAge: 365 * 24 * 60 * 60, // 1 year
      sameSite: "lax",
    });
  }

  // ============================================================================
  // Language Detection (IP-based with fallbacks)
  // ============================================================================

  // Check if locale already set (user preference takes priority)
  const existingLocaleCookie = request.cookies.get("NEXT_LOCALE");

  if (!existingLocaleCookie) {
    let detectedLocale = DEFAULT_LOCALE;

    // Priority 1: Vercel geo headers (works in production on Vercel Edge)
    // x-vercel-ip-country is the reliable header — request.geo is deprecated
    const countryCode =
      request.headers.get("x-vercel-ip-country") || request.geo?.country;

    if (countryCode && COUNTRY_TO_LANG[countryCode]) {
      detectedLocale = COUNTRY_TO_LANG[countryCode];
    }
    // No Accept-Language fallback — default stays "fr" for French-first platform

    // Set locale cookie (7 days — auto-re-detect weekly, avoids stale wrong locale)
    supabaseResponse.cookies.set("NEXT_LOCALE", detectedLocale, {
      path: "/",
      maxAge: 7 * 24 * 60 * 60, // 7 days
      sameSite: "lax",
    });
  }

  // Store referral code from ?ref=CODE in cookie (30 days)
  const refCode = request.nextUrl.searchParams.get("ref");
  if (refCode && /^HZN-[A-Z0-9]{6}$/.test(refCode)) {
    supabaseResponse.cookies.set("huntzen_referral_code", refCode, {
      path: "/",
      maxAge: 30 * 24 * 60 * 60, // 30 days
      sameSite: "lax",
    });
  }

  // Maintenance mode — si le backend retourne 503, rediriger vers /maintenance
  const pathname = request.nextUrl.pathname;
  const isMaintenancePage = pathname === "/maintenance";
  const isApiOrStatic =
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.includes(".");

  if (!isMaintenancePage && !isApiOrStatic) {
    try {
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || "";
      if (backendUrl) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1500);
        const bannerRes = await fetch(`${backendUrl}/api/banner`, {
          signal: controller.signal,
          headers: { "Cache-Control": "no-store" },
        });
        clearTimeout(timeoutId);
        if (bannerRes.status === 503) {
          const url = request.nextUrl.clone();
          url.pathname = "/maintenance";
          return NextResponse.redirect(url);
        }
      }
    } catch {
      // Backend injoignable — on laisse passer pour éviter de bloquer le site
    }
  }

  // Routes protegees - rediriger vers login si non authentifie
  // Note: /jobs, /cv-analysis, /assistant sont maintenant accessibles sans compte (freemium)
  // /admin is protected here (auth check), is_admin check is in the admin layout (Server Component)
  const protectedRoutes = ["/dashboard", "/profile", "/saved-jobs", "/admin"];
  const isProtectedRoute = protectedRoutes.some((route) =>
    request.nextUrl.pathname.startsWith(route),
  );

  if (isProtectedRoute && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectTo", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  // Routes auth - rediriger vers jobs si deja authentifie
  const authRoutes = ["/login", "/signup"];
  const isAuthRoute = authRoutes.some(
    (route) => request.nextUrl.pathname === route,
  );

  if (isAuthRoute && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/jobs";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
