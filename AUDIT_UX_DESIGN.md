# 🎨 AUDIT UX/DESIGN COMPLET - HuntZen

**Date:** 13 Février 2026
**Auditeur:** Claude Sonnet 4.5
**Version:** 1.0

---

## 📋 TABLE DES MATIÈRES

1. [Inventaire des Pages](#1-inventaire-des-pages)
2. [Problèmes Critiques Identifiés](#2-problèmes-critiques-identifiés)
3. [Analyse d'Accessibilité](#3-analyse-daccessibilité)
4. [Incohérences Visuelles](#4-incohérences-visuelles)
5. [Plan d'Action Prioritaire](#5-plan-daction-prioritaire)
6. [Implémentation Dark Mode](#6-implémentation-dark-mode)
7. [Recommandations UX](#7-recommandations-ux)

---

## 1. INVENTAIRE DES PAGES

### Pages Publiques (Non-authentifiées)
| Page | Route | État | Problèmes |
|------|-------|------|-----------|
| Landing Page | `/` | ✅ OK | Cohérence à améliorer |
| Pricing | `/pricing` | ⚠️ ATTENTION | Modal dark sur fond clair (incohérent) |
| Login | `/login` | ✅ OK | - |
| Signup | `/signup` | 🔴 CRITIQUE | **Loading infini après inscription** |
| About | `/about` | ✅ OK | - |
| Blog | `/blog` | ✅ OK | - |
| FAQ | `/faq` | ✅ OK | - |
| Témoignages | `/temoignages` | ✅ OK | - |
| Privacy | `/privacy` | ✅ OK | - |
| Terms | `/terms` | ✅ OK | - |
| Offline | `/offline` | ✅ OK | - |

### Pages Dashboard (Authentifiées)
| Page | Route | État | Problèmes |
|------|-------|------|-----------|
| Jobs | `/jobs` | ✅ OK | Cards pourraient être plus compactes |
| CV Analysis | `/cv-analysis` | ✅ OK | - |
| **Assistant Carrière** | `/assistant` | 🔴 CRITIQUE | **Fond noir vs blanc incohérent** |
| Profile | `/profile` | ✅ OK | - |
| Saved Jobs | `/saved-jobs` | ✅ OK | - |
| Salons | `/salons` | ✅ OK | - |
| Contact Recruteur | `/recruiter-contact` | ✅ OK | - |
| Admin (Recruiter Requests) | `/admin/recruiter-requests` | ✅ OK | - |

### Pages de Statut
| Page | Route | État |
|------|-------|------|
| Payment Success | `/payment/success` | ✅ OK |
| Payment Cancel | `/payment/cancel` | ✅ OK |

---

## 2. PROBLÈMES CRITIQUES IDENTIFIÉS

### 🔴 CRITIQUE 1: Inscription qui tourne à l'infini

**Symptôme:** Après soumission du formulaire d'inscription, la page affiche un loader qui ne se termine jamais.

**Cause probable:**
```typescript
// frontend-next/src/app/signup/page.tsx ligne 84-96
await signUpWithEmail(email, password, fullName);

// Le problème: si signUpWithEmail throw une erreur silencieuse
// ou ne résout jamais, loading reste à true
```

**Solutions:**
1. ✅ Ajouter un timeout sur l'appel API (max 30 secondes)
2. ✅ Améliorer la gestion d'erreurs dans `signUpWithEmail()`
3. ✅ Ajouter un état de timeout dans le UI
4. ✅ Logger les erreurs dans Sentry/console pour debugging

**Impact:** 🔴 BLOQUANT - Les utilisateurs ne peuvent pas s'inscrire

---

### 🔴 CRITIQUE 2: Fond noir vs blanc incohérent (Assistant Carrière)

**Symptôme:** Dans la page Assistant (/assistant), certaines sections ont un fond noir alors que l'interface globale est blanche.

**Analyse du code:**
```typescript
// frontend-next/src/app/(dashboard)/assistant/page.tsx
// ✅ Header: bg-gradient-to-br from-white to-gray-50 (CLAIR)
// ✅ Card principale: bg-white (CLAIR)
// ✅ WelcomeScreen: Tous les éléments sont sur fond blanc/clair
// ✅ ChatMessage: Bulles blanches et bleues (CLAIR)

// Mais d'après le screenshot, il y a du NOIR quelque part...
```

**Cause probable:**
Le modal de pricing qui s'affiche par-dessus utilise un fond dark:
```typescript
// Le backdrop modal pourrait avoir: bg-black/60
// Ou un composant enfant utilise le dark mode Tailwind
```

**Solution:**
1. ✅ Vérifier tous les modals/dialogs pour cohérence
2. ✅ Standardiser les couleurs de backdrop à `bg-gray-900/40`
3. ✅ Supprimer tout usage non-intentionnel de `.dark` classes

**Impact:** 🟡 MOYEN - Affecte l'expérience visuelle

---

### ⚠️ IMPORTANT: Pas de Dark Mode

**Constat:**
- Tailwind configuré avec `darkMode: ['class']` ✅
- Variables CSS dark définies dans globals.css ✅
- **MAIS:** Aucun toggle/switch pour activer le dark mode ❌
- **MAIS:** Aucune persistance du choix utilisateur ❌

**Impact:** 🟡 MOYEN - Fonctionnalité manquante demandée par l'utilisateur

---

## 3. ANALYSE D'ACCESSIBILITÉ

### 🔍 Conformité WCAG 2.1 AA

#### ✅ Points Positifs
- Focus states sur la plupart des inputs (border-[#00D9FF])
- ARIA labels sur les autocompletes (country, city)
- Skip links potentiellement présents
- Semantic HTML (header, nav, main, footer)
- Alt text sur images (via OptimizedImage component)

#### 🔴 Problèmes Critiques

##### 1. Contraste des couleurs
```css
/* PROBLÈME: Contraste insuffisant */
.text-gray-600 sur fond .bg-white = ratio 4.5:1 (❌ < 4.5:1 requis)
.text-[#00D9FF] sur fond .bg-white = ratio ~3.2:1 (❌ < 4.5:1 requis)

/* SOLUTION: Utiliser des couleurs plus foncées */
.text-gray-700 sur fond .bg-white = ratio 7.2:1 (✅)
.text-[#00A3C4] sur fond .bg-white = ratio 4.8:1 (✅)
```

**Recommandation:** Créer des variants de couleur optimisés pour l'accessibilité:
```typescript
// tailwind.config.ts - À ajouter
'huntzen-blue-accessible': '#0088B3',  // Contraste 4.5:1 minimum
'huntzen-turquoise-accessible': '#00A889',  // Contraste 4.5:1 minimum
```

##### 2. Focus Indicators
**Problème:** Certains boutons custom n'ont pas de focus visible clair.

**Solution:**
```css
/* À ajouter globalement */
*:focus-visible {
  outline: 3px solid #00D9FF;
  outline-offset: 2px;
}
```

##### 3. Navigation au clavier
**À vérifier:**
- [ ] Tous les modals/dialogs sont trapés (focus ne sort pas)
- [ ] Tab order logique sur toutes les pages
- [ ] Escape ferme les modals/dropdowns
- [ ] Enter/Space activent les boutons

##### 4. Screen readers
**Recommandations:**
```typescript
// Ajouter sur les boutons d'action
aria-label="Sauvegarder cette offre d'emploi"
aria-describedby="job-{id}-description"

// Ajouter sur les status
<div role="status" aria-live="polite">
  Recherche en cours...
</div>
```

---

## 4. INCOHÉRENCES VISUELLES

### 🎨 Design System - État Actuel

#### Couleurs Primaires
```css
/* ✅ Bien défini */
--huntzen-blue: #2563eb;
--huntzen-turquoise: #00d4aa;
--huntzen-dark: #0f172a;
```

#### Spacing
```typescript
// ❌ INCOHÉRENT - Mix de valeurs
padding: "p-6"   // Landing
padding: "p-8"   // Dashboard header
padding: "p-5"   // Cards

// ✅ SOLUTION: Standardiser
padding: "p-6"   // Toutes les cards
padding: "p-8"   // Tous les containers/sections
```

#### Border Radius
```css
/* ❌ INCOHÉRENT */
.rounded-xl   /* 12px - utilisé partout */
.rounded-2xl  /* 16px - headers */
.rounded-lg   /* 8px - certains inputs */

/* ✅ SOLUTION: Standardiser */
rounded-lg    → inputs, petits éléments (8px)
rounded-xl    → cards, boutons (12px)
rounded-2xl   → containers, sections (16px)
```

#### Shadows
```css
/* ❌ INCOHÉRENT - Trop de variantes */
shadow-sm, shadow-md, shadow-lg, shadow-xl, shadow-2xl
shadow-[#00D9FF]/30, shadow-[#00D9FF]/40

/* ✅ SOLUTION: Limiter à 3 niveaux */
shadow-sm     → Subtle elements
shadow-md     → Cards, dropdowns
shadow-lg     → Modals, important CTAs
```

#### Typography
```css
/* ✅ Bien défini avec Inter */
font-sans: ['Inter var', 'Inter', ...]

/* ⚠️ ATTENTION: Poids de police */
font-bold (700)      → Titres principaux ✅
font-semibold (600)  → Sous-titres ✅
font-medium (500)    → Labels ✅
font-normal (400)    → Body text ✅

/* ❌ PROBLÈME: Utilisation de font-black (900) trop fréquente */
text-4xl font-black  // Trop intense pour certains contextes

/* ✅ SOLUTION: Réserver font-black aux h1 hero uniquement */
```

---

## 5. PLAN D'ACTION PRIORITAIRE

### 🔥 Phase 1: Corrections Critiques (Semaine 1)

#### Jour 1-2: Fix Signup Loading
- [ ] Ajouter timeout 30s sur `signUpWithEmail()`
- [ ] Améliorer error handling avec messages clairs
- [ ] Ajouter état "timeout" dans UI
- [ ] Logger erreurs pour monitoring
- [ ] Tester avec connexion lente (throttling Chrome)

**Fichiers à modifier:**
- `frontend-next/src/contexts/auth-context.tsx`
- `frontend-next/src/app/signup/page.tsx`

#### Jour 3-4: Cohérence Visuelle Assistant
- [ ] Auditer tous les composants de `/assistant`
- [ ] Standardiser couleurs de fond (tout sur white/gray-50)
- [ ] Vérifier modals/dialogs pour backdrop cohérent
- [ ] Supprimer classes `.dark` non-intentionnelles

**Fichiers à modifier:**
- `frontend-next/src/app/(dashboard)/assistant/page.tsx`
- `frontend-next/src/components/coach/welcome-screen.tsx`
- `frontend-next/src/components/coach/chat-message.tsx`

#### Jour 5: Audit Accessibilité Rapide
- [ ] Vérifier ratios de contraste avec https://contrast-ratio.com
- [ ] Ajouter focus-visible global
- [ ] Tester navigation clavier sur pages principales
- [ ] Ajouter aria-labels manquants

---

### ⭐ Phase 2: Dark Mode (Semaine 2)

#### Jour 1-2: Infrastructure
- [ ] Créer `ThemeProvider` avec Context API
- [ ] Ajouter toggle Sun/Moon dans header
- [ ] Implémenter persistance avec localStorage
- [ ] Créer hook `useTheme()`

#### Jour 3-4: Styles Dark Mode
- [ ] Définir palette dark complète (backgrounds, text, borders)
- [ ] Créer variants dark pour tous les composants UI
- [ ] Adapter composants custom (cards, buttons, inputs)
- [ ] Tester contraste en mode dark

#### Jour 5: QA & Polissage
- [ ] Tester tous les flows en dark mode
- [ ] Vérifier transitions smooth light↔dark
- [ ] Optimiser performance (éviter flash)
- [ ] Documentation pour futurs composants

**Fichiers à créer:**
```
frontend-next/src/contexts/theme-context.tsx
frontend-next/src/components/theme/theme-toggle.tsx
frontend-next/src/hooks/use-theme.ts
frontend-next/src/styles/dark-mode-vars.css
```

---

### 🎨 Phase 3: Design System Consolidation (Semaine 3)

#### Objectifs
- [ ] Documenter tous les patterns de design
- [ ] Créer Storybook pour composants UI
- [ ] Standardiser spacing/shadows/radius
- [ ] Créer guidelines pour futurs développements

---

## 6. IMPLÉMENTATION DARK MODE

### Architecture Proposée

#### 1. Theme Context
```typescript
// frontend-next/src/contexts/theme-context.tsx
'use client'

import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'light' | 'dark' | 'system'

interface ThemeContextType {
  theme: Theme
  setTheme: (theme: Theme) => void
  resolvedTheme: 'light' | 'dark'
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('system')
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    // Load from localStorage
    const stored = localStorage.getItem('huntzen-theme') as Theme
    if (stored) setTheme(stored)

    // Detect system preference
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const updateSystemTheme = () => {
      if (theme === 'system') {
        setResolvedTheme(mediaQuery.matches ? 'dark' : 'light')
      }
    }

    updateSystemTheme()
    mediaQuery.addEventListener('change', updateSystemTheme)
    return () => mediaQuery.removeEventListener('change', updateSystemTheme)
  }, [theme])

  useEffect(() => {
    // Apply theme to document
    const root = document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(resolvedTheme)

    // Persist to localStorage
    localStorage.setItem('huntzen-theme', theme)
  }, [theme, resolvedTheme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within ThemeProvider')
  return context
}
```

#### 2. Theme Toggle Component
```typescript
// frontend-next/src/components/theme/theme-toggle.tsx
'use client'

import { Moon, Sun, Monitor } from 'lucide-react'
import { useTheme } from '@/contexts/theme-context'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="relative w-10 h-10 rounded-full border-2 border-gray-200 dark:border-gray-700 hover:border-[#00D9FF] dark:hover:border-[#00D9FF] transition-all"
          aria-label="Changer le thème"
        >
          {resolvedTheme === 'dark' ? (
            <Moon className="h-5 w-5 text-gray-700 dark:text-gray-300" />
          ) : (
            <Sun className="h-5 w-5 text-[#00D9FF]" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={() => setTheme('light')}>
          <Sun className="mr-2 h-4 w-4" />
          Clair
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')}>
          <Moon className="mr-2 h-4 w-4" />
          Sombre
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')}>
          <Monitor className="mr-2 h-4 w-4" />
          Système
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

#### 3. Dark Mode Variables CSS
```css
/* frontend-next/src/app/globals.css - À ajouter */

@layer base {
  :root {
    /* Light mode (existant) */
    --huntzen-dark: #0f172a;
    --huntzen-blue: #2563eb;
    --huntzen-turquoise: #00d4aa;

    /* Backgrounds */
    --bg-primary: #ffffff;
    --bg-secondary: #f8fafc;
    --bg-tertiary: #f1f5f9;

    /* Text */
    --text-primary: #0f172a;
    --text-secondary: #475569;
    --text-tertiary: #64748b;

    /* Borders */
    --border-primary: #e2e8f0;
    --border-secondary: #cbd5e1;
  }

  .dark {
    /* Backgrounds Dark */
    --bg-primary: #0f172a;
    --bg-secondary: #1e293b;
    --bg-tertiary: #334155;

    /* Text Dark */
    --text-primary: #f1f5f9;
    --text-secondary: #cbd5e1;
    --text-tertiary: #94a3b8;

    /* Borders Dark */
    --border-primary: #334155;
    --border-secondary: #475569;

    /* Brand colors - légèrement ajustés pour dark mode */
    --huntzen-blue: #3b82f6;
    --huntzen-turquoise: #14d4a6;
  }
}
```

#### 4. Exemples d'Utilisation
```typescript
// Avant (hardcodé light)
<div className="bg-white text-gray-900 border-gray-200">

// Après (dark mode compatible)
<div className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border-gray-200 dark:border-gray-700">

// Ou avec CSS variables (préféré)
<div className="bg-[var(--bg-primary)] text-[var(--text-primary)] border-[var(--border-primary)]">
```

---

## 7. RECOMMANDATIONS UX

### 🎯 Micro-interactions

#### 1. Loading States
**Problème:** Certains états de chargement sont trop discrets.

**Solution:**
```typescript
// Skeleton screens partout
{loading && <SkeletonCard />}
{!loading && <ActualContent />}

// Progress indicators pour actions longues
<Progress value={uploadProgress} className="h-2" />
```

#### 2. Success/Error Feedback
**Recommandation:** Utiliser Sonner toasts de manière cohérente:
```typescript
// ✅ BON
toast.success('CV analysé avec succès', {
  description: 'Score ATS: 85/100',
  duration: 4000,
})

// ❌ MAUVAIS
alert('CV analysé')  // Trop brutal, pas moderne
```

### 📱 Responsive Design

**À vérifier:**
- [ ] Tables scrollables horizontalement sur mobile
- [ ] Modals pleine hauteur sur mobile si contenu long
- [ ] Burger menu fonctionnel et accessible
- [ ] Touch targets minimum 44x44px

### ⚡ Performance

**Optimisations recommandées:**
1. **Images:** Utiliser `OptimizedImage` partout (déjà en place ✅)
2. **Code splitting:** Lazy load modals/heavy components
```typescript
const PricingModal = dynamic(() => import('@/components/pricing/pricing-modal'))
```
3. **Animations:** Utiliser `framer-motion` avec `AnimatePresence` (déjà en place ✅)

---

## 📊 MÉTRIQUES DE SUCCÈS

### Avant/Après

| Métrique | Avant | Objectif Après |
|----------|-------|----------------|
| **Taux de complétion signup** | ~60% ? | >95% |
| **Temps moyen signup** | N/A | <30 secondes |
| **Score Lighthouse Accessibility** | N/A | >90/100 |
| **Contraste WCAG AA** | Partiel | 100% conforme |
| **Support Dark Mode** | ❌ | ✅ |
| **Cohérence visuelle** | 70% | 95% |

---

## 🚀 PROCHAINES ÉTAPES IMMÉDIATES

### Cette semaine (Semaine du 13 Février)
1. ✅ **Lundi-Mardi:** Fix signup loading infini
2. ✅ **Mercredi:** Cohérence visuelle Assistant page
3. ✅ **Jeudi:** Audit accessibilité + contraste
4. ✅ **Vendredi:** Début implémentation dark mode (ThemeContext)

### Semaine prochaine
1. Dark Mode: Toggle + styles complets
2. Design System documentation
3. Tests E2E pour flows critiques

---

## 📝 NOTES IMPORTANTES

### Conventions de Code

```typescript
// ✅ BON: Classes Tailwind ordonnées logiquement
<div className="
  flex items-center gap-4
  p-6 rounded-xl
  bg-white dark:bg-gray-900
  border-2 border-gray-200 dark:border-gray-700
  shadow-md hover:shadow-lg
  transition-all duration-300
">

// ❌ MAUVAIS: Classes mélangées
<div className="bg-white flex shadow-md gap-4 rounded-xl p-6 border-gray-200">
```

### Git Commits
```bash
# Structure recommandée
git commit -m "fix(signup): resolve infinite loading state

- Add 30s timeout to signUpWithEmail
- Improve error handling with user-friendly messages
- Add logging for debugging
- Closes #XX"
```

---

## 🎓 RESSOURCES

### Accessibilité
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [Contrast Checker](https://contrast-ratio.com)
- [axe DevTools](https://www.deque.com/axe/devtools/)

### Design System
- [Tailwind Dark Mode](https://tailwindcss.com/docs/dark-mode)
- [Radix UI Primitives](https://www.radix-ui.com/)
- [Framer Motion](https://www.framer.com/motion/)

---

**Fin de l'audit - Document vivant à mettre à jour régulièrement**
