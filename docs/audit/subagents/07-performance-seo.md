# Audit — Performance & SEO
Date : 2026-03-18
Score : 42/100

## Resume executif

Le projet dispose d'une base SEO solide (metadata centralisees dans `lib/seo/metadata.ts`, sitemap, robots.txt, structured data JSON-LD, OG image generee). Cependant, des problemes critiques impactent lourdement le score :

1. **La page d'accueil (landing) est un Client Component** (`"use client"`) : tout le contenu est invisible pour les crawlers sans JS. C'est le probleme SEO le plus grave du site.
2. **Chargement de fonts via `@import url()` et `<link preload>` externe** au lieu d'utiliser uniquement `next/font` (deja configure via `lib/fonts.ts`). Triple chargement de fonts = LCP degrade.
3. **Plusieurs pages publiques importantes sans metadata** : blog, login, signup.
4. **Images Unsplash en CSS inline** (`background-image: url(...)`) au lieu de `next/image` : pas d'optimisation, pas de lazy loading, pas de format AVIF/WebP.
5. **Aucun hreflang** malgre 4 langues configurees (fr, en, es, pt).
6. **Pages dynamiques (villes/secteurs) commentees** dans le sitemap.
7. **Aucun `not-found.tsx` personnalise**.

---

## Tableau SEO par page

| Page | Path | Title unique | Description unique | OG | Canonical | Metadata source |
|---|---|---|---|---|---|---|
| Landing | `/` | Oui | Oui | Oui | Oui | `layout.tsx` → `homeMetadata` |
| Jobs | `/jobs` | Oui | Oui | Oui | Oui | `jobs/layout.tsx` → `jobsMetadata` |
| CV Analysis | `/cv-analysis` | Oui | Oui | Oui | Oui | `cv-analysis/layout.tsx` |
| Salons | `/salons` | Oui | Oui | Oui | Oui | `salons/layout.tsx` |
| Assistant | `/assistant` | Oui | Oui | Oui | Oui | `assistant/layout.tsx` |
| Pricing | `/pricing` | Oui | Oui | Oui | Oui | `pricing/layout.tsx` |
| About | `/about` | Oui | Oui | Oui | Oui | `about/layout.tsx` |
| FAQ | `/faq` | Oui | Oui | Oui | Oui | `faq/page.tsx` |
| Temoignages | `/temoignages` | Oui | Oui | Oui | Oui | `temoignages/page.tsx` |
| Terms | `/terms` | Oui | Oui | Non (pas d'OG) | Oui | `terms/layout.tsx` |
| Privacy | `/privacy` | Oui | Oui | Non (pas d'OG) | Oui | `privacy/layout.tsx` |
| **Blog** | `/blog` | **NON** | **NON** | **NON** | **NON** | **Aucune metadata** |
| **Login** | `/login` | **NON** | **NON** | **NON** | **NON** | **Aucune metadata** |
| **Signup** | `/signup` | **NON** | **NON** | **NON** | **NON** | **Aucune metadata** |
| **Forgot Password** | `/forgot-password` | **NON** | **NON** | **NON** | **NON** | **Aucune metadata** |
| Profile | `/profile` | NON | NON | NON | NON | Aucune (dashboard, moins critique) |
| Saved Jobs | `/saved-jobs` | NON | NON | NON | NON | Aucune (dashboard) |
| Referral | `/referral` | NON | NON | NON | NON | Aucune (dashboard) |
| Documents | `/documents` | NON | NON | NON | NON | Aucune (dashboard) |
| Expat | `/expat` | NON | NON | NON | NON | Aucune (dashboard) |
| Candidatures | `/candidatures` | NON | NON | NON | NON | Aucune (dashboard) |

---

## :red_circle: BLOQUANTS (SEO critique) — -58 points

### 1. Landing page en `"use client"` — contenu invisible pour les crawlers (-15pts)
**Fichier** : `frontend-next/src/app/page.tsx:1`

La page d'accueil est entierement un Client Component. Tout le HTML (hero, features, pricing, stats, CTA) est rendu cote client via JavaScript. Les crawlers de Google executent le JS, mais :
- Le rendu est retarde (LCP degrade)
- Le contenu n'est pas dans le HTML initial envoye par le serveur
- Les bots moins sophistiques (Bing, social media scrapers) ne voient rien
- Framer-motion ajoute du poids JS inutile pour du contenu statique

**Impact** : La page la plus importante du site est potentiellement invisible pour le SEO.

### 2. Triple chargement de fonts externes (-10pts)
**Fichiers** :
- `frontend-next/src/app/layout.tsx:74-80` — `<link preload>` vers Google Fonts (Inter + DM Sans)
- `frontend-next/src/app/page.tsx:700` — `@import url()` pour Plus Jakarta Sans
- `frontend-next/src/components/auth/unlock-overlay.tsx:195` — `@import url()` pour Spectral + DM Sans
- `frontend-next/src/lib/fonts.ts` — `next/font/google` pour Inter + DM Sans (CORRECT)

Le projet utilise **correctement** `next/font` dans `lib/fonts.ts`, mais le layout charge AUSSI les memes fonts via `<link preload>` externe, et la landing charge une 3e font (Plus Jakarta Sans) via `@import`. C'est un chargement redondant et bloquant.

**Impact** : CLS, FOIT, LCP degrade. Chaque `@import url()` est render-blocking.

### 3. Page Blog sans aucune metadata (-10pts)
**Fichier** : `frontend-next/src/app/blog/page.tsx`

Pas de `layout.tsx` avec metadata, pas d'export `metadata` dans le fichier. Le blog est une page publique indexable sans title ni description unique. Google utilisera le title par defaut "HuntZen Jobs - Votre allie carriere".

### 4. Pages Login/Signup sans metadata (-10pts)
**Fichiers** : `frontend-next/src/app/login/page.tsx`, `frontend-next/src/app/signup/page.tsx`

Ces pages sont indexables (pas dans robots.txt disallow) mais n'ont pas de metadata. Google les indexera avec le title template par defaut.

### 5. Aucun hreflang configure (-8pts)
**Fichier** : `frontend-next/src/lib/seo/metadata.ts`

Le projet supporte 4 langues (fr, en, es, pt) via next-intl, mais aucune balise `hreflang` n'est configuree dans les alternates des metadata. Google ne sait pas quelle version linguistique servir selon le pays de l'utilisateur.

### 6. Images Unsplash en CSS inline, pas en next/image (-5pts)
**Fichier** : `frontend-next/src/app/page.tsx:68,263,350,370`

3 images Unsplash sont chargees via `backgroundImage: url(...)` dans des `<div>` :
- Pas d'optimisation next/image (pas de WebP/AVIF)
- Pas de lazy loading natif
- Pas de `width`/`height` (risque CLS)
- Pas de `alt` text (accessibilite)

---

## :orange_circle: IMPORTANTS — informatifs

### 7. Sitemap incomplet — pages dynamiques commentees
**Fichier** : `frontend-next/src/app/sitemap.ts:92-124`

Les pages par ville (20 villes) et par secteur (15 secteurs) sont preparees mais **commentees**. Les pages correspondantes n'existent pas encore. Le sitemap ne contient que 8 URLs statiques.

Pages publiques manquantes dans le sitemap :
- `/about` (presente en layout mais pas dans sitemap)
- `/blog`
- `/faq`
- `/temoignages`
- `/login`, `/signup`

### 8. Aucun `not-found.tsx` personnalise
**Fichier** : Absent

Next.js affichera sa page 404 par defaut. Opportunite manquee pour guider l'utilisateur et conserver le trafic SEO.

### 9. Toutes les pages dashboard sont `"use client"`
**Fichiers** : 33 fichiers `page.tsx` sur 44 sont `"use client"`

Beaucoup de pages dashboard utilisent `"use client"` car elles ont des hooks/state, ce qui est justifie. Mais les pages publiques (about, blog, pricing) pourraient etre des Server Components avec des parties client isolees.

### 10. Page pricing — strings hardcodes en francais
**Fichier** : `frontend-next/src/app/pricing/page.tsx`

Nombreux textes hardcodes non i18n :
- Ligne 53-110 : testimonials et FAQs en francais brut
- Ligne 309,319,322,330 : "Choisissez votre plan", "et decrochez votre job"
- Ligne 364,392 : "Mensuel", "Annuel"
- Ligne 583,591 : "Ils ont transforme leur recherche d'emploi"

Cela empeche l'indexation multilingue de cette page critique pour la conversion.

### 11. Page about — strings hardcodes, pas d'i18n
**Fichier** : `frontend-next/src/app/about/page.tsx`

Tout le contenu SEO (1700+ mots) est hardcode en francais. Aucune utilisation de `useTranslations()`.

### 12. Pas de structured data JobPosting sur les offres
**Fichier** : `frontend-next/src/components/seo/structured-data.tsx`

Le projet a des schemas Organization et WebSite, mais pas de schema `JobPosting` (schema.org) sur les pages d'offres d'emploi. C'est critique pour apparaitre dans Google for Jobs.

### 13. Aucun `dynamic()` import utilise
Aucun composant n'utilise `next/dynamic` pour le code-splitting. Les composants lourds (recharts, framer-motion, react-pdf) sont charges immediatement.

---

## :yellow_circle: AMELIORATIONS

### 14. `console.error` dans pricing page
**Fichier** : `frontend-next/src/app/pricing/page.tsx:260`
`console.error("Stripe checkout error:", error)` — devrait utiliser Sentry.

### 15. Robots.txt bloque AhrefsBot et SemrushBot
**Fichier** : `frontend-next/src/app/robots.ts:36-43`

Bloquer ces bots empeche le monitoring SEO via ces outils. C'est un choix, mais a valider.

### 16. `swcMinify: true` deprecie
**Fichier** : `frontend-next/next.config.js:142`

`swcMinify` est active par defaut depuis Next.js 14 et l'option est deprecated.

### 17. Error boundary uniquement au niveau root
**Fichier** : `frontend-next/src/app/error.tsx`

Un seul `error.tsx` au niveau root. Les sous-routes dashboard n'ont pas de `error.tsx` specifique.

---

## :white_check_mark: CE QUI EST BIEN

1. **Metadata centralisees** dans `lib/seo/metadata.ts` — propre, maintenable, avec canonical, OG et Twitter cards pour les pages principales
2. **Structured data JSON-LD** : Organization + WebSite + SearchAction sur la homepage
3. **FAQ structured data** : schemas FAQPage sur `/faq` et `/temoignages`
4. **Robots.txt** bien configure : `/api/`, `/admin/`, `/profile`, `/auth/`, `/payment/` exclus
5. **OG Image** generee dynamiquement via `opengraph-image.tsx` (next/og ImageResponse)
6. **next/font** configure correctement dans `lib/fonts.ts` (Inter + DM Sans avec display:swap)
7. **next.config.js** bien optimise : `compress: true`, `poweredByHeader: false`, images AVIF+WebP, security headers CSP complets
8. **`loading.tsx`** present dans 7 routes dashboard (assistant, saved-jobs, salons, cv-analysis, recruiter-contact, dashboard root, jobs)
9. **`error.tsx`** au niveau root avec Sentry reporting et i18n
10. **Google Search Console** verifie (`verification.google` dans metadata)
11. **Aucune `<img>` brute** dans les composants TSX — toutes les images composant utilisent `next/image`
12. **Pas de lodash** — aucun import de librairies entiere non tree-shakeable
13. **PWA** configure avec runtime caching intelligent
14. **DNS prefetch + preconnect** pour Supabase et Railway

---

## Decompte du score

| Critere | Impact | Points retires |
|---------|--------|---------------|
| Landing page "use client" (contenu invisible) | Critique | -15 |
| Triple chargement fonts externes | Critique | -10 |
| Blog sans metadata | -10/page | -10 |
| Login/Signup sans metadata | -10/page x2 | -10 (plafonné) |
| Pas de hreflang (4 langues) | Important | -8 |
| Images Unsplash CSS inline (3) | -5/image | -5 |

**Base : 100 - 58 = 42/100**
