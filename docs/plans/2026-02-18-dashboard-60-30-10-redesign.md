# Dashboard 60/30/10 Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remplacer le dark mode du dashboard par un système 60/30/10 fixe : 60% White, 30% Ocean Navy #0D1F3C (sidebar), 10% Cyan #00D9FF (accents).

**Architecture:** Sidebar = seule zone navy. Tout le reste = fond blanc pur, typographie slate, accents cyan. Suppression totale des classes `dark:` dans les fichiers dashboard.

**Tech Stack:** Next.js 14, Tailwind CSS, shadcn/ui, Framer Motion

---

## COLOR TOKENS DE RÉFÉRENCE

```
OCEAN NAVY  : #0D1F3C   (sidebar bg, 30%)
WHITE       : #FFFFFF   (main content bg, cards, 60%)
CYAN        : #00D9FF   (accents, CTAs, active, 10%)

Texte sur blanc   : text-slate-900 (heading) / text-slate-600 (body) / text-slate-400 (muted)
Texte sur navy    : text-white (primary) / text-white/70 (secondary) / text-white/40 (muted)
Border sur blanc  : border-slate-100 ou border-slate-200
Border sur navy   : border-white/10
Shadow cards      : shadow-sm
```

---

## Task 1 : layout.tsx — Fond blanc dashboard

**File:** `frontend-next/src/app/(dashboard)/layout.tsx`

**Changement unique :**
```tsx
// AVANT
<div className="min-h-screen bg-gray-50 dark:bg-gray-900">

// APRÈS
<div className="min-h-screen bg-white">
```

**Commit:** `style(layout): apply white bg, remove dark mode from dashboard wrapper`

---

## Task 2 : sidebar.tsx — Navy #0D1F3C complet

**File:** `frontend-next/src/components/layout/sidebar.tsx`

**Remplacements (dans l'ordre d'apparition) :**

### 2.1 — SidebarContent wrapper (ligne ~144)
```tsx
// AVANT
<div className="flex flex-col h-full bg-white dark:bg-gray-800">
// APRÈS
<div className="flex flex-col h-full bg-[#0D1F3C]">
```

### 2.2 — Header border (ligne ~149)
```tsx
// AVANT
className="sidebar-header flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700"
// APRÈS
className="sidebar-header flex items-center justify-between p-6 border-b border-white/10"
```

### 2.3 — Mobile close button (ligne ~160)
```tsx
// AVANT
className="lg:hidden text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
// APRÈS
className="lg:hidden text-white/70 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors"
```

### 2.4 — Nav section label (ligne ~174)
```tsx
// AVANT
className="nav-section-label block text-gray-500 dark:text-gray-400 text-[0.65rem] font-bold tracking-widest px-3 mb-4"
// APRÈS
className="nav-section-label block text-white/40 text-[0.65rem] font-bold tracking-widest px-3 mb-4"
```

### 2.5 — Nav item link (inactive/active, ligne ~200-204)
```tsx
// AVANT (inactive)
"text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-black dark:hover:text-white"
// APRÈS (inactive)
"text-white/70 hover:bg-white/8 hover:text-white"

// AVANT (active)
"bg-[#00D9FF]/10 dark:bg-[#00D9FF]/20 text-black dark:text-white"
// APRÈS (active)
"bg-[#00D9FF]/15 text-white"
```

### 2.6 — Nav icon (ligne ~221-225)
```tsx
// AVANT
isActive ? "text-[#00D9FF]" : "text-gray-600 dark:text-gray-400 group-hover:text-[#00D9FF]"
// APRÈS
isActive ? "text-[#00D9FF]" : "text-white/50 group-hover:text-[#00D9FF]"
```

### 2.7 — "Mon Utilisation" button (ligne ~253)
```tsx
// AVANT
className="nav-item flex items-center gap-3 px-4 py-3 mb-1 rounded-xl text-sm font-medium transition-all text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-black dark:hover:text-white w-full group"
// APRÈS
className="nav-item flex items-center gap-3 px-4 py-3 mb-1 rounded-xl text-sm font-medium transition-all text-white/70 hover:bg-white/8 hover:text-white w-full group"
```

### 2.8 — "Mon Utilisation" icon (ligne ~255)
```tsx
// AVANT
className="w-5 h-5 text-gray-600 dark:text-gray-400 group-hover:text-[#00D9FF] transition-colors"
// APRÈS
className="w-5 h-5 text-white/50 group-hover:text-[#00D9FF] transition-colors"
```

### 2.9 — Usage summary block (ligne ~270)
```tsx
// AVANT
className="px-4 rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600"
// APRÈS
className="px-4 rounded-xl bg-white/5 border border-white/10"
```

Wait, this is: `className="p-4 rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600"`
```tsx
// APRÈS
className="p-4 rounded-xl bg-white/5 border border-white/10"
```

### 2.10 — User section border (ligne ~276)
```tsx
// AVANT
<div className="px-4 py-4 border-t border-gray-200 dark:border-gray-700">
// APRÈS
<div className="px-4 py-4 border-t border-white/10">
```

### 2.11 — Profile link hover (ligne ~293)
```tsx
// AVANT
className="flex items-center gap-3 px-3 py-2.5 mb-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer group"
// APRÈS
className="flex items-center gap-3 px-3 py-2.5 mb-3 rounded-xl hover:bg-white/8 transition-colors cursor-pointer group"
```

### 2.12 — Avatar div (ligne ~295)
```tsx
// AVANT
className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center group-hover:bg-[#00D9FF]/10 dark:group-hover:bg-[#00D9FF]/20 transition-colors border border-gray-200 dark:border-gray-600"
// APRÈS
className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-[#00D9FF]/15 transition-colors border border-white/10"
```

### 2.13 — Avatar icon (ligne ~296, inside User icon)
```tsx
// AVANT
className="w-5 h-5 text-gray-600 dark:text-gray-400 group-hover:text-[#00D9FF] transition-colors"
// APRÈS
className="w-5 h-5 text-white/60 group-hover:text-[#00D9FF] transition-colors"
```

### 2.14 — User name (ligne ~300)
```tsx
// AVANT
className="text-sm font-semibold text-black dark:text-white truncate group-hover:text-[#00D9FF] transition-colors"
// APRÈS
className="text-sm font-semibold text-white truncate group-hover:text-[#00D9FF] transition-colors"
```

### 2.15 — User email (ligne ~317)
```tsx
// AVANT
className="text-xs text-gray-500 dark:text-gray-400 truncate"
// APRÈS
className="text-xs text-white/50 truncate"
```

### 2.16 — "Not logged in" text (ligne ~329)
```tsx
// AVANT
className="text-sm text-gray-600 dark:text-gray-400 mb-3"
// APRÈS
className="text-sm text-white/60 mb-3"
```

### 2.17 — Signup button (ligne ~341-344)
```tsx
// AVANT
className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-black dark:text-white text-sm font-semibold hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors border border-gray-200 dark:border-gray-600"
// APRÈS
className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-white/10 text-white text-sm font-semibold hover:bg-white/15 transition-colors border border-white/20"
```

### 2.18 — Lock icon (ligne ~236)
```tsx
// AVANT
className="w-4 h-4 text-gray-400 dark:text-gray-500"
// APRÈS
className="w-4 h-4 text-white/30"
```

### 2.19 — Footer border (ligne ~367)
```tsx
// AVANT
<div className="sidebar-footer px-4 py-3 border-t border-gray-200 dark:border-gray-700">
// APRÈS
<div className="sidebar-footer px-4 py-3 border-t border-white/10">
```

### 2.20 — Theme label (ligne ~370)
```tsx
// AVANT
<span className="text-sm font-medium text-gray-600 dark:text-gray-400">
// APRÈS
<span className="text-sm font-medium text-white/60">
```

### 2.21 — Footer nav links (Tarifs, Aide, Retour — lignes ~378-400)
```tsx
// AVANT
className="... text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-black dark:hover:text-white ..."
// APRÈS
className="... text-white/60 hover:bg-white/8 hover:text-white ..."
```
Appliquer sur les 3 liens (Crown/Tarifs, HelpCircle/Aide, ArrowLeft/Retour).

### 2.22 — Logout button (ligne ~405)
```tsx
// AVANT
className="... text-gray-600 dark:text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 ..."
// APRÈS
className="... text-white/60 hover:bg-red-500/10 hover:text-red-400 ..."
```

### 2.23 — Supprimer ThemeToggleSimple
Retirer le bloc "Thème" complet (div + span + ThemeToggleSimple) car le dark mode n'existe plus dans le dashboard. Supprimer aussi l'import `ThemeToggleSimple`.

**Commit:** `style(sidebar): apply #0D1F3C ocean navy theme, remove dark mode variants`

---

## Task 3 : jobs/page.tsx — Fond blanc, slate typography

**File:** `frontend-next/src/app/(dashboard)/jobs/page.tsx`

**Règle générale pour TOUTES les pages :**
- `bg-gray-50` → `bg-slate-50` ou `bg-white`
- `bg-white dark:bg-gray-800` → `bg-white`
- `dark:bg-gray-*` → supprimer la variante dark entière
- `text-gray-900 dark:text-white` → `text-slate-900`
- `text-gray-600 dark:text-gray-400` → `text-slate-600`
- `text-gray-500 dark:text-gray-400` → `text-slate-500`
- `border-gray-200 dark:border-gray-700` → `border-slate-200`
- `dark:border-gray-*` → supprimer variante dark
- Garder tous les `text-[#00D9FF]`, `bg-[#00D9FF]`, gradients cyan

**Commit:** `style(jobs): remove dark mode, apply 60/30/10 white theme`

---

## Task 4 : cv-analysis/page.tsx — Fond blanc

**File:** `frontend-next/src/app/(dashboard)/cv-analysis/page.tsx`

Appliquer les mêmes règles que Task 3.

**Commit:** `style(cv-analysis): remove dark mode, apply 60/30/10 white theme`

---

## Task 5 : assistant/page.tsx — Fond blanc

**File:** `frontend-next/src/app/(dashboard)/assistant/page.tsx`

Appliquer les mêmes règles que Task 3.

**Commit:** `style(assistant): remove dark mode, apply 60/30/10 white theme`

---

## Task 6 : salons/page.tsx — Fond blanc

**File:** `frontend-next/src/app/(dashboard)/salons/page.tsx`

Appliquer les mêmes règles que Task 3.

**Commit:** `style(salons): remove dark mode, apply 60/30/10 white theme`

---

## Task 7 : saved-jobs/page.tsx — Fond blanc

**File:** `frontend-next/src/app/(dashboard)/saved-jobs/page.tsx`

Appliquer les mêmes règles que Task 3.

**Commit:** `style(saved-jobs): remove dark mode, apply 60/30/10 white theme`

---

## Task 8 : recruiter-contact/page.tsx — Fond blanc

**File:** `frontend-next/src/app/(dashboard)/recruiter-contact/page.tsx`

Appliquer les mêmes règles que Task 3.

**Commit:** `style(recruiter-contact): remove dark mode, apply 60/30/10 white theme`

---

## Task 9 : profile/page.tsx — Fond blanc

**File:** `frontend-next/src/app/(dashboard)/profile/page.tsx`

Appliquer les mêmes règles que Task 3.

**Commit:** `style(profile): remove dark mode, apply 60/30/10 white theme`

---

## Task 10 : Push final

```bash
git push origin Production
```

---

## CHECKLIST QUALITÉ (après implémentation)

- [ ] Sidebar est navy #0D1F3C sur toutes les pages
- [ ] Fond main content = blanc pur (pas gray-50)
- [ ] Aucun `dark:` restant dans les 9 fichiers
- [ ] Textes lisibles (slate-900/600/400 sur blanc)
- [ ] Accents cyan #00D9FF visibles et cohérents
- [ ] ThemeToggleSimple retiré du sidebar
- [ ] Mobile menu sidebar aussi navy
