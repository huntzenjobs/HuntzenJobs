# 🎨 Guide Logo Adaptatif - HuntZen Jobs

**Date:** 2026-02-12
**Status:** Logos temporaires SVG créés
**Action requise:** Remplacer par vos vrais logos

---

## 📁 Fichiers Logo Actuels

### Emplacement: `/frontend-next/public/`

```
public/
├── logo.png              ← ANCIEN (à garder pour rétrocompatibilité)
├── logo-light.svg        ← NOUVEAU - Logo CYAN pour fonds SOMBRES
├── logo-dark.svg         ← NOUVEAU - Logo NOIR pour fonds CLAIRS
└── og-image.svg          ← Image Open Graph pour SEO
```

---

## 🎯 Utilisation Automatique

### Composant `AdaptiveLogo`

Le logo s'adapte automatiquement selon le contexte:

| Context                  | Logo utilisé      | Couleur |
|-------------------------|-------------------|---------|
| Header transparent      | `logo-light.svg`  | Cyan    |
| Header blanc (scrolled) | `logo-dark.svg`   | Noir    |
| Sidebar                 | `logo-dark.svg`   | Noir    |
| Page auth (transparent) | `logo-light.svg`  | Cyan    |

**Code:**
```tsx
// Fond sombre → Logo cyan
<AdaptiveLogo isDark={false} size="lg" showText showPulse />

// Fond clair → Logo noir
<AdaptiveLogo isDark={true} size="md" showText />
```

---

## 🔄 Comment Remplacer les Logos

### Option 1: Remplacer les SVG existants (RECOMMANDÉ)

**Avantages:**
- Taille fichier minimale
- Scalable à l'infini
- Modifications faciles

**Étapes:**

1. **Créer vos logos dans Figma/Illustrator/Inkscape**

2. **Exporter en SVG:**
   - Dimension: 200x200px (ou carrée)
   - Optimiser pour le web
   - Supprimer métadonnées inutiles

3. **Créer 2 versions:**

   **`logo-light.svg`** - Pour fonds SOMBRES
   ```svg
   <!-- Utiliser #00D9FF (cyan) ou blanc #FFFFFF -->
   <svg width="200" height="200" ...>
     <!-- Votre logo en CYAN/BLANC -->
   </svg>
   ```

   **`logo-dark.svg`** - Pour fonds CLAIRS
   ```svg
   <!-- Utiliser #000000 (noir) ou gris foncé -->
   <svg width="200" height="200" ...>
     <!-- Votre logo en NOIR -->
   </svg>
   ```

4. **Remplacer les fichiers:**
   ```bash
   # Copier vos nouveaux logos
   cp votre-logo-light.svg frontend-next/public/logo-light.svg
   cp votre-logo-dark.svg frontend-next/public/logo-dark.svg
   ```

5. **Tester:**
   ```bash
   cd frontend-next
   npm run dev
   ```

   Vérifier:
   - Page d'accueil (scroll pour voir changement)
   - Pages login/signup
   - Dashboard sidebar

---

### Option 2: Utiliser des PNG (si vous préférez)

**Inconvénients:**
- Fichiers plus lourds
- Qualité pixelisée sur Retina
- Moins flexible

**Étapes:**

1. **Créer 2 PNG:**
   - Dimension: 400x400px minimum (pour Retina)
   - Format: PNG avec transparence
   - Optimiser avec TinyPNG

2. **Modifier le composant:**

   Ouvrir: `frontend-next/src/components/ui/adaptive-logo.tsx`

   Ligne 60, remplacer:
   ```tsx
   src={isDark ? "/logo-dark.svg" : "/logo-light.svg"}
   ```

   Par:
   ```tsx
   src={isDark ? "/logo-dark.png" : "/logo-light.png"}
   ```

3. **Placer les fichiers:**
   ```bash
   cp votre-logo-light.png frontend-next/public/logo-light.png
   cp votre-logo-dark.png frontend-next/public/logo-dark.png
   ```

---

## 🎨 Spécifications Techniques

### Logo Light (fonds sombres)

**Couleurs recommandées:**
- Primaire: `#00D9FF` (cyan HuntZen)
- Secondaire: `#FFFFFF` (blanc)
- Accent: `#00C4EA` (cyan foncé)

**Contextes d'utilisation:**
- Header transparent (page d'accueil)
- Pages auth (login/signup)
- Fonds noirs/gris foncés
- Backgrounds gradients sombres

**Test de contraste:**
- Minimum WCAG AA: 4.5:1
- Sur fond `#1a1a1a` → Ratio: 11.2:1 ✅

---

### Logo Dark (fonds clairs)

**Couleurs recommandées:**
- Primaire: `#000000` (noir)
- Secondaire: `#1a1a1a` (gris très foncé)
- Accent: `#2d2d2d` (gris foncé)

**Contextes d'utilisation:**
- Header scrollé (fond blanc)
- Sidebar dashboard
- Backgrounds blancs/gris clairs
- Mobile header

**Test de contraste:**
- Minimum WCAG AA: 4.5:1
- Sur fond `#FFFFFF` → Ratio: 21:1 ✅

---

## 🔍 Validation & Tests

### Checklist de validation

Avant de considérer vos logos comme finaux:

- [ ] **Visibilité sur fonds sombres** (logo-light.svg)
  - Tester sur: noir #000000, gris #1a1a1a, bleu foncé
  - Contraste suffisant (4.5:1 minimum)

- [ ] **Visibilité sur fonds clairs** (logo-dark.svg)
  - Tester sur: blanc #FFFFFF, gris clair #f5f5f5
  - Contraste suffisant (4.5:1 minimum)

- [ ] **Dimensions cohérentes**
  - Ratio 1:1 (carré)
  - Même taille visuelle entre light et dark

- [ ] **Details préservés**
  - Lisible à 16x16px (favicon)
  - Lisible à 200x200px (header)

- [ ] **Performance**
  - SVG < 10KB optimisé
  - PNG < 50KB optimisé

---

## 🖼️ Exemples de Bons Logos Adaptatifs

### Inspiration (marques connues)

**Apple:**
- Light: Logo blanc monochrome
- Dark: Logo noir monochrome
- Simplicité maximale

**Stripe:**
- Light: Logo bleu/blanc
- Dark: Logo noir
- Garde l'identité de marque

**GitHub:**
- Light: Logo blanc avec Octocat
- Dark: Logo noir avec Octocat
- Icône reconnaissable

**Vercel:**
- Light: Triangle blanc
- Dark: Triangle noir
- Géométrie pure

---

## 🛠️ Outils Recommandés

### Design

1. **Figma** (gratuit)
   - https://figma.com
   - Templates logo gratuits
   - Export SVG optimisé

2. **Inkscape** (gratuit, open-source)
   - https://inkscape.org
   - Outil vectoriel professionnel

3. **Canva** (freemium)
   - https://canva.com
   - Templates logo simples

### Optimisation

1. **SVGOMG** (SVG)
   - https://jakearchibald.github.io/svgomg/
   - Optimise SVG sans perte qualité

2. **TinyPNG** (PNG)
   - https://tinypng.com
   - Compression PNG lossless

3. **Squoosh** (PNG/WebP)
   - https://squoosh.app
   - Outil Google pour optimiser images

---

## 🎓 Conseils de Design

### DO ✅

- **Simplicité:** Logo doit être reconnaissable à 16px
- **Cohérence:** Même forme entre light et dark
- **Contraste:** Toujours tester sur vrais backgrounds
- **Scalabilité:** Vectoriel (SVG) préféré
- **Identité:** Garder les éléments clés de la marque

### DON'T ❌

- **Trop de détails:** Illisible en petit
- **Dégradés complexes:** Problèmes de contraste
- **Texte minuscule:** Utiliser `showText` du composant
- **Couleurs flashy:** Respecter palette HuntZen
- **Logos différents:** Light et dark doivent être cohérents

---

## 🚨 Problèmes Courants

### "Le logo ne change pas quand je scroll"

**Solution:**
1. Vider cache navigateur (Cmd+Shift+R)
2. Vérifier que les fichiers SVG existent
3. Vérifier console pour erreurs 404

### "Logo pixelisé sur écran Retina"

**Solution:**
- Utiliser SVG (recommandé)
- OU PNG 2x (400x400px minimum)

### "Logo trop grand/petit"

**Solution:**
Modifier la taille dans le composant:

```tsx
// Petit
<AdaptiveLogo size="sm" />  // 48x48px

// Moyen
<AdaptiveLogo size="md" />  // 64x64px

// Grand
<AdaptiveLogo size="lg" />  // 80x80px

// Très grand
<AdaptiveLogo size="xl" />  // 96x96px
```

### "Besoin d'une couleur custom"

**Solution:**

Ajouter une prop `logoColor` au composant:

```tsx
// frontend-next/src/components/ui/adaptive-logo.tsx

// Ajouter prop
logoColor?: string

// Utiliser
<AdaptiveLogo logoColor="#FF0000" />
```

---

## 📞 Support

**Fichiers à modifier:**
- Logo: `frontend-next/public/logo-*.svg`
- Composant: `frontend-next/src/components/ui/adaptive-logo.tsx`
- Header: `frontend-next/src/components/landing-header.tsx`
- Sidebar: `frontend-next/src/components/layout/sidebar.tsx`

**Documentation:**
- Next.js Image: https://nextjs.org/docs/app/api-reference/components/image
- SVG Optimization: https://web.dev/optimize-svgs/

---

**Dernière mise à jour:** 2026-02-12
**Version:** 1.0
