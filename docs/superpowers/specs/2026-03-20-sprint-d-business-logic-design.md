# Sprint D — Logique métier & Monétisation (60 → 90+) — Design Spec

> Date : 2026-03-20
> Score actuel : 60/100 (audit commercial 2026-03-18, dimension "Logique métier")
> Score cible : 90+/100
> Référence audit : docs/audit/subagents/01-business-logic.md

---

## Décisions d'architecture validées

1. **Source unique Supabase** (Option D) — Tout le wording, prix, limites, feature_flags vient de `subscription_plans` dans Supabase. Le frontend n'a PLUS de `PLAN_LIMITS` hardcodé.
2. **`/api/public/plans`** retourne tout : limits, feature_flags, wording, prix. Accessible sans auth.
3. **`/api/auth/me`** reste authentifié : état personnel (plan actif, quotas consommés, overrides).
4. **Cache persistant confiant** (Option A) — Le dernier état connu est gardé en localStorage indéfiniment. Fallback = dernier plan connu, jamais "free" par défaut.
5. **Sur 403 API** : invalider cache → refetch `/auth/me` → modal informative "Ton abonnement a changé" avec CTA upgrade. Pas de déconnexion forcée.

---

## Ce qui existe déjà (pas à reconstruire)

- Admin panel `/admin/plans` avec PlanCardEditor (limites, prix, wording, feature_flags, Stripe prices)
- 5 endpoints PATCH backend (`/api/admin/plans/{id}/limits|features|wording|price|stripe-price`)
- Table `subscription_plans` avec JSONB limits + feature_flags
- Cache invalidation Redis (`plans_config`, `auth_me:*`) + event `subscription-changed`
- `/api/public/plans` (existe mais incomplet — ne retourne pas limits ni feature_flags)
- `/api/auth/me` retourne déjà quotas + plan_feature_flags

---

## D1 — Enrichir `/api/public/plans` (+limits, feature_flags)

### Problème
L'endpoint actuel sélectionne : `id, name, display_name, description, price_monthly, price_yearly, features, features_excluded, sort_order, is_active`. Il manque `limits` et `feature_flags`.

### Fix
Ajouter `limits, feature_flags` au SELECT dans `backend/src/api/routes/public_plans.py`.

### Fichiers modifiés
- `backend/src/api/routes/public_plans.py` — ajouter 2 colonnes au SELECT

---

## D2 — Supprimer PLAN_LIMITS hardcodé, utiliser l'API

### Problème
`frontend-next/src/hooks/use-freemium-limits.ts` contient ~80 lignes de `PLAN_LIMITS` hardcodé avec des valeurs qui peuvent diverger de la DB. C'est la cause racine du bug "Plan Gratuit" et des incohérences.

### Solution
Remplacer `PLAN_LIMITS` par les données de `/api/public/plans` :

1. **`use-plans-config.ts`** (existe déjà) fetch `/api/public/plans` avec cache localStorage 5min. Il faut qu'il retourne aussi `limits` et `feature_flags` maintenant que l'API les fournit.

2. **`subscription-context.tsx`** utilise `usePlansConfig()` au lieu de `PLAN_LIMITS` pour les limites par plan. La source de vérité pour les limites personnelles reste `apiData.quotas` (de `/auth/me`).

3. **`use-freemium-limits.ts`** : supprimer `PLAN_LIMITS` constant. Le hook utilise les limites de `usePlansConfig()` comme fallback au lieu de valeurs hardcodées.

### Hiérarchie des données (après fix)
```
1. apiData.quotas (de /auth/me) — vérité pour le user connecté
2. plansConfig.getPlan(plan).limits — fallback depuis /api/public/plans (cache 5min)
3. Skeleton/loading — si rien n'est disponible, jamais "free" par défaut
```

### Fichiers modifiés
- `frontend-next/src/hooks/use-freemium-limits.ts` — supprimer PLAN_LIMITS, utiliser plansConfig
- `frontend-next/src/hooks/use-plans-config.ts` — exposer limits + feature_flags
- `frontend-next/src/contexts/subscription-context.tsx` — utiliser plansConfig au lieu de PLAN_LIMITS

---

## D3 — Cache persistant + fix fallback "Plan Gratuit"

### Problème
Quand `/api/auth/me` retourne 401/erreur/est lent, le contexte tombe sur `freemium.plan` = "free". Un user Pro voit "Plan Gratuit".

### Solution

1. **Cache persistant** : Quand `/api/auth/me` retourne avec succès, sauvegarder l'état complet dans `localStorage` sous la clé `huntzen_subscription_cache` (pas de TTL — persistant).

2. **Fallback** : Si l'API est en erreur/loading :
   - Chercher `huntzen_subscription_cache` dans localStorage
   - Si trouvé → utiliser le dernier plan connu (ex: "pro")
   - Si pas trouvé (première visite) → "free" (légitime, c'est un nouveau user)

3. **Invalidation** : Le cache est invalidé uniquement par :
   - Une réponse réussie de `/api/auth/me` (mise à jour)
   - Un event `subscription-changed` (webhook Stripe)
   - Un logout explicite (clear)

4. **Loading state** : Pendant le premier fetch (pas de cache), afficher un skeleton au lieu de "Plan Gratuit".

### Fichiers modifiés
- `frontend-next/src/hooks/use-subscription-api.ts` — cache persistant + fallback
- `frontend-next/src/contexts/subscription-context.tsx` — loading state, pas de fallback "free"

---

## D4 — Modal "Ton abonnement a changé" sur 403

### Problème
Si le cache dit "Pro" mais le user est vraiment free (annulation expirée), les appels API backend retournent 403. Le frontend doit réagir.

### Solution

1. **Intercepteur 403** dans `api-client.ts` ou `use-subscription-api.ts` :
   - Sur 403 avec code `QUOTA_EXCEEDED` ou `PLAN_DOWNGRADED` → invalider localStorage cache
   - Refetch `/api/auth/me`
   - Afficher modal informative

2. **Modal "Abonnement changé"** (nouveau composant) :
   ```
   ┌──────────────────────────────────┐
   │  Ton abonnement a changé         │
   │                                   │
   │  Tu es maintenant sur le plan     │
   │  Exploration (Gratuit).           │
   │                                   │
   │  [Voir les offres]  [Continuer]   │
   └──────────────────────────────────┘
   ```
   - CTA "Voir les offres" → ouvre PricingModal
   - CTA "Continuer" → ferme la modal, user reste sur free
   - Pas de déconnexion forcée
   - Textes i18n (fr.json + en.json)

### Fichiers créés
- `frontend-next/src/components/freemium/subscription-changed-modal.tsx`

### Fichiers modifiés
- `frontend-next/src/hooks/use-subscription-api.ts` — intercepteur 403
- `frontend-next/src/contexts/subscription-context.tsx` — state pour ouvrir la modal
- `frontend-next/messages/fr.json` + `en.json` — clés i18n

---

## D5 — Supprimer tous les hardcoded prices/names dans les composants

### Problème
5+ fichiers ont des prix, noms de plans, et limites hardcodés qui ignorent la DB.

### Fix — fichier par fichier

1. **`subscription-card.tsx`** (lignes 49-65) : prix hardcodés `"8,90€"`, `"13,90€"`, `"19,90€"` → utiliser `usePlansConfig().getPlan(plan)?.price_monthly`

2. **`usage-modal.tsx`** (lignes 38-60, 218, 264-287) : noms de plans et descriptions hardcodés → utiliser `usePlansConfig()` pour display_name + limits

3. **`conversion-popups.tsx`** (lignes 22-95) : `plan: "starter"` hardcodé sur chaque popup → utiliser `getRequiredPlan(feature)` dynamique depuis feature_flags

4. **`lib/seo/metadata.ts`** (ligne 342) : description SEO avec "Gratuit (3 recherches/jour), Essentiel 8.90€/mois" → texte générique sans prix spécifiques (les prix changent)

5. **`backend/src/api/routes/auth.py`** (ligne 198) : `plan_prices = {"free": 0, ...}` fallback → récupérer depuis `subscription_plans` table ou supprimer le fallback prix

### Fichiers modifiés
- `frontend-next/src/components/profile/subscription-card.tsx`
- `frontend-next/src/components/freemium/usage-modal.tsx`
- `frontend-next/src/components/freemium/conversion-popups.tsx`
- `frontend-next/src/lib/seo/metadata.ts`
- `backend/src/api/routes/auth.py`

---

## D6 — Vérification complète flow admin → prod

### Objectif
Vérifier que TOUT changement admin se propage correctement sans redeploy :

| Action admin | Propagation attendue | À vérifier |
|---|---|---|
| Changer display_name d'un plan | Pricing page, sidebar, profile, modals | ✅ invalidation `plans_config` Redis |
| Changer prix affiché (DB) | Pricing page, subscription-card | ✅ PATCH `/admin/plans/{id}/price` |
| Créer nouveau prix Stripe | Stripe checkout utilise le nouveau prix | ✅ POST `/admin/plans/{id}/stripe-price` (archive l'ancien) |
| Changer une limite (cv_analyses) | Quotas user, usage-counter, profile | ✅ PATCH `/admin/plans/{id}/limits` + invalidation `auth_me:*` |
| Activer/désactiver un feature flag | Feature-lock, accès features | ✅ PATCH `/admin/plans/{id}/features` |
| Changer description plan | Pricing page, modal | ✅ PATCH `/admin/plans/{id}/wording` |

### Vérification flow Stripe complet
- Admin crée prix → Stripe crée le price → ancien archivé → DB mise à jour
- User fait checkout → Stripe utilise le nouveau prix → webhook → Supabase synced
- User change de plan (upgrade) → proration immédiate correcte
- User change de plan (downgrade) → scheduled à fin de période, pas immédiat
- User annule → `cancel_at_period_end=true` → webhook synced → UI affiche "annulation programmée"
- User réactive → `cancel_at_period_end=false` → webhook synced → UI affiche "actif"

---

## D7 — Fix bugs audit restants

### 7a — invoice.payment_failed ne notifie pas l'utilisateur
**Fichier** : `backend/src/api/routes/stripe.py` (webhook handler)
**Fix** : Dans le handler `invoice.payment_failed`, ajouter :
- Notification Supabase (`user_notifications` table) pour l'utilisateur
- Email via `send_payment_failed_email()` (Resend)
- La notification apparaîtra via NotificationBell (déjà branché)

### 7b — Downgrade applique le prix immédiatement
**Fichier** : `backend/src/services/stripe.py` (lignes 361-394)
**Vérification** : Le code utilise déjà `_schedule_downgrade()` avec `proration_behavior="none"` et modification à la fin de la période. Vérifier que c'est bien le cas et que le prix ne change pas immédiatement.

---

## Ordre d'exécution

1. **D1** — Enrichir `/api/public/plans` (backend, 5 min)
2. **D2** — Supprimer PLAN_LIMITS hardcodé (frontend, dépend de D1)
3. **D3** — Cache persistant + fix fallback (frontend, indépendant de D2)
4. **D4** — Modal "abonnement changé" sur 403 (frontend, dépend de D3)
5. **D5** — Supprimer hardcoded prices/names (frontend, dépend de D2)
6. **D6** — Vérification flow admin → prod (test E2E, indépendant)
7. **D7** — Fix bugs audit restants (backend, indépendant)

### Dépendances
- D1 bloque D2 et D5 (le frontend a besoin des données enrichies)
- D3 bloque D4 (la modal dépend du nouveau système de cache)
- D6 est indépendant (vérification après D1-D5)
- D7 est indépendant (backend uniquement)
- D2 et D3 peuvent être faits en parallèle après D1

---

## Risques

1. **D2 — Régression limites** : Supprimer PLAN_LIMITS pourrait casser des composants qui dépendent de la structure exacte. Mitigation : vérifier tous les consumers de `useFreemiumLimits()` avant de modifier.
2. **D3 — Cache stale** : Un user downgrade garde l'accès UI "Pro" jusqu'au prochain 403. Mitigation : acceptable car le backend vérifie les quotas côté serveur (D4 gère le 403).
3. **D5 — Composants nombreux** : 5+ fichiers à modifier, risque d'oublier un hardcoded. Mitigation : grep exhaustif sur les valeurs hardcodées avant et après.

---

## Tests

- `npx tsc --noEmit` + `npm run lint` → zéro erreur après chaque item
- `npm run build` → build production réussi
- Vérifier `/api/public/plans` retourne limits + feature_flags (curl)
- Vérifier qu'un user Pro voit "Pro" même avec un token expiré (cache persistant)
- Vérifier qu'un 403 déclenche la modal "abonnement changé"
- Vérifier que l'admin change un prix → la pricing page reflète le changement sans redeploy
- Vérifier que l'admin change une limite → le profil utilisateur reflète la nouvelle limite
