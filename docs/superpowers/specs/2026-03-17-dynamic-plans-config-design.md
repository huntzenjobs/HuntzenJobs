# Spec : Plans dynamiques depuis admin — Suppression du hardcoding

**Date** : 2026-03-17
**Statut** : Approuvé
**Branche** : feature/dynamic-plans-config

---

## Contexte

Les plans d'abonnement (noms, prix, descriptions, features marketing) sont hardcodés en dur dans 6+ fichiers frontend. L'admin ne peut pas changer un prix ou un wording sans redéployer. La DB `subscription_plans` contient déjà toutes les données nécessaires.

---

## Objectif

Toutes les informations de plans (display_name, description, price_monthly, price_yearly, features texte marketing) doivent être lues depuis la DB via une API publique. L'admin peut modifier ces informations sans deploy.

---

## Architecture

```
DB: subscription_plans
  ↓
GET /api/public/plans  ←── Redis cache "plans_config" TTL 5min
  ↓                         ↑ invalidé par tout PATCH admin plan
usePlansConfig() hook ←── localStorage cache 5min + event "subscription-changed"
  ↓ consommé par
  pricing/page.tsx | pricing-modal.tsx | usage-modal.tsx
  subscription-card.tsx | feature-lock.tsx | subscription-context.tsx
  conversion-popups.tsx
```

---

## Backend — 2 changements

### 1. `GET /api/public/plans` (sans auth)

Route dans `backend/src/api/routes/public.py` (nouveau fichier) ou dans `plans.py`.

**Response** :
```json
[
  {
    "id": "uuid",
    "name": "starter",
    "display_name": "Starter",
    "description": "Le plus choisi",
    "price_monthly": 8.90,
    "price_yearly": 85.00,
    "features": ["Recherches illimitées", "Filtres avancés", ...],
    "sort_order": 2,
    "is_active": true
  }
]
```

Cache Redis clé `plans_config` TTL 5min. Pas de `feature_flags` ni `limits` dans cette réponse (données internes).

### 2. `PATCH /api/admin/plans/{id}/wording` (admin auth)

Body : `{ display_name?: string, description?: string }`
→ met à jour `subscription_plans` + invalide `plans_config` + invalide `auth_me:*`

### 3. Invalidation `plans_config` dans tous les PATCH admin

Ajouter dans : `/limits`, `/features`, `/price`, `/wording` → invalider Redis `plans_config`.

---

## Frontend — Hook `usePlansConfig()`

**Fichier** : `frontend-next/src/hooks/use-plans-config.ts`

```ts
interface PlanConfig {
  id: string
  name: string
  display_name: string
  description: string
  price_monthly: number
  price_yearly: number | null
  features: string[]
  sort_order: number
}

// Usage
const { plans, getPlan, isLoading } = usePlansConfig()
getPlan("starter")?.price_monthly // 8.90
```

- Fetch `/api/public/plans` (pas d'auth)
- Cache localStorage clé `plans_config_cache` TTL 5min
- Écoute event `subscription-changed` → invalide cache + refetch
- Fallback: si API indisponible, retourne array vide (composants gèrent skeleton)

---

## Frontend — Refactoring composants

### subscription-context.tsx
- `planName` ← `apiData.subscription?.plan_display_name` (déjà dans /me)
- Supprimer `PLAN_NAMES` constant

### usage-modal.tsx
- `PLAN_CONFIG[plan].name` → `usePlansConfig().getPlan(plan)?.display_name`
- Garder icônes + couleurs (décoratives)

### pricing-modal.tsx
- Prix (`price: "8,90"`) → `getPlan(planId)?.price_monthly`
- Features incluses → `getPlan(planId)?.features`
- Skeleton pendant `isLoading`

### app/pricing/page.tsx
- Array `plans` hardcodé → depuis `usePlansConfig()`
- Icônes Lucide conservées (mapping statique icon par plan name)
- Skeleton 4 cartes pendant `isLoading`

### subscription-card.tsx
- Prix → `usePlansConfig().getPlan(plan)?.price_monthly`
- Nom → `plan_display_name` depuis `/api/auth/me`

### feature-lock.tsx
- `PLAN_NAMES[plan]` → `usePlansConfig().getPlan(plan)?.display_name`

### conversion-popups.tsx
- Supprimer `price: string` de `PopupConfig`
- Ajouter `discountPercent?: number` (0.20 = -20%)
- Ajouter `priceOverride?: string` ("0€ pendant 7 jours")
- Prix calculé : `planPrice * (1 - discountPercent)` formaté en "X,XX€/mois"
- Mapping : `{ momentum: { discountPercent: 0.20, plan: "starter" }, anti_churn: { discountPercent: 0.30, plan: "pro" }, inactive_7d: { priceOverride: "0€ pendant 7 jours" } ... }`

---

## Admin — Éditeur de wording

Nouvelle section "Wording" dans `plan-card-editor.tsx` :
- Champ texte `display_name`
- Champ texte `description`
- Bouton Save → `PATCH /wording`
- Nouveau `updateWording()` dans `use-admin-plans.ts`

---

## Plan de commits (7 commits atomiques)

1. `feat(backend): endpoint public GET /api/public/plans + cache Redis plans_config`
2. `feat(backend): PATCH /admin/plans/{id}/wording + invalidation plans_config dans tous les PATCH`
3. `feat(frontend): hook usePlansConfig() avec cache localStorage + event-driven invalidation`
4. `refactor(subscription): planName depuis plan_display_name API, supprimer PLAN_NAMES hardcodé`
5. `refactor(pricing): pricing-modal + pricing/page.tsx dynamiques depuis usePlansConfig`
6. `refactor(freemium): usage-modal + subscription-card + feature-lock + conversion-popups dynamiques`
7. `feat(admin): section wording dans plan-card-editor + updateWording hook`

---

## Ce qui reste statique (intentionnel)

- Icônes Lucide dans les pages pricing (décoratives, mapping par `plan.name`)
- Couleurs/gradients des plans (UI design, pas du contenu)
- `app/faq/faq-data.ts` — contenu éditorial hors scope
- Témoignages `/pricing` — contenu marketing hors scope
- `PLAN_LIMITS` dans `use-freemium-limits.ts` — reste fallback quand API indisponible

---

## Tests de vérification

1. Admin change `display_name` "Starter" → "Essentiel" → page pricing se met à jour sans deploy
2. Admin change `price_monthly` 8.90 → 9.90 → pricing-modal + conversion-popups affichent 9,90€
3. Admin change une feature marketing → liste des avantages mise à jour dans pricing-modal
4. Couper Redis → hook retombe sur localStorage cache → puis fallback gracieux
5. Event `subscription-changed` → `usePlansConfig()` refetch immédiat
