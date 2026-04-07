# Design — Fix sidebar reload + toast "Chargement abonnement"

**Date:** 2026-02-25
**Branche:** feat/fix-sidebar-reload
**Statut:** Approuvé

---

## Problèmes rapportés

1. La sidebar se recharge visuellement en boucle (desktop + mobile)
2. Sur mobile, impossible de sélectionner un item (sidebar re-render pendant le tap)
3. Toast "Chargement de votre abonnement en cours..." s'affiche à chaque connexion
4. Console : `[SUBSCRIPTION] Inconsistency detected: authenticated but no subscription data`

---

## Root Cause Analysis

### Bug #1 — Toast intempestif au login (race condition)

```
1. Utilisateur se connecte
2. auth.session devient non-null (auth state update)
3. Le useEffect "inconsistency check" dans subscription-context.tsx s'exécute :
   - isAuthenticated = true ✓
   - isApiLoading = false ✓ (fetchSubscription n'a pas encore mis isLoading: true)
   - hasSubscriptionData = false ✓
   → TOAST affiché à tort
4. 50-200ms plus tard : fetchSubscription démarre et met isLoading: true
```

**Fichier** : `use-subscription-api.ts` — `fetchSubscription` ne set jamais `isLoading: true` avant le fetch réseau.

### Bug #2 — Sidebar "reload" visuel (boucle re-render)

```
useSubscriptionSync useEffect deps = [refetch]
→ refetch = useCallback avec deps [session?.access_token, authLoading, loadCache, saveCache]
→ après chaque fetch réussi, saveCache change? Non. Mais session peut être recréée.
→ de toute façon, tout changement de refetch → useEffect se ré-exécute
→ listener "subscription-changed" retiré + ré-enregistré
→ subscription context re-render → sidebar re-render
→ Framer Motion `initial={{ opacity:0, y:-10 }}` sur nav items → animation repart
→ effet visuel de "rechargement"
```

**Fichiers** : `use-subscription-api.ts` (useSubscriptionSync) + `sidebar.tsx` (Framer Motion initial)

### Bug #3 — Mobile encore pire

Les 4 listeners `touchstart` dans `use-auto-refresh-session` déclenchent à chaque tap.
Chaque tap → `resetInactivityTimer()` → setState → re-render → Framer Motion rejoue l'animation.
Le fix #2b (supprimer `initial`) résout aussi ce symptôme.

---

## Design de la solution

### Fix 1 — `use-subscription-api.ts` : `isLoading: true` immédiat

Dans `fetchSubscription`, dès qu'on détecte un token valide, set `isLoading: true` **avant** le fetch réseau :

```ts
const fetchSubscription = useCallback(async () => {
  if (authLoading) return;
  if (session && !session.access_token) return;

  if (!session?.access_token) {
    // no session path...
    return;
  }

  // NEW: Signal loading immediately to prevent race condition
  setData(prev => ({ ...prev, isLoading: true, error: null }));

  // ... fetch réseau
}, [...]);
```

### Fix 2a — `use-subscription-api.ts` : ref pattern dans `useSubscriptionSync`

Remplacer la dépendance `[refetch]` par un ref stable :

```ts
export function useSubscriptionSync() {
  const { refetch } = useSubscriptionApi();
  const refetchRef = useRef(refetch);

  // Sync ref sans ré-enregistrer le listener
  useEffect(() => {
    refetchRef.current = refetch;
  });

  // Enregistré UNE SEULE FOIS
  useEffect(() => {
    const handleSubscriptionChange = () => {
      localStorage.removeItem(CACHE_KEY);
      localStorage.removeItem(CACHE_EXPIRY_KEY);
      refetchRef.current();
    };
    window.addEventListener("subscription-changed", handleSubscriptionChange);
    return () => window.removeEventListener("subscription-changed", handleSubscriptionChange);
  }, []); // deps vides

  return { invalidateCache: refetch };
}
```

### Fix 2b — `subscription-context.tsx` : ref pour `apiData.refetch` dans inconsistency check

```ts
const refetchRef = useRef(apiData.refetch);
useEffect(() => { refetchRef.current = apiData.refetch; });

useEffect(() => {
  // ... inconsistency check
  // Utiliser refetchRef.current() au lieu de apiData.refetch?.()
}, [
  auth?.session,
  apiData.subscription,
  apiData.isLoading,
  apiData.error,
  hasShownInconsistencyWarning,
  freemium.plan,
  // apiData.refetch SUPPRIMÉ des deps
]);
```

### Fix 3 — `sidebar.tsx` : supprimer `initial` sur éléments toujours montés

Les nav items sont toujours dans le DOM (pas de montage/démontage conditionnel).
Supprimer `initial` empêche Framer Motion de rejouer l'animation sur re-render.

```tsx
// AVANT (rejoue à chaque re-render)
<motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>

// APRÈS (anime seulement au premier montage)
<motion.div animate={{ opacity: 1, y: 0 }}>
// ou simplement utiliser une div normale pour les nav items statiques
```

---

## Fichiers modifiés

| Fichier | Changement |
|---------|-----------|
| `frontend-next/src/hooks/use-subscription-api.ts` | `isLoading: true` immédiat + ref pattern dans `useSubscriptionSync` |
| `frontend-next/src/contexts/subscription-context.tsx` | Supprimer `apiData.refetch` des deps inconsistency check |
| `frontend-next/src/components/layout/sidebar.tsx` | Supprimer `initial` sur nav items toujours montés |

## Ce qui ne change PAS

- Architecture globale du contexte subscription
- Logique de cache localStorage
- Auto-refresh 5 min
- AnimatePresence pour le menu mobile (conditionnel = ok)
- Token refresh service
