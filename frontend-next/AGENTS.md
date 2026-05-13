# CLAUDE.md — frontend-next/

> Conventions spécifiques au frontend Next.js 14. Complète le CLAUDE.md racine.
> Tout est basé sur l'exploration réelle du code.

---

## Stack exacte

| Outil | Version |
|-------|---------|
| Next.js | 14.2.21 (App Router) |
| React | 18.2.0 |
| TypeScript | ^5 (strict mode) |
| Tailwind CSS | ^3.4.13 |
| shadcn/ui | composants copiés dans src/components/ui/ |
| Radix UI | 14 librairies (@radix-ui/react-*) |
| Supabase | @supabase/ssr ^0.5.1 + @supabase/supabase-js ^2.45.4 |
| next-intl | ^4.8.3 (fr, en, es, pt) |
| next-pwa | ^5.6.0 |
| Sentry | @sentry/nextjs ^10.36.0 |
| Zustand | ^4.5.5 (installé mais NON utilisé — utiliser Context API) |
| TanStack Query | ^5.56.2 |
| SWR | ^2.2.5 |
| Vitest | ^2.0.0 + @testing-library/react ^14.2.0 |
| framer-motion | ^12.29.0 |
| sonner | ^1.5.0 (toasts) |
| recharts | ^3.8.0 |
| zod | ^3.25.76 |

---

## Structure src/

```
src/
├── middleware.ts              # Auth Supabase SSR + geo + referral
├── app/                       # App Router
│   ├── (dashboard)/           # Routes protégées (auth requise)
│   ├── (public)/              # Pages publiques
│   ├── admin/                 # Panel admin (is_admin check)
│   ├── api/                   # Route Handlers Next.js
│   └── auth/                  # Callbacks auth
├── components/
│   ├── ui/                    # 34 primitives shadcn/Radix
│   ├── assistant/             # BotSelector, ChatMessage, WelcomeScreen
│   ├── auth/                  # Login/signup forms
│   ├── career-score/          # CareerScoreCard
│   ├── coach/                 # Interface de chat
│   ├── cv/                    # CV builder, wizard
│   ├── freemium/              # PricingModal, ConversionPopups
│   ├── jobs/                  # JobCard, filtres
│   ├── layout/                # Sidebar, Navbar, SiteBanner
│   ├── notifications/         # NotificationBell, NotificationCenter
│   └── referral/              # Composants parrainage
├── contexts/                  # Auth, Subscription, Assistant, Theme, i18n
├── hooks/                     # 20+ hooks custom
├── lib/
│   ├── utils.ts               # cn() = clsx + tailwind-merge
│   ├── api/huntzen-client.ts  # API client + types
│   ├── supabase/              # client.ts, server.ts, middleware.ts
│   └── auth/                  # token-refresh-service.ts
├── i18n/request.ts            # Config next-intl
├── messages/                  # fr.json, en.json, es.json, pt.json
├── types/                     # assistant.ts, coach-history.ts
└── styles/globals.css
```

---

## Commandes

```bash
# Développement (port 3000)
npm run dev

# Build production
npm run build

# Tests (watch mode)
npm run test

# Tests (single run)
npm run test:run

# Tests avec coverage (cible : 80%)
npm run test:coverage

# Lint (ESLint + Next)
npm run lint

# Type check TypeScript
npx tsc --noEmit

# Sync traductions i18n
npm run sync-translations
```

---

## Composant exemple — Pattern à suivre

Basé sur `src/components/ui/card.tsx` et `src/components/assistant/bot-selector.tsx` :

```typescript
"use client"  // UNIQUEMENT si interactif, sinon Server Component

import { useState, useCallback } from "react"
import { useAuth } from "@/contexts/auth-context"
import { useOptionalSubscription } from "@/contexts/subscription-context"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface MyComponentProps {
  title: string
  className?: string
  onAction?: (id: string) => void
}

export function MyComponent({ title, className, onAction }: MyComponentProps) {
  const { user } = useAuth()
  const subscription = useOptionalSubscription()
  const t = useTranslations("myNamespace")
  const [loading, setLoading] = useState(false)

  const handleAction = useCallback(async (id: string) => {
    setLoading(true)
    try {
      await onAction?.(id)
    } finally {
      setLoading(false)
    }
  }, [onAction])

  return (
    <div className={cn("base-styles", className)}>
      {/* Loading state */}
      {loading && <div>...</div>}

      {/* Empty state */}
      {!loading && !user && <div>{t("empty")}</div>}

      {/* Content */}
      <Button onClick={() => handleAction("id")} disabled={loading}>
        {t("action")}
      </Button>
    </div>
  )
}
```

**Règles du composant :**
- `"use client"` seulement si hooks React ou event handlers
- Export nommé (pas `export default` sauf `page.tsx`, `layout.tsx`, `error.tsx`)
- Props typées avec interface explicite
- `className?: string` + `cn()` pour permettre l'override
- Toujours gérer les états : loading, error, empty, success
- Textes via `useTranslations()`, jamais hardcodés

---

## Pattern d'appel API backend

Basé sur `src/lib/api/huntzen-client.ts` et les hooks :

```typescript
// Pattern 1 : fetch natif avec cleanup (dans un hook)
export function useMyData(userId: string) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/endpoint`,
          {
            headers: {
              Authorization: `Bearer ${await getToken()}`,
              "Content-Type": "application/json",
            },
          }
        )
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        if (!cancelled) setData(json)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erreur")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }  // cleanup obligatoire
  }, [userId])

  return { data, loading, error }
}

// Pattern 2 : fetch direct dans un Server Component
const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/endpoint`, {
  cache: "no-store",  // ou revalidate: 60
})
const data = await res.json()
```

**Important :**
- Variable d'env pour l'URL backend : `NEXT_PUBLIC_BACKEND_URL` ou `NEXT_PUBLIC_API_URL`
- Pas d'axios — fetch natif uniquement
- Cleanup avec `cancelled = true` dans `useEffect` pour éviter les memory leaks

---

## Pattern Auth Supabase SSR

### Côté serveur (middleware + Server Components)

```typescript
// middleware.ts — pattern utilisé
import { createServerClient } from "@supabase/ssr"

const supabase = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { cookies: { get, set, remove } }
)
const { data: { user } } = await supabase.auth.getUser()
```

```typescript
// Server Component — utilise src/lib/supabase/server.ts
import { createClient } from "@/lib/supabase/server"
const supabase = await createClient()
const { data: { user } } = await supabase.auth.getUser()
```

### Côté client

```typescript
// Utiliser le contexte — NE PAS recréer le client Supabase directement
import { useAuth } from "@/contexts/auth-context"
const { user, signOut, signInWithGoogle } = useAuth()

// Pour les appels authentifiés
import { createClient } from "@/lib/supabase/client"
const supabase = createClient()
const { data: { session } } = await supabase.auth.getSession()
const token = session?.access_token
```

### Subscription / plan

```typescript
// Avec garde (lève une erreur si pas de contexte)
import { useSubscription } from "@/contexts/subscription-context"
const { plan, quotas, features } = useSubscription()

// Sans garde (safe pour composants optionnels)
import { useOptionalSubscription } from "@/contexts/subscription-context"
const subscription = useOptionalSubscription()
const isPremium = subscription?.plan === "premium"
```

---

## Conventions de nommage

| Élément | Convention | Exemple |
|---------|-----------|---------|
| Fichiers composants | kebab-case | `bot-selector.tsx` |
| Fichiers hooks | `use-` + kebab-case | `use-debounce.ts` |
| Fichiers contextes | kebab-case | `auth-context.tsx` |
| Classes/Composants | PascalCase | `export function BotSelector` |
| Hooks | camelCase + `use` prefix | `useDebounce`, `useAuth` |
| Variables/fonctions | camelCase | `const handleSubmit` |
| Types/Interfaces | PascalCase | `interface AssistantConfig` |
| Pages | `page.tsx` dans le dossier | `app/(dashboard)/jobs/page.tsx` |
| Layouts | `layout.tsx` | `app/(dashboard)/layout.tsx` |

---

## i18n — Utilisation

```typescript
// Dans un Client Component
"use client"
import { useTranslations, useLocale } from "next-intl"

export function MyComponent() {
  const t = useTranslations("myNamespace")
  const locale = useLocale()
  return <p>{t("key")}</p>
}

// Dans un Server Component
import { getTranslations } from "next-intl/server"
const t = await getTranslations("myNamespace")

// Fichiers de traduction : src/messages/fr.json, en.json, es.json, pt.json
// Toujours ajouter la clé dans les 4 fichiers
```

---

## Tests — Framework et patterns

**Framework** : Vitest + @testing-library/react

**Structure des tests** :
```
__tests__/
├── unit/
│   └── components/
│       └── ui/             # Tests composants primitifs
└── integration/
    └── pages/              # Tests pages avec mocks contextes
```

**Mocks disponibles dans vitest.setup.ts** :
- `next/navigation` (useRouter, usePathname, useSearchParams)
- `next/image` → `<img />`
- `next-themes`
- `@/lib/supabase/client`
- `window.matchMedia`, `ResizeObserver`, `IntersectionObserver`

```typescript
// Pattern test composant
import { render, screen } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"
import { MyComponent } from "@/components/my-component"

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: { id: "test-id", email: "test@test.com" } })
}))

describe("MyComponent", () => {
  it("renders correctly", () => {
    render(<MyComponent title="Test" />)
    expect(screen.getByText("Test")).toBeInTheDocument()
  })
})
```

---

## Erreurs fréquentes à éviter

```typescript
// ❌ Zustand (installé mais pas utilisé)
import { create } from "zustand"  // → utiliser Context API

// ❌ Default export sur composants
export default function MyComponent() {}  // → export nommé sauf page/layout

// ❌ any TypeScript
const data: any = response  // → typer explicitement

// ❌ Texte hardcodé
<p>Bienvenue sur HuntZen</p>  // → useTranslations()

// ❌ img HTML brut
<img src="..." />  // → <Image from "next/image" />

// ❌ Lien HTML brut
<a href="/dashboard">  // → <Link href="/dashboard"> from "next/link"

// ❌ Client Component inutile
"use client"
export function StaticCard({ title }: { title: string }) {
  return <div>{title}</div>  // → Pas besoin de "use client" ici

// ❌ Fetch sans cleanup dans useEffect
useEffect(() => {
  fetchData()  // → ajouter let cancelled = false + return () => { cancelled = true }
}, [])

// ❌ Pas d'état loading/error/empty
return <div>{data.items.map(...)}</div>  // → gérer tous les états

// ❌ Classes Tailwind sans cn()
className="base-class " + (condition ? "conditional" : "")  // → cn()

// ❌ Import Supabase direct dans composant
import { createClient } from "@supabase/supabase-js"  // → @/lib/supabase/client
```

---

## Design tokens custom (Tailwind)

```typescript
// Couleurs HuntZen (tailwind.config.ts)
"ocean"      // bleu principal (#0EA5E9)
"turquoise"  // accent (#06B6D4)
"violet"     // (#7C3AED)
"gold"       // (#F59E0B)
"amethyst"   // (#8B5CF6)

// Gradients
"bg-gradient-ocean"           // bleu → turquoise
"bg-gradient-ocean-turquoise"
"bg-gradient-violet"
"bg-gradient-royal"           // violet → bleu
"bg-gradient-gold"

// Animations custom
"animate-shimmer"     // loading skeleton
"animate-fade-in"
"animate-slide-in-up"
"animate-scale-in"
"animate-pulse-slow"

// Usage
<div className="bg-ocean text-white animate-fade-in" />
```

---

## Validation avant commit

```bash
# Obligatoire avant tout commit frontend
cd frontend-next
npm run lint          # ESLint + Next.js rules
npx tsc --noEmit      # TypeScript strict check
npm run test:run      # Vitest tests
```
