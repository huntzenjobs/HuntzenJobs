# Sprint B — UI/UX 40→100 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Éliminer les 8 problèmes UI/UX critiques identifiés dans l'audit commercial (score 40/100 → 100/100) : error boundary, alert() → toast, silent errors, onboarding first-login, navigation, confirm destructive, pagination, mobile safe-area.

**Architecture:** Corrections ciblées fichier par fichier — aucune réécriture globale. B4 (onboarding) est la seule vraie nouvelle feature : route `/onboarding`, flag `user_metadata.onboarding_completed`, modifications auth-context + callback. Toutes les corrections B1-B3 et B5-B8 sont de l'amélioration sur des fichiers existants.

**Tech Stack:** Next.js 14 App Router, Supabase SSR, sonner (toasts), shadcn/ui AlertDialog, next-intl, Tailwind CSS, React 18

---

## Fichiers créés/modifiés

| Fichier | Tâche | Action |
|---------|-------|--------|
| `src/app/(dashboard)/error.tsx` | B1 | CRÉER |
| `src/app/onboarding/page.tsx` | B4 | CRÉER |
| `src/components/cv/cv-upload-async-wizard.tsx` | B2 + B3 | MODIFIER |
| `src/components/cv/cv-upload-async.tsx` | B2 | MODIFIER |
| `src/components/recruiter/recruiter-contact-modal.tsx` | B2 | MODIFIER |
| `src/app/(dashboard)/recruiter-contact/page.tsx` | B2 | MODIFIER |
| `src/app/(dashboard)/saved-jobs/page.tsx` | B5 + B6 + B8 | MODIFIER |
| `src/contexts/auth-context.tsx` | B4 | MODIFIER |
| `src/app/auth/callback/route.ts` | B4 | MODIFIER |
| `src/app/layout.tsx` | B7 | MODIFIER |
| `src/app/globals.css` | B7 | MODIFIER |
| `messages/fr.json` | B1 + B4 | MODIFIER |
| `messages/en.json` | B1 + B4 | MODIFIER |
| `messages/es.json` | B1 + B4 | MODIFIER |
| `messages/pt.json` | B1 + B4 | MODIFIER |

---

## Task 1: B1 — Dashboard error boundary

**Contexte :** Aucun `error.tsx` dans `(dashboard)/`. Si un composant crash (erreur JS non attrapée), l'utilisateur voit un écran blanc. Next.js App Router nécessite un `error.tsx` avec `"use client"` qui reçoit les props `error` et `reset`.

**Files:**
- Create: `frontend-next/src/app/(dashboard)/error.tsx`
- Modify: `frontend-next/messages/fr.json` (add `dashboard.error` namespace)
- Modify: `frontend-next/messages/en.json`
- Modify: `frontend-next/messages/es.json`
- Modify: `frontend-next/messages/pt.json`

- [ ] **Step 1: Ajouter les clés i18n dans les 4 fichiers de messages**

Dans `messages/fr.json`, ajouter dans le namespace `dashboard` :
```json
"error": {
  "title": "Oups, une erreur est survenue",
  "subtitle": "Quelque chose s'est mal passé. Tu peux réessayer ou retourner au tableau de bord.",
  "retry": "Réessayer",
  "back": "Retour aux offres"
}
```

Dans `messages/en.json` :
```json
"error": {
  "title": "Oops, something went wrong",
  "subtitle": "Something went wrong. You can try again or go back to jobs.",
  "retry": "Try again",
  "back": "Back to jobs"
}
```

Dans `messages/es.json` et `messages/pt.json` (contenu EN en placeholder) :
```json
"error": {
  "title": "Oops, something went wrong",
  "subtitle": "Something went wrong. You can try again or go back to jobs.",
  "retry": "Try again",
  "back": "Back to jobs"
}
```

- [ ] **Step 2: Créer `error.tsx`**

```typescript
"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import Link from "next/link";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("dashboard.error");

  useEffect(() => {
    // Sentry est déjà configuré dans le projet — capturer l'erreur
    import("@sentry/nextjs").then((Sentry) => Sentry.captureException(error));
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="text-center space-y-4 max-w-md">
        <div className="w-16 h-16 mx-auto rounded-full bg-red-50 flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900">{t("title")}</h2>
        <p className="text-gray-500">{t("subtitle")}</p>
        <div className="flex gap-3 justify-center">
          <Button onClick={reset} variant="outline">
            {t("retry")}
          </Button>
          <Button asChild>
            <Link href="/jobs">{t("back")}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Vérifier TypeScript**

```bash
cd frontend-next && npx tsc --noEmit
```
Attendu : 0 erreur.

- [ ] **Step 4: Commit**

```bash
git add frontend-next/src/app/\(dashboard\)/error.tsx \
        frontend-next/messages/fr.json \
        frontend-next/messages/en.json \
        frontend-next/messages/es.json \
        frontend-next/messages/pt.json
git commit -m "fix(ui): add dashboard error boundary with retry/back actions"
```

---

## Task 2: B2 — Remplacer alert() par toast.error()

**Contexte :** 7 occurrences de `alert()` natif dans 4 fichiers. Le projet utilise déjà `sonner` (`import { toast } from "sonner"`). `alert()` bloque le thread, n'est pas stylisé, casse l'UX mobile. Chaque fichier importe déjà `toast` ou l'on ajoute l'import.

**Files:**
- Modify: `frontend-next/src/components/cv/cv-upload-async-wizard.tsx` (4 occurrences)
- Modify: `frontend-next/src/components/cv/cv-upload-async.tsx` (1 occurrence)
- Modify: `frontend-next/src/components/recruiter/recruiter-contact-modal.tsx` (1 occurrence)
- Modify: `frontend-next/src/app/(dashboard)/recruiter-contact/page.tsx` (1 occurrence)

- [ ] **Step 1: Ajouter `import { toast } from "sonner"` dans les 4 fichiers**

Ces 4 fichiers n'ont pas encore l'import sonner. L'ajouter dans chacun, avec les autres imports, avant de remplacer les `alert()` :

Dans `cv-upload-async-wizard.tsx` (en haut, avec les imports existants) :
```typescript
import { toast } from "sonner";
```

Dans `cv-upload-async.tsx` :
```typescript
import { toast } from "sonner";
```

Dans `recruiter-contact-modal.tsx` :
```typescript
import { toast } from "sonner";
```

Dans `recruiter-contact/page.tsx` :
```typescript
import { toast } from "sonner";
```

- [ ] **Step 2: Modifier `cv-upload-async-wizard.tsx` — 4 occurrences**

Remplacement 1 (ligne ~431) :
```typescript
// AVANT
alert("Seuls les fichiers PDF sont acceptés");
// APRÈS
toast.error("Seuls les fichiers PDF sont acceptés");
```

Remplacement 2 (ligne ~679) :
```typescript
// AVANT
alert(
  `Cette analyse n'est pas encore terminée (status: ${data.status})`,
);
// APRÈS
toast.error(
  `Cette analyse n'est pas encore terminée (status: ${data.status})`,
);
```

Remplacement 3 (ligne ~685) :
```typescript
// AVANT
alert("Erreur lors du chargement de l'analyse");
// APRÈS
toast.error("Erreur lors du chargement de l'analyse");
```

Remplacement 4 (ligne ~1592) :
```typescript
// AVANT
alert("Erreur lors de l'export PDF");
// APRÈS
toast.error("Erreur lors de l'export PDF");
```

- [ ] **Step 3: Modifier `cv-upload-async.tsx` — 1 occurrence (ligne ~198)**

```typescript
// AVANT
alert("Seuls les fichiers PDF sont acceptés");
// APRÈS
toast.error("Seuls les fichiers PDF sont acceptés");
```

- [ ] **Step 4: Modifier `recruiter-contact-modal.tsx` — 1 occurrence (ligne ~93)**

```typescript
// AVANT
alert('Une erreur est survenue. Veuillez réessayer.');
// APRÈS
toast.error('Une erreur est survenue. Veuillez réessayer.');
```

- [ ] **Step 5: Modifier `recruiter-contact/page.tsx` — 1 occurrence (ligne ~140)**

```typescript
// AVANT
alert(t("form.error"));
// APRÈS
toast.error(t("form.error"));
```

- [ ] **Step 6: Vérifier qu'aucun `alert(` ne reste**

```bash
grep -rn "alert(" frontend-next/src/components/cv/ \
  frontend-next/src/app/\(dashboard\)/recruiter-contact/
```
Attendu : 0 résultat.

- [ ] **Step 7: TypeScript check**

```bash
cd frontend-next && npx tsc --noEmit
```

- [ ] **Step 8: Commit**

```bash
git add frontend-next/src/components/cv/cv-upload-async-wizard.tsx \
        frontend-next/src/components/cv/cv-upload-async.tsx \
        frontend-next/src/components/recruiter/recruiter-contact-modal.tsx \
        frontend-next/src/app/\(dashboard\)/recruiter-contact/page.tsx
git commit -m "fix(ui): replace native alert() with toast.error() in CV and recruiter components"
```

---

## Task 3: B3 — Silent catches → feedback utilisateur

**Contexte :** 3 blocs `catch` dans `cv-upload-async-wizard.tsx` logguent en console mais n'affichent rien à l'utilisateur. Résultat : l'app semble bloquée sans raison. Ajouter `toast.error()` sur chaque.

**Files:**
- Modify: `frontend-next/src/components/cv/cv-upload-async-wizard.tsx`

- [ ] **Step 1: Modifier catch #1 — loadHistory (ligne ~242)**

```typescript
// AVANT
} catch (error) {
  console.error("Failed to load CV history:", error);
}
// APRÈS
} catch (error) {
  console.error("Failed to load CV history:", error);
  toast.error("Impossible de charger l'historique des analyses");
}
```

- [ ] **Step 2: Modifier catch #2 — reloadHistory (ligne ~287)**

```typescript
// AVANT
} catch (error) {
  console.error("Failed to reload CV history:", error);
}
// APRÈS
} catch (error) {
  console.error("Failed to reload CV history:", error);
  toast.error("Impossible de rafraîchir l'historique");
}
```

- [ ] **Step 3: Modifier catch #3 — démarrage analyse (ligne ~608)**

```typescript
// AVANT
} catch (err) {
  console.error("Analysis error:", err);
}
// APRÈS
} catch (err) {
  console.error("Analysis error:", err);
  toast.error(
    err instanceof Error ? err.message : "Erreur lors du lancement de l'analyse"
  );
}
```

- [ ] **Step 4: TypeScript check**

```bash
cd frontend-next && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add frontend-next/src/components/cv/cv-upload-async-wizard.tsx
git commit -m "fix(ui): surface silent catch errors as toast.error in CV wizard"
```

---

## Task 4: B5 + B6 — saved-jobs navigation + confirmation suppression

**Contexte :**
- B5 : `window.location.href = "/login"` (ligne 135) et `window.location.href = "/jobs"` (ligne 250) dans `saved-jobs/page.tsx` causent un rechargement complet de page. Remplacer par `router.push()`.
- B6 : `handleRemoveSavedJob` supprime directement sans demander confirmation. Ajouter un `AlertDialog` de shadcn/ui. Le composant est déjà installé dans `src/components/ui/alert-dialog.tsx`.

**Files:**
- Modify: `frontend-next/src/app/(dashboard)/saved-jobs/page.tsx`

- [ ] **Step 1: Ajouter l'import `useRouter` et `AlertDialog`**

En haut du fichier, ajouter à l'import `next/navigation` :
```typescript
import { useRouter } from "next/navigation";
```

Ajouter les imports AlertDialog :
```typescript
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
```

- [ ] **Step 2: Ajouter le hook router**

Dans `SavedJobsPage()`, après les useState existants, ajouter :
```typescript
const router = useRouter();
```

- [ ] **Step 3: B5 — Remplacer window.location.href (ligne ~135)**

```typescript
// AVANT
onClick={() => (window.location.href = "/login")}
// APRÈS
onClick={() => router.push("/login")}
```

- [ ] **Step 4: B5 — Remplacer window.location.href (ligne ~250)**

```typescript
// AVANT
onClick={() => (window.location.href = "/jobs")}
// APRÈS
onClick={() => router.push("/jobs")}
```

- [ ] **Step 5: B6 — Ajouter les clés i18n pour la confirmation**

Dans `messages/fr.json`, dans le namespace `dashboard.savedJobs` :
```json
"confirmDeleteTitle": "Supprimer cette offre ?",
"confirmDeleteDescription": "Cette action est irréversible. L'offre sera retirée de tes sauvegardes.",
"confirmDeleteCancel": "Annuler",
"confirmDeleteConfirm": "Supprimer"
```

Dans `messages/en.json`, `messages/es.json`, `messages/pt.json` :
```json
"confirmDeleteTitle": "Remove this job?",
"confirmDeleteDescription": "This action cannot be undone. The job will be removed from your saved jobs.",
"confirmDeleteCancel": "Cancel",
"confirmDeleteConfirm": "Remove"
```

- [ ] **Step 6: B6 — Entourer le bouton Trash2 d'un AlertDialog**

Trouver le bouton qui appelle `handleRemoveSavedJob` et l'entourer :
```tsx
<AlertDialog>
  <AlertDialogTrigger asChild>
    <button
      className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
      title={t("delete")}
    >
      <Trash2 className="w-4 h-4" />
    </button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>{t("confirmDeleteTitle")}</AlertDialogTitle>
      <AlertDialogDescription>
        {t("confirmDeleteDescription")}
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>{t("confirmDeleteCancel")}</AlertDialogCancel>
      <AlertDialogAction
        onClick={() => handleRemoveSavedJob(job.id)}
        className="bg-red-500 hover:bg-red-600"
      >
        {t("confirmDeleteConfirm")}
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

- [ ] **Step 7: TypeScript check**

```bash
cd frontend-next && npx tsc --noEmit
```

- [ ] **Step 8: Commit**

```bash
git add frontend-next/src/app/\(dashboard\)/saved-jobs/page.tsx \
        frontend-next/messages/fr.json \
        frontend-next/messages/en.json \
        frontend-next/messages/es.json \
        frontend-next/messages/pt.json
git commit -m "fix(ui): replace window.location.href with router.push and add delete confirmation dialog in saved-jobs"
```

---

## Task 5: B8 — Pagination saved-jobs

**Contexte :** La query Supabase `.select("*").order("saved_at")` charge TOUS les jobs sans limite. Ajouter une pagination côté serveur avec Supabase `.range()`. Page size : 10. Afficher "Page X / Y" + boutons Précédent/Suivant.

**Files:**
- Modify: `frontend-next/src/app/(dashboard)/saved-jobs/page.tsx`

- [ ] **Step 1: Ajouter les constantes et états de pagination**

```typescript
const PAGE_SIZE = 10;
const [currentPage, setCurrentPage] = useState(1);
const [totalCount, setTotalCount] = useState(0);
```

- [ ] **Step 2: Mettre à jour `fetchSavedJobs` en `useCallback` avec `.range()` et `count`**

`fetchSavedJobs` doit être mémorisé avec `useCallback` pour éviter la violation `react-hooks/exhaustive-deps` dans le `useEffect` qui en dépend. L'ajouter à l'import React existant (`import { useEffect, useState, useCallback } from "react"` — vérifier qu'il y est déjà).

```typescript
const fetchSavedJobs = useCallback(async (page = 1) => {
  if (!user?.id) return;
  try {
    const supabase = createClient();
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error, count } = await supabase
      .from("saved_jobs")
      .select("*", { count: "exact" })
      .eq("user_id", user.id)
      .order("saved_at", { ascending: false })
      .range(from, to);

    if (error) throw error;

    setSavedJobs(data || []);
    setTotalCount(count || 0);
  } catch (error) {
    setSavedJobs([]);
  } finally {
    setLoading(false);
  }
}, [user?.id]);
```

- [ ] **Step 3: Mettre à jour l'appel useEffect**

```typescript
useEffect(() => {
  if (user) {
    fetchSavedJobs(currentPage);
    fetchDocuments();
  } else {
    setLoading(false);
  }
}, [user, currentPage, fetchDocuments, fetchSavedJobs]);
```

- [ ] **Step 4: Calculer les valeurs de pagination et corriger l'affichage du compteur**

```typescript
const totalPages = Math.ceil(totalCount / PAGE_SIZE);
```

**Important :** Dans le header de la page, le compteur affiche `savedJobs.length` (nombre de la page courante). Le remplacer par `totalCount` pour refléter le vrai nombre total :

```typescript
// Trouver la ligne qui ressemble à :
// {t("savedCount", { count: savedJobs.length })}
// et remplacer par :
{t("savedCount", { count: totalCount })}
```

Note : La recherche locale (`filteredJobs`) filtre uniquement les 10 jobs de la page courante — comportement acceptable pour ce sprint.

- [ ] **Step 5: Ajouter les clés i18n**

Dans `messages/fr.json`, dans `dashboard.savedJobs` :
```json
"pagination": {
  "page": "Page {current} sur {total}",
  "previous": "Précédent",
  "next": "Suivant",
  "count": "{count} offres sauvegardées"
}
```

Dans `messages/en.json`, `messages/es.json`, `messages/pt.json` :
```json
"pagination": {
  "page": "Page {current} of {total}",
  "previous": "Previous",
  "next": "Next",
  "count": "{count} saved jobs"
}
```

- [ ] **Step 6: Ajouter l'UI de pagination**

Après la liste des jobs (avant la fin du return), ajouter :

```tsx
{totalPages > 1 && (
  <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-200">
    <p className="text-sm text-slate-500">
      {t("pagination.count", { count: totalCount })}
    </p>
    <div className="flex items-center gap-3">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
        disabled={currentPage === 1}
      >
        {t("pagination.previous")}
      </Button>
      <span className="text-sm text-slate-600">
        {t("pagination.page", { current: currentPage, total: totalPages })}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
        disabled={currentPage === totalPages}
      >
        {t("pagination.next")}
      </Button>
    </div>
  </div>
)}
```

- [ ] **Step 7: TypeScript check**

```bash
cd frontend-next && npx tsc --noEmit
```

- [ ] **Step 8: Commit**

```bash
git add frontend-next/src/app/\(dashboard\)/saved-jobs/page.tsx \
        frontend-next/messages/fr.json \
        frontend-next/messages/en.json \
        frontend-next/messages/es.json \
        frontend-next/messages/pt.json
git commit -m "feat(ui): add server-side pagination to saved-jobs (PAGE_SIZE=10)"
```

---

## Task 6: B4 — Onboarding premier login

**Contexte :** Zéro onboarding actuellement. Après signup/OAuth, l'utilisateur atterrit directement sur `/jobs` sans context. Design validé : **une seule question** (poste + ville), plein écran, style Typeform. Flag `user_metadata.onboarding_completed` dans Supabase pour différencier nouveaux vs anciens users. Fonctionne pour les 3 flows : signup email (session immédiate), Google OAuth, confirmation email.

**Files:**
- Create: `frontend-next/src/app/onboarding/page.tsx`
- Modify: `frontend-next/src/contexts/auth-context.tsx` (ligne ~367 — signUpWithEmail)
- Modify: `frontend-next/src/app/auth/callback/route.ts` (ligne ~68 — finalRedirect)
- Modify: `frontend-next/messages/fr.json`, `en.json`, `es.json`, `pt.json`

- [ ] **Step 1: Ajouter les clés i18n (namespace `onboarding`)**

Dans `messages/fr.json` (à la racine du JSON, nouveau namespace) :
```json
"onboarding": {
  "title": "Bienvenue sur HuntZen ! 👋",
  "subtitle": "Dis-nous ce que tu cherches pour personnaliser tes offres.",
  "jobTitle": {
    "label": "Quel poste tu cherches ?",
    "placeholder": "Ex : Développeur React, Designer UX, Chef de projet..."
  },
  "location": {
    "label": "Dans quelle ville ?",
    "placeholder": "Ex : Paris, Lyon, Remote..."
  },
  "cta": "Voir mes offres →",
  "skip": "Passer pour l'instant"
}
```

Dans `messages/en.json` :
```json
"onboarding": {
  "title": "Welcome to HuntZen! 👋",
  "subtitle": "Tell us what you're looking for to personalize your job results.",
  "jobTitle": {
    "label": "What role are you looking for?",
    "placeholder": "e.g. React Developer, UX Designer, Project Manager..."
  },
  "location": {
    "label": "In which city?",
    "placeholder": "e.g. London, Remote, New York..."
  },
  "cta": "Show my jobs →",
  "skip": "Skip for now"
}
```

Dans `messages/es.json` et `messages/pt.json` (copie EN en placeholder) : même contenu que EN.

- [ ] **Step 2: Créer `src/app/onboarding/page.tsx`**

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { motion } from "framer-motion";

export default function OnboardingPage() {
  const t = useTranslations("onboarding");
  const router = useRouter();
  const [jobTitle, setJobTitle] = useState("");
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(false);

  // Guard: if already onboarded (manual navigation), redirect immediately.
  // isChecking prevents flash of form before redirect resolves.
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const check = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.user_metadata?.onboarding_completed) {
        router.replace("/jobs");
      } else {
        setIsChecking(false);
      }
    };
    check();
  }, [router]);

  if (isChecking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900" />
    );
  }

  const markOnboardingDone = async () => {
    const supabase = createClient();
    await supabase.auth.updateUser({
      data: { onboarding_completed: true },
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await markOnboardingDone();
      const params = new URLSearchParams();
      if (jobTitle) params.set("q", jobTitle);
      if (location) params.set("location", location);
      router.push(`/jobs${params.toString() ? `?${params}` : ""}`);
    } catch {
      router.push("/jobs");
    }
  };

  const handleSkip = async () => {
    await markOnboardingDone();
    router.push("/jobs");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-lg"
      >
        {/* Logo */}
        <div className="text-center mb-10">
          <span className="text-3xl font-black text-white">
            Hunt<span className="text-[#00D9FF]">Zen</span>
          </span>
        </div>

        <div className="bg-white/5 backdrop-blur-md rounded-3xl p-8 border border-white/10">
          <h1 className="text-3xl font-black text-white mb-2">{t("title")}</h1>
          <p className="text-gray-400 mb-8">{t("subtitle")}</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <Label
                htmlFor="jobTitle"
                className="text-gray-300 font-medium mb-2 block"
              >
                {t("jobTitle.label")}
              </Label>
              <Input
                id="jobTitle"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder={t("jobTitle.placeholder")}
                className="bg-white/10 border-white/20 text-white placeholder:text-gray-500 h-12 text-base focus:border-[#00D9FF] focus:ring-[#00D9FF]"
                autoFocus
              />
            </div>

            <div>
              <Label
                htmlFor="location"
                className="text-gray-300 font-medium mb-2 block"
              >
                {t("location.label")}
              </Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder={t("location.placeholder")}
                className="bg-white/10 border-white/20 text-white placeholder:text-gray-500 h-12 text-base focus:border-[#00D9FF] focus:ring-[#00D9FF]"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 text-base font-bold bg-[#00D9FF] hover:bg-[#00C4EA] text-white mt-4"
            >
              {t("cta")}
            </Button>
          </form>

          <div className="text-center mt-4">
            <button
              onClick={handleSkip}
              className="text-gray-500 hover:text-gray-400 text-sm transition-colors"
            >
              {t("skip")}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
```

- [ ] **Step 3: Modifier `auth-context.tsx` — signUpWithEmail (ligne ~366)**

```typescript
// AVANT (dans signUpWithEmail)
if (data?.session) {
  router.push("/jobs");
} else {
  router.push("/signup?success=true&email=" + encodeURIComponent(email));
}

// APRÈS
if (data?.session) {
  const isNewUser = !data.session.user.user_metadata?.onboarding_completed;
  router.push(isNewUser ? "/onboarding" : "/jobs");
} else {
  router.push("/signup?success=true&email=" + encodeURIComponent(email));
}
```

- [ ] **Step 4: Modifier `auth/callback/route.ts` — finalRedirect (ligne ~67)**

```typescript
// AVANT
const finalRedirect =
  redirectTo && redirectTo.startsWith("/") ? redirectTo : "/jobs";

// APRÈS
const isNewUser = !data.user.user_metadata?.onboarding_completed;
const defaultRedirect = isNewUser ? "/onboarding" : "/jobs";
const finalRedirect =
  redirectTo && redirectTo.startsWith("/") ? redirectTo : defaultRedirect;
```

- [ ] **Step 5: Protéger `/onboarding` dans le middleware (optionnel mais recommandé)**

Dans `middleware.ts`, vérifier que `/onboarding` n'est pas dans `protectedRoutes` (il ne devrait pas l'être, car l'user vient d'être authentifié via le callback avant d'arriver là). Vérifier également que `/onboarding` n'est pas dans `authRoutes` (pour ne pas redirecter un user connecté vers `/jobs` avant qu'il ait complété l'onboarding).

```typescript
// Ligne ~207 — authRoutes doit rester : ["/login", "/signup"] uniquement
// /onboarding ne doit PAS être dans cette liste
const authRoutes = ["/login", "/signup"];
```

- [ ] **Step 6: TypeScript check**

```bash
cd frontend-next && npx tsc --noEmit
```
Attendu : 0 erreur.

- [ ] **Step 7: Commit**

```bash
git add frontend-next/src/app/onboarding/page.tsx \
        frontend-next/src/contexts/auth-context.tsx \
        frontend-next/src/app/auth/callback/route.ts \
        frontend-next/messages/fr.json \
        frontend-next/messages/en.json \
        frontend-next/messages/es.json \
        frontend-next/messages/pt.json
git commit -m "feat(onboarding): add first-login wizard with job/location personalization"
```

---

## Task 7: B7 — Mobile safe-area + viewport

**Contexte :** Les appareils avec encoche (iPhone 12+) et barre d'accueil nécessitent `viewport-fit=cover` + `env(safe-area-inset-*)`. Sans ça, le contenu peut passer sous la barre d'accueil. En Next.js 14 App Router, le viewport est géré via l'export `viewport` (séparé de `metadata`).

**Files:**
- Modify: `frontend-next/src/app/layout.tsx`
- Modify: `frontend-next/src/app/globals.css`

- [ ] **Step 1: Vérifier l'export `viewport` actuel dans layout.tsx**

```bash
grep -n "viewport" frontend-next/src/app/layout.tsx
```

Si aucun export `viewport` n'existe (il est peut-être dans `homeMetadata`), l'ajouter.

- [ ] **Step 2: Ajouter l'export `viewport` dans `layout.tsx`**

```typescript
import type { Metadata, Viewport } from "next";

// Ajouter cet export (séparé de metadata)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",    // ← clé pour les encoches iPhone
  themeColor: "#00D9FF",
};
```

- [ ] **Step 2b: Supprimer la `<meta name="theme-color">` dupliquée dans `layout.tsx`**

Le fichier `layout.tsx` contient déjà `<meta name="theme-color" content="#00D9FF" />` à la ligne ~44 dans le `<head>`. Maintenant que l'export `viewport` le gère, cette balise duplique la valeur et cause un warning Next.js. La supprimer :

```typescript
// SUPPRIMER cette ligne dans <head> :
<meta name="theme-color" content="#00D9FF" />
```

- [ ] **Step 3: Ajouter les utilitaires safe-area dans `globals.css`**

Ajouter à la fin du fichier :

```css
/* =========================================
   MOBILE SAFE AREA — iPhone notch + home bar
   ========================================= */
@layer utilities {
  .pb-safe {
    padding-bottom: env(safe-area-inset-bottom);
  }
  .pt-safe {
    padding-top: env(safe-area-inset-top);
  }
  .pl-safe {
    padding-left: env(safe-area-inset-left);
  }
  .pr-safe {
    padding-right: env(safe-area-inset-right);
  }
  .mb-safe {
    margin-bottom: env(safe-area-inset-bottom);
  }
}
```

- [ ] **Step 4: Appliquer `pb-safe` à la sidebar et au layout dashboard**

Chercher le composant Sidebar bas (footer de la sidebar) :
```bash
grep -n "fixed\|bottom-0\|sidebar.*footer\|nav.*bottom" \
  frontend-next/src/components/layout/sidebar.tsx 2>/dev/null || \
grep -rn "pb-4\|pb-6\|pb-8" frontend-next/src/app/\(dashboard\)/layout.tsx 2>/dev/null
```

Pour tout élément fixé en bas (bottom navigation, sidebar footer), ajouter `pb-safe` à la className Tailwind existante.

- [ ] **Step 5: TypeScript check**

```bash
cd frontend-next && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add frontend-next/src/app/layout.tsx \
        frontend-next/src/app/globals.css
git commit -m "fix(mobile): add viewport-fit=cover and safe-area CSS utilities for iPhone notch support"
```

---

## Validation finale

- [ ] **Lint global**

```bash
cd frontend-next && npm run lint
```
Attendu : 0 erreur, 0 warning.

- [ ] **TypeScript global**

```bash
cd frontend-next && npx tsc --noEmit
```
Attendu : 0 erreur.

- [ ] **Tests Vitest**

```bash
cd frontend-next && npm run test:run
```
Attendu : tests existants toujours verts (aucun nouveau test ajouté — les bugs fixes sont vérifiables manuellement).

- [ ] **Vérification manuelle B1** : Provoquer une erreur JS dans un composant dashboard → voir l'écran "Oups" avec bouton retry.

- [ ] **Vérification manuelle B2/B3** : Uploader un fichier non-PDF → voir toast.error (plus d'alert bloquant).

- [ ] **Vérification manuelle B4** : Créer un nouveau compte → être redirigé vers `/onboarding` → remplir/skipper → atterrir sur `/jobs` (pré-filtré si rempli). Se reconnecter avec ce compte → aller directement sur `/jobs` (pas de re-onboarding).

- [ ] **Vérification manuelle B6** : Cliquer sur Trash2 → AlertDialog apparaît → Annuler ne supprime pas → Confirmer supprime.

- [ ] **Vérification manuelle B8** : Avoir > 10 saved jobs → pagination apparaît → navigation fonctionne.

---

## Ordre d'exécution recommandé

1. **Task 1** (B1 — error.tsx) — 15 min, zéro risque
2. **Task 2** (B2 — alert → toast) — 20 min, zéro risque
3. **Task 3** (B3 — silent catches) — 10 min, zéro risque
4. **Task 4** (B5+B6 — saved-jobs) — 20 min, faible risque
5. **Task 5** (B8 — pagination) — 25 min, modifier la query Supabase
6. **Task 6** (B4 — onboarding) — 45 min, nouvelle feature + modifications auth
7. **Task 7** (B7 — mobile) — 15 min, CSS + viewport meta
