# Sidebar Reload + Subscription Toast Fix — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Éliminer le re-render visuel de la sidebar et le toast "Chargement de votre abonnement" qui apparaît à tort à chaque login.

**Architecture:** 3 fixes chirurgicaux dans 3 fichiers. Pas de refactoring structurel. Aucune nouvelle dépendance.

**Tech Stack:** React 18, Next.js 14 App Router, next-intl, Framer Motion, Supabase Auth

---

## Task 1 — Fix race condition : `isLoading: true` immédiat dans `fetchSubscription`

**Fichier :** `frontend-next/src/hooks/use-subscription-api.ts`

**Problème :** `fetchSubscription` ne set jamais `isLoading: true` avant le fetch réseau.
Quand l'utilisateur se connecte, il y a une fenêtre de ~100ms où :
`auth.session !== null` ET `isLoading = false` ET `subscription = null` → toast affiché à tort.

**Localisation exacte :** ligne ~168 (juste avant `const response = await fetch(...)`)

**Step 1 : Lire le fichier pour trouver la ligne exacte**

```bash
grep -n "Fetch from backend\|process.env.NEXT_PUBLIC_BACKEND_URL\|const response = await fetch" \
  frontend-next/src/hooks/use-subscription-api.ts
```

Attendu : ligne autour de 168–175.

**Step 2 : Ajouter `isLoading: true` immédiat**

Trouver ce bloc dans `fetchSubscription` (juste après le check `if (!session?.access_token)`) :

```ts
      // Fetch from backend
      if (!process.env.NEXT_PUBLIC_BACKEND_URL) {
        throw new Error("NEXT_PUBLIC_BACKEND_URL is not configured");
      }

      const response = await fetch(
```

Remplacer par :

```ts
      // Signal loading immediately — prevents race condition where
      // auth.session is set but isLoading is still false from previous state
      setData((prev) => ({ ...prev, isLoading: true, error: null }));

      // Fetch from backend
      if (!process.env.NEXT_PUBLIC_BACKEND_URL) {
        throw new Error("NEXT_PUBLIC_BACKEND_URL is not configured");
      }

      const response = await fetch(
```

**Step 3 : Vérifier que TypeScript compile**

```bash
cd frontend-next && npx tsc --noEmit 2>&1 | grep -v "__tests__"
```

Attendu : aucune erreur.

**Step 4 : Commit**

```bash
git add frontend-next/src/hooks/use-subscription-api.ts
git commit -m "fix(subscription): set isLoading:true immediately on fetch start to prevent race condition toast"
```

---

## Task 2 — Fix boucle de re-render : ref pattern dans `useSubscriptionSync`

**Fichier :** `frontend-next/src/hooks/use-subscription-api.ts`

**Problème :** `useSubscriptionSync` a `[refetch]` dans ses deps. `refetch` est recréé à chaque render
→ le listener `subscription-changed` est retiré et ré-enregistré sans cesse
→ logs `[SubscriptionSync] Event listener removed / registered` répétés
→ cascade de re-renders → Framer Motion rejoue les animations → sidebar "recharge"

**Localisation exacte :** lignes 358–393 (function `useSubscriptionSync`)

**Step 1 : Remplacer `useSubscriptionSync` entièrement**

Trouver la fonction complète :

```ts
export function useSubscriptionSync() {
  const { refetch } = useSubscriptionApi();

  useEffect(() => {
    const handleSubscriptionChange = () => {
      console.log("[SubscriptionSync] Subscription changed event detected");

      // Clear localStorage cache immediately
      localStorage.removeItem(CACHE_KEY);
      localStorage.removeItem(CACHE_EXPIRY_KEY);

      // Refetch fresh data from API
      refetch();

      console.log("[SubscriptionSync] Cache invalidated and refetch triggered");
    };

    // Listen for custom subscription-changed event
    // Dispatched from payment/success page after Stripe webhook processes
    window.addEventListener("subscription-changed", handleSubscriptionChange);

    console.log("[SubscriptionSync] Event listener registered");

    return () => {
      window.removeEventListener(
        "subscription-changed",
        handleSubscriptionChange,
      );
      console.log("[SubscriptionSync] Event listener removed");
    };
  }, [refetch]);

  return {
    invalidateCache: refetch,
  };
}
```

Remplacer par :

```ts
export function useSubscriptionSync() {
  const { refetch } = useSubscriptionApi();

  // Keep ref always up-to-date so the listener can call the latest refetch
  // without needing to re-register itself every time refetch changes
  const refetchRef = useRef<() => Promise<void>>(refetch);
  useEffect(() => {
    refetchRef.current = refetch;
  });

  // Register listener ONCE — never re-registers even if refetch changes
  useEffect(() => {
    const handleSubscriptionChange = () => {
      console.log("[SubscriptionSync] Subscription changed event detected");
      localStorage.removeItem(CACHE_KEY);
      localStorage.removeItem(CACHE_EXPIRY_KEY);
      refetchRef.current();
      console.log("[SubscriptionSync] Cache invalidated and refetch triggered");
    };

    window.addEventListener("subscription-changed", handleSubscriptionChange);

    return () => {
      window.removeEventListener(
        "subscription-changed",
        handleSubscriptionChange,
      );
    };
  }, []); // empty deps — registers exactly once on mount

  return {
    invalidateCache: refetch,
  };
}
```

**Step 2 : Vérifier que `useRef` est déjà importé**

```bash
grep "useRef" frontend-next/src/hooks/use-subscription-api.ts | head -3
```

Si `useRef` n'est pas dans les imports ligne 3, l'ajouter :
```ts
import { useState, useEffect, useCallback, useRef } from "react";
```
(Il y est déjà selon la ligne 3 du fichier — vérifier quand même.)

**Step 3 : TypeScript check**

```bash
cd frontend-next && npx tsc --noEmit 2>&1 | grep -v "__tests__"
```

**Step 4 : Commit**

```bash
git add frontend-next/src/hooks/use-subscription-api.ts
git commit -m "fix(subscription): stabilize subscription-changed listener with useRef pattern (prevent listener churn)"
```

---

## Task 3 — Fix inconsistency check : retirer `apiData.refetch` des deps

**Fichier :** `frontend-next/src/contexts/subscription-context.tsx`

**Problème :** `apiData.refetch` est dans le tableau de deps du useEffect "inconsistency check" (ligne 259).
Si `refetch` change de référence (ce qu'on a stabilisé en Task 2 mais pas entièrement),
le useEffect se re-déclenche et peut afficher le toast ou logger le warning à tort.

**Step 1 : Ajouter un ref pour `apiData.refetch`**

Trouver dans `subscription-context.tsx` la ligne qui déclare les autres refs/states (autour de ligne 85-97),
et ajouter juste après les `useState` :

```ts
  // Stable ref for refetch — avoids re-triggering inconsistency check when refetch changes
  const refetchRef = useRef<(() => Promise<void>) | undefined>(apiData.refetch);
  useEffect(() => {
    refetchRef.current = apiData.refetch;
  });
```

**Step 2 : Dans le useEffect inconsistency check, remplacer `apiData.refetch?.()` par `refetchRef.current?.()`**

Trouver (autour de ligne 238-241) :
```ts
      // Auto-refetch after 5 seconds if not an error
      if (!isApiError) {
        setTimeout(() => {
          console.log("[SUBSCRIPTION] Auto-refetching subscription data...");
          apiData.refetch?.();
        }, 5000);
      }
```

Remplacer par :
```ts
      // Auto-refetch after 5 seconds if not an error
      if (!isApiError) {
        setTimeout(() => {
          console.log("[SUBSCRIPTION] Auto-refetching subscription data...");
          refetchRef.current?.();
        }, 5000);
      }
```

**Step 3 : Retirer `apiData.refetch` du tableau de deps (ligne ~259)**

Trouver :
```ts
  }, [
    auth?.session,
    apiData.subscription,
    apiData.isLoading,
    apiData.error,
    hasShownInconsistencyWarning,
    freemium.plan,
    apiData.refetch,
  ]);
```

Remplacer par :
```ts
  }, [
    auth?.session,
    apiData.subscription,
    apiData.isLoading,
    apiData.error,
    hasShownInconsistencyWarning,
    freemium.plan,
    // apiData.refetch intentionally omitted — accessed via refetchRef to prevent
    // this effect from re-running every time refetch changes reference
  ]);
```

**Step 4 : Vérifier que `useRef` est importé dans subscription-context.tsx**

```bash
grep "useRef" frontend-next/src/contexts/subscription-context.tsx | head -3
```

Si absent, l'ajouter aux imports React en haut du fichier.

**Step 5 : TypeScript check**

```bash
cd frontend-next && npx tsc --noEmit 2>&1 | grep -v "__tests__"
```

**Step 6 : Commit**

```bash
git add frontend-next/src/contexts/subscription-context.tsx
git commit -m "fix(subscription): remove apiData.refetch from inconsistency check deps (use ref instead)"
```

---

## Task 4 — Fix animations Framer Motion : retirer `initial` des éléments toujours montés

**Fichier :** `frontend-next/src/components/layout/sidebar.tsx`

**Problème :** Les éléments suivants ont `initial={{ opacity: 0, ... }}`.
Framer Motion rejoue l'animation `initial → animate` à chaque re-render du composant.
Sur mobile, `touchstart` déclenche des re-renders fréquents → sidebar clignote sans cesse.

**Éléments concernés (toujours montés, pas de montage/démontage conditionnel) :**
- Ligne ~155 : header `motion.div` (`initial={{ opacity: 0, y: -10 }}`)
- Ligne ~179 : label nav section `motion.span` (`initial={{ opacity: 0 }}`)
- Ligne ~193 : chaque nav item `motion.div` (`initial={{ opacity: 0, x: -20 }}`)
- Ligne ~251 : bouton "Mon Utilisation" `motion.button` (`initial={{ opacity: 0, x: -20 }}`)
- Ligne ~271 : usage summary `motion.div` (`initial={{ opacity: 0, y: 10 }}`) — conditionnel OK mais animé inutilement
- Ligne ~292 : user section `motion.div` (`initial={{ opacity: 0, y: 10 }}`) — re-render au login

**Règle :** Garder `initial` UNIQUEMENT sur :
- Le menu mobile (`AnimatePresence` → montage/démontage conditionnel = ok)
- `layoutId="activeTab"` (indicateur actif — ok, c'est un layout animation)

**Step 1 : Retirer `initial` du header**

Trouver :
```tsx
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="sidebar-header flex items-center justify-between p-6 border-b border-white/10"
      >
```

Remplacer par :
```tsx
      <div className="sidebar-header flex items-center justify-between p-6 border-b border-white/10">
```
(simple `div` — le header n'a pas besoin d'animation Framer Motion)

**Step 2 : Retirer `initial` du label section nav**

Trouver :
```tsx
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="nav-section-label block text-white/40 text-[0.65rem] font-bold tracking-widest px-3 mb-4"
          >
            {t("label")}
          </motion.span>
```

Remplacer par :
```tsx
          <span className="nav-section-label block text-white/40 text-[0.65rem] font-bold tracking-widest px-3 mb-4">
            {t("label")}
          </span>
```

**Step 3 : Retirer `initial` des nav items (map)**

Trouver (dans le `.map()`) :
```tsx
              <motion.div
                key={item.name}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
              >
```
et sa fermeture :
```tsx
              </motion.div>
```

Remplacer par :
```tsx
              <div key={item.name}>
```
et :
```tsx
              </div>
```

**Step 4 : Retirer `initial` du bouton "Mon Utilisation"**

Trouver :
```tsx
            <motion.button
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: navigation.length * 0.05 }}
              onClick={() => {
```

Remplacer par :
```tsx
            <button
              onClick={() => {
```

Et la balise fermante `</motion.button>` → `</button>`.

**Step 5 : Retirer `initial` de la section user (connecté)**

Trouver (autour ligne 292) :
```tsx
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Link
              href="/profile"
```

Remplacer par :
```tsx
          <div>
            <Link
              href="/profile"
```

Et la balise fermante `</motion.div>` qui suit → `</div>`.

**Step 6 : Retirer `initial` de la section user (déconnecté)**

Même pattern quelques lignes plus bas (le bloc `motion.div` autour du lien `/login`).

**Step 7 : Retirer `initial` du usage summary (optionnel mais propre)**

Trouver :
```tsx
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="px-4 mt-6"
          >
            <UsageSummary ... />
          </motion.div>
```

Remplacer par :
```tsx
          <div className="px-4 mt-6">
            <UsageSummary ... />
          </div>
```

**Step 8 : Vérifier que `motion` est encore utilisé (pour ne pas laisser un import mort)**

```bash
grep -n "motion\." frontend-next/src/components/layout/sidebar.tsx
```

Les seuls `motion.*` restants devraient être :
- `motion.span` avec `layoutId="activeTab"` (indicateur onglet actif)
- `motion.aside` pour le menu mobile (dans `AnimatePresence`)

Si `motion` n'est plus utilisé du tout → retirer l'import `motion` de la ligne 6.

**Step 9 : TypeScript check**

```bash
cd frontend-next && npx tsc --noEmit 2>&1 | grep -v "__tests__"
```

**Step 10 : Commit**

```bash
git add frontend-next/src/components/layout/sidebar.tsx
git commit -m "fix(sidebar): remove Framer Motion initial props from always-mounted elements to prevent animation restart on re-render"
```

---

## Task 5 — Test manuel et PR

**Step 1 : Lancer le dev server**

```bash
cd frontend-next && npm run dev
```

**Step 2 : Vérifier le fix toast (Bug #1)**

1. Ouvrir `http://localhost:3000/login`
2. Se connecter avec un compte valide
3. Observer : **aucun toast** "Chargement de votre abonnement" ne doit apparaître
4. La sidebar doit afficher directement le bon badge de plan

**Step 3 : Vérifier le fix sidebar (Bug #2)**

1. Ouvrir DevTools → Console
2. Naviguer dans le dashboard pendant 30 secondes
3. Observer : **aucun** `[SubscriptionSync] Event listener removed` / `registered` répétitif
4. La sidebar ne doit pas "clignoter" ou rejouer des animations

**Step 4 : Vérifier mobile (Bug #3)**

1. DevTools → Toggle device toolbar → iPhone 14
2. Taper sur des items de la sidebar → ils doivent être sélectionnables sans flicker
3. Pas d'animation parasite au toucher

**Step 5 : Push et PR**

```bash
git push origin HEAD
gh pr create \
  --title "fix(sidebar): eliminate reload flicker and spurious subscription toast" \
  --body "Fixes sidebar re-render loop and false 'Chargement abonnement' toast on login.

**Root causes fixed:**
- Race condition: fetchSubscription now sets isLoading:true immediately
- Listener churn: useSubscriptionSync uses ref pattern (empty deps)
- Animation restart: removed initial props from always-mounted sidebar elements
- Deps instability: removed apiData.refetch from inconsistency check deps"
```
