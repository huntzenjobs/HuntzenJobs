# Dynamic Plans Config Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Supprimer tout hardcoding de prix/noms/descriptions de plans dans le frontend — tout passe par `GET /api/public/plans` depuis la DB.

**Architecture:** Nouvel endpoint public backend + hook React `usePlansConfig()` + refactoring de 6 composants frontend + éditeur de wording admin. Git pull avant chaque commit. PR à la fin.

**Tech Stack:** FastAPI, Redis, Next.js 14, TypeScript, React hooks, localStorage cache

**Branche cible:** `feature/dynamic-plans-config` depuis `Production`

---

## Fichiers modifiés/créés

**Backend (nouveaux/modifiés) :**
- Create: `backend/src/api/routes/public_plans.py`
- Modify: `backend/src/api/routes/__init__.py`
- Modify: `backend/src/api/routes/admin.py` (PATCH /wording + invalidation plans_config)

**Frontend (nouveaux) :**
- Create: `frontend-next/src/hooks/use-plans-config.ts`

**Frontend (modifiés) :**
- Modify: `frontend-next/src/contexts/subscription-context.tsx`
- Modify: `frontend-next/src/components/freemium/feature-lock.tsx`
- Modify: `frontend-next/src/components/freemium/usage-modal.tsx`
- Modify: `frontend-next/src/components/freemium/pricing-modal.tsx`
- Modify: `frontend-next/src/components/freemium/conversion-popups.tsx`
- Modify: `frontend-next/src/components/profile/subscription-card.tsx`
- Modify: `frontend-next/src/app/pricing/page.tsx`
- Modify: `frontend-next/src/hooks/admin/use-admin-plans.ts`
- Modify: `frontend-next/src/components/admin/plans/plan-card-editor.tsx`

---

## Task 1 — Branche + endpoint public backend

**Files:**
- Create: `backend/src/api/routes/public_plans.py`
- Modify: `backend/src/api/routes/__init__.py`

- [ ] **Step 1: Créer la branche**
```bash
git pull origin Production
git checkout -b feature/dynamic-plans-config
```

- [ ] **Step 2: Créer `backend/src/api/routes/public_plans.py`**

```python
"""
Public Plans API — no authentication required.
Returns active subscription plans for pricing pages.
"""

import json
import logging
from typing import Any, Dict, List

from fastapi import APIRouter

from src.db.supabase_client import get_supabase_client

logger = logging.getLogger(__name__)

router = APIRouter()

PLANS_CACHE_KEY = "plans_config"
PLANS_CACHE_TTL = 300  # 5 minutes


@router.get("/plans")
async def get_public_plans() -> List[Dict[str, Any]]:
    """
    Returns all active subscription plans with display info.
    Used by pricing pages and modals — no auth required.
    Cached in Redis for 5 minutes.
    """
    # Try Redis cache first
    try:
        from src.utils.cache import get_redis
        redis = await get_redis()
        if redis:
            cached = await redis.get(PLANS_CACHE_KEY)
            if cached:
                return json.loads(cached)
    except Exception:
        pass

    supabase = get_supabase_client()
    result = supabase.table("subscription_plans").select(
        "id, name, display_name, description, price_monthly, price_yearly, features, sort_order, is_active"
    ).eq("is_active", True).order("sort_order").execute()

    plans = result.data or []

    # Cache in Redis
    try:
        from src.utils.cache import get_redis
        redis = await get_redis()
        if redis:
            await redis.setex(PLANS_CACHE_KEY, PLANS_CACHE_TTL, json.dumps(plans))
    except Exception:
        pass

    return plans
```

- [ ] **Step 3: Enregistrer dans `__init__.py`**

Ouvrir `backend/src/api/routes/__init__.py` et ajouter :
```python
# Après la dernière ligne d'import existante (suggestions_router) :
from src.api.routes.public_plans import router as public_plans_router
```
Et dans la section `router.include_router` :
```python
router.include_router(public_plans_router, prefix="/api/public", tags=["Public Plans"])
```

- [ ] **Step 4: Tester l'endpoint**
```bash
curl http://localhost:8000/api/public/plans
# Attendu: array JSON avec free/starter/pro/premium
```

- [ ] **Step 5: Commit**
```bash
git pull origin Production
git add backend/src/api/routes/public_plans.py backend/src/api/routes/__init__.py
git commit -m "feat(backend): endpoint public GET /api/public/plans avec cache Redis plans_config"
git push origin feature/dynamic-plans-config
```

---

## Task 2 — Backend: wording admin + invalidation plans_config

**Files:**
- Modify: `backend/src/api/routes/admin.py`

- [ ] **Step 1: Ajouter PATCH /plans/{plan_id}/wording dans admin.py**

Trouver le bloc `@router.patch("/plans/{plan_id}/price")` (vers ligne 625) et ajouter AVANT :

```python
@router.patch("/plans/{plan_id}/wording")
async def update_plan_wording(
    plan_id: str,
    body: Dict[str, Any],
    admin: AdminUserDep,
) -> Dict[str, Any]:
    """Update display_name and/or description for a plan (admin only)."""
    supabase = get_supabase_client()

    update_data: Dict[str, Any] = {}
    if "display_name" in body and isinstance(body["display_name"], str):
        update_data["display_name"] = body["display_name"].strip()
    if "description" in body and isinstance(body["description"], str):
        update_data["description"] = body["description"].strip()

    if not update_data:
        raise HTTPException(status_code=400, detail="display_name ou description requis")

    from datetime import datetime, timezone
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

    try:
        current = supabase.table("subscription_plans").select("name").eq("id", plan_id).single().execute()
        if not current.data:
            raise HTTPException(status_code=404, detail="Plan not found")

        supabase.table("subscription_plans").update(update_data).eq("id", plan_id).execute()

        # Invalider cache public plans_config
        try:
            from src.utils.cache import get_redis
            redis = await get_redis()
            if redis:
                await redis.delete("plans_config")
                # Invalider aussi auth_me car plan_display_name change
                keys = [k async for k in redis.scan_iter("auth_me:*")]
                if keys:
                    await redis.delete(*keys)
        except Exception:
            pass

        _log_admin_action(supabase, admin["id"], "admin.plan_wording_updated", None, {
            "plan_id": plan_id,
            "plan_name": current.data["name"],
            "changes": update_data,
        })

        return {"success": True, **update_data}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to update wording")
```

- [ ] **Step 2: Ajouter invalidation `plans_config` dans PATCH /limits, /features, /price**

Dans `update_plan_limits` (vers ligne 549), juste avant `return {"success": True, ...}`, le bloc Redis existant invalide `auth_me:*`. Ajouter aussi `await redis.delete("plans_config")` dans ce bloc.

Chercher les 3 blocs `redis.scan_iter("auth_me:*")` dans PATCH /limits, /features, /price et ajouter dans chacun :
```python
await redis.delete("plans_config")
```
juste avant ou après la ligne `await redis.delete(*keys)`.

- [ ] **Step 3: Vérifier que la route /wording est déclarée sous le router admin**

Elle sera automatiquement accessible sous `/api/admin/plans/{id}/wording` car le router admin est enregistré avec prefix `/api/admin`.

- [ ] **Step 4: Commit**
```bash
git pull origin Production
git add backend/src/api/routes/admin.py
git commit -m "feat(backend): PATCH /admin/plans/{id}/wording + invalidation plans_config dans tous les PATCH"
git push origin feature/dynamic-plans-config
```

---

## Task 3 — Hook `usePlansConfig()`

**Files:**
- Create: `frontend-next/src/hooks/use-plans-config.ts`

- [ ] **Step 1: Créer le hook**

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "";
const CACHE_KEY = "plans_config_cache";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export interface PlanConfig {
  id: string;
  name: "free" | "starter" | "pro" | "premium";
  display_name: string;
  description: string;
  price_monthly: number;
  price_yearly: number | null;
  features: string[];
  sort_order: number;
}

function loadCache(): PlanConfig[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, expiry } = JSON.parse(raw);
    if (Date.now() > expiry) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return data as PlanConfig[];
  } catch {
    return null;
  }
}

function saveCache(data: PlanConfig[]) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ data, expiry: Date.now() + CACHE_TTL }),
    );
  } catch {}
}

function clearCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {}
}

export function usePlansConfig() {
  const [plans, setPlans] = useState<PlanConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPlans = useCallback(async () => {
    // Try cache first
    const cached = loadCache();
    if (cached) {
      setPlans(cached);
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/api/public/plans`);
      if (!res.ok) throw new Error("Failed to fetch plans");
      const data: PlanConfig[] = await res.json();
      saveCache(data);
      setPlans(data);
    } catch (err) {
      console.warn("[usePlansConfig] API unavailable, no fallback:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  // Refresh when admin saves plan changes
  useEffect(() => {
    const handleChange = () => {
      clearCache();
      fetchPlans();
    };
    window.addEventListener("subscription-changed", handleChange);
    return () => window.removeEventListener("subscription-changed", handleChange);
  }, [fetchPlans]);

  const getPlan = useCallback(
    (name: string): PlanConfig | undefined => plans.find((p) => p.name === name),
    [plans],
  );

  /** Format price as French string: 8.9 → "8,90" */
  const formatPrice = useCallback((price: number): string => {
    return price.toFixed(2).replace(".", ",");
  }, []);

  return { plans, getPlan, isLoading, formatPrice };
}
```

- [ ] **Step 2: Commit**
```bash
git pull origin Production
git add frontend-next/src/hooks/use-plans-config.ts
git commit -m "feat(frontend): hook usePlansConfig() avec cache localStorage 5min + event-driven invalidation"
git push origin feature/dynamic-plans-config
```

---

## Task 4 — subscription-context + feature-lock (suppression PLAN_NAMES)

**Files:**
- Modify: `frontend-next/src/contexts/subscription-context.tsx`
- Modify: `frontend-next/src/components/freemium/feature-lock.tsx`

- [ ] **Step 1: Modifier `subscription-context.tsx`**

Trouver (lignes 75-80) :
```typescript
const PLAN_NAMES: Record<PlanType, string> = {
  free: "Gratuit",
  starter: "Starter",
  pro: "Pro",
  premium: "Premium",
};
```
**Supprimer** ce bloc entier.

Trouver (ligne ~162) :
```typescript
const planName = PLAN_NAMES[plan];
```
**Remplacer** par :
```typescript
// plan_display_name vient directement de /api/auth/me (champ subscription)
const planName = apiData.subscription?.plan_display_name || plan;
```

- [ ] **Step 2: Modifier `feature-lock.tsx`**

Supprimer :
```typescript
const PLAN_NAMES: Record<PlanType, string> = {
  free: "Gratuit",
  starter: "Starter",
  pro: "Pro",
  premium: "Premium",
};
```

Ajouter l'import du hook :
```typescript
import { usePlansConfig } from "@/hooks/use-plans-config";
```

Dans `FeatureLockOverlay`, ajouter à l'intérieur du composant :
```typescript
const { getPlan } = usePlansConfig();
```

Remplacer l'usage de `PLAN_NAMES[requiredPlan]` par :
```typescript
getPlan(requiredPlan)?.display_name ?? requiredPlan
```

Faire de même dans `FeatureLockBadge` (même pattern — ajouter `const { getPlan } = usePlansConfig()` et remplacer `PLAN_NAMES[requiredPlan]`).

- [ ] **Step 3: Vérifier qu'aucun autre fichier n'importe `PLAN_NAMES` depuis ces fichiers**
```bash
grep -r "PLAN_NAMES" /Users/wissem/HuntzenIA/huntzen_jobsearch/frontend-next/src/
# Attendu: zéro résultat
```

- [ ] **Step 4: Commit**
```bash
git pull origin Production
git add frontend-next/src/contexts/subscription-context.tsx frontend-next/src/components/freemium/feature-lock.tsx
git commit -m "refactor(subscription): planName depuis plan_display_name API, supprimer PLAN_NAMES hardcodé"
git push origin feature/dynamic-plans-config
```

---

## Task 5 — pricing-modal.tsx

**Files:**
- Modify: `frontend-next/src/components/freemium/pricing-modal.tsx`

- [ ] **Step 1: Ajouter l'import du hook**

Après les imports existants, ajouter :
```typescript
import { usePlansConfig } from "@/hooks/use-plans-config";
```

- [ ] **Step 2: Dans la fonction `PricingModal()`, ajouter le hook**

Après les déclarations d'état existantes, ajouter :
```typescript
const { getPlan, formatPrice, isLoading: plansLoading } = usePlansConfig();
```

- [ ] **Step 3: Remplacer l'array `plans` hardcodé (lignes 113-171)**

Remplacer le bloc entier `const plans: PricingPlan[] = [...]` par :

```typescript
const plans: PricingPlan[] = [
  {
    id: "free",
    name: getPlan("free")?.display_name ?? tModal("plans.free.name"),
    price: formatPrice(getPlan("free")?.price_monthly ?? 0),
    priceYearly: formatPrice(getPlan("free")?.price_yearly ?? 0),
    priceValue: getPlan("free")?.price_monthly ?? 0,
    priceYearlyValue: getPlan("free")?.price_yearly ?? 0,
    period: tModal("plans.free.period"),
    description: getPlan("free")?.description ?? tModal("plans.free.description"),
    icon: <Gift className="w-6 h-6" />,
    color: "text-gray-600",
    bgGradient: "from-gray-400 to-gray-500",
    features: buildFeatures("free"),
  },
  {
    id: "starter",
    name: getPlan("starter")?.display_name ?? tModal("plans.starter.name"),
    price: formatPrice(getPlan("starter")?.price_monthly ?? 8.9),
    priceYearly: formatPrice(getPlan("starter")?.price_yearly ?? 85),
    priceValue: getPlan("starter")?.price_monthly ?? 8.9,
    priceYearlyValue: getPlan("starter")?.price_yearly ?? 85,
    period: tModal("plans.starter.period"),
    description: getPlan("starter")?.description ?? tModal("plans.starter.description"),
    icon: <Zap className="w-6 h-6" />,
    color: "text-blue-600",
    bgGradient: "from-blue-500 to-blue-600",
    features: buildFeatures("starter"),
  },
  {
    id: "pro",
    name: getPlan("pro")?.display_name ?? tModal("plans.pro.name"),
    price: formatPrice(getPlan("pro")?.price_monthly ?? 13.9),
    priceYearly: formatPrice(getPlan("pro")?.price_yearly ?? 133),
    priceValue: getPlan("pro")?.price_monthly ?? 13.9,
    priceYearlyValue: getPlan("pro")?.price_yearly ?? 133,
    period: tModal("plans.pro.period"),
    description: getPlan("pro")?.description ?? tModal("plans.pro.description"),
    icon: <Sparkles className="w-6 h-6" />,
    color: "text-violet-600",
    bgGradient: "from-violet-500 to-purple-600",
    popular: true,
    features: buildFeatures("pro"),
  },
  {
    id: "premium",
    name: getPlan("premium")?.display_name ?? tModal("plans.premium.name"),
    price: formatPrice(getPlan("premium")?.price_monthly ?? 19.9),
    priceYearly: formatPrice(getPlan("premium")?.price_yearly ?? 191),
    priceValue: getPlan("premium")?.price_monthly ?? 19.9,
    priceYearlyValue: getPlan("premium")?.price_yearly ?? 191,
    period: tModal("plans.premium.period"),
    description: getPlan("premium")?.description ?? tModal("plans.premium.description"),
    icon: <Crown className="w-6 h-6" />,
    color: "text-amber-600",
    bgGradient: "from-amber-500 to-orange-500",
    features: buildFeatures("premium"),
  },
];
```

Note: `buildFeatures` reste inchangé (utilise i18n pour les noms de features de la table de comparaison — c'est du contenu UI statique, pas admin-géré).

- [ ] **Step 4: Commit**
```bash
git pull origin Production
git add frontend-next/src/components/freemium/pricing-modal.tsx
git commit -m "refactor(pricing-modal): prix et noms dynamiques depuis usePlansConfig, fallback i18n"
git push origin feature/dynamic-plans-config
```

---

## Task 6 — pricing/page.tsx

**Files:**
- Modify: `frontend-next/src/app/pricing/page.tsx`

- [ ] **Step 1: Ajouter import**
```typescript
import { usePlansConfig } from "@/hooks/use-plans-config";
```

- [ ] **Step 2: Dans `export default function PricingPage()`**

Supprimer l'array `const plans = [...]` (lignes 38-111) et ajouter à l'intérieur du composant :

```typescript
const { getPlan, formatPrice, isLoading: plansLoading } = usePlansConfig();

// Icon mapping (statique — décoratives, pas du contenu)
const PLAN_ICONS: Record<string, React.ElementType> = {
  free: Gift,
  starter: Zap,
  pro: Sparkles,
  premium: Crown,
};
const PLAN_COLORS: Record<string, string> = {
  free: "#9CA3AF",
  starter: "#00D9FF",
  pro: "#9333EA",
  premium: "#F97316",
};

// Plans dynamiques depuis API, avec fallback sur les données hardcodées
const plans = plansLoading
  ? []
  : [
      {
        id: "free",
        name: getPlan("free")?.display_name ?? "Gratuit",
        priceMonthly: formatPrice(getPlan("free")?.price_monthly ?? 0),
        priceYearly: formatPrice(getPlan("free")?.price_yearly ?? 0),
        tagline: getPlan("free")?.description ?? "Pour découvrir",
        description: "Testez gratuitement les fonctionnalités essentielles",
        icon: PLAN_ICONS["free"],
        color: PLAN_COLORS["free"],
        features: (getPlan("free")?.features ?? ["3 recherches d'offres par jour", "1 analyse de CV par jour", "5 minutes de coaching personnel", "Support standard"])
          .map((name) => ({ name })),
      },
      {
        id: "starter",
        name: getPlan("starter")?.display_name ?? "Starter",
        priceMonthly: formatPrice(getPlan("starter")?.price_monthly ?? 8.9),
        priceYearly: formatPrice(getPlan("starter")?.price_yearly ?? 85),
        tagline: getPlan("starter")?.description ?? "Le plus choisi",
        description: "Idéal pour démarrer votre recherche efficacement",
        icon: PLAN_ICONS["starter"],
        color: PLAN_COLORS["starter"],
        popular: true,
        features: (getPlan("starter")?.features ?? ["Recherches illimitées", "Filtres avancés", "Favoris", "Analyses CV", "Score ATS", "Coaching 30min/j"])
          .map((name) => ({ name })),
      },
      {
        id: "pro",
        name: getPlan("pro")?.display_name ?? "Pro",
        priceMonthly: formatPrice(getPlan("pro")?.price_monthly ?? 13.9),
        priceYearly: formatPrice(getPlan("pro")?.price_yearly ?? 133),
        tagline: getPlan("pro")?.description ?? "Le plus complet",
        description: "Pour les professionnels exigeants en recherche active",
        icon: PLAN_ICONS["pro"],
        color: PLAN_COLORS["pro"],
        features: (getPlan("pro")?.features ?? ["Tout Starter", "Coaching illimité", "Export PDF", "Simulations entretien", "Feedback détaillé", "Support prioritaire"])
          .map((name) => ({ name })),
      },
      {
        id: "premium",
        name: getPlan("premium")?.display_name ?? "Premium",
        priceMonthly: formatPrice(getPlan("premium")?.price_monthly ?? 19.9),
        priceYearly: formatPrice(getPlan("premium")?.price_yearly ?? 191),
        tagline: getPlan("premium")?.description ?? "L'excellence",
        description: "L'expérience ultime pour maximiser vos chances",
        icon: PLAN_ICONS["premium"],
        color: PLAN_COLORS["premium"],
        features: (getPlan("premium")?.features ?? ["Tout Pro", "Historique illimité", "Conseils ultra-ciblés", "Alertes email", "Accès anticipé", "Support VIP", "Rapports mensuels"])
          .map((name) => ({ name })),
      },
    ];
```

- [ ] **Step 3: Ajouter un skeleton pendant le chargement**

Trouver l'endroit où les plan cards sont rendues. Ajouter avant :
```typescript
{plansLoading && (
  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
    {[1, 2, 3, 4].map((i) => (
      <div key={i} className="h-96 bg-gray-100 rounded-xl animate-pulse" />
    ))}
  </div>
)}
```

- [ ] **Step 4: Adapter le rendu des features**

Dans le JSX, les features étaient `{ icon: Search, name: "..." }` avec icône. Maintenant c'est `{ name: "..." }` sans icône. Adapter le rendu :
```tsx
{plan.features.map((feature, i) => (
  <div key={i} className="flex items-center gap-2 text-sm">
    <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
    <span>{feature.name}</span>
  </div>
))}
```

- [ ] **Step 5: Commit**
```bash
git pull origin Production
git add frontend-next/src/app/pricing/page.tsx
git commit -m "refactor(pricing-page): plans dynamiques depuis usePlansConfig avec skeleton loading"
git push origin feature/dynamic-plans-config
```

---

## Task 7 — usage-modal + subscription-card

**Files:**
- Modify: `frontend-next/src/components/freemium/usage-modal.tsx`
- Modify: `frontend-next/src/components/profile/subscription-card.tsx`

### usage-modal.tsx

- [ ] **Step 1: Ajouter import**
```typescript
import { usePlansConfig } from "@/hooks/use-plans-config";
```

- [ ] **Step 2: Dans `UsageModal()`, ajouter**
```typescript
const { getPlan } = usePlansConfig();
```

- [ ] **Step 3: Remplacer `planConfig.name` par**
```typescript
getPlan(plan)?.display_name ?? PLAN_CONFIG[plan]?.name ?? plan
```
(Garder `PLAN_CONFIG` pour les icônes et couleurs, juste remplacer le `name`)

### subscription-card.tsx

- [ ] **Step 4: Ajouter import**
```typescript
import { usePlansConfig } from "@/hooks/use-plans-config";
```

- [ ] **Step 5: Dans `SubscriptionCard()`, ajouter**
```typescript
const { getPlan, formatPrice } = usePlansConfig();
```

- [ ] **Step 6: Remplacer les prix dans `PLAN_CONFIG`**

Au lieu de modifier le const statique, remplacer les usages de `PLAN_CONFIG[plan].price` par :
```typescript
// Pour le prix affiché
const dynamicPrice = (() => {
  const p = getPlan(plan);
  if (!p || p.price_monthly === 0) return "0€";
  return `${formatPrice(p.price_monthly)}€/mois`;
})();
```
Et utiliser `dynamicPrice` là où `planConfig.price` + `planConfig.period` étaient utilisés.

- [ ] **Step 7: Remplacer `planConfig.name`**
```typescript
getPlan(plan)?.display_name ?? PLAN_CONFIG[plan]?.name ?? plan
```

- [ ] **Step 8: Commit**
```bash
git pull origin Production
git add frontend-next/src/components/freemium/usage-modal.tsx frontend-next/src/components/profile/subscription-card.tsx
git commit -m "refactor(freemium): usage-modal + subscription-card utilisent usePlansConfig pour prix et noms"
git push origin feature/dynamic-plans-config
```

---

## Task 8 — conversion-popups.tsx

**Files:**
- Modify: `frontend-next/src/components/freemium/conversion-popups.tsx`

- [ ] **Step 1: Modifier l'interface `PopupConfig`**

Remplacer :
```typescript
export interface PopupConfig {
  id: string;
  trigger: string;
  title: string;
  body: string;
  primaryCta: string;
  secondaryCta?: string;
  plan: "starter" | "pro";
  price: string;
  couponTrigger?: string;
}
```
Par :
```typescript
export interface PopupConfig {
  id: string;
  trigger: string;
  title: string;
  body: string;
  primaryCta: string;
  secondaryCta?: string;
  plan: "starter" | "pro";
  discountPercent?: number;   // ex: 0.20 pour -20%
  priceOverride?: string;     // ex: "0€ pendant 7 jours" (cas spéciaux)
  couponTrigger?: string;
}
```

- [ ] **Step 2: Mettre à jour `POPUP_CONFIGS`**

Remplacer tout le contenu de `POPUP_CONFIGS` par :
```typescript
export const POPUP_CONFIGS: PopupConfig[] = [
  { id: "search_limit", trigger: "search_limit", title: "Tu as atteint ta limite de recherches aujourd'hui", body: "Passe à Starter pour des recherches illimitées et trouve ton prochain job plus vite.", primaryCta: "Débloquer les recherches", secondaryCta: "Parrainer un ami", plan: "starter" },
  { id: "cv_score", trigger: "cv_score", title: "Ton CV peut faire beaucoup mieux", body: "Accède aux conseils détaillés de Sofia pour booster ton score ATS et décrocher plus d'entretiens.", primaryCta: "Activer l'analyse complète", plan: "starter" },
  { id: "session_cut", trigger: "session_cut", title: "Ta session coach est terminée", body: "Continue avec Nova, Maria ou Lucas sans limite. Ton prochain job est à portée de main.", primaryCta: "Continuer avec le Coach", plan: "starter" },
  { id: "interview_score", trigger: "interview_score", title: "Tu veux aller plus loin avec Lucas ?", body: "Simule autant d'entretiens que tu veux et reçois des retours approfondis à chaque session.", primaryCta: "Activer la simulation complète", plan: "pro" },
  { id: "momentum", trigger: "momentum", title: "Tu es en plein élan — profite de -20% aujourd'hui", body: "Tu recherches activement. Voici une offre exclusive valable 24h pour toi.", primaryCta: "Choisir mon plan avec -20%", plan: "starter", discountPercent: 0.20, couponTrigger: "momentum" },
  { id: "anti_churn", trigger: "anti_churn", title: "Reste et économise -30% pendant 3 mois", body: "Avant de partir, voici une offre exclusive : -30% sur ton abonnement pendant 3 mois.", primaryCta: "Garder mon avantage", secondaryCta: "Annuler quand même", plan: "pro", discountPercent: 0.30, couponTrigger: "anti_churn" },
  { id: "inactive_7d", trigger: "inactive_7d", title: "7 jours Pro offerts — on t'a réservé ta place", body: "Tu nous manques ! Reviens et profite de 7 jours Pro gratuits pour reprendre ta recherche.", primaryCta: "Activer mes 7 jours Pro", plan: "pro", priceOverride: "0€ pendant 7 jours", couponTrigger: "win_back_7d" },
  { id: "pricing_hover", trigger: "pricing_hover", title: "67% de nos abonnés choisissent Pro", body: "Ils trouvent un job en moyenne 3x plus vite. Rejoins-les aujourd'hui.", primaryCta: "Choisir Pro maintenant", plan: "pro" },
];
```

- [ ] **Step 3: Dans `ConversionPopup`, ajouter le hook et calcul du prix dynamique**

Ajouter l'import :
```typescript
import { usePlansConfig } from "@/hooks/use-plans-config";
```

Dans la fonction `ConversionPopup`, ajouter :
```typescript
const { getPlan, formatPrice } = usePlansConfig();

const computedPrice = (() => {
  if (!config) return "";
  if (config.priceOverride) return config.priceOverride;
  const planData = getPlan(config.plan);
  if (!planData) return "";
  const base = planData.price_monthly;
  const discounted = config.discountPercent
    ? base * (1 - config.discountPercent)
    : base;
  return `${formatPrice(discounted)}€/mois`;
})();
```

- [ ] **Step 4: Remplacer `config.price` par `computedPrice` dans le JSX**

Chercher toutes les occurrences de `config.price` dans le rendu JSX et remplacer par `computedPrice`.

- [ ] **Step 5: Commit**
```bash
git pull origin Production
git add frontend-next/src/components/freemium/conversion-popups.tsx
git commit -m "refactor(conversion-popups): prix dynamiques depuis usePlansConfig, discountPercent remplace prix hardcodé"
git push origin feature/dynamic-plans-config
```

---

## Task 9 — Admin: éditeur de wording dans plan-card-editor

**Files:**
- Modify: `frontend-next/src/hooks/admin/use-admin-plans.ts`
- Modify: `frontend-next/src/components/admin/plans/plan-card-editor.tsx`
- Modify: `frontend-next/src/app/admin/plans/page.tsx`

### use-admin-plans.ts

- [ ] **Step 1: Ajouter `updateWording` dans le hook**

Dans l'interface, ajouter :
```typescript
// Déjà dans Plan interface — vérifier que display_name et description sont présents
// Si non, ajouter à l'interface Plan:
display_name: string;
description: string | null;
```

Ajouter après `updateDisplayPrice` :
```typescript
const updateWording = useCallback(
  async (
    planId: string,
    wording: { display_name?: string; description?: string },
  ) => {
    setLoading(true);
    try {
      await adminFetch(`/api/admin/plans/${planId}/wording`, {
        method: "PATCH",
        body: JSON.stringify(wording),
      });
      toast.success("Wording mis à jour");
      window.dispatchEvent(new Event("subscription-changed"));
      return true;
    } catch (e: any) {
      toast.error(e.message || "Erreur lors de la mise à jour du wording");
      return false;
    } finally {
      setLoading(false);
    }
  },
  [],
);
```

Ajouter `updateWording` dans le return.

### plan-card-editor.tsx

- [ ] **Step 2: Ajouter les props `onUpdateWording`**

Dans l'interface `Props`, ajouter :
```typescript
onUpdateWording: (
  planId: string,
  wording: { display_name?: string; description?: string },
) => Promise<boolean>;
```

- [ ] **Step 3: Ajouter le state et handler**

```typescript
const [displayName, setDisplayName] = useState(plan.display_name || "");
const [description, setDescription] = useState(plan.description || "");

const handleSaveWording = async () => {
  setSaving("wording");
  await onUpdateWording(plan.id, { display_name: displayName, description });
  setSaving(null);
};
```

- [ ] **Step 4: Ajouter la section Wording dans le JSX**

Après la section "Feature Flags" existante, ajouter une nouvelle section dans la grille :
```tsx
{/* — Section: Wording — */}
<div className="space-y-3 lg:px-6">
  <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
    Wording
  </span>
  <div className="space-y-2 mt-2">
    <div className="space-y-1">
      <Label className="text-xs">Nom affiché</Label>
      <Input
        className="h-8 text-sm"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        placeholder="Ex: Starter"
      />
    </div>
    <div className="space-y-1">
      <Label className="text-xs">Description courte</Label>
      <Input
        className="h-8 text-sm"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Ex: Le plus choisi"
      />
    </div>
  </div>
  <Button
    size="sm"
    variant="outline"
    onClick={handleSaveWording}
    disabled={saving === "wording"}
    className="w-full"
  >
    <Save className="h-3.5 w-3.5 mr-1.5" />
    {saving === "wording" ? "Sauvegarde..." : "Sauvegarder"}
  </Button>
</div>
```

- [ ] **Step 5: Adapter le CSS grid pour inclure la nouvelle colonne**

La grille passe de `lg:grid-cols-3` (free) / `lg:grid-cols-4` (payants) à :
- free: `lg:grid-cols-4`
- payants: `lg:grid-cols-5`

Modifier la ligne du `className` du grid :
```typescript
className={`grid grid-cols-1 gap-6 lg:gap-0 lg:divide-x lg:divide-border ${plan.name !== "free" ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}
```

### admin/plans/page.tsx

- [ ] **Step 6: Ajouter `updateWording` dans le hook et le passer en prop**

```typescript
const { ..., updateWording } = useAdminPlans();
```

Dans le JSX du `PlanCardEditor` :
```typescript
onUpdateWording={async (id, wording) => {
  const ok = await updateWording(id, wording);
  if (ok) refresh();
  return ok;
}}
```

- [ ] **Step 7: Commit**
```bash
git pull origin Production
git add \
  frontend-next/src/hooks/admin/use-admin-plans.ts \
  frontend-next/src/components/admin/plans/plan-card-editor.tsx \
  frontend-next/src/app/admin/plans/page.tsx
git commit -m "feat(admin): section wording dans plan-card-editor — display_name et description éditables"
git push origin feature/dynamic-plans-config
```

---

## Task 10 — Vérification finale + PR

- [ ] **Step 1: Vérifier qu'il ne reste aucun prix hardcodé**
```bash
grep -rn "8,90\|13,90\|19,90\|8\.90\|13\.90\|19\.90" \
  /Users/wissem/HuntzenIA/huntzen_jobsearch/frontend-next/src/ \
  --include="*.tsx" --include="*.ts" \
  | grep -v "node_modules" | grep -v ".next"
# Attendu: zéro résultat (sauf éventuellement dans les fallback strings)
```

- [ ] **Step 2: Vérifier qu'il ne reste aucun PLAN_NAMES hardcodé**
```bash
grep -rn "PLAN_NAMES\|\"Gratuit\"\|\"Starter\"\|\"Premium\"" \
  /Users/wissem/HuntzenIA/huntzen_jobsearch/frontend-next/src/ \
  --include="*.tsx" --include="*.ts" \
  | grep -v "node_modules"
# Attendu: zéro ou seulement dans les fallback strings (accepté)
```

- [ ] **Step 3: Tester le flow complet manuellement**

```
TEST 1 — Prix dynamique:
1. GET /api/public/plans → vérifier les prix retournés
2. Ouvrir /pricing → vérifier que les prix correspondent à la DB
3. Ouvrir la pricing-modal depuis l'app → même prix

TEST 2 — Wording admin:
1. Admin /admin/plans → changer display_name "Starter" → "Essentiel" → Save
2. Attendre 1s → ouvrir /pricing → vérifier "Essentiel" affiché
3. Vérifier dans /api/public/plans → display_name = "Essentiel"
4. Remettre "Starter" → Save

TEST 3 — Prix popup dynamique:
1. Déclencher un popup (ex: session_cut) → vérifier que le prix affiché correspond au prix DB du plan starter
2. Popup momentum → vérifier prix = starter_price * 0.8

TEST 4 — Cache invalidation:
1. Admin change un prix → pricing page se met à jour (event subscription-changed)
2. Ouvrir un nouvel onglet sans event → attendre 5min → cache expiré → nouveau prix

TEST 5 — Fallback si API indisponible:
1. Couper le backend → /pricing ne doit pas crasher (skeleton ou valeurs fallback)
```

- [ ] **Step 4: Créer la PR**
```bash
git pull origin Production
git push origin feature/dynamic-plans-config

gh pr create \
  --base Production \
  --title "feat(plans): suppression hardcoding — plans 100% dynamiques depuis admin" \
  --body "$(cat <<'EOF'
## Résumé

- **Backend**: Nouvel endpoint public `GET /api/public/plans` + `PATCH /admin/plans/{id}/wording` + invalidation cache Redis `plans_config` dans tous les PATCH admin
- **Frontend**: Hook `usePlansConfig()` avec cache localStorage 5min + invalidation via event `subscription-changed`
- **Refactoring**: 6 composants migrent de hardcoded vers `usePlansConfig()` — pricing-modal, pricing/page, usage-modal, subscription-card, feature-lock, conversion-popups
- **Admin**: Nouvelle section "Wording" dans plan-card-editor — `display_name` et `description` éditables sans redeploy

## Impact utilisateur

- Les prix, noms et descriptions de plans se mettent à jour immédiatement après modification admin
- Les popups de conversion affichent les vrais prix (avec calcul dynamique des remises %)
- Aucune régression — fallback hardcodé si API indisponible

## Tests

- [ ] `/api/public/plans` retourne les 4 plans actifs
- [ ] `/admin/plans` → sauvegarder wording → page pricing mise à jour
- [ ] Popup conversion → prix = prix DB du plan (avec discount calculé)
- [ ] Cache Redis invalidé après tout PATCH admin plan
EOF
)"
```

---

## Résumé des commits (10 commits atomiques)

| # | Commit | Fichiers |
|---|--------|---------|
| 1 | `feat(backend): endpoint public GET /api/public/plans` | public_plans.py, __init__.py |
| 2 | `feat(backend): PATCH /wording + invalidation plans_config` | admin.py |
| 3 | `feat(frontend): hook usePlansConfig()` | use-plans-config.ts |
| 4 | `refactor(subscription): planName depuis API, supprimer PLAN_NAMES` | subscription-context.tsx, feature-lock.tsx |
| 5 | `refactor(pricing-modal): prix et noms dynamiques` | pricing-modal.tsx |
| 6 | `refactor(pricing-page): plans dynamiques avec skeleton` | pricing/page.tsx |
| 7 | `refactor(freemium): usage-modal + subscription-card dynamiques` | usage-modal.tsx, subscription-card.tsx |
| 8 | `refactor(conversion-popups): prix dynamiques avec discountPercent` | conversion-popups.tsx |
| 9 | `feat(admin): section wording dans plan-card-editor` | use-admin-plans.ts, plan-card-editor.tsx, admin/plans/page.tsx |
| 10 | PR créée sur GitHub |
