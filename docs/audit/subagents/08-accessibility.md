# Audit — Accessibilite
Date : 2026-03-18
Score : 62/100

## Resume executif

Le projet HuntZen beneficie d'une bonne base d'accessibilite grace a l'utilisation de shadcn/ui (Radix UI) pour les primitives (Dialog, Select, Button, etc.) qui gerent nativement le focus trapping, les roles ARIA et la navigation clavier. Un composant `SkipLink` existe et est integre dans le layout racine. Le dashboard utilise `<main id="main-content">` correctement. Cependant, plusieurs problemes significatifs subsistent : des indicateurs de focus manquants sur des elements interactifs custom, des icones sans labels, des dropdowns de navigation non accessibles au clavier, et des images de fond decoratives sans alternative textuelle.

---

## BLOQUANTS (usage impossible sans souris)

### B1 — Dropdowns navigation landing non accessibles au clavier
**Fichier:** `frontend-next/src/components/landing-header.tsx:116-168`
**Probleme:** Les menus "Outils" et "Ressources" dans le header de la landing s'ouvrent via `onClick` et `onMouseEnter` mais ne gerent pas la navigation clavier (touches fleches, Escape pour fermer, `aria-expanded`, `aria-haspopup`). Un utilisateur clavier ne peut pas naviguer dans les sous-menus.
**Impact:** Les liens vers Assistant, Analyse CV, Blog, FAQ, Temoignages sont inaccessibles au clavier depuis la landing page.

### B2 — Bouton Send du chat assistant sans label accessible
**Fichier:** `frontend-next/src/app/(dashboard)/assistant/page.tsx:829-840`
**Probleme:** Le bouton d'envoi de message contient uniquement une icone `<Send>` ou `<Loader2>` sans `aria-label`. Un screen reader annoncera simplement "button" sans contexte.
**Correction:** Ajouter `aria-label={t("sendMessage")}` sur le `<Button>`.

### B3 — Bouton Paperclip (joindre CV) sans aria-label suffisant
**Fichier:** `frontend-next/src/app/(dashboard)/assistant/page.tsx:789-802`
**Probleme:** Le bouton utilise `title="Joindre votre CV (PDF)"` mais pas d'`aria-label`. L'attribut `title` n'est pas systematiquement annonce par les screen readers.
**Correction:** Ajouter `aria-label="Joindre votre CV (PDF)"`.

---

## IMPORTANTS (usage difficile)

### I1 — ExpandableTextarea : outline-none sans focus-visible ring suffisant
**Fichier:** `frontend-next/src/components/ui/expandable-textarea.tsx:137`
**Probleme:** Le textarea utilise `outline-none` et fournit un `focus:ring-4 focus:ring-ocean-100` qui est un bleu tres clair (#dbeafe) sur fond blanc. Le ratio de contraste de cet indicateur de focus est insuffisant (environ 1.3:1) — il est presque invisible pour les utilisateurs avec une deficience visuelle legere.
**Correction:** Utiliser `focus-visible:ring-ocean-500` ou `focus-visible:ring-2 focus-visible:ring-ring` pour un contraste suffisant.

### I2 — Inputs custom dans search-form-inline : focus:outline-none avec focus:ring-2 custom
**Fichier:** `frontend-next/src/components/jobs/search-form-inline.tsx:272-286`
**Probleme:** Les inputs utilisent `focus:outline-none focus:ring-2 focus:ring-offset-0` avec `focus:ring-blue-500`. C'est fonctionnel mais le `ring-offset-0` peut rendre le focus ring difficile a distinguer du border. Le pattern est acceptable mais fragile.

### I3 — Bouton compteur de messages sans aria-label descriptif
**Fichier:** `frontend-next/src/app/(dashboard)/assistant/page.tsx:481-498`
**Probleme:** Le bouton affichant le compteur de messages (ex: "5 / 10") n'a pas d'`aria-label`. Un screen reader lira "5 / 10 button" sans contexte.

### I4 — Landing page : aucun landmark `<main>` ni `<nav>` semantique
**Fichier:** `frontend-next/src/app/page.tsx`
**Probleme:** La landing page n'utilise pas de balise `<main>`. Le contenu est dans un `<div className="min-h-screen">`. Le header utilise `<nav>` dans `landing-header.tsx` (ligne 95) ce qui est correct, mais la page elle-meme manque de `<main>`.
**Note:** Le dashboard a bien `<main id="main-content">` (layout.tsx:24-25).

### I5 — Icones Lucide sans aria-hidden dans la grille de features (landing)
**Fichier:** `frontend-next/src/app/page.tsx:530-533`
**Probleme:** Les icones dans la section "12 features" (`<Icon className="w-5 h-5 text-slate-600" />`) n'ont ni `aria-hidden="true"` ni `aria-label`. Lucide React ajoute `aria-hidden` par defaut, donc ce point est mineur, mais il faut verifier que c'est bien le cas avec la version installee.

---

## AMELIORATIONS (WCAG AA manque)

### A1 — Texte `text-white/50` sur fond dark dans le hero (landing)
**Fichier:** `frontend-next/src/app/page.tsx:129`
**Probleme:** `text-white/50` sur fond `bg-slate-900` donne un ratio d'environ 3.8:1 pour du texte normal. WCAG AA exige 4.5:1 pour le texte normal. Le texte du sous-titre hero ("subtitle") ne passe pas.
**Valeurs:** `rgba(255,255,255,0.5)` sur `#0f172a` => ratio ~3.8:1.
**Aussi concerne:** `text-white/40` (ligne 164, social proof) => ratio ~2.8:1 — echec net.

### A2 — Texte `text-white/60` dans le CTA final
**Fichier:** `frontend-next/src/app/page.tsx:678`
**Probleme:** `text-white/60` sur `bg-slate-900` donne un ratio d'environ 5.0:1 — celui-ci passe de justesse pour le texte normal mais est a la limite.

### A3 — Texte `text-white/70` dans la sidebar
**Fichier:** `frontend-next/src/components/layout/sidebar.tsx:208,240`
**Probleme:** `text-white/70` sur `bg-[#0D1F3C]` donne un ratio d'environ 6.5:1 — **OK pour le texte normal**. Mais `text-white/40` (ligne 208, section label) donne ~2.6:1 — echec.
**Concerne:** `text-white/50` pour l'email utilisateur (ligne 342) => ~3.5:1 — echec pour texte normal.

### A4 — Couleur `text-[#00D9FF]` (cyan) sur fond blanc insuffisante
**Fichier:** `frontend-next/src/app/page.tsx:232,290-299,604`
**Probleme:** `#00D9FF` sur fond blanc `#FFFFFF` donne un ratio de **2.5:1** — largement insuffisant pour du texte (4.5:1 requis) et pour les elements graphiques (3:1 requis). Utilise comme couleur de texte pour les numeros d'etapes, les CTA links, les valeurs de stats.
**Impact large:** Cette couleur est utilisee de maniere pervasive sur la landing et le dashboard.

### A5 — Bouton CTA orange sans contraste suffisant pour le texte
**Fichier:** `frontend-next/src/app/page.tsx:689`
**Probleme:** `bg-[#F97316]` (orange-500) avec `text-white` donne un ratio de **3.0:1** — insuffisant pour le texte normal (4.5:1 requis), mais acceptable pour le texte large/bold (3:1). Le texte ici est `text-base font-bold`, donc c'est a la limite.

### A6 — Formulaire de chat assistant : textarea sans label visible
**Fichier:** `frontend-next/src/app/(dashboard)/assistant/page.tsx:804-827`
**Probleme:** Le `ExpandableTextarea` n'a pas de `<label>` visible ni d'`aria-label` explicite. Il a un `placeholder` mais les placeholders ne remplacent pas les labels pour l'accessibilite.

### A7 — Input file cache sans label
**Fichier:** `frontend-next/src/app/(dashboard)/assistant/page.tsx:781-787`
**Probleme:** L'input file pour l'upload CV est `className="hidden"` avec `accept=".pdf"` mais n'a pas de label ni d'`aria-label`. Bien qu'il soit cache et declenche via un bouton, l'association semantique est manquante.

### A8 — Structure de titres incompletes sur la landing
**Fichier:** `frontend-next/src/app/page.tsx`
**Probleme:** La page a un `<h1>` (hero), puis des `<h2>` et `<h3>` dans les sections. La hierarchie semble correcte (h1 -> h2 -> h3). **OK globalement**, mais la section pricing delegate a `<LandingPricingSection />` qui pourrait introduire des sauts.

### A9 — Texte hardcode dans le dialog de changement d'assistant
**Fichier:** `frontend-next/src/app/(dashboard)/assistant/page.tsx:571-585`
**Probleme:** Le dialog contient du texte en francais hardcode ("Changer d'assistant ?", "Annuler") qui ne sera pas traduit pour les utilisateurs en anglais/espagnol/portugais. C'est aussi un probleme i18n.

### A10 — Pas de role="alert" sur les messages d'erreur du chat
**Fichier:** `frontend-next/src/app/(dashboard)/assistant/page.tsx:240-246`
**Probleme:** Quand une erreur survient dans le chat, le message est ajoute comme un message assistant normal sans `role="alert"` ni `aria-live="polite"`. Les screen readers ne seront pas notifies automatiquement.

### A11 — `prefers-reduced-motion` bien gere
**Fichier:** `frontend-next/src/app/globals.css:862-870`
**Observation positive:** La media query `prefers-reduced-motion: reduce` est implementee et desactive toutes les animations. C'est une bonne pratique.

### A12 — Pricing modal toggle (monthly/yearly) sans label accessible
**Fichier:** `frontend-next/src/components/freemium/pricing-modal.tsx:248`
**Probleme:** Le toggle mensuel/annuel utilise un `<button>` avec `focus:outline-none` et un `<span className="sr-only">` devrait etre present mais n'est pas visible dans le code lu. A verifier.

---

## CE QUI EST ACCESSIBLE

- [OK] **SkipLink** : composant `SkipLink` present dans `layout.tsx` (ligne 88), pointe vers `#main-content`, visible au focus avec style bien defini.
- [OK] **`<main id="main-content">`** : present dans le dashboard layout (ligne 24-25).
- [OK] **Dialog shadcn/Radix** : focus trapping, bouton close avec `<span className="sr-only">Close</span>`, Escape pour fermer, overlay cliquable. Conforme.
- [OK] **Select shadcn/Radix** : navigation clavier avec fleches, focus visible, roles ARIA natifs de Radix. Conforme.
- [OK] **Button shadcn** : `focus-visible:ring-[3px]` avec `focus-visible:border-ring` — excellent indicateur de focus. `aria-invalid` gere.
- [OK] **Input shadcn** : `focus-visible:ring-[3px]`, `aria-invalid` supporte, `disabled` avec opacite.
- [OK] **Sidebar navigation** : `aria-label` sur les boutons mobile (close, open, logout). Focus visible avec `focus-visible:ring-2` sur les liens footer.
- [OK] **SearchFormInline** : labels `sr-only` sur les inputs (`query-inline`, `query-mobile`), `aria-invalid` et `aria-describedby` vers les messages d'erreur, checkbox avec `htmlFor` correct.
- [OK] **ExpandableTextarea** : `aria-live="polite"` sur le compteur de caracteres, `role="alert"` sur le helper text en erreur.
- [OK] **`prefers-reduced-motion`** : gere globalement dans globals.css.
- [OK] **AlertDialog** (sidebar logout) : composant Radix natif, accessible.
- [OK] **Checkbox remote jobs** : `id` + `htmlFor` correctement lies dans SearchFormInline.
