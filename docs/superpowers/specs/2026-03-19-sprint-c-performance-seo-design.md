# Sprint C — Performance & SEO (42 → 90) — Design Spec

> Date : 2026-03-19
> Scope : frontend-next/ uniquement
> Score actuel : 42/100 (audit commercial 2026-03-18)
> Score cible : 90/100
> Référence audit : docs/audit/subagents/07-performance-seo.md

---

## Décisions d'architecture validées

1. **Landing SSR** : Option A — garder framer-motion, extraire les sections animées en Client Components
2. **~~Routing i18n~~** : REPORTÉ au Sprint D — risque trop élevé de régression sur l'auth Google OAuth et le middleware Supabase SSR. Les 8pts de hreflang ne justifient pas le risque de casser l'auth pour les users actuels.
3. **Fonts** : Supprimer les `<link preload>` redondants + `@import Plus Jakarta Sans`, `next/font` suffit
4. **Images** : Migrer les `backgroundImage: url(unsplash)` vers `next/image` avec `fill` + `object-cover`

### Items du Sprint C (C4 exclu)
- C1 — Landing SSR (+15pts)
- C2 — Font cleanup (+10pts)
- C3 — Metadata pages manquantes (+10pts) — metadata statiques FR (pas de routing locale)
- C5 — Images next/image (+5pts)
- C6 — Sitemap complet (+3pts) — sans variantes locale
- C7 — JobPosting schema (+5pts)
- C8 — Dynamic imports (+2pts)
- C9 — Cleanup config (0pts)
- **Total : +50pts → 92/100** (arrondi audit)

---

## C1 — Landing page SSR (+15pts)

### Problème
`app/page.tsx` (646 lignes) est entièrement `"use client"`. Le contenu HTML (hero, features, pricing, stats, CTA) est invisible pour les crawlers sans JS. C'est le problème SEO le plus critique.

De plus, la landing contient un `<style jsx global>` (ligne 632) avec un `@import url("Plus Jakarta Sans")` render-blocking qui charge une 3e font famille et override `body { font-family }`. Ce `@import` est synchrone et bloque le rendu.

### Solution
Convertir `page.tsx` en Server Component. Extraire les parties animées (framer-motion) dans des Client Components enfants. Supprimer le `<style jsx global>` et migrer Plus Jakarta Sans vers `next/font/google` dans `lib/fonts.ts`.

### Architecture

```
app/page.tsx                             ← Server Component (getTranslations)
components/landing/
├── hero-section.tsx                     ← "use client" (motion.*, glow orbs, CTA)
├── trust-bar.tsx                        ← "use client" (motion fadeUp)
├── how-it-works-section.tsx             ← "use client" (motion)
├── features-grid.tsx                    ← "use client" (motion cards)
├── stats-section.tsx                    ← "use client" (motion compteurs)
├── cta-final-section.tsx                ← "use client" (motion)
├── pricing-section.tsx                  ← EXISTE DÉJÀ (LandingPricingSection)
└── referral-tracker.tsx                 ← "use client" (useEffect cookie referral)
```

### Pattern Server → Client

```tsx
// app/page.tsx (Server Component)
import { getTranslations } from "next-intl/server"
import { HeroSection } from "@/components/landing/hero-section"
import { TrustBar } from "@/components/landing/trust-bar"
// ...

export default async function HomePage() {
  const tHero = await getTranslations("hero")
  const tTrustBar = await getTranslations("trustBar")
  const tHow = await getTranslations("howItWorks")
  const tFeatures = await getTranslations("features")
  const tFeaturesGrid = await getTranslations("featuresGrid")
  const tStats = await getTranslations("stats")
  const tCtaFinal = await getTranslations("ctaFinal")

  return (
    <div className="min-h-screen bg-white">
      <LandingHeader />
      <HeroSection texts={{
        tag: tHero("tag"),
        h1: tHero("h1"),
        h2: tHero("h2"),
        subtitle: tHero("subtitle"),
        ctaSearch: tHero("ctaSearch"),
        ctaDiscover: tHero("ctaDiscover"),
        socialProof: tHero("socialProof"),
      }} />
      <TrustBar texts={{ title: tTrustBar("title"), ... }} />
      {/* ... autres sections */}
      <Footer />
      <ReferralTracker />
    </div>
  )
}
```

### Props interface par section

Chaque Client Component reçoit un objet `texts` typé avec les traductions pré-résolues côté serveur. Exemple :

```tsx
// components/landing/hero-section.tsx
"use client"
import { motion } from "framer-motion"
import Link from "next/link"

interface HeroSectionProps {
  texts: {
    tag: string
    h1: string
    h2: string
    subtitle: string
    ctaSearch: string
    ctaDiscover: string
    socialProof: string
  }
}

export function HeroSection({ texts }: HeroSectionProps) {
  // motion.* animations identiques à l'actuel
  // Textes via texts.h1, texts.h2 au lieu de t("h1"), t("h2")
}
```

### ReferralTracker isolé

```tsx
// components/landing/referral-tracker.tsx
"use client"
import { useEffect } from "react"

export function ReferralTracker() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const ref = params.get("ref")
    if (ref && /^[a-zA-Z0-9_-]{3,32}$/.test(ref)) {
      document.cookie = `huntzen_referral_code=${ref}; path=/; max-age=604800; SameSite=Lax`
    }
  }, [])
  return null
}
```

### Migration font Plus Jakarta Sans

Le `<style jsx global>` actuel (lignes 632-642) :
- `@import url("Plus Jakarta Sans")` — render-blocking, dégrade LCP
- Override `body { font-family: "Plus Jakarta Sans" }` — remplace la font Inter du reste de l'app

**Fix** :
1. Ajouter Plus Jakarta Sans dans `lib/fonts.ts` via `next/font/google`
2. Appliquer la variable CSS uniquement sur le wrapper landing : `className={plusJakartaSans.variable}` + `font-family: var(--font-plus-jakarta)` via Tailwind
3. Supprimer le bloc `<style jsx global>` entier (incompatible avec Server Component de toute façon)

```ts
// lib/fonts.ts — ajout
import { Plus_Jakarta_Sans } from "next/font/google"

export const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
  display: "swap",
  preload: true,
  weight: ["400", "500", "600", "700", "800", "900"],
})
```

### Résultat SEO
- Le HTML contient tous les textes (h1, h2, descriptions, CTAs) dans la réponse serveur initiale
- Les crawlers sans JS voient le contenu complet
- Les animations sont "progressivement améliorées" côté client
- Le JS framer-motion est chargé après le contenu visible
- Zéro `@import` render-blocking

---

## C2 — Font cleanup (+10pts)

### Problème
`layout.tsx` lignes 76-86 contient des `<link rel="preload" as="style">` vers Google Fonts (Inter + DM Sans). Ces fonts sont DÉJÀ chargées par `next/font/google` dans `lib/fonts.ts` avec `preload: true` et `display: "swap"`. Le résultat est un triple chargement qui dégrade LCP et cause du FOIT.

### Fix
Supprimer les lignes 76-86 de `layout.tsx` :

```html
<!-- SUPPRIMER ces lignes -->
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Inter:..." />
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=DM+Sans:..." />
```

`next/font` gère déjà tout : téléchargement, self-hosting, preload, display swap.

### Fichiers modifiés
- `frontend-next/src/app/layout.tsx` — supprimer 2 `<link>` + commentaire associé

---

## C3 — Metadata pages manquantes (+10pts)

### Problème
Les pages `/blog`, `/login`, `/signup`, `/forgot-password` n'ont aucun export `metadata`. Comme elles sont `"use client"`, on ne peut pas exporter de metadata depuis le `page.tsx`.

### Fix
Créer un `layout.tsx` avec export `metadata` statique pour chaque page concernée. Les metadata sont centralisées dans `lib/seo/metadata.ts` (pattern existant). Pas de `generateMetadata` dynamique puisque C4 (routing locale) est reporté.

### Nouvelles metadata dans lib/seo/metadata.ts

```ts
export const blogMetadata: Metadata = {
  title: "Blog",
  description: "Conseils et actualités pour réussir votre recherche d'emploi — HuntZen Jobs",
  openGraph: {
    title: "Blog | HuntZen Jobs",
    description: "Conseils et actualités pour réussir votre recherche d'emploi",
  },
  alternates: { canonical: `${SITE_URL}/blog` },
}

export const loginMetadata: Metadata = {
  title: "Connexion",
  description: "Connectez-vous à votre compte HuntZen Jobs",
  robots: { index: false, follow: true },
}

export const signupMetadata: Metadata = {
  title: "Inscription gratuite",
  description: "Créez votre compte HuntZen Jobs gratuitement et boostez votre recherche d'emploi",
  openGraph: {
    title: "Inscription gratuite | HuntZen Jobs",
    description: "Créez votre compte gratuitement",
  },
  alternates: { canonical: `${SITE_URL}/signup` },
}

export const forgotPasswordMetadata: Metadata = {
  title: "Mot de passe oublié",
  description: "Réinitialisez votre mot de passe HuntZen Jobs",
  robots: { index: false, follow: true },
}
```

### Fichiers créés
- `app/blog/layout.tsx` — export blogMetadata
- `app/login/layout.tsx` — export loginMetadata
- `app/signup/layout.tsx` — export signupMetadata
- `app/forgot-password/layout.tsx` — export forgotPasswordMetadata

### Décision : indexation
- Blog et Signup : `index: true` (pages publiques utiles pour le SEO)
- Login et Forgot-password : `index: false, follow: true` (pas de valeur SEO, mais on suit les liens)

---

## ~~C4 — Routing i18n avec préfixes locale (+8pts)~~ — REPORTÉ AU SPRINT D

> **Décision** : Reporté car risque élevé de régression sur l'auth Google OAuth et le middleware Supabase SSR.
> Le design ci-dessous est conservé comme référence pour le Sprint D.

### Problème
Aucun hreflang configuré malgré 4 langues. Google ne sait pas quelle version linguistique servir. Les URLs sont identiques quelle que soit la langue (détection par cookie).

### Solution (Sprint D)
Restructurer le routing avec `app/[locale]/` et `next-intl/routing` en mode `localePrefix: "as-needed"` (FR sans préfixe, EN/ES/PT avec préfixe).

### 1. Structure fichiers

```
app/
├── [locale]/                      ← NOUVEAU segment dynamique
│   ├── layout.tsx                 ← NextIntlClientProvider + validation locale
│   ├── page.tsx                   ← landing (Server Component, C1)
│   ├── not-found.tsx              ← déplacé
│   ├── error.tsx                  ← déplacé (si existe à ce niveau)
│   ├── (dashboard)/               ← déplacé tel quel (toutes les sous-routes)
│   ├── (public)/                  ← déplacé tel quel
│   ├── admin/                     ← déplacé
│   ├── blog/                      ← déplacé
│   ├── login/                     ← déplacé
│   ├── signup/                    ← déplacé
│   ├── forgot-password/           ← déplacé
│   ├── pricing/                   ← déplacé
│   ├── about/                     ← déplacé
│   ├── faq/                       ← déplacé
│   ├── temoignages/               ← déplacé
│   ├── terms/                     ← déplacé
│   ├── privacy/                   ← déplacé
│   ├── payment/                   ← déplacé
│   └── auth/                      ← déplacé
├── layout.tsx                     ← ROOT (html, body, fonts, Sentry — RESTE ICI)
├── sitemap.ts                     ← reste ici (global)
├── robots.ts                      ← reste ici
├── icon.tsx                       ← reste ici
├── apple-icon.tsx                 ← reste ici
├── opengraph-image.tsx            ← reste ici
└── api/                           ← Route Handlers (PAS de locale) — RESTE ICI
```

### 2. Configuration next-intl routing

```ts
// src/i18n/routing.ts (NOUVEAU)
import { defineRouting } from "next-intl/routing"
import { createNavigation } from "next-intl/navigation"

export const routing = defineRouting({
  locales: ["fr", "en", "es", "pt"],
  defaultLocale: "fr",
  localePrefix: "as-needed",  // FR = /jobs, EN = /en/jobs
})

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing)
```

### 3. Middleware adapté — Composition next-intl + Supabase SSR

Le middleware actuel gère : auth Supabase SSR, client ID, locale detection (cookie NEXT_LOCALE + géo IP), referral tracking, maintenance mode, routes protégées. Il faut intégrer le routing next-intl sans casser cette logique.

**Pattern de composition** : next-intl fournit `createMiddleware` qui retourne une Response. On l'appelle en premier pour gérer le routing locale, puis on ajoute la logique Supabase sur la même response.

```ts
// src/middleware.ts
import createIntlMiddleware from "next-intl/middleware"
import { routing } from "@/i18n/routing"
import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

const intlMiddleware = createIntlMiddleware(routing)

// Helper : strip locale prefix pour matcher les routes protégées
function stripLocalePrefix(pathname: string): string {
  const localePattern = /^\/(en|es|pt)(\/|$)/
  return pathname.replace(localePattern, "/")
}

export async function middleware(request: NextRequest) {
  // 1. next-intl routing (détection locale, redirect si nécessaire)
  const intlResponse = intlMiddleware(request)

  // Si next-intl a décidé de rediriger (ex: /en/jobs → /en/jobs), retourner immédiatement
  if (intlResponse.headers.get("x-middleware-rewrite") === undefined
      && intlResponse.status >= 300 && intlResponse.status < 400) {
    return intlResponse
  }

  // 2. Supabase SSR auth — on manipule les cookies sur la response de next-intl
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          cookiesToSet.forEach(({ name, value, options }) =>
            intlResponse.cookies.set(name, value, options)
          )
        },
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()

  // 3. Client ID cookie (freemium tracking) — sur intlResponse
  if (!request.cookies.get("huntzen_client_id")) {
    intlResponse.cookies.set("huntzen_client_id", "hzn_" + crypto.randomUUID().replace(/-/g, ""), {
      path: "/", maxAge: 365 * 24 * 60 * 60, sameSite: "lax",
    })
  }

  // 4. Referral tracking — sur intlResponse
  const refCode = request.nextUrl.searchParams.get("ref")
  if (refCode && /^HZN-[A-Z0-9]{6}$/.test(refCode)) {
    intlResponse.cookies.set("huntzen_referral_code", refCode, {
      path: "/", maxAge: 30 * 24 * 60 * 60, sameSite: "lax",
    })
  }

  // 5. Routes protégées — STRIP LE PREFIXE LOCALE avant comparaison
  const pathname = request.nextUrl.pathname
  const pathnameWithoutLocale = stripLocalePrefix(pathname)

  const protectedRoutes = ["/dashboard", "/profile", "/saved-jobs", "/admin"]
  if (protectedRoutes.some(route => pathnameWithoutLocale.startsWith(route)) && !user) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"  // next-intl ajoutera le préfixe locale automatiquement
    url.searchParams.set("redirectTo", pathname)
    return NextResponse.redirect(url)
  }

  // 6. Routes auth — redirect si déjà connecté
  const authRoutes = ["/login", "/signup"]
  if (authRoutes.some(route => pathnameWithoutLocale === route) && user) {
    const url = request.nextUrl.clone()
    url.pathname = "/jobs"
    return NextResponse.redirect(url)
  }

  return intlResponse
}
```

**Points clés** :
- `intlMiddleware(request)` est appelé en premier → gère la détection de locale (Accept-Language, cookie) et les redirects
- Supabase SSR met ses cookies directement sur `intlResponse` (pas un nouveau `NextResponse.next()`)
- `stripLocalePrefix()` retire `/en/`, `/es/`, `/pt/` avant de comparer avec `protectedRoutes` → `/en/dashboard` matche bien `/dashboard`
- La détection de locale par géo IP (COUNTRY_TO_LANG) est remplacée par next-intl qui utilise le header `Accept-Language` natif + cookie `NEXT_LOCALE`
- La maintenance mode est retirée du middleware (elle fera une requête API bloquante sur chaque navigation — à migrer vers un pattern différent si nécessaire)

### 3b. Réécriture de i18n/request.ts

Le fichier actuel détecte la locale via cookie `NEXT_LOCALE`. Avec le routing `[locale]`, la locale vient du segment URL :

```ts
// src/i18n/request.ts (RÉÉCRIT)
import { getRequestConfig } from "next-intl/server"
import { routing } from "./routing"

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale
  if (!locale || !routing.locales.includes(locale as any)) {
    locale = routing.defaultLocale
  }

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  }
})
```

### 3c. Migration NextIntlClientProvider

**Problème** : Le root `layout.tsx` actuel encapsule `SiteBanner` et `CookieBanner` dans `NextIntlClientProvider`. Si on le déplace dans `[locale]/layout.tsx`, ces composants perdent l'accès aux traductions.

**Solution** : Déplacer `SiteBanner` et `CookieBanner` dans `[locale]/layout.tsx` (pas dans root). Le root `layout.tsx` ne garde que : `<html>`, `<body>`, fonts, Sentry import, Providers (auth, theme, subscription). Tout composant qui a besoin de traductions doit être sous `[locale]/`.

```tsx
// app/layout.tsx (ROOT — simplifié)
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <html suppressHydrationWarning>
      <head>
        {/* PWA meta, DNS prefetch, favicons, structured data */}
      </head>
      <body className={`${inter.variable} ${dmSans.variable} ${plusJakartaSans.variable} font-sans antialiased`}>
        <SkipLink />
        <Providers initialUser={user}>{children}</Providers>
      </body>
    </html>
  )
}
```

```tsx
// app/[locale]/layout.tsx (LOCALE — avec traductions)
export default async function LocaleLayout({ children, params }: ...) {
  const { locale } = await params
  if (!routing.locales.includes(locale as any)) notFound()
  setRequestLocale(locale)
  const messages = await getMessages()

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <SiteBanner />
      {children}
      <CookieBanner />
    </NextIntlClientProvider>
  )
}
```

**Note** : Le `<html lang={locale}>` pose un problème car il est dans root layout mais la locale n'est pas disponible à ce niveau. Solution : ne pas mettre `lang` dans root, et ajouter un `<script>` dans `[locale]/layout.tsx` qui set `document.documentElement.lang = locale` côté client, OU utiliser `generateMetadata` dans `[locale]/layout.tsx` qui ajoute le `lang` automatiquement via le htmlAttributes de Next.js metadata API.

### 4. Layout [locale]

```tsx
// app/[locale]/layout.tsx
import { NextIntlClientProvider } from "next-intl"
import { getMessages, setRequestLocale } from "next-intl/server"
import { notFound } from "next/navigation"
import { routing } from "@/i18n/routing"

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { locale: string }
}) {
  const { locale } = await params
  if (!routing.locales.includes(locale as any)) notFound()
  setRequestLocale(locale)

  const messages = await getMessages()

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  )
}
```

Le root `layout.tsx` garde : `<html>`, `<body>`, fonts, Sentry, Providers (auth, theme, subscription), CookieBanner. Le `NextIntlClientProvider` est déplacé de root vers `[locale]/layout.tsx`.

### 5. hreflang via alternates

```ts
// lib/seo/metadata.ts — helper
export function localeAlternates(path: string) {
  return {
    canonical: `${SITE_URL}${path}`,
    languages: {
      "fr": `${SITE_URL}${path}`,
      "en": `${SITE_URL}/en${path}`,
      "es": `${SITE_URL}/es${path}`,
      "pt": `${SITE_URL}/pt${path}`,
      "x-default": `${SITE_URL}${path}`,
    },
  }
}
```

Appliqué à toutes les metadata de pages publiques.

### 6. Liens internes

Les imports `Link` de `next/link` dans les composants existants continuent de fonctionner. Pour les nouvelles navigations, utiliser `Link` de `@/i18n/routing` qui ajoute automatiquement le préfixe locale.

### 7. Impact sur les Route Handlers (api/)

`app/api/` reste EN DEHORS de `[locale]/` — les Route Handlers n'ont pas besoin de locale. Aucun changement nécessaire.

---

## C5 — Images Unsplash → next/image (+5pts)

### Problème
4 images Unsplash en `backgroundImage: url(...)` dans la landing — pas d'optimisation, pas de lazy loading, pas de WebP/AVIF :
- Ligne 67 : hero background (section 1)
- Ligne 259 : feature A — recherche d'emploi (section 4)
- Ligne 345 : feature B — CV ATS (section 4)
- Ligne 363 : feature C — coaches IA (section 4)

### Fix
Remplacer les 4 par `next/image` avec `fill` + `object-cover`. Sera fait lors de l'extraction en Client Components (C1) :

```tsx
// Pattern pour chaque image
import Image from "next/image"

<div className="relative w-full h-full rounded-3xl overflow-hidden">
  <Image
    src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?q=80&w=2340&auto=format&fit=crop"
    alt="Équipe en collaboration professionnelle"
    fill
    className="object-cover"
    priority    // uniquement pour le hero (LCP), les autres en lazy
    sizes="(max-width: 768px) 100vw, 50vw"
  />
</div>
```

- L'image hero a `priority` (au-dessus de la fold)
- Les 3 images features ont le lazy loading par défaut (en dessous de la fold)

### Config next.config.js

```js
images: {
  remotePatterns: [
    // ... existants
    { protocol: "https", hostname: "images.unsplash.com" },
  ],
}
```

---

## C6 — Sitemap complet (+3pts)

### Pages publiques à ajouter

```ts
// Nouvelles entrées dans sitemap.ts
{ url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.6 },
{ url: `${SITE_URL}/blog`, changeFrequency: "weekly", priority: 0.7 },
{ url: `${SITE_URL}/faq`, changeFrequency: "monthly", priority: 0.6 },
{ url: `${SITE_URL}/temoignages`, changeFrequency: "monthly", priority: 0.6 },
{ url: `${SITE_URL}/signup`, changeFrequency: "yearly", priority: 0.5 },
```

### Pas de variantes locale (C4 reporté)

Pas de variantes `/en/...`, `/es/...`, `/pt/...` dans le sitemap pour l'instant — les URLs localisées n'existent pas encore. Sera ajouté quand le Sprint D (routing i18n) sera implémenté.

### Login non inclus
`/login` et `/forgot-password` ont `robots: { index: false }` → pas dans le sitemap.

---

## C7 — Structured data JobPosting (+5pts)

### Nouveau composant

```tsx
// components/seo/structured-data.tsx — ajout
import Script from "next/script"

interface JobPostingSchemaProps {
  job: {
    title: string
    description: string
    datePosted: string
    company: string
    location: string
    country?: string  // code ISO 3166-1 alpha-2 (défaut: "FR")
    employmentType?: string  // FULL_TIME, PART_TIME, INTERNSHIP, CONTRACT
    salary?: { min?: number; max?: number; currency?: string }
    url?: string
  }
}

export function JobPostingSchema({ job }: JobPostingSchemaProps) {
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description: job.description,
    datePosted: job.datePosted,
    hiringOrganization: {
      "@type": "Organization",
      name: job.company,
    },
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: job.location,
        addressCountry: job.country || "FR",
      },
    },
  }
  if (job.employmentType) schema.employmentType = job.employmentType
  if (job.salary?.min || job.salary?.max) {
    schema.baseSalary = {
      "@type": "MonetaryAmount",
      currency: job.salary.currency || "EUR",
      value: {
        "@type": "QuantitativeValue",
        minValue: job.salary.min,
        maxValue: job.salary.max,
        unitText: "YEAR",
      },
    }
  }
  if (job.url) schema.url = job.url

  return (
    <Script id={`job-posting-${job.title.slice(0, 20)}`} type="application/ld+json">
      {JSON.stringify(schema)}
    </Script>
  )
}
```

### Intégration
Ajouté dans la page `/jobs` — pour chaque offre visible dans les résultats de recherche. Limité aux 10 premières offres pour ne pas surcharger le DOM.

---

## C8 — Dynamic imports pour composants lourds (perf)

### Problème
`lib/performance/code-splitting.ts` a 5 exports `dynamic()` commentés, mais AUCUN des 5 chemins d'import référencés n'existe dans le codebase (`jobs/job-details-modal`, `subscription/subscription-modal`, `landing/animated-features`, `analytics/chart`, `editor/rich-text`). L'item tel que prévu ne produit aucun changement.

### Fix redéfini
Appliquer `next/dynamic` aux composants lourds **qui existent réellement** :

1. `freemium/pricing-modal.tsx` — modale lourde (Stripe checkout), chargée dans 3 pages
2. `recharts` — librairie chart (~200KB), utilisée dans le dashboard admin

Mettre à jour `code-splitting.ts` avec les bons chemins. Utiliser `ssr: false` pour les modales et charts.

```ts
export const DynamicPricingModal = dynamic(
  () => import("@/components/freemium/pricing-modal").then(mod => mod.PricingModal),
  { loading: () => null, ssr: false }
)
```

---

## C9 — Cleanup config

### swcMinify
Supprimer `swcMinify: true` de `next.config.js` — deprecated depuis Next.js 14, actif par défaut. L'option génère un warning au build.

---

## Ordre d'exécution recommandé

1. **C1** — Landing SSR (le plus impactant, +15pts)
2. **C2** — Font cleanup (quick fix dans layout.tsx, +10pts)
3. **C5** — Images next/image (dans les Client Components créés par C1, +5pts)
4. **C3** — Metadata pages manquantes (+10pts)
5. **C6** — Sitemap complet (+3pts)
6. **C7** — JobPosting schema (+5pts)
7. **C8** — Dynamic imports (+2pts)
8. **C9** — Cleanup config (0pts)

### Dépendances
- C1 bloque C5 (les images Unsplash sont dans les composants landing extraits par C1)
- C2 peut être fait en parallèle de C1
- C3, C6, C7, C8, C9 sont tous indépendants entre eux et de C1

---

## Risques identifiés

1. **C1 — Landing SSR + style jsx global** : Le `<style jsx global>` de la landing (Plus Jakarta Sans + body font override) n'est pas compatible avec un Server Component. **Mitigation** : Migrée vers `next/font` (détaillé dans C1).
2. **C1 — Flash hydration** : Les animations framer-motion pourraient avoir un flash avant hydration. **Mitigation** : les glow orbs ont `opacity: 0.1` → flash imperceptible.
3. **C7 — JobPosting** : Les données d'offres viennent du backend API côté client. Le schema sera injecté dans la page jobs `"use client"`. Alternative : Server Component wrapper qui fetch et injecte le schema côté serveur.
4. **C1 — Taille du refactoring** : La landing fait 646 lignes à découper en ~7 composants. Risque d'oublier un bout de logique. **Mitigation** : vérification visuelle avant/après avec `npm run dev`.

## Item reporté — Sprint D (i18n routing)

C4 (routing `[locale]` + hreflang) est reporté car :
- Risque élevé de régression sur l'auth Google OAuth et le middleware Supabase SSR
- Temps estimé 1-2 jours pour C4 seul
- Les 8pts de hreflang ne justifient pas le risque
- Sera traité dans un sprint dédié avec tests E2E sur tous les flows auth

---

## Tests

- `npx tsc --noEmit` + `npm run lint` → zéro erreur après chaque item
- Build production `npm run build` → zéro erreur
- Lighthouse SEO score ≥ 90 sur la landing
- View source sur la landing → le HTML contient les textes h1, h2, descriptions (pas vide)
- Google Rich Results Test sur `/jobs` pour le schema JobPosting
- Vérifier que le sitemap.xml contient about, blog, faq, temoignages, signup
- Vérifier que les fonts ne chargent plus via Google Fonts externe (Network tab)
- Vérifier les 4 images Unsplash → format WebP/AVIF dans le Network tab
- `npm run test:frontend` → tous les tests existants passent (pas de régression)
