# SESSION — 2026-03-19 — Sprint C Performance & SEO + Préparation Sprint D

## Ce qui a été fait

### Sprint C — Performance & SEO (42 → ~90/100) — IMPLÉMENTÉ
- **C1** — Landing page convertie en Server Component (8 Client Components extraits)
  - `hero-section.tsx`, `trust-bar.tsx`, `tools-carousel.tsx`, `features-showcase.tsx`
  - `stats-section.tsx`, `pricing-landing-wrapper.tsx`, `cta-final-section.tsx`, `referral-tracker.tsx`
  - Plus Jakarta Sans migré vers `next/font/google` dans `lib/fonts.ts`
  - `<style jsx global>` supprimé
- **C2** — Font cleanup : suppression des `<link preload>` Google Fonts redondants dans layout.tsx
- **C3** — Metadata ajoutées pour blog, login, signup, forgot-password (4 layouts créés)
- **C5** — 4 images Unsplash migrées vers `next/image` (hero + 3 features)
- **C6** — Sitemap complété : about, blog, faq, temoignages, signup ajoutés
- **C7** — JobPostingSchema ajouté dans structured-data.tsx
- **C8** — Dynamic imports activés pour JobDetailsModal + PricingModal
- **C9** — swcMinify deprecated supprimé de next.config.js
- **C4** (routing i18n) — REPORTÉ Sprint D-bis (risque auth)

### Autres modifications
- Section "Comment ça marche" remplacée par carrousel auto-défilant des 12 outils
- Responsive carrousel (w-56 mobile, w-64 desktop)
- Fix review : subscription-card.tsx strings i18n + rate limit reactivate-subscription
- Commit des changements Sprint A/B non commités (session précédente)

### Review des 36 commits — SAFE TO PUSH
- Aucun secret, breaking change, ou régression détecté
- Migration SQL `20260318000004_fix_rls_security.sql` à appliquer manuellement sur Supabase prod

## Commits de cette session

```
40256fc feat(perf): C8 — activate dynamic imports for JobDetailsModal and PricingModal
ab55e14 feat(seo): C2+C3+C5+C6+C7+C9 — font cleanup, metadata, next/image, sitemap, JobPosting schema, swcMinify removal
ad85c86 feat(seo): C1 — convert landing page to Server Component with client section components
31b5a5d fix(landing): responsive carousel cards — smaller on mobile (w-56, p-4)
e790176 feat(landing): replace 'Comment ça marche' with auto-scrolling tools carousel
8d03a7e fix(i18n+ui): remaining Sprint A/B uncommitted changes
b168431 fix(review): externalize subscription-card strings + add rate limit on reactivate-subscription
5bd0cd5 docs(spec): Sprint C v2 — C4 reporté, score cible 90/100
e015580 docs(spec): Sprint C Performance & SEO design spec (42→100)
```

## Prochain Sprint — Sprint D : Audit Subscription & Monetisation

### Problèmes identifiés
1. **Bug "Plan Gratuit"** — Users Pro/Starter voient "Plan Gratuit" quand le token expire ou que l'API /auth/me est lente
2. **Double système de limites** — localStorage (client) + usage_quotas (serveur) avec sync fragile toutes les 5min
3. **Dossier freemium/ mal nommé** — contient la logique de TOUS les plans, pas juste freemium
4. **Fallback agressif** — 3 couches de fallback qui tombent toutes sur "free" au moindre problème
5. **Incohérences potentielles** — PLAN_LIMITS hardcodés (client) vs subscription_plans (DB) vs feature_overrides (API)
6. **Doublons suspectés** — pricing-modal vs usage-modal vs conversion-popups : overlap de logique ?

### Scope Sprint D
- Audit complet du flow subscription (inscription → checkout → webhook → affichage plan → limites → renewal)
- Cartographie des incohérences et doublons
- Fix du bug "Plan Gratuit" pour tous les users
- Simplification du système de limites (source de vérité unique)
- Modal universelle de plan (affiche le vrai plan, pas de fallback "free")

### Pour reprendre
```
Branche : Production
Commande : "Lance le Sprint D — Audit Subscription & Monetisation selon docs/sessions/SESSION_2026-03-19_SPRINT-C-SEO.md"
```
