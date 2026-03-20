# Sprint D — Business Logic & Monétisation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unifier le système de plans/limites sur une source unique (Supabase), supprimer tous les hardcoded values, et fixer le bug "Plan Gratuit".

**Architecture:** L'admin panel existe déjà avec 5 endpoints PATCH. Le travail consiste à (1) enrichir `/api/public/plans` pour retourner limits+feature_flags, (2) brancher le frontend sur cette source unique, (3) implémenter un cache persistant pour éviter le fallback "free", (4) nettoyer tous les hardcoded values.

**Tech Stack:** Next.js 14 (App Router), FastAPI, Supabase, Stripe, Redis cache, localStorage

**Spec:** `docs/superpowers/specs/2026-03-20-sprint-d-business-logic-design.md`

---

## File Map

### Backend (modifications)
- `backend/src/api/routes/public_plans.py` — ajouter limits + feature_flags au SELECT
- `backend/src/api/routes/stripe.py` — ajouter notification invoice.payment_failed
- `backend/src/api/routes/auth.py` — supprimer fallback prix hardcodé

### Frontend (modifications)
- `frontend-next/src/hooks/use-plans-config.ts` — exposer limits + feature_flags dans le type
- `frontend-next/src/hooks/use-freemium-limits.ts` — supprimer PLAN_LIMITS, utiliser plansConfig
- `frontend-next/src/hooks/use-subscription-api.ts` — cache persistant + intercepteur 403
- `frontend-next/src/contexts/subscription-context.tsx` — plus de fallback "free", utiliser cache persistant
- `frontend-next/src/components/profile/subscription-card.tsx` — supprimer prix hardcodés
- `frontend-next/src/components/freemium/usage-modal.tsx` — supprimer noms de plans hardcodés
- `frontend-next/src/components/freemium/conversion-popups.tsx` — supprimer plan hardcodé par popup
- `frontend-next/src/lib/seo/metadata.ts` — supprimer prix/limites dans description SEO

### Frontend (création)
- `frontend-next/src/components/freemium/subscription-changed-modal.tsx` — modal informative 403

### Traductions
- `frontend-next/messages/fr.json` — clés pour subscription-changed-modal
- `frontend-next/messages/en.json` — clés pour subscription-changed-modal

---

## Task 1: D1 — Enrichir `/api/public/plans`

**Files:**
- Modify: `backend/src/api/routes/public_plans.py:42-44`

- [ ] **Step 1: Modifier le SELECT pour inclure limits et feature_flags**

Dans `backend/src/api/routes/public_plans.py`, remplacer la ligne 42-44 :

```python
# AVANT
result = supabase.table("subscription_plans").select(
    "id, name, display_name, description, price_monthly, price_yearly, features, features_excluded, sort_order, is_active"
).eq("is_active", True).order("sort_order").execute()

# APRÈS
result = supabase.table("subscription_plans").select(
    "id, name, display_name, description, price_monthly, price_yearly, features, features_excluded, limits, feature_flags, sort_order, is_active"
).eq("is_active", True).order("sort_order").execute()
```

- [ ] **Step 2: Vérifier avec ruff**

Run: `ruff check backend/src/api/routes/public_plans.py --ignore E501`
Expected: 0 erreur

- [ ] **Step 3: Commit**

```bash
git add backend/src/api/routes/public_plans.py
git commit -m "feat(api): D1 — add limits and feature_flags to /api/public/plans response"
```

---

## Task 2: D2 — Mettre à jour `use-plans-config.ts` pour exposer limits + feature_flags

**Files:**
- Modify: `frontend-next/src/hooks/use-plans-config.ts`

- [ ] **Step 1: Ajouter limits et feature_flags au type PlanConfig**

Ajouter dans l'interface `PlanConfig` (après `features_excluded`) :

```typescript
export interface PlanConfig {
  id: string;
  name: "free" | "starter" | "pro" | "premium";
  display_name: string;
  description: string;
  price_monthly: number;
  price_yearly: number | null;
  features: string[];
  features_excluded: string[];
  limits: Record<string, number> | null;        // AJOUTÉ
  feature_flags: Record<string, boolean> | null; // AJOUTÉ
  sort_order: number;
}
```

- [ ] **Step 2: Ajouter helper `getPlanLimits` et `getPlanFeatureFlags`**

Ajouter dans le hook `usePlansConfig`, après `formatPrice` :

```typescript
const getPlanLimits = useCallback(
  (name: string): Record<string, number> | null =>
    plans.find((p) => p.name === name)?.limits ?? null,
  [plans],
);

const getPlanFeatureFlags = useCallback(
  (name: string): Record<string, boolean> | null =>
    plans.find((p) => p.name === name)?.feature_flags ?? null,
  [plans],
);
```

Mettre à jour le return :

```typescript
return { plans, getPlan, getPlanLimits, getPlanFeatureFlags, isLoading, formatPrice };
```

- [ ] **Step 3: Vérifier TypeScript**

Run: `cd frontend-next && npx tsc --noEmit`
Expected: 0 erreur

- [ ] **Step 4: Commit**

```bash
git add frontend-next/src/hooks/use-plans-config.ts
git commit -m "feat(hooks): D2a — expose limits and feature_flags from usePlansConfig"
```

---

## Task 3: D2b — Supprimer PLAN_LIMITS hardcodé de `use-freemium-limits.ts`

**Files:**
- Modify: `frontend-next/src/hooks/use-freemium-limits.ts`

- [ ] **Step 1: Importer `usePlansConfig`**

Ajouter en haut du fichier :

```typescript
import { usePlansConfig } from "@/hooks/use-plans-config";
```

- [ ] **Step 2: Remplacer le `PLAN_LIMITS` const par un getter dynamique**

Supprimer le `export const PLAN_LIMITS = { ... }` (lignes 19-80).

Remplacer par une fonction qui construit les limites depuis l'API avec fallback minimal :

```typescript
// Fallback minimal si API pas encore chargée — sera écrasé par l'API
const FALLBACK_FREE_LIMITS = {
  job_searches_per_day: 3,
  jobs_visible: 10,
  cv_analyses_per_day: 1,
  assistant_messages_per_day: 10,
} as const;

function buildPlanLimits(apiLimits: Record<string, number> | null, featureFlags: Record<string, boolean> | null) {
  const limits = apiLimits ?? FALLBACK_FREE_LIMITS;
  const flags = featureFlags ?? {};
  return {
    job_searches_per_day: limits.job_searches ?? limits.job_searches_per_day ?? 3,
    jobs_visible: limits.jobs_visible ?? 10,
    cv_analyses_per_day: limits.cv_analyses ?? limits.cv_analyses_per_day ?? 1,
    assistant_messages_per_day: limits.assistant_messages ?? limits.assistant_messages_per_day ?? 10,
    has_advanced_filters: flags.advanced_filters ?? false,
    has_favorites: flags.favorites ?? false,
    has_email_alerts: flags.email_alerts ?? false,
    has_visual_score: flags.visual_score ?? false,
    has_pdf_export: flags.pdf_export ?? false,
    has_cv_history: flags.cv_history ?? false,
    has_interview_sim: flags.interview_sim ?? false,
    has_personalized_advice: flags.personalized_advice ?? false,
    has_coach_history: flags.coach_history ?? false,
  };
}
```

Note : `-1` en DB = unlimited → convertir en `Infinity` côté frontend. Ajouter dans `buildPlanLimits` :

```typescript
// Convertir -1 (DB) en Infinity (JS)
for (const [key, val] of Object.entries(limits)) {
  if (val === -1) (limits as Record<string, number>)[key] = Infinity;
}
```

- [ ] **Step 3: Garder PLAN_LIMITS en export compat (4 consumers existants)**

`PLAN_LIMITS` est importé dans 4 fichiers :
- `subscription-context.tsx` — type `PlanLimits = (typeof PLAN_LIMITS)[PlanType]`
- `subscription-card.tsx` — runtime usage pour feature flags
- `feature-lock.tsx` — type + runtime dans 4 composants (FeatureLockOverlay, FeatureLockBadge, LockedButton, LockedFeatureWrapper)
- `use-freemium-limits.ts` — définition

On ne peut PAS supprimer `PLAN_LIMITS` d'un coup. Stratégie :

1. Garder `export const PLAN_LIMITS` mais le construire dynamiquement depuis un cache local des plans API :

```typescript
// Cache statique des plans API — rempli par usePlansConfig lors du premier fetch
let _cachedApiPlans: Record<string, { limits: Record<string, number> | null; feature_flags: Record<string, boolean> | null }> = {};

export function _updatePlanLimitsCache(plans: Array<{ name: string; limits: Record<string, number> | null; feature_flags: Record<string, boolean> | null }>) {
  _cachedApiPlans = {};
  for (const p of plans) {
    _cachedApiPlans[p.name] = { limits: p.limits, feature_flags: p.feature_flags };
  }
}

// PLAN_LIMITS reste exporté pour la compat — mais lit depuis le cache API si disponible
export const PLAN_LIMITS = new Proxy({} as Record<PlanType, ReturnType<typeof buildPlanLimits>>, {
  get(_target, prop: string) {
    const planName = prop as PlanType;
    const cached = _cachedApiPlans[planName];
    if (cached) {
      return buildPlanLimits(cached.limits, cached.feature_flags);
    }
    // Fallback hardcodé minimal si API pas encore chargée
    return buildPlanLimits(null, null);
  },
});
```

2. Dans `use-plans-config.ts`, appeler `_updatePlanLimitsCache(plans)` après chaque fetch réussi.

3. Exporter le type pour les consumers :

```typescript
export type PlanLimits = ReturnType<typeof buildPlanLimits>;
```

- [ ] **Step 3b: Mettre à jour `use-plans-config.ts` pour remplir le cache PLAN_LIMITS**

Ajouter dans le callback `fetchPlans()` après `setPlans(data)` :

```typescript
import { _updatePlanLimitsCache } from "@/hooks/use-freemium-limits";

// Sync le cache PLAN_LIMITS pour les consumers legacy
_updatePlanLimitsCache(data);
```

- [ ] **Step 3c: Mettre à jour `feature-lock.tsx`**

Ce fichier importe `PLAN_LIMITS` pour les types et le runtime. Grâce au Proxy, il continuera de fonctionner sans modification. Vérifier uniquement que les types compilent.

- [ ] **Step 4: Vérifier TypeScript + qu'aucun import ne casse**

Run: `cd frontend-next && npx tsc --noEmit`
Expected: 0 erreur (ajuster les types si nécessaire)

- [ ] **Step 5: Commit**

```bash
git add frontend-next/src/hooks/use-freemium-limits.ts
git commit -m "refactor(hooks): D2b — replace hardcoded PLAN_LIMITS with dynamic API-sourced limits"
```

---

## Task 4: D3 — Cache persistant dans `use-subscription-api.ts`

**Files:**
- Modify: `frontend-next/src/hooks/use-subscription-api.ts`

- [ ] **Step 1: Changer le cache TTL en persistant**

Remplacer la logique de cache dans `use-subscription-api.ts` :

```typescript
// Réutilise la même clé que l'existant (ligne 63) — on supprime juste le TTL
// Supprimer aussi CACHE_EXPIRY_KEY (ligne 64) et CACHE_DURATION (ligne 68) devenus inutiles
const PERSISTENT_CACHE_KEY = "huntzen_subscription_cache";

function loadPersistentCache(): ApiResponse | null {
  try {
    const raw = localStorage.getItem(PERSISTENT_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ApiResponse;
  } catch {
    return null;
  }
}

function savePersistentCache(data: ApiResponse) {
  try {
    localStorage.setItem(PERSISTENT_CACHE_KEY, JSON.stringify(data));
  } catch {}
}

function clearPersistentCache() {
  try {
    localStorage.removeItem(PERSISTENT_CACHE_KEY);
  } catch {}
}
```

- [ ] **Step 2: Utiliser le cache persistant comme fallback**

Dans le hook, quand le fetch échoue ou est en loading :

```typescript
// Initialiser avec le cache persistant au lieu de null
const cached = loadPersistentCache();
const [data, setData] = useState<...>({
  user: cached?.user ?? null,
  subscription: cached?.subscription ?? null,
  quotas: cached?.quotas ?? null,
  feature_overrides: cached?.feature_overrides ?? {},
  plan_feature_flags: cached?.plan_feature_flags ?? {},
  isLoading: !cached, // Si cache existe, pas de loading
  error: null,
  isFromCache: !!cached,
});
```

Et quand le fetch réussit :

```typescript
// Après un fetch réussi
savePersistentCache(apiResponse);
```

- [ ] **Step 3: Invalider le cache au logout**

Écouter l'événement logout pour clear :

```typescript
useEffect(() => {
  if (!session) {
    clearPersistentCache();
  }
}, [session]);
```

- [ ] **Step 4: Vérifier TypeScript**

Run: `cd frontend-next && npx tsc --noEmit`
Expected: 0 erreur

- [ ] **Step 5: Commit**

```bash
git add frontend-next/src/hooks/use-subscription-api.ts
git commit -m "feat(subscription): D3 — persistent cache, never fallback to 'free' on API error"
```

---

## Task 5: D3b — Mettre à jour `subscription-context.tsx` pour utiliser le cache persistant

**Files:**
- Modify: `frontend-next/src/contexts/subscription-context.tsx`

- [ ] **Step 1: Supprimer le fallback `freemium.plan` qui retourne "free"**

Remplacer la logique plan (lignes 142-157) :

```typescript
const plan: PlanType = (() => {
  // 1. API a retourné des données (fetch réussi OU cache persistant chargé) → source de vérité
  if (apiData.subscription?.plan_name) {
    return apiData.subscription.plan_name;
  }

  // 2. Pas de session → visiteur non connecté → free légitime
  if (!auth?.session) return "free";

  // 3. Authentifié, API en loading, pas encore de données → ne PAS afficher "free"
  //    Le cache persistant aura déjà rempli apiData.subscription si disponible (Task D3)
  //    Si pas de cache persistant → c'est un nouveau user → "free" est correct
  if (apiData.isLoading) return "free";

  // 4. API erreur → dernier plan connu via freemium state (localStorage usage)
  if (apiData.error) return freemium.plan;

  // 5. API a répondu mais pas de subscription data → user free
  return "free";
})();
```

Note : Grâce au cache persistant (Task D3), `apiData.subscription` sera pré-rempli dès l'initialisation du hook si un cache existe. Donc le cas 1 sera true immédiatement pour les users qui ont déjà eu une session. Le fallback "free" (cas 3) ne se produit que pour les nouveaux users sans historique.

- [ ] **Step 2: Vérifier TypeScript**

Run: `cd frontend-next && npx tsc --noEmit`
Expected: 0 erreur

- [ ] **Step 3: Commit**

```bash
git add frontend-next/src/contexts/subscription-context.tsx
git commit -m "fix(subscription): D3b — use persistent cache fallback, never show 'free' for authenticated users"
```

---

## Task 6: D4 — Modal "Ton abonnement a changé" sur 403

**Files:**
- Create: `frontend-next/src/components/freemium/subscription-changed-modal.tsx`
- Modify: `frontend-next/src/hooks/use-subscription-api.ts` — intercepteur 403
- Modify: `frontend-next/src/contexts/subscription-context.tsx` — state pour la modal
- Modify: `frontend-next/messages/fr.json` + `en.json` — clés i18n

- [ ] **Step 1: Ajouter les clés i18n**

Dans `fr.json`, ajouter dans `"subscription"` :

```json
"planChanged": {
  "title": "Ton abonnement a changé",
  "description": "Tu es maintenant sur le plan {plan}.",
  "ctaUpgrade": "Voir les offres",
  "ctaContinue": "Continuer"
}
```

Dans `en.json`, ajouter dans `"subscription"` :

```json
"planChanged": {
  "title": "Your subscription has changed",
  "description": "You are now on the {plan} plan.",
  "ctaUpgrade": "View plans",
  "ctaContinue": "Continue"
}
```

- [ ] **Step 2: Créer le composant modal**

Créer `frontend-next/src/components/freemium/subscription-changed-modal.tsx` :

```typescript
"use client";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { usePlansConfig } from "@/hooks/use-plans-config";

interface SubscriptionChangedModalProps {
  open: boolean;
  onClose: () => void;
  onUpgrade: () => void;
  currentPlan: string;
}

export function SubscriptionChangedModal({
  open,
  onClose,
  onUpgrade,
  currentPlan,
}: SubscriptionChangedModalProps) {
  const t = useTranslations("subscription.planChanged");
  const { getPlan } = usePlansConfig();
  const planDisplayName = getPlan(currentPlan)?.display_name ?? currentPlan;

  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("description", { plan: planDisplayName })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("ctaContinue")}
          </Button>
          <Button onClick={onUpgrade}>{t("ctaUpgrade")}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 3: Ajouter l'intercepteur 403 dans `use-subscription-api.ts`**

Dans le hook, après un fetch qui retourne 403 :

```typescript
// Dans la fonction fetchData, après le fetch
if (res.status === 403) {
  // Invalider le cache persistant
  clearPersistentCache();
  // Refetch pour obtenir le vrai état
  // Le composant parent détectera le changement de plan et affichera la modal
  window.dispatchEvent(new CustomEvent("subscription-downgraded"));
}
```

- [ ] **Step 4: Intégrer la modal dans `subscription-context.tsx`**

Ajouter un state + listener dans le provider :

```typescript
const [showPlanChangedModal, setShowPlanChangedModal] = useState(false);

useEffect(() => {
  const handler = () => {
    clearPersistentCache();
    apiData.refetch();
    setShowPlanChangedModal(true);
  };
  window.addEventListener("subscription-downgraded", handler);
  return () => window.removeEventListener("subscription-downgraded", handler);
}, [apiData.refetch]);
```

Et dans le JSX du provider, rendre la modal :

```tsx
<SubscriptionChangedModal
  open={showPlanChangedModal}
  onClose={() => setShowPlanChangedModal(false)}
  onUpgrade={() => {
    setShowPlanChangedModal(false);
    openPricingModal();
  }}
  currentPlan={plan}
/>
```

- [ ] **Step 5: Vérifier TypeScript**

Run: `cd frontend-next && npx tsc --noEmit`
Expected: 0 erreur

- [ ] **Step 6: Commit**

```bash
git add frontend-next/src/components/freemium/subscription-changed-modal.tsx \
  frontend-next/src/hooks/use-subscription-api.ts \
  frontend-next/src/contexts/subscription-context.tsx \
  frontend-next/messages/fr.json frontend-next/messages/en.json
git commit -m "feat(subscription): D4 — add subscription-changed modal on 403 with cache invalidation"
```

---

## Task 7: D5 — Supprimer tous les hardcoded prices/names

**Files:**
- Modify: `frontend-next/src/components/profile/subscription-card.tsx`
- Modify: `frontend-next/src/components/freemium/usage-modal.tsx`
- Modify: `frontend-next/src/components/freemium/conversion-popups.tsx`
- Modify: `frontend-next/src/lib/seo/metadata.ts`
- Modify: `backend/src/api/routes/auth.py`

- [ ] **Step 1: `subscription-card.tsx` — supprimer prix ET strings FR hardcodés**

1. Remplacer les prix hardcodés par `usePlansConfig()` :
```typescript
const { getPlan, formatPrice } = usePlansConfig();
const planData = getPlan(plan);
const price = planData ? `${formatPrice(planData.price_monthly)}€` : "";
```

2. Externaliser TOUTES les strings FR hardcodées vers `fr.json`/`en.json` :
   - `FEATURE_LABELS` (ligne ~74-84) → clés i18n `subscription.featureLabels.*`
   - "Paiement en échec" (ligne ~264) → clé i18n
   - "Ouverture...", "Mettre à jour ma carte" (ligne ~277-278)
   - "Actif" (ligne ~329)
   - "Fin le ...", "Annulation prévue" (ligne ~337-339)

- [ ] **Step 2: `usage-modal.tsx` — supprimer TOUTES les strings FR hardcodées**

1. Remplacer les noms "Gratuit", "Starter", etc. par `getPlan(plan)?.display_name`
2. Remplacer les descriptions par `getPlan(plan)?.description`
3. Remplacer les limites par `getPlan(plan)?.limits`
4. Externaliser TOUTES les strings FR hardcodées (lignes 183-325) :
   - "Analyses CV", "Messages Assistant", "Recherches d'emploi" → i18n
   - "Découvrez HuntZen gratuitement" → i18n
   - Tous les textes descriptifs → i18n

- [ ] **Step 3: `conversion-popups.tsx` — supprimer `plan: "starter"` hardcodé**

Remplacer `plan: "starter"` sur chaque popup par une logique dynamique qui utilise `getRequiredPlan(feature)` depuis le subscription context (qui lui-même utilise les feature_flags de l'API).

- [ ] **Step 4: `lib/seo/metadata.ts` — supprimer prix/limites dans description SEO**

Remplacer les descriptions avec prix hardcodés (lignes ~342, ~359 openGraph, ~365 twitter) par un texte générique :

```typescript
description: "Plans adaptés à chaque étape de votre recherche d'emploi. De l'exploration gratuite à l'accompagnement complet.",
```

Appliquer le même texte sur openGraph.description et twitter.description.

- [ ] **Step 5: `backend/src/api/routes/auth.py` — supprimer fallback prix hardcodé**

Supprimer `plan_prices = {"free": 0, "starter": 8.90, ...}` (ligne ~198). Si la DB est down, retourner `price_monthly: null` au lieu d'un faux prix.

- [ ] **Step 6: Vérifier TypeScript + ruff**

Run: `cd frontend-next && npx tsc --noEmit`
Run: `ruff check backend/src/api/routes/auth.py --ignore E501`
Expected: 0 erreur

- [ ] **Step 7: Commit**

```bash
git add frontend-next/src/components/profile/subscription-card.tsx \
  frontend-next/src/components/freemium/usage-modal.tsx \
  frontend-next/src/components/freemium/conversion-popups.tsx \
  frontend-next/src/lib/seo/metadata.ts \
  backend/src/api/routes/auth.py
git commit -m "refactor(subscription): D5 — remove all hardcoded prices, plan names and limits from frontend+backend"
```

---

## Task 8: D7a — Notification invoice.payment_failed

**Files:**
- Modify: `backend/src/services/stripe.py:821-846` — `handle_payment_failed()` function
- Modify: `backend/src/services/notifications.py:16-26` — ajouter `"payment_failed"` à `VALID_TYPES`
- Modify: `backend/src/services/email.py` — ajouter `send_payment_failed_email()`

- [ ] **Step 1: Ajouter "payment_failed" aux types valides de notifications**

Dans `backend/src/services/notifications.py`, ajouter `"payment_failed"` au set `VALID_TYPES` (ligne 16-26) :

```python
VALID_TYPES = {
    "job_alert",
    "cv_feedback",
    "referral_bonus",
    "promo_code",
    "career_progress",
    "interview_ready",
    "win_back_7d",
    "support_ticket_received",
    "support_ticket_reply",
    "payment_failed",  # AJOUTÉ
}
```

- [ ] **Step 2: Enrichir `handle_payment_failed()` dans services/stripe.py**

Le handler existe déjà à la ligne 821 de `backend/src/services/stripe.py`. Il met à jour le status en "past_due" mais ne notifie pas l'utilisateur. Ajouter la notification après l'invalidation du cache :

```python
async def handle_payment_failed(invoice: Dict[str, Any]):
    """Handle failed payment."""
    stripe_subscription_id = invoice["subscription"]

    if not supabase_client:
        return

    try:
        result = supabase_client.table("user_subscriptions")\
            .update({
                "status": "past_due",
                "updated_at": datetime.now(timezone.utc).isoformat()
            })\
            .eq("stripe_subscription_id", stripe_subscription_id)\
            .execute()

        if result.data and len(result.data) > 0:
            user_id = result.data[0].get("user_id")
            if user_id:
                await invalidate_user_quota_cache(user_id)

                # Notification in-app (synchrone, pas await)
                from src.services.notifications import create_notification
                create_notification(
                    supabase_client,
                    user_id=user_id,
                    type="payment_failed",
                    title="Paiement échoué",
                    body="Votre paiement a échoué. Veuillez mettre à jour votre moyen de paiement pour conserver votre abonnement.",
                )

                # Email (best-effort)
                try:
                    from src.services.email import send_payment_failed_email
                    user_result = supabase_client.table("profiles").select("email").eq("id", user_id).maybe_single().execute()
                    if user_result.data and user_result.data.get("email"):
                        send_payment_failed_email(user_result.data["email"])
                except Exception as e:
                    logger.warning(f"Failed to send payment_failed email: {e}")

        logger.info(f"Subscription marked as past_due: {stripe_subscription_id}")

    except Exception as e:
        logger.error(f"Failed to update subscription status: {e}")
        raise
```

Note : `create_notification()` est synchrone (pas async) — pas de `await`.

- [ ] **Step 3: Ajouter `send_payment_failed_email()` dans services/email.py**

Suivre le pattern existant des autres fonctions email dans `email.py`. Ajouter :

```python
def send_payment_failed_email(email: str, language: str = "fr"):
    """Send payment failure notification email."""
    _T = {
        "fr": {
            "subject": "Paiement échoué - HuntZen Jobs",
            "body": "Votre dernier paiement a échoué. Veuillez mettre à jour votre moyen de paiement dans votre profil pour conserver votre abonnement.",
        },
        "en": {
            "subject": "Payment failed - HuntZen Jobs",
            "body": "Your last payment failed. Please update your payment method in your profile to keep your subscription.",
        },
    }
    t = _T.get(language, _T["fr"])
    _send_email(email, t["subject"], t["body"])
```

Adapter au pattern exact de `_send_email()` ou `send_transactional_email()` existant dans le fichier.

- [ ] **Step 4: Vérifier avec ruff**

Run: `ruff check backend/src/services/stripe.py backend/src/services/notifications.py backend/src/services/email.py --ignore E501`
Expected: 0 erreur

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/stripe.py backend/src/services/notifications.py backend/src/services/email.py
git commit -m "feat(stripe): D7a — notify user on invoice.payment_failed (in-app notification + email)"
```

---

## Task 9: D6 — Vérification flow admin → prod

**Files:** Aucune modification, vérification uniquement

- [ ] **Step 1: Vérifier que les endpoints admin invalident bien le cache**

Grep pour `plans_config` et `auth_me` dans `backend/src/api/routes/admin.py` :

```bash
grep -n "plans_config\|auth_me" backend/src/api/routes/admin.py
```

Chaque endpoint PATCH doit invalider `plans_config` ET `auth_me:*`.

- [ ] **Step 2: Vérifier le flow Stripe downgrade**

Lire `backend/src/services/stripe.py` fonction `_schedule_downgrade()` et confirmer :
- `proration_behavior="none"` est utilisé
- Le changement est schedulé à `current_period_end`, pas immédiat

- [ ] **Step 3: Build production final**

Run: `npm run build`
Expected: Build réussi, 0 erreur

- [ ] **Step 4: TypeScript + lint final**

Run: `cd frontend-next && npx tsc --noEmit`
Run: `ruff check backend/src/ --ignore E501`
Expected: 0 erreur sur les deux

- [ ] **Step 5: Commit final si corrections nécessaires**

```bash
git commit -m "fix(sprint-d): final verification fixes"
```

---

## Execution Order Summary

```
D1 (backend, 5min) → D2a (frontend hook, 10min) → D2b (frontend limits, 20min)
                                                      ↓
D3 (cache persistant, 15min) → D3b (context fix, 10min) → D4 (modal 403, 20min)
                                                              ↓
D5 (hardcoded cleanup, 30min) → D6 (vérification, 10min)

D7a (backend webhook, 15min) — indépendant, peut être fait en parallèle
```

**Temps total estimé : 2-3 heures**
